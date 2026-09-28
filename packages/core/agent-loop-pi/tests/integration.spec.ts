import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { Context } from '@deepseek-ai/cordis'
import AgentRegistry, { type Agent } from '@deepseek-ai/dsh-agent'
import LlmRuntime, { createUserMessage } from '@deepseek-ai/dsh-llm'
import SessionStore, { SessionId } from '@deepseek-ai/dsh-session'
import SessionProjectionRegistry from '@deepseek-ai/dsh-session-projection'
import SystemPrompt from '@deepseek-ai/dsh-system-prompt'
import ToolRuntime, { defineTool } from '@deepseek-ai/dsh-tools'
import { afterEach, describe, expect, it, vi } from 'vitest'
import PiAgentLoop from '../src/index.ts'
import {
  MockAdapter,
  textResponse,
  toolCallResponse,
} from '../../agent-loop/tests/mock-adapter.ts'

const cleanup: Array<() => Promise<void>> = []

afterEach(async () => {
  for (const dispose of cleanup.splice(0).reverse()) await dispose()
})

async function harness(adapter: MockAdapter) {
  const ctx = new Context()
  cleanup.push(() => ctx.fiber.dispose())
  await ctx.plugin(LlmRuntime)
  await ctx.plugin(SessionStore)
  await ctx.plugin(SessionProjectionRegistry)
  await ctx.plugin(SystemPrompt)
  await ctx.plugin(ToolRuntime)
  await ctx.plugin(AgentRegistry)
  await ctx.plugin(PiAgentLoop, { agents: [] })
  ctx.llm.registerAdapter(['mock'], adapter)
  return ctx
}

function send(agent: Agent, text: string): void {
  agent.followup(createUserMessage({
    content: [{ type: 'text', text }],
    source: { kind: 'user' },
  }))
}

