/** Immutable per-step values shared by preparation and model streaming. */

import type { Agent as DshAgent } from '@deepseek-ai/dsh-agent'
import type { UserMessage } from '@deepseek-ai/dsh-llm'
import type {
  FrozenModelSelection,
  KernelContextSnapshot,
  KernelToolSchema,
  TurnPosition,
} from './kernel-driver.ts'

/** Fully accepted step snapshot; no mutable registry state crosses this boundary. */
export interface PreparedKernelStep {
  readonly position: TurnPosition
  readonly admittedMessages: readonly UserMessage[]
  readonly prompt: Readonly<{
    readonly rendered: string
    readonly sections: readonly unknown[]
    readonly tools: readonly KernelToolSchema[]
  }>
  readonly model: FrozenModelSelection
  readonly context: KernelContextSnapshot
  readonly startsRequestSeries: boolean
}

/** Creates the one immutable snapshot consumed by a kernel step. */
export interface StepPreparer {
  prepare(
    agent: DshAgent,
    target: 'next-turn' | 'next-step',
    position: TurnPosition,
    signal: AbortSignal,
  ): Promise<{ kind: 'reject' } | { kind: 'enter'; value: PreparedKernelStep }>
}

/** Resolves DSH model configuration and streams one prepared DSH request. */
export interface DshModelStreamBridge {
  resolve(
    agent: DshAgent,
    position: TurnPosition,
    signal: AbortSignal,
  ): Promise<FrozenModelSelection>

  stream(
    step: PreparedKernelStep,
    piContext: unknown,
    signal: AbortSignal,
  ): AsyncIterable<unknown>
}
