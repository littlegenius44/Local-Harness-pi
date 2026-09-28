import { Context } from '@deepseek-ai/cordis'
import AgentRegistry from '@deepseek-ai/dsh-agent'
import AgentLoop, {
  ReactLoopInbox,
  type AgentLoopMachine,
  type AgentMachineCreateInput,
} from '@deepseek-ai/dsh-agent-loop'
import LlmRuntime, {
  createAssistantMessage,
  createToolResultMessage,
  createUserMessage,
  ToolCallId,
  type UserMessage,
} from '@deepseek-ai/dsh-llm'
import SessionStore, { SessionId } from '@deepseek-ai/dsh-session'
import SessionProjectionRegistry from '@deepseek-ai/dsh-session-projection'
import SystemPrompt from '@deepseek-ai/dsh-system-prompt'
import ToolRuntime, { defineTool } from '@deepseek-ai/dsh-tools'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { KernelEventOrderSink } from '../src/event-bridge.ts'
import {
  RunId,
  type KernelDriver,
  type KernelEvent,
  type KernelEventSink,
  type KernelRun,
  type KernelRunInput,
  type KernelRunResult,
} from '../src/kernel-driver.ts'
import type { PreparedKernelStep, StepPreparer } from '../src/model-bridge.ts'
import { DshPiAgent } from '../src/pi-agent.ts'
import { PiKernelDriver, dshStreamAsPiEvents } from '../src/pi-kernel-driver.ts'

const cleanup: Array<() => Promise<void>> = []

afterEach(async () => {
  for (const dispose of cleanup.splice(0).reverse()) await dispose()
})

const model = {
  provider: 'fixture',
  model: 'fixture-model',
  wireApi: 'openai-responses',
  inputModalities: ['text'],
  generation: 1,
} as const

class ClaimingPreparer implements StepPreparer {
  async prepare(
    agent: Parameters<StepPreparer['prepare']>[0],
    target: Parameters<StepPreparer['prepare']>[1],
    position: Parameters<StepPreparer['prepare']>[2],
    signal: AbortSignal,
  ): Promise<{ kind: 'reject' } | { kind: 'enter'; value: PreparedKernelStep }> {
    signal.throwIfAborted()
    const admittedMessages = (agent.inbox as ReactLoopInbox).claim(target, position.turn)
    return {
      kind: 'enter',
      value: {
        position,
        admittedMessages,
        prompt: { rendered: '', sections: [], tools: [] },
        model,
        context: {
          sessionId: agent.session.id,
          systemPrompt: '',
          messages: agent.session.deriveMessages(),
          tools: [],
          model,
          sessionSurfaceGeneration: agent.session.surface.replaceGeneration,
        },
        startsRequestSeries: false,
      },
    }
  }
}

class FakeKernelDriver implements KernelDriver {
  readonly descriptor = {
    id: 'pi',
    version: '0.85.1',
    capabilities: {
      streaming: true,
      tools: true,
      parallelTools: false,
      steering: true,
      reasoning: true,
      images: true,
    },
  } as const

  readonly runs: KernelRunInput[] = []
  readonly started = Promise.withResolvers<undefined>()
  readonly release = Promise.withResolvers<undefined>()

  start(input: KernelRunInput, sink: KernelEventSink): KernelRun {
    this.runs.push(input)
    const local = new AbortController()
    const signal = AbortSignal.any([input.signal, local.signal])
    const settled = (async (): Promise<KernelRunResult> => {
      await sink.onEvent({ type: 'run.started', runId: input.runId }, signal)
      await sink.onEvent({ type: 'step.started', position: { turn: input.turn, step: 1 } }, signal)
      for (const message of input.initialMessages) {
        await sink.onEvent({
          type: 'message.started',
          position: { turn: input.turn, step: 1 },
          message,
        }, signal)
        await sink.onEvent({
          type: 'message.completed',
          position: { turn: input.turn, step: 1 },
          message,
        }, signal)
      }
      this.started.resolve(undefined)
      await Promise.race([
        this.release.promise,
        new Promise<undefined>((resolve) => {
          signal.addEventListener('abort', () => { resolve(undefined) }, { once: true })
        }),
      ])
      if (signal.aborted) return { kind: 'cancelled', reason: signal.reason }
      const assistant = createAssistantMessage({
        content: [{ type: 'text', text: 'done' }],
        source: { provider: model.provider, model: model.model },
      })
      await sink.onEvent({
        type: 'message.started',
        position: { turn: input.turn, step: 1 },
        message: assistant,
      }, signal)
      await sink.onEvent({
        type: 'message.completed',
        position: { turn: input.turn, step: 1 },
        message: assistant,
      }, signal)
      await sink.onEvent({
        type: 'step.completed',
        position: { turn: input.turn, step: 1 },
        reason: 'completed',
      }, signal)
      await sink.onEvent({
        type: 'run.completed',
        turn: input.turn,
        reason: { kind: 'completed' },
      }, signal)
      return { kind: 'completed' }
    })()
    return {
      runId: input.runId,
      settled,
      abort(reason: unknown) { local.abort(reason) },
    }
  }
}

