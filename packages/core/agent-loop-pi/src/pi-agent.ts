/** DSH-owned Agent lifecycle driven through the replaceable kernel boundary. */

import type {
  Agent,
  AgentCancelCause,
  AgentEventDispatch,
  AgentOptions,
  AgentStatus,
  AssistantStreamFrame,
  CancelOptions,
  InboxTarget,
} from '@deepseek-ai/dsh-agent'
import { agentEvents } from '@deepseek-ai/dsh-agent'
import {
  AssistantStreamAttempt,
  ReactLoopInbox,
  SystemPromptProjection,
} from '@deepseek-ai/dsh-agent-loop'
import type { AssistantMessage, Message } from '@deepseek-ai/dsh-llm'
import type { Scope } from '@deepseek-ai/dsh-scope'
import { createScope } from '@deepseek-ai/dsh-scope'
import type { Session, SessionId, TurnEndReason, UserMessage } from '@deepseek-ai/dsh-session'
import type { Context } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-session-projection'
import { KernelEventOrderSink } from './event-bridge.ts'
import {
  RunId,
  type KernelDriver,
  type KernelEvent,
  type KernelRun,
} from './kernel-driver.ts'
import { DshStepRuntime, type PreparedKernelStep, type StepPreparer } from './model-bridge.ts'
import { PiKernelDriver } from './pi-kernel-driver.ts'
import { DshToolBridge } from './tool-bridge.ts'

type Phase =
  | { kind: 'idle'; lastTurn: number }
  | { kind: 'maintenance'; abort: AbortController; lastTurn: number; wakeRequested: boolean }
  | { kind: 'running'; abort: AbortController; turn: number; wakeRequested: boolean }

/** Testable dependencies whose production implementations remain package-private. */
export interface DshPiAgentDependencies {
  readonly driver: KernelDriver
  readonly stepPreparer: StepPreparer
  /** Resolve later steps prepared inside the active Pi run. */
  readonly stepAt?: (position: { turn: number; step: number }) => PreparedKernelStep | undefined
  /** Serial tool commit bridge paired with the driver coordinator. */
  readonly toolBridge?: DshToolBridge
}

/** DSH Agent surface whose durable Session remains the only recovery truth. */
export class DshPiAgent implements Agent {
  readonly inbox: ReactLoopInbox
  readonly scope: Scope
  readonly ctx: Context

  private phase: Phase
  private activityDone: Promise<void> = Promise.resolve()
  private readonly dispatch: AgentEventDispatch
  private readonly systemPrompt: SystemPromptProjection
  private readonly preparedSteps = new Map<number, PreparedKernelStep>()
  private openStep: number | undefined
  private liveAssistant: AssistantStreamAttempt | undefined
  private assistantAttemptCounter = 0
  private assistantStreamRevision = 0
  private runEndReason: TurnEndReason | undefined
  private activeRun: KernelRun | undefined
  private readonly dependencies: DshPiAgentDependencies
  private readonly toolBridge: DshToolBridge

  constructor(
    private readonly loopCtx: Context,
    public readonly id: SessionId,
    public readonly options: AgentOptions,
    public readonly session: Session,
    dependencies?: DshPiAgentDependencies,
  ) {
    this.dispatch = agentEvents(loopCtx, this)
    this.scope = createScope(loopCtx, this)
    this.ctx = this.scope.ctx
    this.inbox = new ReactLoopInbox(this.ctx.sessionProjections, session, this.dispatch)
    this.systemPrompt = new SystemPromptProjection(session)
    const lastTurn = this.loopCtx.sessionProjections.stateOf(session, 'turnBoundary')?.lastTurn ?? 0
    this.phase = { kind: 'idle', lastTurn }
    const toolBridge = dependencies?.toolBridge ?? new DshToolBridge(loopCtx, this)
    if (dependencies === undefined) {
      const runtime = new DshStepRuntime(loopCtx, this, session, toolBridge)
      this.dependencies = {
        stepPreparer: runtime,
        driver: new PiKernelDriver(runtime),
        stepAt: position => runtime.stepAt(position),
        toolBridge: runtime.tools,
      }
    } else {
      this.dependencies = dependencies
    }
    this.toolBridge = toolBridge
  }

  /** Current externally visible lifecycle phase. */
  get status(): AgentStatus {
    return this.phase.kind === 'running' ? 'running' : 'idle'
  }