describe('PiAgentLoop activation boundary', () => {
  it('inherits the DSH factory and runs a text turn through the low-level Pi loop', async () => {
    const adapter = new MockAdapter([textResponse('hello from Pi')])
    const ctx = await harness(adapter)
    const handle = await ctx.agents.create({
      sessionId: SessionId('pi-text'),
      agentOptions: { provider: 'mock', model: 'mock' },
    })
    cleanup.push(() => handle.dispose())
    expect(handle.agent.constructor.name).toBe('DshPiAgent')

    send(handle.agent, 'hello')
    await handle.agent.whenIdle()

    expect(adapter.requests).toHaveLength(1)
    expect(handle.agent.session.deriveMessages().at(-1)).toMatchObject({
      role: 'assistant',
      content: [{ type: 'text', text: 'hello from Pi' }],
    })
    const assistant = handle.agent.session.snapshotEvents().find(event => event.type === 'assistant/message')
    if (assistant?.type !== 'assistant/message') throw new Error('Pi turn did not commit its assistant message')
    expect(assistant.data.usage).toEqual({ inputTokens: 10, outputTokens: 13 })
    const rawChunks = assistant.data.stream.flatMap(record => record.type === 'chunk' ? [record.chunk] : [])
    expect(rawChunks.filter(chunk => chunk.type === 'usage')).toHaveLength(1)
    expect(rawChunks.filter(chunk => chunk.type === 'finish')).toHaveLength(1)
  })

  it('round-trips one serial tool through DSH before the second model step', async () => {
    const adapter = new MockAdapter([
      toolCallResponse('write-1', 'write', { value: 'x' }),
      textResponse('finished'),
    ])
    const ctx = await harness(adapter)
    const executions: string[] = []
    ctx.tools.register(defineTool({
      name: 'write',
      description: 'fixture write',
      parameters: { value: { type: 'string', required: true } },
      output: {
        schema: { type: 'string' },
        render: (_args, value) => [{ type: 'text', text: value }],
      },
      async execute(args) {
        executions.push(args.value)
        return `saved:${args.value}`
      },
    }))
    const handle = await ctx.agents.create({
      sessionId: SessionId('pi-tool'),
      agentOptions: { provider: 'mock', model: 'mock' },
    })
    cleanup.push(() => handle.dispose())

    send(handle.agent, 'write it')
    await handle.agent.whenIdle()

    expect(executions).toEqual(['x'])
    expect(adapter.requests).toHaveLength(2)
    const events = handle.agent.session.snapshotEvents()
    expect(events.map(event => event.type)).toEqual(expect.arrayContaining([
      'tool/call', 'tool/result', 'turn/end',
    ]))
    expect(events.find(event => event.type === 'assistant/message')).toMatchObject({
      data: {
        message: {
          content: [{ type: 'tool-call', id: 'write-1', name: 'write' }],
        },
      },
    })
    expect(handle.agent.session.deriveMessages().at(-1)).toMatchObject({
      role: 'assistant', content: [{ type: 'text', text: 'finished' }],
    })
  })

  it.each([
    ['model cancellation', 'hang' as const],
    ['model failure', []],
  ])('closes a balanced turn after %s', async (_label, script) => {
    const adapter = script === 'hang' ? new MockAdapter(['hang']) : new MockAdapter(script)
    const ctx = await harness(adapter)
    const handle = await ctx.agents.create({
      sessionId: SessionId(`pi-${_label.replace(' ', '-')}`),
      agentOptions: { provider: 'mock', model: 'mock' },
    })
    cleanup.push(() => handle.dispose())
    send(handle.agent, 'run')
    if (script === 'hang') {
      await vi.waitFor(() => { expect(adapter.requests).toHaveLength(1) })
      handle.agent.cancel({ kind: 'user' })
    }
    await handle.agent.whenIdle()
    const events = handle.agent.session.snapshotEvents()
    expect(events.filter(event => event.type === 'turn/start')).toHaveLength(1)
    expect(events.filter(event => event.type === 'turn/end')).toHaveLength(1)
  })

  it('cancels a running DSH tool without losing its call/result pair', async () => {
    const adapter = new MockAdapter([toolCallResponse('slow-1', 'slow_write', {})])
    const ctx = await harness(adapter)
    const entered = Promise.withResolvers<undefined>()
    ctx.tools.register(defineTool({
      name: 'slow_write',
      description: 'cooperative fixture',
      parameters: {},
      output: {
        schema: { type: 'string' },
        render: (_args, value) => [{ type: 'text', text: value }],
      },
      execute(_args, exec) {
        entered.resolve(undefined)
        return new Promise<string>((resolve) => {
          if (exec.signal.aborted) resolve('cancelled')
          else exec.signal.addEventListener('abort', () => { resolve('cancelled') }, { once: true })
        })
      },
    }))
    const handle = await ctx.agents.create({
      sessionId: SessionId('pi-tool-cancel'),
      agentOptions: { provider: 'mock', model: 'mock' },
    })
    cleanup.push(() => handle.dispose())
    send(handle.agent, 'start tool')
    await entered.promise
    handle.agent.cancel({ kind: 'user' })
    await handle.agent.whenIdle()

    const events = handle.agent.session.snapshotEvents()
    expect(events.filter(event => event.type === 'tool/call')).toHaveLength(1)
    expect(events.filter(event => event.type === 'tool/result')).toHaveLength(1)
  })

  it('rebuilds the next request from the current compacted DSH surface', async () => {
    const adapter = new MockAdapter([textResponse('first'), textResponse('second')])
    const ctx = await harness(adapter)
    const handle = await ctx.agents.create({
      sessionId: SessionId('pi-compaction'),
      agentOptions: { provider: 'mock', model: 'mock' },
    })
    cleanup.push(() => handle.dispose())
    send(handle.agent, 'original prompt')
    await handle.agent.whenIdle()
    const original = handle.agent.session.snapshotEvents().find(event => event.type === 'user/message')
    if (original?.type !== 'user/message') throw new Error('first turn did not commit its user message')
    handle.agent.session.append('user/message', createUserMessage({
      content: [{ type: 'text', text: 'compacted summary' }],
      source: { kind: 'plugin', plugin: 'test-compaction' },
    }), {
      surfaceOp: { op: 'replace', startSeq: original.seq, endSeq: original.seq },
      sourceEventSeqs: [original.seq],
    })

    send(handle.agent, 'after compaction')
    await handle.agent.whenIdle()
    const secondRequestTexts = adapter.requests[1]?.messages
      .flatMap(message => message.content)
      .flatMap(block => block.type === 'text' ? [block.text] : [])
    expect(secondRequestTexts).toContain('compacted summary')
    expect(secondRequestTexts).not.toContain('original prompt')
  })

  it('contains no Pi harness session, skill, compaction, or persistence store', () => {
    const root = fileURLToPath(new URL('../src/', import.meta.url))
    const production = ['index.ts', 'pi-agent.ts', 'pi-kernel-driver.ts']
      .map(file => readFileSync(`${root}${file}`, 'utf8'))
      .join('\n')
    const forbidden = [
      ['Agent', 'Harness'].join(''),
      ['harness', 'session'].join('/'),
      ['harness', 'skills'].join('/'),
      ['harness', 'compaction'].join('/'),
      ['Pi', 'Session'].join(''),
      ['Pi', 'Store'].join(''),
      ['implements', 'AgentFactory'].join(' '),
    ]
    for (const marker of forbidden) expect(production).not.toContain(marker)
  })
})
