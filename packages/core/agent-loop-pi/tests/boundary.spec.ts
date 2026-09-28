import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  createAssistantMessage,
  createMessage,
  createToolResultMessage,
  createUserMessage,
  MessageId,
  ToolCallId,
  type Message,
  type StreamChunk,
} from '@deepseek-ai/dsh-llm'
import { describe, expect, it } from 'vitest'
import {
  KernelBoundaryError,
  PI_KERNEL_DESCRIPTOR,
} from '../src/kernel-driver.ts'
import { fromPiMessages, toPiMessages } from '../src/message-conversion.ts'
import { toPiAssistantEvents } from '../src/stream-conversion.ts'

const ROOT = join(import.meta.dirname, '..', '..', '..', '..')

async function collect<T>(source: AsyncIterable<T>): Promise<T[]> {
  const values: T[] = []
  for await (const value of source) values.push(value)
  return values
}

function fixtureMessages(): Message[] {
  const user = createUserMessage({
    content: [
      { type: 'text', text: '你好, Pi 🌍' },
      { type: 'text', text: '' },
      {
        type: 'image',
        attachment: {
          attachmentId: 'sha256:image-one' as never,
          mediaType: 'image/png',
          bytes: 42,
          width: 8,
          height: 6,
          name: '图像.png',
        },
      },
    ],
    source: { kind: 'user' },
  })
  const assistant = createAssistantMessage({
    content: [
      { type: 'reasoning', text: '先分析' },
      { type: 'text', text: '' },
      {
        type: 'tool-call',
        id: ToolCallId('call-nested'),
        name: 'inspect',
        arguments: '{"path":"C:\\\\工作区","options":{"depth":2,"tags":["a","中"]}}',
      },
    ],
    source: { provider: 'local', model: 'test-model' },
  })
  const result = createToolResultMessage({
    callId: ToolCallId('call-nested'),
    content: [{ type: 'text', text: '失败：无权限' }],
    isError: true,
  })
  return [user, assistant, result]
}

describe('Pi kernel package boundary', () => {
  it('pins the private Host-only package and its source registration', () => {
    const manifest = JSON.parse(readFileSync(join(ROOT, 'packages/core/agent-loop-pi/package.json'), 'utf8')) as {
      name: string
      version: string
      private: boolean
      type: string
      dependencies: Record<string, string>
    }
    expect(manifest).toMatchObject({
      name: '@local-harness/pi-agent-loop',
      version: '0.1.5-alpha.2',
      private: true,
      type: 'module',
    })
    expect(manifest.dependencies).toMatchObject({
      '@earendil-works/pi-agent-core': '0.85.1',
      '@earendil-works/pi-ai': '0.85.1',
    })

    const base = readFileSync(join(ROOT, 'tsconfig.base.json'), 'utf8')
    const host = readFileSync(join(ROOT, 'tsconfig.host.json'), 'utf8')
    const client = readFileSync(join(ROOT, 'tsconfig.client.json'), 'utf8')
    const workspace = readFileSync(join(ROOT, 'pnpm-workspace.yaml'), 'utf8')
    expect(base).toContain('"@local-harness/pi-agent-loop"')
    expect(host).toContain('"path": "./packages/core/agent-loop-pi"')
    expect(client).not.toContain('packages/core/agent-loop-pi')
    expect(workspace).toContain("'@earendil-works/pi-agent-core@0.85.1'")

    const readmeRecord = readFileSync(
      join(ROOT, 'packages/core/agent-loop-pi/README.i18n.yaml'),
      'utf8',
    )
    expect(readmeRecord).toMatch(/^README\.md: [0-9a-f]{40}$/m)
    expect(readmeRecord).toMatch(/^README\.zh\.md: [0-9a-f]{40}$/m)
  })

  it('keeps Pi types out of the public kernel seam', () => {
    const source = readFileSync(
      join(ROOT, 'packages/core/agent-loop-pi/src/kernel-driver.ts'),
      'utf8',
    )
    expect(source).not.toMatch(/@earendil-works|\bPi(?:Message|Model|Context|Event)\b/)
  })

  it('publishes the fixed serial Pi descriptor', () => {
    expect(PI_KERNEL_DESCRIPTOR).toEqual({
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
    })
  })
})

