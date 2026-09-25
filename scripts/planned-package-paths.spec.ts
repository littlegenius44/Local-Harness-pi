import { describe, expect, it } from 'vitest'
import { plannedPackagePaths } from './planned-package-paths.ts'

describe('plannedPackagePaths', () => {
  it('recognizes exact files explicitly scheduled for creation in implementation plans', () => {
    expect([...plannedPackagePaths('docs/superpowers/plans/example.md', '- Create: `packages/core/agent/src/future.ts`')])
      .toEqual(['packages/core/agent/src/future.ts'])
  })

  it('does not exempt modified files, arbitrary mentions, globs, or path traversal', () => {
    expect([...plannedPackagePaths('docs/superpowers/plans/example.md', [
      '- Modify: `packages/core/agent/src/missing.ts`',
      'Use `packages/core/agent/src/typo.ts`.',
      '- Create: `packages/core/agent/src/*.ts`',
      '- Create: `packages/core/../secret.ts`',
    ].join('\n'))]).toEqual([])
  })

  it('does not apply to current package references', () => {
    expect([...plannedPackagePaths('packages/core/agent/README.md', '- Create: `packages/core/agent/src/future.ts`')]).toEqual([])
  })
})
