import { describe, expect, it } from 'vitest'
import { designBlockErrors, validateDesignBlock } from './doc-design-blocks.ts'

describe('designBlockErrors', () => {
  it('accepts syntactically complete future interfaces without inventing implementations', () => {
    expect(designBlockErrors('export interface Planned { run(input: FutureInput): FutureResult }')).toEqual([])
  })

  it('rejects malformed design syntax', () => {
    expect(designBlockErrors('export interface Planned { value: }')).not.toEqual([])
  })

  it('rejects member fragments without an enclosing declaration', () => {
    expect(designBlockErrors("location?: 'local' | 'cloud'")).not.toEqual([])
  })

  it('rejects the design designation in current package documentation', () => {
    expect(validateDesignBlock('packages/core/agent/README.md', 'export interface Future {}')).not.toEqual([])
  })

  it('checks approved design syntax through the same entry used by the gate', () => {
    const file = 'docs/architecture/interface-contracts.md'
    expect(validateDesignBlock(file, 'export interface Future { value: PlannedValue }')).toEqual([])
    expect(validateDesignBlock(file, 'export interface Future { value: }')).not.toEqual([])
  })

  it('accepts the approved minimal serial PR-B implementation plan', () => {
    const file = 'docs/superpowers/plans/2026-09-27-local-harness-pi-pr-b-minimal-serial.md'
    expect(validateDesignBlock(file, 'export interface Future { value: PlannedValue }')).toEqual([])
  })
})
