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
  yield { type: 'start', partial: snapshot(message) }

  for await (const chunk of chunks) {
    switch (chunk.type) {
      case 'block-start': {
        expectNextIndex(message, chunk.index)
        switch (chunk.blockType) {
          case 'text':
            message.content.push({ type: 'text', text: '' })
            yield { type: 'text_start', contentIndex: chunk.index, partial: snapshot(message) }
            break
          case 'reasoning':
            message.content.push({ type: 'thinking', thinking: '' })
            yield { type: 'thinking_start', contentIndex: chunk.index, partial: snapshot(message) }
            break
          case 'tool-call':
            message.content.push({ type: 'toolCall', id: '', name: '', arguments: {} })
            yield { type: 'toolcall_start', contentIndex: chunk.index, partial: snapshot(message) }
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
        yield { type: 'text_delta', contentIndex: chunk.index, delta: chunk.text, partial: snapshot(message) }
        break
      }
      case 'reasoning-delta': {
        const block = blockAt(message, chunk.index)
        if (block.type !== 'thinking') throw streamError(`reasoning delta targeted ${block.type} block ${chunk.index}`)
        block.thinking += chunk.text
        yield { type: 'thinking_delta', contentIndex: chunk.index, delta: chunk.text, partial: snapshot(message) }
        break
      }
      case 'tool-call-delta': {
        const block = blockAt(message, chunk.index)
        if (block.type !== 'toolCall') throw streamError(`tool delta targeted ${block.type} block ${chunk.index}`)
        block.id = chunk.id
        if (chunk.name !== undefined) block.name = chunk.name
        yield {
          type: 'toolcall_delta',
          contentIndex: chunk.index,
          delta: chunk.argumentsDelta,
          partial: snapshot(message),
        }
        break
      }
      case 'block-end': {
        const partial = blockAt(message, chunk.index)
        switch (chunk.block.type) {
          case 'text':
            if (partial.type !== 'text') throw streamError(`text ended ${partial.type} block ${chunk.index}`)
            message.content[chunk.index] = { type: 'text', text: chunk.block.text }
            yield {
              type: 'text_end',
              contentIndex: chunk.index,
              content: chunk.block.text,
              partial: snapshot(message),
            }
            break
          case 'reasoning':
            if (partial.type !== 'thinking') throw streamError(`reasoning ended ${partial.type} block ${chunk.index}`)
            message.content[chunk.index] = { type: 'thinking', thinking: chunk.block.text }
            yield {
              type: 'thinking_end',
              contentIndex: chunk.index,
              content: chunk.block.text,
              partial: snapshot(message),
            }
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
            yield {
              type: 'toolcall_end',
              contentIndex: chunk.index,
              toolCall,
              partial: snapshot(message),
            }
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
        if (terminal.event === 'done') {
          yield { type: 'done', reason: terminal.reason as 'stop' | 'length' | 'toolUse', message: finalMessage }
        } else {
          yield { type: 'error', reason: terminal.reason as 'aborted' | 'error', error: finalMessage }
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
