/** Pinned Pi 0.85.1 low-level loop adapted to the product-owned kernel seam. */

import { runAgentLoop } from '@earendil-works/pi-agent-core'
import type {
  AgentContext,
  AgentLoopTurnUpdate,
  AgentTool,
  AgentToolResult,
  StreamFn,
} from '@earendil-works/pi-agent-core'
import {
  createAssistantMessageEventStream,
  type Api,
  type AssistantMessage,
  type AssistantMessageEvent,
  type Message as PiMessage,
  type Model,
} from '@earendil-works/pi-ai'
import type { StreamChunk } from '@deepseek-ai/dsh-llm'
import { PiKernelEventTranslator } from './event-bridge.ts'
import {
  KernelBoundaryError,
  PI_KERNEL_DESCRIPTOR,
  type DshToolBridgeResult,
  type KernelDriver,
  type KernelRun,
  type KernelRunInput,
  type KernelRunResult,
} from './kernel-driver.ts'
import { toPiAssistantEvents } from './stream-conversion.ts'
import { toPiMessages } from './message-conversion.ts'
import type { PreparedKernelStep } from './model-bridge.ts'

/** Mutable run-local callbacks owned by one DSH Agent. */
export interface PiKernelCoordinator {
  /** Initial immutable step registered before the run starts. */
  initialStep(input: KernelRunInput): PreparedKernelStep
  /** Prepare the next DSH step before Pi starts its next turn. */
  prepareNextStep(signal: AbortSignal): Promise<{ kind: 'reject' } | { kind: 'enter'; value: PreparedKernelStep }>
  /** Stream one already-prepared DSH model request. */
  stream(
    step: PreparedKernelStep,
    context: AgentContext,
    signal: AbortSignal,
  ): AsyncIterable<AssistantMessageEvent>
  /** Execute one tool through the DSH tool pipeline. Commit 3 supplies this callback. */
  executeTool?(
    step: PreparedKernelStep,
    callId: string,
    name: string,
    args: unknown,
    signal: AbortSignal,
    update: (partial: unknown) => void,
  ): Promise<DshToolBridgeResult>
}

function toPiModel(step: PreparedKernelStep): Model<Api> {
  const model = step.model
  return {
    id: model.model,
    name: model.model,
    api: model.wireApi,
    provider: model.provider,
    baseUrl: '',
    reasoning: model.reasoningEffort !== undefined,
    input: [...model.inputModalities],
    cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
    contextWindow: model.contextWindow ?? 128_000,
    maxTokens: model.maxTokens ?? 16_384,
  }
}

function toPiToolResult(result: DshToolBridgeResult): AgentToolResult<unknown> {
  return {
    content: result.content.flatMap(block => block.type === 'text'
      ? [{ type: 'text' as const, text: block.text }]
      : []),
    details: result.meta,
    ...result.concludesTurn === true ? { terminate: true } : {},
  }
}

function toPiTools(step: PreparedKernelStep, coordinator: PiKernelCoordinator): AgentTool[] {
  return step.context.tools.map(schema => ({
    name: schema.name,
    label: schema.label,
    description: schema.description,
    parameters: schema.parameters as AgentTool['parameters'],
    executionMode: 'sequential',
    async execute(callId, args, signal, onUpdate) {
      if (coordinator.executeTool === undefined) {
        throw new KernelBoundaryError(
          'TOOL_BRIDGE_NOT_CONFIGURED',
          `tool "${schema.name}" cannot execute before the DSH bridge is installed`,
          { domain: 'TOOL' },
        )
      }
      const result = await coordinator.executeTool(
        step,
        callId,
        schema.name,
        args,
        signal ?? new AbortController().signal,
        partial => onUpdate?.({ content: [], details: partial }),
      )
      if (result.isError) {
        const failure = new Error(result.error?.message ?? `tool "${schema.name}" failed`)
        if (result.error?.code !== undefined) Object.assign(failure, { code: result.error.code })
        throw failure
      }
      return toPiToolResult(result)
    },
  }))
}

function toPiContext(step: PreparedKernelStep, coordinator: PiKernelCoordinator): AgentContext {
  return {
    systemPrompt: step.context.systemPrompt,
    messages: toPiMessages(step.context.messages),
    tools: toPiTools(step, coordinator),
  }
}

