/** DSH model chunks projected into the assistant event protocol consumed by the loop. */

import type { StreamChunk, TokenUsage } from '@deepseek-ai/dsh-llm'
import type {
  AssistantMessage,
  AssistantMessageEvent,
  StopReason,
  Usage,
} from '@earendil-works/pi-ai'
import { KernelBoundaryError, type FrozenModelSelection } from './kernel-driver.ts'

type ChunkSource = Iterable<StreamChunk> | AsyncIterable<StreamChunk>

const sourceChunks = new WeakMap<AssistantMessageEvent, readonly StreamChunk[]>()
const terminalChunks = new WeakMap<AssistantMessage, readonly StreamChunk[]>()

function withSourceChunks<T extends AssistantMessageEvent>(
  event: T,
  chunks: readonly StreamChunk[],
): T {
  sourceChunks.set(event, chunks)
  return event
}

/** Exact DSH chunks represented by one converted Pi stream event. */
export function dshChunksFor(event: AssistantMessageEvent): readonly StreamChunk[] | undefined {
  return sourceChunks.get(event)
}

/** Exact terminal DSH chunks retained on the final Pi assistant message. */
export function dshTerminalChunksFor(message: AssistantMessage): readonly StreamChunk[] | undefined {
  return terminalChunks.get(message)
}

function streamError(message: string, cause?: unknown): KernelBoundaryError {
  return new KernelBoundaryError('KERNEL_STREAM_CONVERSION', message, {
    domain: 'MODEL',
    ...cause === undefined ? {} : { cause },
  })
}

function emptyUsage(): Usage {
  return {
    input: 0,
    output: 0,
    cacheRead: 0,
    cacheWrite: 0,
    totalTokens: 0,
    cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
  }
}

function toUsage(usage: TokenUsage | undefined): Usage {
  if (usage === undefined) return emptyUsage()
  return {
    input: usage.inputTokens,
    output: usage.outputTokens,
    cacheRead: usage.cacheReadTokens ?? 0,
    cacheWrite: usage.cacheWriteTokens ?? 0,
    ...usage.reasoningTokens === undefined ? {} : { reasoning: usage.reasoningTokens },
    totalTokens: usage.totalTokens
      ?? usage.inputTokens + usage.outputTokens + (usage.cacheReadTokens ?? 0) + (usage.cacheWriteTokens ?? 0),
    cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
  }
}

function snapshot(message: AssistantMessage): AssistantMessage {
  return structuredClone(message)
}

function blockAt(message: AssistantMessage, index: number): AssistantMessage['content'][number] {
  const block = message.content[index]
  if (block === undefined) throw streamError(`stream block ${index} was not started`)
  return block
}

function expectNextIndex(message: AssistantMessage, index: number): void {
  if (index !== message.content.length) {
    throw streamError(`stream block ${index} started out of order`)
  }
}

function parseArguments(raw: string, callId: string): Record<string, unknown> {
  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch (error: unknown) {
    throw streamError(`tool call "${callId}" contains malformed JSON arguments`, error)
  }
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    throw streamError(`tool call "${callId}" arguments must be a JSON object`)
  }
  return parsed as Record<string, unknown>
}

function finishState(kind: StreamChunk & { type: 'finish' }): {
  readonly reason: StopReason
  readonly event: 'done' | 'error'
  readonly errorMessage?: string
} {
  switch (kind.reason.kind) {
    case 'stop': return { reason: 'stop', event: 'done' }
    case 'tool-calls': return { reason: 'toolUse', event: 'done' }
    case 'max-tokens': return { reason: 'length', event: 'done' }
    case 'aborted': return {
      reason: 'aborted',
      event: 'error',
      errorMessage: `[${kind.reason.failure.code}] ${kind.reason.failure.message}`,
    }
    case 'error': return {
      reason: 'error',
      event: 'error',
      errorMessage: `[${kind.reason.failure.code}] ${kind.reason.failure.message}`,
    }
    default: throw streamError(`unsupported finish reason: ${String((kind.reason as { kind?: unknown }).kind)}`)
  }
}

