import { isAbsolute, join, relative } from 'node:path'
import { describe, expect, it } from 'vitest'
import { resolveDesktopPaths } from '../src/paths.ts'

describe('desktop data ownership', () => {
  it('keeps the profile and package-manager state under the selected application home', () => {
    const home = join(process.cwd(), '用户 数据', 'Local-Harness-pi', 'harness')
    const paths = resolveDesktopPaths(home)
    expect(paths.profile).toBe(join(home, 'profiles', 'desktop'))
    const ownedPaths = [paths.root, paths.profile, paths.staging, paths.rollback, paths.pending, paths.lock, ...Object.values(paths.pnpm)]
    for (const path of ownedPaths) {
      const child = relative(home, path)
      expect(child.startsWith('..')).toBe(false)
      expect(isAbsolute(child)).toBe(false)
    }
    expect(resolveDesktopPaths(join(home, 'other')).profile).not.toBe(paths.profile)
  })
})
