/** Lossless in-memory projection from durable DSH messages to loop messages. */

import {
  createAssistantMessage,
  createToolResultMessage,
  createUserMessage,
  freezeMessage,
  type ContentBlock,
  type Message,
  type MessageId,
} from '@deepseek-ai/dsh-llm'
import type {
  AssistantMessage,
  Message as PiMessage,
  TextContent,
  ToolCall,
  ToolResultMessage,
  UserMessage,
} from '@earendil-works/pi-ai'
import { KernelBoundaryError } from './kernel-driver.ts'
import type { FrozenModelSelection } from './kernel-driver.ts'

const DSH_MESSAGE = Symbol('local-harness.dsh-message')

/** A standard loop message with its authoritative DSH identity attached in memory. */
export type TracedPiMessage = PiMessage & { readonly [DSH_MESSAGE]: Message }

function conversionError(message: string, cause?: unknown): KernelBoundaryError {
  return new KernelBoundaryError('KERNEL_MESSAGE_CONVERSION', message, {
    domain: 'KERNEL',
    ...cause === undefined ? {} : { cause },
  })
}

function stamp<T extends PiMessage>(message: T, source: Message): T & { readonly [DSH_MESSAGE]: Message } {
  Object.defineProperty(message, DSH_MESSAGE, {
    value: source,
    enumerable: false,
    configurable: false,
    writable: false,
  })
  return message as T & { readonly [DSH_MESSAGE]: Message }
}

function imageReference(block: Extract<ContentBlock, { type: 'image' }>): TextContent {
  return {
    type: 'text',
    text: `[dsh-image:${JSON.stringify(block.attachment)}]`,
  }
}

function userContent(blocks: readonly ContentBlock[]): TextContent[] {
  return blocks.map((block): TextContent => {
    switch (block.type) {
      case 'text': return { type: 'text', text: block.text }
      case 'image': return imageReference(block)
      case 'file': throw conversionError('file blocks cannot enter the V1 kernel message projection')
      case 'reasoning': throw conversionError('reasoning blocks are not valid user content')
      case 'tool-call': throw conversionError('tool-call blocks are not valid user content')
      case 'tool-result': throw conversionError('tool-result blocks require a dedicated tool result message')
      default: throw conversionError(`unsupported user block type: ${String((block as { type?: unknown }).type)}`)
    }
  })
}

function parseToolArguments(raw: string, callId: string): Record<string, unknown> {
  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch (error: unknown) {
    throw conversionError(`tool call "${callId}" contains malformed JSON arguments`, error)
  }
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    throw conversionError(`tool call "${callId}" arguments must be a JSON object`)
  }
  return parsed as Record<string, unknown>
}

function assistantContent(blocks: readonly ContentBlock[]): AssistantMessage['content'] {
  return blocks.map((block): AssistantMessage['content'][number] => {
    switch (block.type) {
      case 'text': return { type: 'text', text: block.text }
      case 'reasoning': return { type: 'thinking', thinking: block.text }
      case 'tool-call': return {
        type: 'toolCall',
        id: block.id,
        name: block.name,
        arguments: parseToolArguments(block.arguments, block.id),
      }
      case 'image': throw conversionError('assistant image blocks are not representable by the loop')
      case 'file': throw conversionError('assistant file blocks are not representable by the loop')
      case 'tool-result': throw conversionError('assistant messages cannot contain tool results')
      default: throw conversionError(`unsupported assistant block type: ${String((block as { type?: unknown }).type)}`)
    }
  })
}

function zeroUsage(): AssistantMessage['usage'] {
  return {
    input: 0,
    output: 0,
    cacheRead: 0,
    cacheWrite: 0,
    totalTokens: 0,
    cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
  }
}

function toAssistant(message: Message): AssistantMessage {
  const content = assistantContent(message.content)
  const source = message.source.kind === 'model' ? message.source : undefined
  return {
    role: 'assistant',
    content,
    api: 'dsh-kernel',
    provider: source?.provider ?? 'dsh-kernel',
    model: source?.model ?? 'dsh-kernel',
    usage: zeroUsage(),
    stopReason: content.some(block => block.type === 'toolCall') ? 'toolUse' : 'stop',
    timestamp: 0,
  }
}

