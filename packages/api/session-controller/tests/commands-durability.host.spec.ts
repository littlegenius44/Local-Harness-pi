import { Context } from '@deepseek-ai/cordis'
import type { Agent, ModelSelectionRef } from '@deepseek-ai/dsh-agent'
import AgentRegistry from '@deepseek-ai/dsh-agent'
import { createInboxStub } from '@deepseek-ai/dsh-agent-loop-testkit'
import AttachmentStore from '@deepseek-ai/dsh-attachment'
import FileUploads from '@deepseek-ai/dsh-client-file-upload'
import CommandRuntime from '@deepseek-ai/dsh-commands'
import { createUserMessage } from '@deepseek-ai/dsh-llm'
import { createScope } from '@deepseek-ai/dsh-scope'
import SessionStore, { SessionId } from '@deepseek-ai/dsh-session'
import { describe, expect, it, vi } from 'vitest'
import type { ApiSessionAgentController } from '../src/agent.ts'
import { SessionCommandController } from '../src/commands.ts'
import type { SessionRequestId } from '../src/types.ts'

const SESSION = SessionId('prompt-durability')

async function harness() {
  const ctx = new Context()
  await ctx.plugin(SessionStore)
  await ctx.plugin(AgentRegistry)
  await ctx.plugin(CommandRuntime)
  const session = ctx.sessions.create(SESSION, { meta: { cwd: '/workspace' } })
  const inbox = createInboxStub()
  const followup = vi.fn()
  const steer = vi.fn()
  const agent = {
    id: session.id,
    session,
    inbox,
    status: 'idle',
    ctx: undefined,
    followup,
    steer,
    cancel: vi.fn(),
  } as unknown as Agent
  ;(agent as { ctx: Context }).ctx = createScope(ctx, agent).ctx
  ctx.agents.register(agent)
  ctx.provide('attachments', Object.setPrototypeOf({
    saveImages: () => Promise.reject(new Error('fixture does not admit images')),
  }, AttachmentStore.prototype) as never)
  ctx.provide('llm', {
    listProviders: () => [{ id: 'fixture', name: 'Fixture' }],
    resolveModelInfo: () => Promise.resolve({ provider: 'fixture', id: 'fixture-model', name: 'Fixture' }),
  } as never)
  ctx.provide('connection', {
    fetch: { register: () => () => {} },
  } as never)
  const selection: ModelSelectionRef = {
    current: { provider: 'fixture', model: 'fixture-model' },
    assembled: undefined,
  }
  const agents = {
    resolveAgent: () => Promise.resolve({ agent }),
    selectionFor: () => selection,
    serializeImageAdmission: <Value>(_agent: Agent, operation: () => Promise<Value>) => operation(),
  } as unknown as ApiSessionAgentController
  new FileUploads(ctx)
  return {
    ctx,
    session,
    agent,
    followup,
    controller: new SessionCommandController(ctx, agents, '/workspace'),
  }
}

function request(requestId = 'req-1' as SessionRequestId) {
  return {
    requestId,
    sessionId: SESSION,
    mode: 'queue' as const,
    content: [{ type: 'text' as const, text: 'hello' }],
  }
}

describe('SessionCommandController prompt durability', () => {
  it('does not acknowledge a newly accepted prompt until its session flush settles', async () => {
    const { ctx, controller, followup } = await harness()
    const gate = Promise.withResolvers<undefined>()
    const flushing = vi.fn(async () => gate.promise)
    ctx.on('session/flush', flushing)

    let acknowledged = false
    const pending = controller.prompt(request()).then((value) => {
      acknowledged = true
      return value
    })
    await vi.waitFor(() => { expect(followup).toHaveBeenCalledOnce() })
    await vi.waitFor(() => { expect(flushing).toHaveBeenCalledOnce() })
    expect(acknowledged).toBe(false)
    gate.resolve(undefined)
    await expect(pending).resolves.toEqual({ accepted: true })
  })

  it('flushes an idempotent request before acknowledging the retry', async () => {
    const { ctx, controller, agent, followup } = await harness()
    const duplicate = createUserMessage({
      content: [{ type: 'text', text: 'already accepted' }],
      source: { kind: 'user', rpcId: request().requestId },
    })
    agent.inbox.append('next-turn', duplicate)
    const flushing = vi.fn(() => Promise.resolve())
    ctx.on('session/flush', flushing)

    await expect(controller.prompt(request())).resolves.toEqual({ accepted: true })
    expect(flushing).toHaveBeenCalledOnce()
    expect(followup).not.toHaveBeenCalled()
  })

  it('rejects the acknowledgement when the required flush fails', async () => {
    const { ctx, controller } = await harness()
    ctx.on('session/flush', () => Promise.reject(new Error('disk unavailable')))
    await expect(controller.prompt(request())).rejects.toThrow('disk unavailable')
  })
})
