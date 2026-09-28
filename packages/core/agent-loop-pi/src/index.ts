/** Pi-backed DSH AgentLoop plugin and its product-owned kernel contracts. */

import AgentLoop, {
  type AgentLoopMachine,
  type AgentMachineCreateInput,
} from '@deepseek-ai/dsh-agent-loop'
import { DshPiAgent } from './pi-agent.ts'

/** DSH factory lifecycle whose machine implementation is the serial Pi loop. */
export class PiAgentLoop extends AgentLoop {
  protected override createMachine(input: AgentMachineCreateInput): AgentLoopMachine {
    return new DshPiAgent(input.ctx, input.id, input.options, input.session)
  }
}

export default PiAgentLoop

export * from './kernel-driver.ts'
export type {
  DshModelStreamBridge,
  PreparedKernelStep,
  StepPreparer,
} from './model-bridge.ts'