  send(message: UserMessage, target: InboxTarget, wakeup: boolean): void {
    const wakingAfterAbort = wakeup && this.phase.kind !== 'idle' && this.phase.abort.signal.aborted
    const resolvedTarget = wakingAfterAbort ? 'next-turn' : target
    this.inbox.splice(resolvedTarget, Infinity, 0, [message])
    if (wakeup) this.wakeDriver(wakingAfterAbort)
  }

  followup(message: UserMessage): void {
    this.send(message, 'next-turn', true)
  }

  steer(message: UserMessage): void {
    this.send(message, 'next-step', true)
  }

  inject(message: UserMessage): void {
    this.send(message, 'next-step', false)
  }

  cancel(cause: AgentCancelCause, options: CancelOptions = {}): void {
    if (!options.keepInbox) {
      this.inbox.clear()
      if (this.phase.kind !== 'idle') this.phase.wakeRequested = false
    }
    if (this.phase.kind === 'idle') return
    this.phase.abort.abort(cause)
    this.activeRun?.abort(cause)
  }

  runMaintenance<T>(job: (signal: AbortSignal) => Promise<T>): Promise<T> {
    if (this.phase.kind !== 'idle') throw new Error(`agent "${this.id}" already has active work`)
    const done = Promise.withResolvers<void>()
    const maintenance: Phase = {
      kind: 'maintenance',
      abort: new AbortController(),
      lastTurn: this.phase.lastTurn,
      wakeRequested: false,
    }
    this.setPhase(maintenance)
    this.activityDone = done.promise
    return (async () => {
      try {
        return await job(maintenance.abort.signal)
      } finally {
        this.setPhase({ kind: 'idle', lastTurn: maintenance.lastTurn })
        if (maintenance.wakeRequested && this.inbox.hasPending) this.wakeDriver()
        done.resolve()
      }
    })()
  }

  async whenIdle(): Promise<void> {
    let activity: Promise<void>
    do {
      await (activity = this.activityDone)
    } while (activity !== this.activityDone)
  }

  private setPhase(next: Phase): void {
    const previous = this.status
    this.phase = next
    const status = this.status
    if (status !== previous) this.dispatch.emit('agent/status', { status })
  }

  private wakeDriver(wakeAfterAbort = false): void {
    if (this.phase.kind !== 'idle') {
      const reason = this.phase.abort.signal.reason as AgentCancelCause | undefined
      if (reason?.kind !== 'disposed' && (this.phase.kind === 'maintenance' || wakeAfterAbort)) {
        this.phase.wakeRequested = true
      }
      return
    }
    const done = Promise.withResolvers<void>()
    this.activityDone = done.promise
    this.setPhase({
      kind: 'running',
      abort: new AbortController(),
      turn: this.phase.lastTurn,
      wakeRequested: false,
    })
    this.loopCtx.agents.withInitiator(this, () => this.kick()).then(done.resolve, done.reject)
  }

  private async kick(): Promise<void> {
    try {
      while (await this.turn()) {}
    } catch (_error: unknown) {
      // Failures are reported and contained at the Agent driver boundary.
    } finally {
      if (this.phase.kind === 'running') {
        const { turn, wakeRequested } = this.phase
        this.setPhase({ kind: 'idle', lastTurn: turn })
        if (wakeRequested && this.inbox.hasPending) this.wakeDriver()
      }
    }
  }

  private async turn(): Promise<boolean> {
    if (this.phase.kind !== 'running') throw new Error(`agent "${this.id}": turn outside running phase`)
    const phase = this.phase
    const signal = phase.abort.signal
    signal.throwIfAborted()
    const turn = phase.turn + 1
    phase.turn = turn
    this.session.append('turn/start', { turn })
    let reason: TurnEndReason = { kind: 'completed' }
    try {
      const prepared = await this.dependencies.stepPreparer.prepare(
        this,
        'next-turn',
        { turn, step: 1 },
        signal,
      )
      if (prepared.kind === 'reject') {
        reason = { kind: 'blocked' }
        return false
      }
      if (prepared.value.admittedMessages.length === 0) return false
      this.preparedSteps.set(1, prepared.value)
      this.runEndReason = undefined
      const runId = RunId(`${this.id}:${turn}`)
      const orderedSink = new KernelEventOrderSink({
        onEvent: (event, eventSignal) => this.commitKernelEvent(event, eventSignal),
      })
      const run = this.dependencies.driver.start({
        runId,
        sessionId: this.session.id,
        turn,
        initialMessages: prepared.value.admittedMessages,
        initialContext: prepared.value.context,
        signal,
      }, orderedSink)
      this.activeRun = run
      const result = await run.settled
      switch (result.kind) {
        case 'completed':
          reason = this.completedRunReason()
          break
        case 'cancelled':
          reason = { kind: 'aborted', reason: result.reason as AgentCancelCause }
          break
        case 'failed':
          reason = { kind: 'error', error: { code: result.failure.code, message: result.failure.message } }
          this.dispatch.emit('agent/error', { turn, step: this.openStep ?? 0, error: result.failure })
          break
      }
    } catch (error: unknown) {
      reason = signal.aborted
        ? { kind: 'aborted', reason: signal.reason as AgentCancelCause }
        : { kind: 'error', error: { code: 'UNKNOWN', message: error instanceof Error ? error.message : String(error) } }
      this.dispatch.emit('agent/error', { turn, step: this.openStep ?? 0, error })
    } finally {
      this.activeRun = undefined
      this.closeOpenAssistant()
      this.toolBridge.abort()
      this.closeOpenStep(turn)
      this.preparedSteps.clear()
      this.session.append('turn/end', { turn, reason })
      await this.loopCtx.sessions.flush(this.session)
    }
    return !signal.aborted && this.inbox.hasPending
  }