class FakeToolKernelDriver implements KernelDriver {
  readonly descriptor = new FakeKernelDriver().descriptor

  start(input: KernelRunInput, sink: KernelEventSink): KernelRun {
    const local = new AbortController()
    const signal = AbortSignal.any([input.signal, local.signal])
    const settled = (async (): Promise<KernelRunResult> => {
      const position = { turn: input.turn, step: 1 }
      const callId = ToolCallId('write-1')
      const assistant = createAssistantMessage({
        content: [{ type: 'tool-call', id: callId, name: 'write', arguments: '{"value":"x"}' }],
        source: { provider: model.provider, model: model.model },
      })
      await sink.onEvent({ type: 'run.started', runId: input.runId }, signal)
      await sink.onEvent({ type: 'step.started', position }, signal)
      for (const message of input.initialMessages) {
        await sink.onEvent({ type: 'message.started', position, message }, signal)
        await sink.onEvent({ type: 'message.completed', position, message }, signal)
      }
      await sink.onEvent({ type: 'message.started', position, message: assistant }, signal)
      await sink.onEvent({ type: 'message.completed', position, message: assistant }, signal)
      await sink.onEvent({
        type: 'tool.started', position, callId, name: 'write', arguments: { value: 'x' }, sourceIndex: 0,
      }, signal)
      await sink.onEvent({
        type: 'tool.completed', position, callId, sourceIndex: 0,
        result: { callId, sourceIndex: 0, content: [], isError: false },
      }, signal)
      const toolResult = createToolResultMessage({
        callId,
        content: [{ type: 'text', text: 'Pi placeholder' }],
        isError: false,
      })
      await sink.onEvent({ type: 'message.started', position, message: toolResult }, signal)
      await sink.onEvent({ type: 'message.completed', position, message: toolResult }, signal)
      await sink.onEvent({ type: 'step.completed', position, reason: 'tool-calls' }, signal)
      await sink.onEvent({ type: 'run.completed', turn: input.turn, reason: { kind: 'completed' } }, signal)
      return { kind: 'completed' }
    })()
    return {
      runId: input.runId,
      settled,
      abort(reason: unknown) { local.abort(reason) },
    }
  }
}

async function harness<Driver extends KernelDriver = FakeKernelDriver>(provided?: Driver) {
  const ctx = new Context()
  cleanup.push(() => ctx.fiber.dispose())
  const driver = (provided ?? new FakeKernelDriver()) as Driver
  const stepPreparer = new ClaimingPreparer()
  class TestPiLoop extends AgentLoop {
    protected override createMachine(input: AgentMachineCreateInput): AgentLoopMachine {
      return new DshPiAgent(input.ctx, input.id, input.options, input.session, {
        driver,
        stepPreparer,
      })
    }
  }
  await ctx.plugin(LlmRuntime)
  await ctx.plugin(SessionStore)
  await ctx.plugin(SessionProjectionRegistry)
  await ctx.plugin(SystemPrompt)
  await ctx.plugin(ToolRuntime)
  await ctx.plugin(AgentRegistry)
  await ctx.plugin(TestPiLoop, { agents: [] })
  const id = SessionId('pi-machine')
  const handle = await ctx.agents.create({
    sessionId: id,
    agentOptions: { provider: model.provider, model: model.model },
  })
  cleanup.push(() => handle.dispose())
  return { ctx, agent: handle.agent, driver, session: handle.agent.session }
}

function user(text: string): UserMessage {
  return createUserMessage({ content: [{ type: 'text', text }], source: { kind: 'user' } })
}

