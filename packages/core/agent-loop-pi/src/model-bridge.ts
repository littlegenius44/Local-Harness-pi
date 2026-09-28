/** Immutable per-step values shared by preparation and model streaming. */

import type { Agent as DshAgent, AgentEventDispatch, PreStepDecision } from '@deepseek-ai/dsh-agent'
import { agentEvents, assembleContextFor } from '@deepseek-ai/dsh-agent'
import {
  LlmError,
  markAgentLoopRequest,
  type GenerateOptions,
  type LlmCallConfig,
  type PreparedLlmCall,
  type UserMessage,
} from '@deepseek-ai/dsh-llm'
import {
  ReactLoopInbox,
  RuntimeContextProjection,
} from '@deepseek-ai/dsh-agent-loop'
import { deepFreeze } from '@deepseek-ai/dsh-util-values'
import { canonicalHeader, headerEquals } from '@deepseek-ai/dsh-session'
import type { EpochHeader, RequestContext, Session } from '@deepseek-ai/dsh-session'
import {
  joinContextSections,
  renderContextSections,
  renderPrompt,
  type PromptAssembly,
} from '@deepseek-ai/dsh-system-prompt'
import type { Context } from '@deepseek-ai/cordis'
import type { AgentContext } from '@earendil-works/pi-agent-core'
import type { AssistantMessageEvent } from '@earendil-works/pi-ai'
import type { KernelRunInput } from './kernel-driver.ts'
import { toPiAssistantEvents } from './stream-conversion.ts'
import type {
  FrozenModelSelection,
  KernelContextSnapshot,
  KernelToolSchema,
  TurnPosition,
} from './kernel-driver.ts'

/** Fully accepted step snapshot; no mutable registry state crosses this boundary. */
export interface PreparedKernelStep {
  readonly position: TurnPosition
  readonly admittedMessages: readonly UserMessage[]
  readonly prompt: Readonly<{
    readonly rendered: string
    readonly sections: readonly unknown[]
    readonly tools: readonly KernelToolSchema[]
  }>
  readonly model: FrozenModelSelection
  readonly context: KernelContextSnapshot
  readonly startsRequestSeries: boolean
}

/** Creates the one immutable snapshot consumed by a kernel step. */
export interface StepPreparer {
  prepare(
    agent: DshAgent,
    target: 'next-turn' | 'next-step',
    position: TurnPosition,
    signal: AbortSignal,
  ): Promise<{ kind: 'reject' } | { kind: 'enter'; value: PreparedKernelStep }>
}

/** Resolves DSH model configuration and streams one prepared DSH request. */
export interface DshModelStreamBridge {
  resolve(
    agent: DshAgent,
    position: TurnPosition,
    signal: AbortSignal,
  ): Promise<FrozenModelSelection>

  stream(
    step: PreparedKernelStep,
    piContext: unknown,
    signal: AbortSignal,
  ): AsyncIterable<unknown>
}

interface ResolvedStep {
  readonly config: LlmCallConfig
  readonly preparedCall?: PreparedLlmCall
  readonly assembly: PromptAssembly
}

/** DSH-native step preparation and model streaming used by the production Pi machine. */
export class DshStepRuntime implements StepPreparer, DshModelStreamBridge {
  private readonly dispatch: AgentEventDispatch
  private readonly runtimeContext: RuntimeContextProjection
  private readonly resolved = new WeakMap<PreparedKernelStep, ResolvedStep>()
  private generation = 0
  private turn = 0
  private step = 0
  private requestHeaderLogged = false
  private requestSurfaceGeneration: number
  private latest: PreparedKernelStep | undefined
  private readonly preparedByPosition = new Map<string, PreparedKernelStep>()

  constructor(
    private readonly loopCtx: Context,
    private readonly agent: DshAgent,
    private readonly session: Session,
  ) {
    this.dispatch = agentEvents(loopCtx, agent)
    this.runtimeContext = new RuntimeContextProjection(agent.ctx, session)
    this.requestSurfaceGeneration = session.surface.replaceGeneration
  }

