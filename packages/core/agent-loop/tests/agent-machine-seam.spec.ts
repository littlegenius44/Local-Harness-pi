import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import AgentRegistry from '@deepseek-ai/dsh-agent'
import LlmRuntime from '@deepseek-ai/dsh-llm'
import SessionStore, { SessionId, SessionSeq } from '@deepseek-ai/dsh-session'
import SessionProjectionRegistry from '@deepseek-ai/dsh-session-projection'
import JsonlSessionPersistence from '@deepseek-ai/dsh-session-persistence-jsonl'
import SystemPrompt from '@deepseek-ai/dsh-system-prompt'
import ToolRuntime from '@deepseek-ai/dsh-tools'
import AgentLoop, { type AgentLoopMachine, type AgentMachineCreateInput } from '../src/index.ts'
import { ReactLoopAgent } from '../src/agent.ts'

const cleanup: Array<() => Promise<void>> = []
afterEach(async () => {
  for (const dispose of cleanup.splice(0).reverse()) await dispose()
})

class InjectedMachine extends ReactLoopAgent {}

async function harness(fail = false, useDefault = false) {
  const root = await mkdtemp(join(tmpdir(), 'dsh-machine-seam-'))
  cleanup.push(() => rm(root, { recursive: true, force: true }))
  const ctx = new Context()
  cleanup.push(() => ctx.fiber.dispose())
  const inputs: AgentMachineCreateInput[] = []
  const failure = new Error('machine construction failed')
  class TestLoop extends AgentLoop {
    protected override createMachine(input: AgentMachineCreateInput): AgentLoopMachine {
      inputs.push(input)
      if (fail) throw failure
      return new InjectedMachine(input.ctx, input.id, input.options, input.session)
    }
  }
  await ctx.plugin(LlmRuntime)
  await ctx.plugin(SessionStore)
  await ctx.plugin(SessionProjectionRegistry)
  await ctx.plugin(SystemPrompt)
  await ctx.plugin(ToolRuntime)
  await ctx.plugin(AgentRegistry)
  await ctx.plugin(JsonlSessionPersistence, { root })
  const fiber = await ctx.plugin(useDefault ? AgentLoop : TestLoop, { agents: [] })
  return { ctx, inputs, failure, fiber }
}

describe('AgentLoop machine construction', () => {
  it('keeps the default React machine', async () => {
    const { ctx } = await harness(false, true)
    const handle = await ctx.agents.create({ sessionId: SessionId('default') })
    expect(handle.agent).toBeInstanceOf(ReactLoopAgent)
    await handle.dispose()
  })

  it('uses the injected machine for create and resume with the acquired Session', async () => {
    const { ctx, inputs } = await harness()
    const id = SessionId('round-trip')
    const first = await ctx.agents.create({
      sessionId: id,
      agentOptions: { model: 'fixture' },
      seed: [
        { type: 'turn/start', seq: SessionSeq(0), time: 1, data: { turn: 1 } },
        { type: 'turn/end', seq: SessionSeq(1), time: 2, data: { turn: 1, reason: { kind: 'completed' } } },
      ],
    })
    expect(first.agent).toBeInstanceOf(InjectedMachine)
    expect(inputs[0]?.session).toBe(first.agent.session)
    expect(inputs[0]?.options).toBe(first.agent.options)
    expect(ctx.agents.get(id)).toBe(first.agent)
    const committed = first.agent.session.snapshotEvents()
    await first.dispose()
    const resumed = await ctx.agents.resume({ resumeSessionId: id })
    expect(resumed.agent).toBeInstanceOf(InjectedMachine)
    expect(inputs).toHaveLength(2)
    expect(inputs[1]?.session).toBe(resumed.agent.session)
    expect(inputs[1]?.session).not.toBe(first.agent.session)
    expect(resumed.agent.session.snapshotEvents()).toEqual(committed)
    await resumed.dispose()
    expect(ctx.agents.get(id)).toBeUndefined()
    expect(ctx.sessions.get(id)).toBeUndefined()
    const writer = await ctx.sessionPersistence.open(id, 'write')
    await writer.close()
  })

  it('rolls back construction errors and releases the reserved identity', async () => {
    const { ctx, failure, inputs } = await harness(true)
    const id = SessionId('throwing')
    for (let attempt = 0; attempt < 2; attempt++) {
      await expect(ctx.agents.create({ sessionId: id })).rejects.toBe(failure)
      expect(ctx.agents.get(id)).toBeUndefined()
      expect(ctx.sessions.get(id)).toBeUndefined()
    }
    expect(inputs).toHaveLength(2)
  })

  it('does not construct a machine for an already cancelled request', async () => {
    const { ctx, inputs } = await harness()
    const reason = new Error('cancel before construction')
    await expect(ctx.agents.create({
      sessionId: SessionId('cancelled'), signal: AbortSignal.abort(reason),
    })).rejects.toBe(reason)
    expect(inputs).toHaveLength(0)
  })

  it('factory teardown cancels and drains the injected machine exactly once', async () => {
    const { ctx, fiber } = await harness()
    const id = SessionId('dispose')
    const handle = await ctx.agents.create({ sessionId: id })
    const cancel = vi.spyOn(handle.agent, 'cancel')
    const idle = vi.spyOn(handle.agent, 'whenIdle')
    await fiber.dispose()
    await handle.dispose()
    expect(cancel).toHaveBeenCalledExactlyOnceWith({ kind: 'disposed' })
    expect(idle).toHaveBeenCalledTimes(1)
    expect(ctx.agents.get(id)).toBeUndefined()
    expect(ctx.sessions.get(id)).toBeUndefined()
  })

  it('owner disposal during setup rolls back an injected machine before publication', async () => {
    const { ctx, inputs } = await harness()
    const id = SessionId('owner-abort')
    const started = Promise.withResolvers<undefined>()
    const gate = Promise.withResolvers<undefined>()
    let creating!: ReturnType<typeof ctx.agents.create>
    const owner = await ctx.plugin(Object.assign((inner: Context) => {
      creating = inner.agents.create({
        sessionId: id,
        setup: async () => { started.resolve(undefined); await gate.promise },
      })
    }, { inject: ['agents'] }))
    await started.promise
    const rejected = expect(creating).rejects.toThrow(/owner disposed during setup/)
    try {
      await owner.dispose()
      await rejected
      expect(inputs).toHaveLength(1)
      expect(ctx.agents.get(id)).toBeUndefined()
      expect(ctx.sessions.get(id)).toBeUndefined()
    } finally {
      gate.resolve(undefined)
    }
  })
})
