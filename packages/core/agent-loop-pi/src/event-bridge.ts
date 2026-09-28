/** Ordered, awaited event validation at the replaceable kernel boundary. */

import { ToolCallId, type MessageId, type StreamChunk } from '@deepseek-ai/dsh-llm'
import type { AgentEvent } from '@earendil-works/pi-agent-core'
import type { AssistantMessageEvent, Message as PiMessage } from '@earendil-works/pi-ai'
import {
  KernelBoundaryError,
  type KernelEvent,
  type KernelEventSink,
  type FrozenModelSelection,
  type RunId,
  type TurnPosition,
} from './kernel-driver.ts'
import { fromPiMessage, piToolCalls } from './message-conversion.ts'

interface StepState {
  readonly position: TurnPosition
  openMessage: MessageId | undefined
  assistantCompleted: boolean
  readonly availableCalls: Map<ToolCallId, number>
  readonly activeCalls: Set<ToolCallId>
  readonly completedCalls: Set<ToolCallId>
}

function orderError(message: string): KernelBoundaryError {
  return new KernelBoundaryError('KERNEL_EVENT_ORDER', message, {
    domain: 'PROTOCOL',
  })
}

function samePosition(left: TurnPosition, right: TurnPosition): boolean {
  return left.turn === right.turn && left.step === right.step
}

/**
 * Validate and serialize one kernel's externally visible event stream.
 * State advances only after the downstream commit barrier fulfills.
 */
export class KernelEventOrderSink implements KernelEventSink {
  private started = false
  private completed = false
  private step: StepState | undefined
  private lastStep = 0
  private tail: Promise<void> = Promise.resolve()

  constructor(private readonly downstream: KernelEventSink) {}

  /** Queue one event behind all prior commit barriers. */
  onEvent(event: KernelEvent, signal: AbortSignal): Promise<void> {
    const operation = this.tail.then(() => this.accept(event, signal))
    this.tail = operation.catch(() => undefined)
    return operation
  }

  private async accept(event: KernelEvent, signal: AbortSignal): Promise<void> {
    const commit = this.validate(event)
    await this.downstream.onEvent(event, signal)
    commit()
  }

  /** Validate without mutating; return the state commit owed after downstream success. */
  private validate(event: KernelEvent): () => void {
    if (this.completed) throw orderError(`event "${event.type}" followed run.completed`)
    if (!this.started && event.type !== 'run.started') {
      throw orderError(`event "${event.type}" preceded run.started`)
    }

    switch (event.type) {
      case 'run.started':
        if (this.started) throw orderError('run.started was emitted more than once')
        return () => { this.started = true }
      case 'step.started': {
        if (this.step !== undefined) throw orderError('step.started arrived before the preceding step completed')
        if (event.position.step !== this.lastStep + 1) {
          throw orderError(`step ${event.position.step} is not the next dense step after ${this.lastStep}`)
        }
        return () => {
          this.step = {
            position: event.position,
            openMessage: undefined,
            assistantCompleted: false,
            availableCalls: new Map(),
            activeCalls: new Set(),
            completedCalls: new Set(),
          }
        }
      }
      case 'message.started': {
        const step = this.requireStep(event.position, event.type)
        if (step.openMessage !== undefined) throw orderError('message.started overlapped an open message')
        return () => { step.openMessage = event.message.id }
      }
      case 'message.delta': {
        const step = this.requireStep(event.position, event.type)
        if (step.openMessage !== event.messageId) {
          throw orderError(`message.delta did not reference the open message "${String(step.openMessage)}"`)
        }
        return () => undefined
      }
      case 'message.completed': {
        const step = this.requireStep(event.position, event.type)
        if (step.openMessage !== event.message.id) {
          throw orderError(`message.completed did not reference the open message "${String(step.openMessage)}"`)
        }
        if (event.message.role === 'assistant' && step.assistantCompleted) {
          throw orderError('a step completed more than one assistant message')
        }
        return () => {
          step.openMessage = undefined
          if (event.message.role !== 'assistant') return
          step.assistantCompleted = true
          let sourceIndex = 0
          for (const block of event.message.content) {
            if (block.type === 'tool-call') step.availableCalls.set(block.id, sourceIndex++)
          }
        }
      }
      case 'tool.started': {
        const step = this.requireStep(event.position, event.type)
        if (!step.assistantCompleted) throw orderError('tool.started preceded assistant completion')
        const sourceIndex = step.availableCalls.get(event.callId)
        if (sourceIndex === undefined || sourceIndex !== event.sourceIndex) {
          throw orderError(`tool.started referenced an unknown or misordered call "${event.callId}"`)
        }
        if (step.activeCalls.has(event.callId) || step.completedCalls.has(event.callId)) {
          throw orderError(`tool call "${event.callId}" started more than once`)
        }
        return () => { step.activeCalls.add(event.callId) }
      }
      case 'tool.progress': {
        const step = this.requireStep(event.position, event.type)
        if (!step.activeCalls.has(event.callId)) {
          throw orderError(`tool.progress referenced inactive call "${event.callId}"`)
        }
        return () => undefined
      }
      case 'tool.completed': {
        const step = this.requireStep(event.position, event.type)
        if (!step.activeCalls.has(event.callId)) {
          throw orderError(`tool.completed referenced inactive call "${event.callId}"`)
        }
        if (step.availableCalls.get(event.callId) !== event.sourceIndex) {
          throw orderError(`tool.completed changed source order for call "${event.callId}"`)
        }
        return () => {
          step.activeCalls.delete(event.callId)
          step.completedCalls.add(event.callId)
        }
      }
      case 'step.completed': {
        const step = this.requireStep(event.position, event.type)
        if (step.openMessage !== undefined) throw orderError('step.completed left a message open')
        if (step.activeCalls.size > 0) throw orderError('step.completed left tool calls active')
        return () => {
          this.lastStep = step.position.step
          this.step = undefined
        }
      }
      case 'run.completed':
        if (this.step !== undefined) throw orderError('run.completed left a step open')
        return () => { this.completed = true }
    }
  }

