/** Lossless in-memory projection from durable DSH messages to loop messages. */

import type { ContentBlock, Message } from '@deepseek-ai/dsh-llm'
import type {
  AssistantMessage,
  Message as PiMessage,
  TextContent,
  ToolCall,
  ToolResultMessage,
  UserMessage,
} from '@earendil-works/pi-ai'
import { KernelBoundaryError } from './kernel-driver.ts'

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