  private async commitKernelEvent(event: KernelEvent, signal: AbortSignal): Promise<void> {
    await Promise.resolve()
    signal.throwIfAborted()
    switch (event.type) {
      case 'run.started':
      case 'tool.progress':
        return
      case 'tool.started':
        this.toolBridge.start(event)
        return
      case 'tool.completed':
        await this.toolBridge.complete(event, signal)
        return
      case 'step.started': {
        const prepared = this.preparedSteps.get(event.position.step)
          ?? this.dependencies.stepAt?.(event.position)
        if (prepared === undefined) throw new Error(`kernel started unprepared step ${event.position.step}`)
        for (const commit of this.systemPrompt.project(prepared.prompt.rendered, {
          inHistory: false,
          startsSeries: prepared.startsRequestSeries,
        })) {
          this.session.append('system/message', {
            ...event.position,
            message: commit.message,
          }, commit.intent)
        }
        this.session.append('step/start', event.position)
        this.openStep = event.position.step
        return
      }
      case 'message.started':
        if (event.message.role === 'assistant') this.startAssistant(event.position.turn, event.position.step)
        return
      case 'message.delta':
        this.liveAssistant?.push(event.delta)
        return
      case 'message.completed':
        this.commitMessage(event.message, event.position.turn, event.position.step)
        return
      case 'step.completed':
        this.closeOpenStep(event.position.turn)
        return
      case 'run.completed':
        this.runEndReason = event.reason
    }
  }

  private startAssistant(turn: number, step: number): void {
    if (this.liveAssistant !== undefined) throw new Error('assistant stream already active')
    const live = new AssistantStreamAttempt(
      this.session.id,
      ++this.assistantAttemptCounter,
      () => ++this.assistantStreamRevision,
      turn,
      step,
      (frame: AssistantStreamFrame) => { this.dispatch.emit('agent/assistant-stream', { frame }) },
    )
    live.start()
    this.liveAssistant = live
  }

  private commitMessage(message: Message, turn: number, step: number): void {
    if (message.role === 'assistant') {
      const live = this.liveAssistant
      if (live === undefined) throw new Error('assistant message completed without a live attempt')
      live.settle('assistant/message', () => this.session.append('assistant/message', {
        turn,
        step,
        message: message as AssistantMessage,
        ...live.usage === undefined ? {} : { usage: live.usage },
        stream: live.stream,
      }, { surfaceOp: 'append' }).seq)
      this.liveAssistant = undefined
      return
    }
    if (message.role === 'user' && message.source.kind === 'tool') {
      const result = message.content[0]
      if (result?.type !== 'tool-result') throw new Error('tool result message has no tool-result block')
      this.toolBridge.commit(result.toolCallId, { turn, step })
      return
    }
    if (message.role !== 'user') return
    this.session.append('user/message', message as UserMessage, { surfaceOp: 'append' })
  }

  private closeOpenAssistant(): void {
    if (this.liveAssistant === undefined) return
    if (!this.liveAssistant.ended) this.liveAssistant.abandon()
    this.liveAssistant = undefined
  }

  private closeOpenStep(turn: number): void {
    if (this.openStep === undefined) return
    this.session.append('step/end', { turn, step: this.openStep })
    this.openStep = undefined
  }

  private completedRunReason(): TurnEndReason {
    return this.runEndReason ?? { kind: 'completed' }
  }
}