  private requireStep(position: TurnPosition, eventType: KernelEvent['type']): StepState {
    const step = this.step
    if (step === undefined) throw orderError(`${eventType} occurred outside a step`)
    if (!samePosition(step.position, position)) {
      throw orderError(`${eventType} targeted a different turn or step`)
    }
    return step
  }
}

function updateChunk(event: AssistantMessageEvent): StreamChunk | undefined {
  switch (event.type) {
    case 'start': return undefined
    case 'text_start': return { type: 'block-start', index: event.contentIndex, blockType: 'text' }
    case 'text_delta': return { type: 'text-delta', index: event.contentIndex, text: event.delta }
    case 'text_end': return {
      type: 'block-end',
      index: event.contentIndex,
      block: { type: 'text', text: event.content },
    }
    case 'thinking_start': return { type: 'block-start', index: event.contentIndex, blockType: 'reasoning' }
    case 'thinking_delta': return { type: 'reasoning-delta', index: event.contentIndex, text: event.delta }
    case 'thinking_end': return {
      type: 'block-end',
      index: event.contentIndex,
      block: { type: 'reasoning', text: event.content },
    }
    case 'toolcall_start': return { type: 'block-start', index: event.contentIndex, blockType: 'tool-call' }
    case 'toolcall_delta': {
      const block = event.partial.content[event.contentIndex]
      return {
        type: 'tool-call-delta',
        index: event.contentIndex,
        id: ToolCallId(block?.type === 'toolCall' ? block.id : ''),
        argumentsDelta: event.delta,
      }
    }
    case 'toolcall_end': return {
      type: 'block-end',
      index: event.contentIndex,
      block: {
        type: 'tool-call',
        id: ToolCallId(event.toolCall.id),
        name: event.toolCall.name,
        arguments: JSON.stringify(event.toolCall.arguments),
      },
    }
    case 'done':
    case 'error':
      return undefined
  }
}

function finishChunk(message: Extract<PiMessage, { role: 'assistant' }>): StreamChunk {
  switch (message.stopReason) {
    case 'stop': return { type: 'finish', reason: { kind: 'stop' } }
    case 'toolUse': return { type: 'finish', reason: { kind: 'tool-calls' } }
    case 'length': return { type: 'finish', reason: { kind: 'max-tokens' } }
    case 'aborted': return {
      type: 'finish',
      reason: { kind: 'aborted', failure: { code: 'ABORTED', message: message.errorMessage ?? 'aborted' } },
    }
    case 'error': return {
      type: 'finish',
      reason: { kind: 'error', failure: { code: 'MODEL_ERROR', message: message.errorMessage ?? 'model error' } },
    }
    case 'pending': return {
      type: 'finish',
      reason: { kind: 'error', failure: { code: 'MODEL_STREAM_CLOSED', message: 'assistant ended while pending' } },
    }
    default: return {
      type: 'finish',
      reason: { kind: 'error', failure: { code: 'MODEL_STOP_REASON', message: 'unknown stop reason' } },
    }
  }
}

/** Stateful translation from the pinned Pi event protocol to product kernel events. */
export class PiKernelEventTranslator {
  private step = 0
  private streamRevision = 0
  private currentMessage: { pi: PiMessage; dshId: MessageId } | undefined
  private readonly callIndexes = new Map<string, number>()
  private readonly progressRevisions = new Map<string, number>()
  private lastReason: Extract<KernelEvent, { type: 'run.completed' }>['reason'] = { kind: 'completed' }

  constructor(
    private readonly runId: RunId,
    private readonly turn: number,
    private readonly model: () => FrozenModelSelection,
  ) {}