describe('DSH and Pi message conversion', () => {
  it('round-trips ordered Unicode, empty text, image references, reasoning, nested arguments, and errors', () => {
    const original = fixtureMessages()
    const piMessages = toPiMessages(original)
    expect(piMessages.map(message => message.role)).toEqual(['user', 'assistant', 'toolResult'])
    expect(fromPiMessages(piMessages)).toEqual(original)
    expect(fromPiMessages(piMessages).map(message => message.id)).toEqual(original.map(message => message.id))
  })

  it('fails malformed tool JSON and unsupported blocks with a stable code', () => {
    const malformed = createAssistantMessage({
      content: [{
        type: 'tool-call',
        id: ToolCallId('bad-json'),
        name: 'broken',
        arguments: '{"unfinished":',
      }],
      source: { provider: 'local', model: 'test-model' },
    })
    expect(() => toPiMessages([malformed])).toThrow(
      expect.objectContaining({ code: 'KERNEL_MESSAGE_CONVERSION' }),
    )

    const unsupported = createMessage({
      role: 'user',
      content: [{
        type: 'file',
        attachment: { attachmentId: 'sha256:file' as never, name: 'x.txt', bytes: 1 },
      }],
      source: { kind: 'user' },
    })
    expect(() => toPiMessages([unsupported])).toThrow(
      expect.objectContaining({ code: 'KERNEL_MESSAGE_CONVERSION' }),
    )
  })

  it('rejects Pi messages without DSH identity metadata', () => {
    expect(() => fromPiMessages([{ role: 'user', content: 'orphan', timestamp: 0 }])).toThrow(
      expect.objectContaining({ code: 'KERNEL_MESSAGE_CONVERSION' }),
    )
  })
})

describe('DSH stream conversion', () => {
  const model = {
    provider: 'local',
    model: 'test-model',
    wireApi: 'openai-responses',
    inputModalities: ['text', 'image'],
    generation: 3,
  } as const

  it('maps text, reasoning, tool calls, usage, and finish to legal Pi events', async () => {
    const chunks: StreamChunk[] = [
      { type: 'block-start', index: 0, blockType: 'text' },
      { type: 'text-delta', index: 0, text: '你' },
      { type: 'block-end', index: 0, block: { type: 'text', text: '你好' } },
      { type: 'block-start', index: 1, blockType: 'reasoning' },
      { type: 'reasoning-delta', index: 1, text: '思' },
      { type: 'block-end', index: 1, block: { type: 'reasoning', text: '思考' } },
      { type: 'block-start', index: 2, blockType: 'tool-call' },
      {
        type: 'tool-call-delta',
        index: 2,
        id: ToolCallId('call-1'),
        name: 'inspect',
        argumentsDelta: '{"nested":',
      },
      {
        type: 'tool-call-delta',
        index: 2,
        id: ToolCallId('call-1'),
        argumentsDelta: '{"value":1}}',
      },
      {
        type: 'block-end',
        index: 2,
        block: {
          type: 'tool-call',
          id: ToolCallId('call-1'),
          name: 'inspect',
          arguments: '{"nested":{"value":1}}',
        },
      },
      {
        type: 'usage',
        usage: { inputTokens: 7, outputTokens: 5, totalTokens: 12, reasoningTokens: 2 },
      },
      { type: 'finish', reason: { kind: 'tool-calls' } },
    ]

    const events = await collect(toPiAssistantEvents(chunks, model))
    expect(events.map(event => event.type)).toEqual([
      'start',
      'text_start',
      'text_delta',
      'text_end',
      'thinking_start',
      'thinking_delta',
      'thinking_end',
      'toolcall_start',
      'toolcall_delta',
      'toolcall_delta',
      'toolcall_end',
      'done',
    ])
    const terminal = events.at(-1)
    expect(terminal).toMatchObject({
      type: 'done',
      reason: 'toolUse',
      message: {
        provider: 'local',
        model: 'test-model',
        stopReason: 'toolUse',
        usage: { input: 7, output: 5, totalTokens: 12, reasoning: 2 },
      },
    })
  })

  it('maps max-token and failure finishes', async () => {
    const maximum = await collect(toPiAssistantEvents([
      { type: 'finish', reason: { kind: 'max-tokens' } },
    ], model))
    expect(maximum.at(-1)).toMatchObject({ type: 'done', reason: 'length' })

    const failure = await collect(toPiAssistantEvents([
      {
        type: 'finish',
        reason: { kind: 'error', failure: { code: 'SERVER', message: 'upstream failed' } },
      },
    ], model))
    expect(failure.at(-1)).toMatchObject({
      type: 'error',
      reason: 'error',
      error: { stopReason: 'error', errorMessage: '[SERVER] upstream failed' },
    })
  })

  it('fails closed streams, malformed tool JSON, and unsupported blocks with stable codes', async () => {
    await expect(collect(toPiAssistantEvents([], model))).rejects.toMatchObject({
      code: 'MODEL_STREAM_CLOSED',
    })
    await expect(collect(toPiAssistantEvents([
      { type: 'block-start', index: 0, blockType: 'tool-call' },
      {
        type: 'block-end',
        index: 0,
        block: {
          type: 'tool-call',
          id: ToolCallId('bad'),
          name: 'broken',
          arguments: '{',
        },
      },
    ], model))).rejects.toMatchObject({ code: 'KERNEL_STREAM_CONVERSION' })
    await expect(collect(toPiAssistantEvents([
      { type: 'block-start', index: 0, blockType: 'image' },
    ], model))).rejects.toBeInstanceOf(KernelBoundaryError)
  })
})

it('keeps message identities branded across the test boundary', () => {
  expect(MessageId('message-1')).toBe('message-1')
})