function streamEvents(source: AsyncIterable<AssistantMessageEvent>, fallback: PreparedKernelStep) {
  const stream = createAssistantMessageEventStream()
  void (async () => {
    try {
      for await (const event of source) stream.push(event)
    } catch (error: unknown) {
      const message: AssistantMessage = {
        role: 'assistant',
        content: [],
        api: fallback.model.wireApi,
        provider: fallback.model.provider,
        model: fallback.model.model,
        usage: {
          input: 0,
          output: 0,
          cacheRead: 0,
          cacheWrite: 0,
          totalTokens: 0,
          cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
        },
        stopReason: 'error',
        errorMessage: error instanceof Error ? error.message : String(error),
        timestamp: Date.now(),
      }
      stream.push({ type: 'error', reason: 'error', error: message })
    }
  })()
  return stream
}

/** Direct low-level Pi driver with awaited event barriers and no Pi Agent state. */
export class PiKernelDriver implements KernelDriver {
  readonly descriptor = PI_KERNEL_DESCRIPTOR

  constructor(private readonly coordinator: PiKernelCoordinator) {}

  start(input: KernelRunInput, sink: Parameters<KernelDriver['start']>[1]): KernelRun {
    const local = new AbortController()
    const onInputAbort = (): void => { local.abort(input.signal.reason) }
    if (input.signal.aborted) local.abort(input.signal.reason)
    else input.signal.addEventListener('abort', onInputAbort, { once: true })
    const signal = local.signal
    let currentStep = this.coordinator.initialStep(input)
    let initialSteeringPoll = true
    let pendingSteering: PiMessage[] = []
    const translator = new PiKernelEventTranslator(input.runId, input.turn, () => currentStep.model)

    const settled = (async (): Promise<KernelRunResult> => {
      try {
        const streamFn: StreamFn = (_model, context) => streamEvents(
          this.coordinator.stream(currentStep, context as AgentContext, signal),
          currentStep,
        )
        await runAgentLoop(
          toPiMessages(input.initialMessages),
          toPiContext(currentStep, this.coordinator),
          {
            model: toPiModel(currentStep),
            convertToLlm: messages => messages as PiMessage[],
            getSteeringMessages: () => {
              if (initialSteeringPoll) {
                initialSteeringPoll = false
                return Promise.resolve([])
              }
              const messages = pendingSteering
              pendingSteering = []
              return Promise.resolve(messages)
            },
            getFollowUpMessages: () => Promise.resolve([]),
            prepareNextTurn: async (): Promise<AgentLoopTurnUpdate> => {
              const prepared = await this.coordinator.prepareNextStep(signal)
              if (prepared.kind === 'reject') {
                throw new KernelBoundaryError('KERNEL_STEP_REJECTED', 'DSH rejected the next Pi step')
              }
              currentStep = prepared.value
              pendingSteering = toPiMessages(currentStep.admittedMessages)
              return {
                context: toPiContext(currentStep, this.coordinator),
                model: toPiModel(currentStep),
              }
            },
            toolExecution: 'sequential',
          },
          async (event) => {
            for (const translated of translator.translate(event)) {
              await sink.onEvent(translated, signal)
            }
          },
          signal,
          streamFn,
        )
        return signal.aborted
          ? { kind: 'cancelled', reason: signal.reason }
          : { kind: 'completed' }
      } catch (error: unknown) {
        if (signal.aborted) return { kind: 'cancelled', reason: signal.reason }
        const failure = error instanceof KernelBoundaryError
          ? error.failure
          : {
            domain: 'KERNEL' as const,
            code: 'KERNEL_RUN_FAILED',
            message: error instanceof Error ? error.message : String(error),
            retryable: false,
          }
        return { kind: 'failed', failure }
      } finally {
        input.signal.removeEventListener('abort', onInputAbort)
      }
    })()

    return {
      runId: input.runId,
      settled,
      abort(reason: unknown) { local.abort(reason) },
    }
  }
}

/** Adapt a raw DSH chunk stream for coordinators that already prepared the request. */
export function dshStreamAsPiEvents(
  step: PreparedKernelStep,
  chunks: AsyncIterable<StreamChunk>,
): AsyncIterable<AssistantMessageEvent> {
  return toPiAssistantEvents(chunks, step.model)
}