  /** Translate one Pi event to the ordered product events it represents. */
  translate(event: AgentEvent): KernelEvent[] {
    switch (event.type) {
      case 'agent_start': return [{ type: 'run.started', runId: this.runId }]
      case 'turn_start':
        this.step += 1
        return [{ type: 'step.started', position: this.position() }]
      case 'message_start': {
        const pi = event.message as PiMessage
        const dsh = fromPiMessage(pi, this.model())
        this.currentMessage = { pi, dshId: dsh.id }
        return [{ type: 'message.started', position: this.position(), message: dsh }]
      }
      case 'message_update': {
        const current = this.requireMessage()
        const chunk = updateChunk(event.assistantMessageEvent)
        if (chunk === undefined) return []
        return [{
          type: 'message.delta',
          position: this.position(),
          messageId: current.dshId,
          streamRevision: ++this.streamRevision,
          delta: chunk,
        }]
      }
      case 'message_end': {
        const current = this.requireMessage()
        const pi = event.message as PiMessage
        const dsh = fromPiMessage(pi, this.model(), current.dshId)
        const translated: KernelEvent[] = []
        if (pi.role === 'assistant') {
          translated.push({
            type: 'message.delta',
            position: this.position(),
            messageId: dsh.id,
            streamRevision: ++this.streamRevision,
            delta: {
              type: 'usage',
              usage: {
                inputTokens: pi.usage.input,
                outputTokens: pi.usage.output,
                totalTokens: pi.usage.totalTokens,
                ...pi.usage.reasoning === undefined ? {} : { reasoningTokens: pi.usage.reasoning },
                ...pi.usage.cacheRead === 0 ? {} : { cacheReadTokens: pi.usage.cacheRead },
                ...pi.usage.cacheWrite === 0 ? {} : { cacheWriteTokens: pi.usage.cacheWrite },
              },
            },
          }, {
            type: 'message.delta',
            position: this.position(),
            messageId: dsh.id,
            streamRevision: ++this.streamRevision,
            delta: finishChunk(pi),
          })
          this.callIndexes.clear()
          for (const [sourceIndex, call] of piToolCalls(pi).entries()) {
            this.callIndexes.set(call.id, sourceIndex)
          }
        }
        translated.push({ type: 'message.completed', position: this.position(), message: dsh })
        this.currentMessage = undefined
        return translated
      }
      case 'tool_execution_start': {
        const sourceIndex = this.callIndexes.get(event.toolCallId)
        if (sourceIndex === undefined) throw orderError(`Pi started unknown tool call "${event.toolCallId}"`)
        return [{
          type: 'tool.started',
          position: this.position(),
          callId: ToolCallId(event.toolCallId),
          name: event.toolName,
          arguments: event.args,
          sourceIndex,
        }]
      }
      case 'tool_execution_update': {
        const revision = (this.progressRevisions.get(event.toolCallId) ?? 0) + 1
        this.progressRevisions.set(event.toolCallId, revision)
        return [{
          type: 'tool.progress',
          position: this.position(),
          callId: ToolCallId(event.toolCallId),
          revision,
          partial: event.partialResult,
        }]
      }
      case 'tool_execution_end': {
        const sourceIndex = this.callIndexes.get(event.toolCallId)
        if (sourceIndex === undefined) throw orderError(`Pi completed unknown tool call "${event.toolCallId}"`)
        const rawResult: unknown = event.result
        const result = typeof rawResult === 'object' && rawResult !== null
          ? rawResult as Readonly<Record<string, unknown>>
          : {}
        const content = Array.isArray(result.content)
          ? result.content.flatMap((rawBlock: unknown) => {
            if (typeof rawBlock !== 'object' || rawBlock === null) return []
            const block = rawBlock as Readonly<Record<string, unknown>>
            return block.type === 'text' && typeof block.text === 'string'
              ? [{ type: 'text' as const, text: block.text }]
              : []
          })
          : []
        return [{
          type: 'tool.completed',
          position: this.position(),
          callId: ToolCallId(event.toolCallId),
          sourceIndex,
          result: {
            callId: ToolCallId(event.toolCallId),
            sourceIndex,
            content,
            isError: event.isError,
            meta: result.details,
          },
        }]
      }
      case 'turn_end': {
        const message = event.message as PiMessage
        const reason = message.role === 'assistant'
          ? message.stopReason === 'toolUse'
            ? 'tool-calls'
            : message.stopReason === 'length'
              ? 'max-tokens'
              : message.stopReason === 'aborted'
                ? 'aborted'
                : message.stopReason === 'error' || message.stopReason === 'pending'
                  ? 'error'
                  : 'completed'
          : 'completed'
        this.lastReason = reason === 'max-tokens'
          ? { kind: 'max-tokens' }
          : reason === 'aborted'
            ? { kind: 'aborted', reason: { kind: 'user' } }
            : reason === 'error'
              ? { kind: 'error', error: { code: 'MODEL_ERROR', message: 'Pi model turn failed' } }
              : { kind: 'completed' }
        return [{ type: 'step.completed', position: this.position(), reason }]
      }
      case 'agent_end': return [{ type: 'run.completed', turn: this.turn, reason: this.lastReason }]
    }
  }

  private position(): TurnPosition {
    return { turn: this.turn, step: this.step }
  }

  private requireMessage(): { pi: PiMessage; dshId: MessageId } {
    if (this.currentMessage === undefined) throw orderError('Pi updated or ended a message before message_start')
    return this.currentMessage
  }
}