describe('DshPiAgent lifecycle', () => {
  it('owns one DSH turn per run and commits a claimed prompt once before settling idle', async () => {
    const { agent, driver, session } = await harness()
    const prompt = user('hello')
    agent.followup(prompt)
    expect(agent.status).toBe('running')
    await driver.started.promise
    expect(session.deriveMessages().filter(message => message.id === prompt.id)).toHaveLength(1)
    driver.release.resolve(undefined)
    await agent.whenIdle()
    expect(agent.status).toBe('idle')
    expect(driver.runs).toHaveLength(1)
    expect(session.snapshotEvents().map(event => event.type)).toEqual(expect.arrayContaining([
      'turn/start',
      'step/start',
      'user/message',
      'assistant/message',
      'step/end',
      'turn/end',
    ]))
  })

  it('aborts the current run while preserving queued input when keepInbox is true', async () => {
    const { agent, driver } = await harness()
    agent.followup(user('first'))
    await driver.started.promise
    const queued = user('later')
    agent.followup(queued)
    agent.cancel({ kind: 'user' }, { keepInbox: true })
    await agent.whenIdle()
    expect(agent.inbox.nextTurn.map(message => message.id)).toContain(queued.id)
  })

  it('does not settle idle until the completed turn is flushed', async () => {
    const { ctx, agent, driver, session } = await harness()
    const gate = Promise.withResolvers<undefined>()
    ctx.on('session/flush', () => gate.promise)
    agent.followup(user('flush me'))
    await driver.started.promise
    driver.release.resolve(undefined)
    await vi.waitFor(() => {
      expect(session.snapshotEvents().at(-1)?.type).toBe('turn/end')
    })
    expect(agent.status).toBe('running')
    gate.resolve(undefined)
    await agent.whenIdle()
    expect(agent.status).toBe('idle')
  })

  it('commits Pi tool calls and canonical DSH results in source order', async () => {
    const { ctx, agent, session } = await harness(new FakeToolKernelDriver())
    ctx.tools.register(defineTool({
      name: 'write',
      description: 'fixture write',
      parameters: { value: { type: 'string', required: true } },
      output: {
        schema: { type: 'string' },
        render: (_args, value) => [{ type: 'text', text: value }],
        presentationMeta: () => ({ card: 'write' }),
      },
      async execute(args) { return `saved:${args.value}` },
    }))
    agent.followup(user('use the tool'))
    await agent.whenIdle()

    const events = session.snapshotEvents()
    const call = events.find(event => event.type === 'tool/call')
    const result = events.find(event => event.type === 'tool/result')
    expect(events.map(event => event.type)).toEqual(expect.arrayContaining([
      'assistant/message', 'tool/call', 'tool/result', 'turn/end',
    ]))
    expect(result).toMatchObject({
      data: {
        message: { content: [{ type: 'tool-result', content: [{ type: 'text', text: 'saved:x' }] }] },
        meta: { card: 'write' },
      },
      sourceEventSeqs: [call?.seq],
    })
  })
})

describe('Kernel event ordering', () => {
  it('rejects duplicate and out-of-order terminal events with KERNEL_EVENT_ORDER', async () => {
    const accepted: KernelEvent[] = []
    const sink = new KernelEventOrderSink({
      async onEvent(event) { accepted.push(event) },
    })
    const signal = new AbortController().signal
    const runId = RunId('ordered')
    await sink.onEvent({ type: 'run.started', runId }, signal)
    await expect(sink.onEvent({ type: 'run.started', runId }, signal)).rejects.toMatchObject({
      code: 'KERNEL_EVENT_ORDER',
    })
    expect(accepted).toHaveLength(1)
  })

  it('awaits the downstream barrier before accepting run completion', async () => {
    const gate = Promise.withResolvers<undefined>()
    const seen: string[] = []
    const sink = new KernelEventOrderSink({
      async onEvent(event) {
        if (event.type === 'run.completed') await gate.promise
        seen.push(event.type)
      },
    })
    const signal = new AbortController().signal
    const runId = RunId('barrier')
    await sink.onEvent({ type: 'run.started', runId }, signal)
    const pending = sink.onEvent({
      type: 'run.completed',
      turn: 1,
      reason: { kind: 'completed' },
    }, signal)
    await Promise.resolve()
    expect(seen).toEqual(['run.started'])
    gate.resolve(undefined)
    await pending
    expect(seen).toEqual(['run.started', 'run.completed'])
  })
})

describe('PiKernelDriver', () => {
  it('maps one low-level Pi run to one DSH turn with awaited events', async () => {
    const prompt = user('drive Pi')
    const step: PreparedKernelStep = {
      position: { turn: 1, step: 1 },
      admittedMessages: [prompt],
      prompt: { rendered: '', sections: [], tools: [] },
      model,
      context: {
        sessionId: SessionId('pi-driver'),
        systemPrompt: '',
        messages: [],
        tools: [],
        model,
        sessionSurfaceGeneration: 0,
      },
      startsRequestSeries: false,
    }
    const driver = new PiKernelDriver({
      initialStep: () => step,
      async prepareNextStep() { return { kind: 'reject' } },
      stream: () => dshStreamAsPiEvents(step, (async function* () {
        yield { type: 'block-start', index: 0, blockType: 'text' } as const
        yield { type: 'text-delta', index: 0, text: 'ok' } as const
        yield { type: 'block-end', index: 0, block: { type: 'text', text: 'ok' } } as const
        yield { type: 'finish', reason: { kind: 'stop' } } as const
      })()),
    })
    const events: KernelEvent[] = []
    const input: KernelRunInput = {
      runId: RunId('real-pi'),
      sessionId: step.context.sessionId,
      turn: 1,
      initialMessages: [prompt],
      initialContext: step.context,
      signal: new AbortController().signal,
    }
    const run = driver.start(input, { async onEvent(event) { events.push(event) } })
    await expect(run.settled).resolves.toEqual({ kind: 'completed' })
    expect(events.map(event => event.type)).toEqual([
      'run.started',
      'step.started',
      'message.started',
      'message.completed',
      'message.started',
      'message.delta',
      'message.delta',
      'message.delta',
      'message.delta',
      'message.delta',
      'message.completed',
      'step.completed',
      'run.completed',
    ])
  })
})
