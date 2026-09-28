/** Product-owned contract between the DSH agent lifecycle and a replaceable loop kernel. */

import type { Branded } from '@deepseek-ai/dsh-brand'
import type {
  ContentBlock,
  Message,
  MessageId,
  StreamChunk,
  ToolCallId,
  UserMessage,
} from '@deepseek-ai/dsh-llm'
import type { SessionId, TurnEndReason } from '@deepseek-ai/dsh-session'

/** Identity of one kernel run inside an agent lifecycle. */
export type RunId = Branded<'RunId'>

/**
 * Brand a process-local run identity without changing its wire value.
 * @param value - Opaque run identity allocated by the DSH machine.
 * @returns The unchanged value with the run-id brand.
 */
export function RunId(value: string): RunId {
  return value as RunId
}

/** One step inside one durable DSH turn. */
export interface TurnPosition {
  readonly turn: number
  readonly step: number
}

/** Serializable failure facts used across the kernel boundary. */
export interface StableFailure {
  readonly domain: 'MODEL' | 'TOOL' | 'SESSION' | 'KERNEL' | 'PROTOCOL' | 'SECURITY' | 'MCP'
  readonly code: string
  readonly message: string
  readonly retryable: boolean
  readonly causeCode?: string
  readonly details?: Readonly<Record<string, unknown>>
}

/** Error carrying a stable boundary failure code. */
export class KernelBoundaryError extends Error {
  /** Stable machine-routing code duplicated for ergonomic error guards. */
  readonly code: string
  /** Serializable failure projection safe to cross the kernel boundary. */
  readonly failure: StableFailure

  constructor(
    code: string,
    message: string,
    options: {
      readonly domain?: StableFailure['domain']
      readonly retryable?: boolean
      readonly causeCode?: string
      readonly details?: Readonly<Record<string, unknown>>
      readonly cause?: unknown
    } = {},
  ) {
    super(message, options.cause === undefined ? undefined : { cause: options.cause })
    this.name = 'KernelBoundaryError'
    this.code = code
    this.failure = {
      domain: options.domain ?? 'KERNEL',
      code,
      message,
      retryable: options.retryable ?? false,
      ...options.causeCode === undefined ? {} : { causeCode: options.causeCode },
      ...options.details === undefined ? {} : { details: options.details },
    }
  }
}

/** Kernel implementations available in the current product release. */
export type KernelId = 'pi'

/** Static identity and supported behavior of one kernel implementation. */
export interface KernelDescriptor {
  readonly id: KernelId
  readonly version: string
  readonly capabilities: Readonly<{
    streaming: true
    tools: true
    parallelTools: false
    steering: boolean
    reasoning: boolean
    images: boolean
  }>
}

/** Immutable model route selected for exactly one prepared step. */
export interface FrozenModelSelection {
  readonly provider: string
  readonly model: string
  readonly wireApi: 'openai-responses' | 'openai-completions'
  readonly reasoningEffort?: string
  readonly maxTokens?: number
  readonly contextWindow?: number
  readonly inputModalities: readonly ('text' | 'image')[]
  readonly generation: number
}

/** Provider-neutral tool schema exposed to the serial kernel loop. */
export interface KernelToolSchema {
  readonly name: string
  readonly label: string
  readonly description: string
  readonly parameters: Readonly<Record<string, unknown>>
  readonly executionMode: 'sequential'
}

/** Complete immutable DSH-derived context for one kernel step. */
export interface KernelContextSnapshot {
  readonly sessionId: SessionId
  readonly systemPrompt: string
  readonly messages: readonly Message[]
  readonly tools: readonly KernelToolSchema[]
  readonly model: FrozenModelSelection
  readonly sessionSurfaceGeneration: number
}

/** Inputs required to start one isolated kernel run. */
export interface KernelRunInput {
  readonly runId: RunId
  readonly sessionId: SessionId
  readonly turn: number
  readonly initialMessages: readonly Message[]
  readonly initialContext: KernelContextSnapshot
  readonly signal: AbortSignal
}

/** Complete DSH tool outcome retained across process-local loop translation. */
export interface DshToolBridgeResult {
  readonly callId: ToolCallId
  readonly sourceIndex: number
  readonly content: readonly ContentBlock[]
  readonly isError: boolean
  readonly error?: Readonly<{ name?: string; code?: string; message: string }>
  readonly meta?: unknown
  readonly additionalContexts?: readonly UserMessage[]
  readonly concludesTurn?: true
}

/** Canonical DSH reason recorded when the owning turn closes. */
export type DshTurnEndReason = TurnEndReason

/** Ordered product event vocabulary emitted by a kernel run. */
export type KernelEvent =
  | { readonly type: 'run.started'; readonly runId: RunId }
  | { readonly type: 'step.started'; readonly position: TurnPosition }
  | { readonly type: 'message.started'; readonly position: TurnPosition; readonly message: Message }
  | {
    readonly type: 'message.delta'
    readonly position: TurnPosition
    readonly messageId: MessageId
    readonly streamRevision: number
    readonly delta: StreamChunk
  }
  | { readonly type: 'message.completed'; readonly position: TurnPosition; readonly message: Message }
  | {
    readonly type: 'tool.started'
    readonly position: TurnPosition
    readonly callId: ToolCallId
    readonly name: string
    readonly arguments: unknown
    /** Exact model-emitted JSON retained for the durable DSH call record. */
    readonly serializedArguments?: string
    readonly sourceIndex: number
  }
  | {
    readonly type: 'tool.progress'
    readonly position: TurnPosition
    readonly callId: ToolCallId
    readonly revision: number
    readonly partial: unknown
  }
  | {
    readonly type: 'tool.completed'
    readonly position: TurnPosition
    readonly callId: ToolCallId
    readonly sourceIndex: number
    readonly result: DshToolBridgeResult
  }
  | {
    readonly type: 'step.completed'
    readonly position: TurnPosition
    readonly reason: 'completed' | 'tool-calls' | 'max-tokens' | 'error' | 'aborted'
  }
  | { readonly type: 'run.completed'; readonly turn: number; readonly reason: DshTurnEndReason }

/** Awaited serial consumer for externally visible kernel events. */
export interface KernelEventSink {
  onEvent(event: KernelEvent, signal: AbortSignal): Promise<void>
}

/** Live handle returned synchronously for a started kernel run. */
export interface KernelRun {
  readonly runId: RunId
  readonly settled: Promise<KernelRunResult>
  abort(reason: unknown): void
}

/** Replaceable conversational loop boundary owned by the DSH agent machine. */
export interface KernelDriver {
  readonly descriptor: KernelDescriptor
  start(input: KernelRunInput, sink: KernelEventSink): KernelRun
}

/** Terminal outcome of one kernel run after its final sink barrier settles. */
export type KernelRunResult =
  | { readonly kind: 'completed' }
  | { readonly kind: 'cancelled'; readonly reason: unknown }
  | { readonly kind: 'failed'; readonly failure: StableFailure }

/** Fixed V1 descriptor: tools are deliberately serial. */
export const PI_KERNEL_DESCRIPTOR = {
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
} as const satisfies KernelDescriptor