  async prepare(
    agent: DshAgent,
    target: 'next-turn' | 'next-step',
    position: TurnPosition,
    signal: AbortSignal,
  ): Promise<{ kind: 'reject' } | { kind: 'enter'; value: PreparedKernelStep }> {
    if (agent !== this.agent || !(agent.inbox instanceof ReactLoopInbox)) {
      throw new Error('DshStepRuntime requires its owning DshPiAgent and ReactLoopInbox')
    }
    const claimed = agent.inbox.claim(target, position.turn)
    const assembly = await this.loopCtx.systemPrompt.assemble(assembleContextFor(agent, signal))
    signal.throwIfAborted()
    const sections = renderContextSections(assembly)
    const runtime = this.runtimeContext.project(joinContextSections(sections), sections)
    const proposed = runtime === undefined ? claimed : [...claimed, runtime]
    const decision = await this.dispatch.waterfall(
      'agent/pre-step',
      { messages: proposed, ...position, signal },
      (): Promise<PreStepDecision> => Promise.resolve({ kind: 'enter', messages: proposed }),
    )
    signal.throwIfAborted()
    if (decision.kind === 'reject') return decision
    const resolved = await this.resolveCall(position, signal)
    const tools: KernelToolSchema[] = assembly.tools.map(tool => ({
      name: tool.name,
      label: tool.name,
      description: tool.description,
      parameters: structuredClone(tool.parameters),
      executionMode: 'sequential',
    }))
    const model = this.selectionOf(resolved)
    const admittedMessages = Object.freeze([...decision.messages])
    const snapshot: KernelContextSnapshot = deepFreeze({
      sessionId: this.session.id,
      systemPrompt: renderPrompt(assembly),
      messages: Object.freeze([...this.session.deriveMessages()]),
      tools,
      model,
      sessionSurfaceGeneration: this.session.surface.replaceGeneration,
    })
    const value: PreparedKernelStep = deepFreeze({
      position,
      admittedMessages,
      prompt: {
        rendered: renderPrompt(assembly),
        sections: structuredClone(sections),
        tools,
      },
      model,
      context: snapshot,
      startsRequestSeries: decision.startsRequestSeries === true,
    })
    this.resolved.set(value, { ...resolved, assembly })
    this.latest = value
    this.preparedByPosition.set(positionKey(position), value)
    this.turn = position.turn
    this.step = position.step
    return { kind: 'enter', value }
  }

  async resolve(
    agent: DshAgent,
    position: TurnPosition,
    signal: AbortSignal,
  ): Promise<FrozenModelSelection> {
    if (agent !== this.agent) throw new Error('model resolution requested for a different Agent')
    return this.selectionOf(await this.resolveCall(position, signal))
  }

  stream(
    step: PreparedKernelStep,
    _piContext: AgentContext,
    signal: AbortSignal,
  ): AsyncIterable<AssistantMessageEvent> {
    const resolved = this.resolved.get(step)
    if (resolved === undefined) throw new Error('model stream requested for an unprepared step')
    const request = this.buildRequest(step, resolved, signal)
    const chunks = resolved.preparedCall?.stream(request) ?? this.loopCtx.llm.stream(request)
    return toPiAssistantEvents(chunks, step.model)
  }

  /** Prepare the dense next step requested by Pi's continuing tool loop. */
  prepareNext(signal: AbortSignal): ReturnType<StepPreparer['prepare']> {
    return this.prepare(this.agent, 'next-step', { turn: this.turn, step: this.step + 1 }, signal)
  }

  /** Return the already-prepared opening step for a newly started kernel run. */
  initialStep(input: KernelRunInput): PreparedKernelStep {
    const step = this.latest
    if (step === undefined || step.position.turn !== input.turn || step.position.step !== 1) {
      throw new Error('kernel run started without its prepared opening step')
    }
    return step
  }

  /** Pi coordinator alias for the shared next-step preparation path. */
  prepareNextStep(signal: AbortSignal): ReturnType<StepPreparer['prepare']> {
    return this.prepareNext(signal)
  }

  /** Look up the immutable step Pi prepared immediately before `turn_start`. */
  stepAt(position: TurnPosition): PreparedKernelStep | undefined {
    return this.preparedByPosition.get(positionKey(position))
  }