/** Convert one complete DSH attempt. A missing terminal finish is always an error. */
export async function* toPiAssistantEvents(
  chunks: ChunkSource,
  model: FrozenModelSelection,
): AsyncGenerator<AssistantMessageEvent> {
  const message: AssistantMessage = {
    role: 'assistant',
    content: [],
    api: model.wireApi,
    provider: model.provider,
    model: model.model,
    usage: emptyUsage(),
    stopReason: 'pending',
    timestamp: 0,
  }
  yield withSourceChunks({ type: 'start', partial: snapshot(message) }, [])
  let pendingChunks: StreamChunk[] = []

  for await (const chunk of chunks) {
    pendingChunks.push(chunk)
    switch (chunk.type) {
      case 'block-start': {
        expectNextIndex(message, chunk.index)
        switch (chunk.blockType) {
          case 'text':
            message.content.push({ type: 'text', text: '' })
            yield withSourceChunks(
              { type: 'text_start', contentIndex: chunk.index, partial: snapshot(message) },
              pendingChunks,
            )
            pendingChunks = []
            break
          case 'reasoning':
            message.content.push({ type: 'thinking', thinking: '' })
            yield withSourceChunks(
              { type: 'thinking_start', contentIndex: chunk.index, partial: snapshot(message) },
              pendingChunks,
            )
            pendingChunks = []
            break
          case 'tool-call':
            message.content.push({ type: 'toolCall', id: '', name: '', arguments: {} })
            yield withSourceChunks(
              { type: 'toolcall_start', contentIndex: chunk.index, partial: snapshot(message) },
              pendingChunks,
            )
            pendingChunks = []
            break
          case 'image':
          case 'file':
          case 'tool-result':
            throw streamError(`unsupported streamed block type: ${chunk.blockType}`)
          default:
            throw streamError(`unsupported streamed block type: ${String(chunk.blockType)}`)
        }
        break
      }
      case 'text-delta': {
        const block = blockAt(message, chunk.index)
        if (block.type !== 'text') throw streamError(`text delta targeted ${block.type} block ${chunk.index}`)
        block.text += chunk.text
        yield withSourceChunks(
          { type: 'text_delta', contentIndex: chunk.index, delta: chunk.text, partial: snapshot(message) },
          pendingChunks,
        )
        pendingChunks = []
        break
      }
      case 'reasoning-delta': {
        const block = blockAt(message, chunk.index)
        if (block.type !== 'thinking') throw streamError(`reasoning delta targeted ${block.type} block ${chunk.index}`)
        block.thinking += chunk.text
        yield withSourceChunks(
          { type: 'thinking_delta', contentIndex: chunk.index, delta: chunk.text, partial: snapshot(message) },
          pendingChunks,
        )
        pendingChunks = []
        break
      }
      case 'tool-call-delta': {
        const block = blockAt(message, chunk.index)
        if (block.type !== 'toolCall') throw streamError(`tool delta targeted ${block.type} block ${chunk.index}`)
        block.id = chunk.id
        if (chunk.name !== undefined) block.name = chunk.name
        yield withSourceChunks({
          type: 'toolcall_delta',
          contentIndex: chunk.index,
          delta: chunk.argumentsDelta,
          partial: snapshot(message),
        }, pendingChunks)
        pendingChunks = []
        break
      }
      case 'block-end': {
        const partial = blockAt(message, chunk.index)
        switch (chunk.block.type) {
          case 'text':
            if (partial.type !== 'text') throw streamError(`text ended ${partial.type} block ${chunk.index}`)
            message.content[chunk.index] = { type: 'text', text: chunk.block.text }
            yield withSourceChunks({
              type: 'text_end',
              contentIndex: chunk.index,
              content: chunk.block.text,
              partial: snapshot(message),
            }, pendingChunks)
            pendingChunks = []
            break
          case 'reasoning':
            if (partial.type !== 'thinking') throw streamError(`reasoning ended ${partial.type} block ${chunk.index}`)
            message.content[chunk.index] = { type: 'thinking', thinking: chunk.block.text }
            yield withSourceChunks({
              type: 'thinking_end',
              contentIndex: chunk.index,
              content: chunk.block.text,
              partial: snapshot(message),
            }, pendingChunks)
            pendingChunks = []
            break
          case 'tool-call': {
            if (partial.type !== 'toolCall') throw streamError(`tool call ended ${partial.type} block ${chunk.index}`)
            const toolCall = {
              type: 'toolCall' as const,
              id: chunk.block.id,
              name: chunk.block.name,
              arguments: parseArguments(chunk.block.arguments, chunk.block.id),
            }
            message.content[chunk.index] = toolCall
            yield withSourceChunks({
              type: 'toolcall_end',
              contentIndex: chunk.index,
              toolCall,
              partial: snapshot(message),
            }, pendingChunks)
            pendingChunks = []
            break
          }
          case 'image':
          case 'file':
          case 'tool-result':
            throw streamError(`unsupported completed block type: ${chunk.block.type}`)
          default:
            throw streamError(`unsupported completed block type: ${String((chunk.block as { type?: unknown }).type)}`)
        }
        break
      }
      case 'usage':
        message.usage = toUsage(chunk.usage)
        break
      case 'finish': {
        const terminal = finishState(chunk)
        message.stopReason = terminal.reason
        if (terminal.errorMessage !== undefined) message.errorMessage = terminal.errorMessage
        const finalMessage = snapshot(message)
        terminalChunks.set(finalMessage, pendingChunks)
        if (terminal.event === 'done') {
          yield withSourceChunks(
            { type: 'done', reason: terminal.reason as 'stop' | 'length' | 'toolUse', message: finalMessage },
            pendingChunks,
          )
        } else {
          yield withSourceChunks(
            { type: 'error', reason: terminal.reason as 'aborted' | 'error', error: finalMessage },
            pendingChunks,
          )
        }
        return
      }
    }
  }

  throw new KernelBoundaryError(
    'MODEL_STREAM_CLOSED',
    'DSH model stream ended without a terminal finish chunk',
    { domain: 'MODEL', retryable: true },
  )
}