function toToolResult(
  message: Message,
  toolNames: ReadonlyMap<string, string>,
): ToolResultMessage {
  const [block] = message.content
  if (message.content.length !== 1 || block?.type !== 'tool-result') {
    throw conversionError('a tool result message must contain exactly one tool-result block')
  }
  return {
    role: 'toolResult',
    toolCallId: block.toolCallId,
    toolName: toolNames.get(block.toolCallId) ?? 'unknown',
    content: userContent(block.content),
    isError: block.isError ?? false,
    timestamp: 0,
  }
}

function recordToolNames(message: AssistantMessage, names: Map<string, string>): void {
  for (const block of message.content) {
    if (block.type === 'toolCall') names.set(block.id, block.name)
  }
}

/**
 * Convert durable messages for loop ordering while retaining the exact DSH fact
 * as non-enumerable metadata. Provider requests never use this projection.
 */
export function toPiMessages(messages: readonly Message[]): TracedPiMessage[] {
  const toolNames = new Map<string, string>()
  return messages.map((message): TracedPiMessage => {
    if (message.role === 'assistant') {
      const converted = toAssistant(message)
      recordToolNames(converted, toolNames)
      return stamp(converted, message)
    }
    if (message.source.kind === 'tool') {
      return stamp(toToolResult(message, toolNames), message)
    }
    const converted: UserMessage = {
      role: 'user',
      content: userContent(message.content),
      timestamp: 0,
    }
    return stamp(converted, message)
  })
}

/** Recover the authoritative messages attached by {@link toPiMessages}. */
export function fromPiMessages(messages: readonly PiMessage[]): Message[] {
  return messages.map((message) => {
    if (!(DSH_MESSAGE in message)) {
      throw conversionError('loop message has no DSH identity metadata')
    }
    return (message as TracedPiMessage)[DSH_MESSAGE]
  })
}

/** Read one attached durable message without exposing the metadata key. */
export function dshMessageOf(message: PiMessage): Message | undefined {
  return DSH_MESSAGE in message ? (message as TracedPiMessage)[DSH_MESSAGE] : undefined
}

/** Return tool-call objects in source order for event correlation. */
export function piToolCalls(message: PiMessage): readonly ToolCall[] {
  return message.role === 'assistant'
    ? message.content.filter((block): block is ToolCall => block.type === 'toolCall')
    : []
}

function fromAssistantContent(content: AssistantMessage['content']): ContentBlock[] {
  return content.map((block): ContentBlock => {
    switch (block.type) {
      case 'text': return { type: 'text', text: block.text }
      case 'thinking': return { type: 'reasoning', text: block.thinking }
      case 'toolCall': return {
        type: 'tool-call',
        id: block.id as never,
        name: block.name,
        arguments: JSON.stringify(block.arguments),
      }
      default: throw conversionError(`unsupported assistant loop block: ${String((block as { type?: unknown }).type)}`)
    }
  })
}

/** Convert a loop artifact back to a DSH message at the event boundary. */
export function fromPiMessage(
  message: PiMessage,
  model: FrozenModelSelection,
  identity?: MessageId,
): Message {
  const traced = dshMessageOf(message)
  if (traced !== undefined) return traced
  if (message.role === 'assistant') {
    const fresh = createAssistantMessage({
      content: fromAssistantContent(message.content),
      source: { provider: model.provider, model: model.model },
    })
    if (identity === undefined) return fresh
    return freezeMessage({ ...fresh, id: identity })
  }
  if (message.role === 'user') {
    const content = typeof message.content === 'string'
      ? [{ type: 'text' as const, text: message.content }]
      : message.content.map((block): ContentBlock => {
        if (block.type === 'text') return { type: 'text', text: block.text }
        throw conversionError('untraced loop images cannot be restored to DSH attachments')
      })
    return createUserMessage({ content, source: { kind: 'plugin', plugin: '@local-harness/pi-agent-loop' } })
  }
  const content = message.content.map((block): ContentBlock => {
    if (block.type === 'text') return { type: 'text', text: block.text }
    throw conversionError('untraced tool-result images are not supported by the V1 bridge')
  })
  const fresh = createToolResultMessage({
    callId: message.toolCallId as never,
    content,
    isError: message.isError,
  })
  if (identity === undefined) return fresh
  return freezeMessage({ ...fresh, id: identity })
}