  private async resolveCall(
    position: TurnPosition,
    signal: AbortSignal,
  ): Promise<{ config: LlmCallConfig; preparedCall?: PreparedLlmCall }> {
    const persisted = this.session.requestHeader()
    const route = { provider: this.agent.options.provider ?? '', model: this.agent.options.model ?? '' }
    const seed = deepFreeze(structuredClone(this.requestHeaderLogged && persisted !== undefined
      ? requestProposal(persisted)
      : {
        ...route,
        ...this.agent.options.reasoningEffort === undefined
          ? {}
          : { reasoningEffort: this.agent.options.reasoningEffort },
        ...this.agent.options.maxTokens === undefined ? {} : { maxTokens: this.agent.options.maxTokens },
      }))
    const proposed = await this.dispatch.waterfall(
      'agent/request',
      { ...position, signal },
      () => Promise.resolve(seed),
    )
    signal.throwIfAborted()
    if (!proposed.provider || !proposed.model) {
      throw new Error(`agent "${this.agent.id}" has no provider/model`)
    }
    try {
      const preparedCall = await this.loopCtx.llm.prepareCall(proposed, signal)
      return { config: preparedCall.config, preparedCall }
    } catch (error: unknown) {
      if (!(error instanceof LlmError) || error.code !== 'NO_ADAPTER') throw error
      return { config: proposed }
    }
  }

  private selectionOf(resolved: { config: LlmCallConfig; preparedCall?: PreparedLlmCall }): FrozenModelSelection {
    const { config, preparedCall } = resolved
    return deepFreeze({
      provider: config.provider,
      model: config.model,
      wireApi: 'openai-responses' as const,
      ...config.reasoningEffort === undefined ? {} : { reasoningEffort: config.reasoningEffort },
      ...config.maxTokens === undefined ? {} : { maxTokens: config.maxTokens },
      ...preparedCall?.context?.contextWindow === undefined
        ? {}
        : { contextWindow: preparedCall.context.contextWindow },
      inputModalities: preparedCall?.inputModalities ?? ['text'],
      generation: ++this.generation,
    })
  }

  private buildRequest(
    step: PreparedKernelStep,
    resolved: ResolvedStep,
    signal: AbortSignal,
  ): GenerateOptions {
    const tools = resolved.assembly.tools
    const header = canonicalHeader({
      config: resolved.config,
      ...resolved.preparedCall === undefined ? {} : { adapterDefaults: resolved.preparedCall.adapterDefaults },
      ...tools.length === 0 ? {} : { tools: [...tools] },
    })
    const baseline = this.session.requestHeader()
    const startsSeries = step.startsRequestSeries
      || this.requestSurfaceGeneration !== this.session.surface.replaceGeneration
    if (!this.requestHeaderLogged) {
      this.session.append('request/header', { header, reason: baseline === undefined ? 'initial' : 'resume' })
      this.requestHeaderLogged = true
    } else if (baseline === undefined || !headerEquals(baseline, header)) {
      this.session.append('request/header', {
        header,
        reason: 'change',
        ...startsSeries ? { startsSeries: true } : {},
      })
    } else if (startsSeries) {
      this.session.append('request/header', { header, reason: 'series' })
    }
    this.requestSurfaceGeneration = this.session.surface.replaceGeneration
    const requestContext: RequestContext = {
      provider: resolved.config.provider,
      model: resolved.config.model,
      ...resolved.preparedCall?.context?.contextWindow === undefined
        ? {}
        : { contextWindow: resolved.preparedCall.context.contextWindow },
      ...resolved.preparedCall?.systemPromptUpdate === undefined
        ? {}
        : { systemPromptUpdate: resolved.preparedCall.systemPromptUpdate },
    }
    const previous = this.session.requestContext()
    if (previous?.provider !== requestContext.provider
      || previous.model !== requestContext.model
      || previous.contextWindow !== requestContext.contextWindow
      || previous.systemPromptUpdate !== requestContext.systemPromptUpdate) {
      this.session.append('request/context', requestContext)
    }
    signal.throwIfAborted()
    return markAgentLoopRequest(Object.freeze({
      ...header.config,
      messages: this.session.deriveMessages(),
      ...header.tools === undefined ? {} : { tools: header.tools },
      sessionId: this.session.id,
      signal,
    }))
  }
}

/** Remove adapter defaults before proposing a persisted request header again. */
function requestProposal(header: EpochHeader): LlmCallConfig {
  if (header.adapterDefaults === undefined) return header.config
  const proposal = { ...header.config }
  if (header.adapterDefaults.reasoningEffort === true) delete proposal.reasoningEffort
  if (header.adapterDefaults.maxTokens === true) delete proposal.maxTokens
  return proposal
}

function positionKey(position: TurnPosition): string {
  return `${position.turn}:${position.step}`
}
