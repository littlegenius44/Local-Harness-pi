/** Serial adapter from Pi tool callbacks to the public DSH tool runtime. */

import type { Context } from '@deepseek-ai/cordis'
import type { Agent } from '@deepseek-ai/dsh-agent'
import { createToolResultMessage, type ToolCallId } from '@deepseek-ai/dsh-llm'
import type { SessionSeq } from '@deepseek-ai/dsh-session'
import type { ToolExecutionResult } from '@deepseek-ai/dsh-tools'
import type {
  DshToolBridgeResult,
  KernelEvent,
  TurnPosition,
} from './kernel-driver.ts'
import type { PreparedKernelStep } from './model-bridge.ts'

type ToolStartedEvent = Extract<KernelEvent, { type: 'tool.started' }>
type ToolCompletedEvent = Extract<KernelEvent, { type: 'tool.completed' }>

interface ActiveToolCall {
  readonly position: TurnPosition
  readonly callId: ToolCallId
  readonly name: string
  readonly arguments: unknown
  readonly sourceIndex: number
  readonly callSeq: SessionSeq
  result?: DshToolBridgeResult
  completed: boolean
}

function bridgeResult(
  callId: ToolCallId,
  sourceIndex: number,
  result: ToolExecutionResult,
): DshToolBridgeResult {
  return {
    callId,
    sourceIndex,
    content: result.content,
    isError: result.isError,
    ...result.error === undefined
      ? {}
      : {
        error: {
          message: result.error.message,
          ...result.error.info === undefined ? {} : result.error.info,
        },
      },
    ...result.meta === undefined ? {} : { meta: result.meta },
    ...result.additionalContexts === undefined ? {} : { additionalContexts: result.additionalContexts },
    ...result.concludesTurn === true ? { concludesTurn: true } : {},
  }
}

/** Owns the single in-flight tool record required by the V1 serial loop. */
export class DshToolBridge {
  private active: ActiveToolCall | undefined

  constructor(
    private readonly ctx: Context,
    private readonly agent: Agent,
  ) {}

  /** Commit the call before Pi is allowed to enter the public execution pipeline. */
  start(event: ToolStartedEvent): void {
    if (this.active !== undefined) {
      throw new Error(`tool call "${event.callId}" started while "${this.active.callId}" is still active`)
    }
    const call = this.agent.session.append('tool/call', {
      ...event.position,
      callId: event.callId,
      name: event.name,
      arguments: JSON.stringify(event.arguments),
    })
    this.active = {
      position: event.position,
      callId: event.callId,
      name: event.name,
      arguments: event.arguments,
      sourceIndex: event.sourceIndex,
      callSeq: call.seq,
      completed: false,
    }
  }

  /** Execute only through `ctx.tools.execute`, retaining its canonical result for commit. */
  async execute(
    _step: PreparedKernelStep,
    callId: string,
    name: string,
    args: unknown,
    signal: AbortSignal,
    _update: (partial: unknown) => void,
  ): Promise<DshToolBridgeResult> {
    const active = this.requireActive(callId)
    if (active.name !== name) {
      throw new Error(`tool call "${callId}" changed name from "${active.name}" to "${name}"`)
    }
    if (active.result !== undefined) throw new Error(`tool call "${callId}" executed more than once`)
    const result = await this.dispatch(active, args, signal)
    active.result = result
    return result
  }

  /** Confirm completion, routing Pi-side immediate failures through DSH as well. */
  async complete(event: ToolCompletedEvent, signal: AbortSignal): Promise<void> {
    const active = this.requireActive(event.callId)
    if (active.sourceIndex !== event.sourceIndex) {
      throw new Error(`tool call "${event.callId}" changed source order`)
    }
    active.result ??= await this.dispatch(active, active.arguments, signal)
    active.completed = true
  }

  private async dispatch(
    active: ActiveToolCall,
    args: unknown,
    signal: AbortSignal,
  ): Promise<DshToolBridgeResult> {
    const result = await this.ctx.tools.execute({
      callId: active.callId,
      name: active.name,
      arguments: args,
      agent: this.agent,
      signal,
    })
    return bridgeResult(active.callId, active.sourceIndex, result)
  }

  /** Commit the original DSH result and stage its extra contexts for the next step. */
  commit(callId: ToolCallId, position: TurnPosition): void {
    const active = this.requireActive(callId)
    const result = active.result
    if (!active.completed || result === undefined) {
      throw new Error(`tool result "${callId}" arrived before tool completion`)
    }
    if (active.position.turn !== position.turn || active.position.step !== position.step) {
      throw new Error(`tool result "${callId}" targeted a different step`)
    }
    const message = createToolResultMessage({
      callId,
      content: [...result.content],
      isError: result.isError,
    })
    const error = result.error
    this.agent.session.append('tool/result', {
      ...position,
      message,
      ...error !== undefined && error.name !== undefined && error.code !== undefined
        ? { error: { name: error.name, code: error.code } }
        : {},
      ...result.meta === undefined ? {} : { meta: result.meta as never },
    }, { surfaceOp: 'append', sourceEventSeqs: [active.callSeq] })
    this.active = undefined
    for (const context of result.additionalContexts ?? []) this.agent.inject(context)
  }

  /** Close a stranded call with a durable error before the owning step ends. */
  abort(): void {
    const active = this.active
    if (active === undefined) return
    active.result ??= {
      callId: active.callId,
      sourceIndex: active.sourceIndex,
      content: [{ type: 'text', text: 'Error: Pi kernel ended before tool completion' }],
      isError: true,
      error: {
        name: 'KernelBoundaryError',
        code: 'KERNEL_TOOL_ABORTED',
        message: 'Pi kernel ended before tool completion',
      },
    }
    active.completed = true
    this.commit(active.callId, active.position)
  }

  private requireActive(callId: string): ActiveToolCall {
    const active = this.active
    if (active === undefined || active.callId !== callId) {
      throw new Error(`tool call "${callId}" has no active DSH bridge record`)
    }
    return active
  }
}
