import { Context } from '@deepseek-ai/cordis'
import type { Agent } from '@deepseek-ai/dsh-agent'
import {
  createAssistantMessage,
  createUserMessage,
  ToolCallId,
} from '@deepseek-ai/dsh-llm'
import SessionStore, { SessionId } from '@deepseek-ai/dsh-session'
import SystemPrompt from '@deepseek-ai/dsh-system-prompt'
import ToolRuntime, { defineTool } from '@deepseek-ai/dsh-tools'
import { describe, expect, it, vi } from 'vitest'
import { DshToolBridge } from '../src/tool-bridge.ts'

async function harness() {
  const ctx = new Context()
  await ctx.plugin(SessionStore)
  await ctx.plugin(SystemPrompt)
  await ctx.plugin(ToolRuntime)
  const session = ctx.sessions.create(SessionId('pi-tool-bridge'))
  const inject = vi.fn()
  const agent = { session, inject } as unknown as Agent
  session.append('turn/start', { turn: 1 })
  session.append('step/start', { turn: 1, step: 1 })
  return { ctx, session, agent, inject, bridge: new DshToolBridge(ctx, agent) }
}

function assistantWithCall(callId: ReturnType<typeof ToolCallId>, name: string, args: string) {
  return createAssistantMessage({
    content: [{ type: 'tool-call', id: callId, name, arguments: args }],
    source: { provider: 'fixture', model: 'fixture' },
  })
}

describe('DshToolBridge', () => {
  it('routes one call through ctx.tools.execute and commits the lossless result after its call', async () => {
    const { ctx, session, agent, inject, bridge } = await harness()
    const callId = ToolCallId('call-1')
    const serializedArguments = '{ "value" : "x" }'
    const deferred = createUserMessage({
      content: [{ type: 'text', text: 'next-step context' }],
      source: { kind: 'plugin', plugin: 'fixture' },
    })
    ctx.tools.register(defineTool({
      name: 'write',
      description: 'fixture side effect',
      parameters: { value: { type: 'string', required: true } },
      output: {
        schema: { type: 'string' },
        render: (_args, value) => [{ type: 'text', text: value }],
        presentationMeta: () => ({ card: 'write-result' }),
      },
      async execute(args, exec) {
        expect(session.snapshotEvents().at(-1)?.type).toBe('tool/call')
        exec.deferContext(deferred)
        exec.concludeTurn()
        return `saved:${args.value}`
      },
    }))
    session.append('assistant/message', {
      turn: 1,
      step: 1,
      message: assistantWithCall(callId, 'write', serializedArguments),
      stream: [],
    }, { surfaceOp: 'append' })

    bridge.start({
      type: 'tool.started',
      position: { turn: 1, step: 1 },
      callId,
      name: 'write',
      arguments: { value: 'x' },
      serializedArguments,
      sourceIndex: 0,
    })
    const result = await bridge.execute(
      { position: { turn: 1, step: 1 } } as never,
      callId,
      'write',
      { value: 'x' },
      new AbortController().signal,
      () => {},
    )
    expect(result).toMatchObject({
      callId,
      sourceIndex: 0,
      content: [{ type: 'text', text: 'saved:x' }],
      isError: false,
      meta: { card: 'write-result' },
      concludesTurn: true,
    })
    await bridge.complete({
      type: 'tool.completed',
      position: { turn: 1, step: 1 },
      callId,
      sourceIndex: 0,
      result,
    }, new AbortController().signal)
    bridge.commit(callId, { turn: 1, step: 1 })

    const events = session.snapshotEvents()
    const call = events.find(event => event.type === 'tool/call')
    const committed = events.find(event => event.type === 'tool/result')
    expect(call).toMatchObject({ data: { arguments: serializedArguments } })
    expect(committed).toMatchObject({
      data: {
        message: { content: [{ type: 'tool-result', content: result.content, isError: false }] },
        meta: { card: 'write-result' },
      },
      surfaceOp: 'append',
      sourceEventSeqs: [call?.seq],
    })
    expect(inject).toHaveBeenCalledWith(deferred)
    expect(agent).toBeDefined()
  })

  it('routes Pi-side immediate failures through the public pipeline before commit', async () => {
    const { session, bridge } = await harness()
    const callId = ToolCallId('missing-1')
    session.append('assistant/message', {
      turn: 1,
      step: 1,
      message: assistantWithCall(callId, 'missing', '{}'),
      stream: [],
    }, { surfaceOp: 'append' })
    bridge.start({
      type: 'tool.started',
      position: { turn: 1, step: 1 },
      callId,
      name: 'missing',
      arguments: {},
      sourceIndex: 0,
    })

    await bridge.complete({
      type: 'tool.completed',
      position: { turn: 1, step: 1 },
      callId,
      sourceIndex: 0,
      result: {
        callId,
        sourceIndex: 0,
        content: [{ type: 'text', text: 'Pi said unknown' }],
        isError: true,
      },
    }, new AbortController().signal)
    bridge.commit(callId, { turn: 1, step: 1 })
    expect(session.snapshotEvents().find(event => event.type === 'tool/result')).toMatchObject({
      data: {
        message: { content: [{ type: 'tool-result', isError: true }] },
        error: { code: 'UNKNOWN_TOOL' },
      },
    })
  })
})
