/** Source provenance and exact Pi dependency gate regressions. */
import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { spawnSync } from 'node:child_process'
import { describe, expect, it } from 'vitest'
import { dump, load } from 'js-yaml'
import { verifyLocalHarnessSources } from '../verify-local-harness-sources.ts'

const repository = resolve(import.meta.dirname, '../..')
const adapter = 'packages/llm/llm-pi-ai'
const kernel = 'packages/core/agent-loop-pi'
const ai = '@earendil-works/pi-ai'
const core = '@earendil-works/pi-agent-core'

async function json(root: string, path: string, value: unknown): Promise<void> {
  await mkdir(dirname(join(root, path)), { recursive: true })
  await writeFile(join(root, path), `${JSON.stringify(value)}\n`)
}

async function fixture(withKernel = false): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), 'local-harness-sources-'))
  await json(root, 'package.json', { version: '0.1.5-alpha.2' })
  await json(root, 'docs/upstream/source-lock.json', JSON.parse(await readFile(join(repository, 'docs/upstream/source-lock.json'), 'utf8')))
  await json(root, `${adapter}/package.json`, { dependencies: { [ai]: '0.85.1' } })
  const dependency = { specifier: '0.85.1', version: '0.85.1' }
  const importers: Record<string, unknown> = { [adapter]: { dependencies: { [ai]: dependency } } }
  if (withKernel) {
    await json(root, `${kernel}/package.json`, {
      name: '@local-harness/pi-agent-loop', private: true, version: '0.1.5-alpha.2',
      dependencies: { [ai]: '0.85.1', [core]: '0.85.1' },
    })
    importers[kernel] = { dependencies: { [ai]: dependency, [core]: dependency } }
  }
  await writeFile(join(root, 'pnpm-lock.yaml'), dump({
    lockfileVersion: '9.0', importers,
    packages: { [`${ai}@0.85.1`]: {}, ...(withKernel ? { [`${core}@0.85.1`]: {} } : {}) },
    snapshots: { [`${ai}@0.85.1`]: {}, ...(withKernel ? { [`${core}@0.85.1`]: {} } : {}) },
  }))
  return root
}

describe('Local-Harness-pi source gate', () => {
  it('accepts PR-A without the kernel and PR-B with both exact dependencies', async () => {
    expect(await verifyLocalHarnessSources(await fixture())).toEqual([])
    expect(await verifyLocalHarnessSources(await fixture(true))).toEqual([])
  })

  it.each(['0.85.1', '0.85.2', '0.85.10'])('validates the base Pi version in peer-qualified resolution %s', async (version) => {
    const root = await fixture(true)
    const lock = load(await readFile(join(root, 'pnpm-lock.yaml'), 'utf8')) as {
      importers: Record<string, { dependencies: Record<string, { specifier: string; version: string }> }>
      packages: Record<string, unknown>
      snapshots: Record<string, unknown>
    }
    const resolution = `${version}(@modelcontextprotocol/sdk@1.29.0(zod@4.4.3))(ws@8.21.0)(zod@4.4.3)`
    for (const importer of Object.values(lock.importers)) {
      for (const entry of Object.values(importer.dependencies)) entry.version = resolution
    }
    lock.packages = { [`${ai}@${version}`]: {}, [`${core}@${version}`]: {} }
    lock.snapshots = { [`${ai}@${resolution}`]: {}, [`${core}@${resolution}`]: {} }
    await writeFile(join(root, 'pnpm-lock.yaml'), dump(lock))
    const errors = await verifyLocalHarnessSources(root)
    if (version === '0.85.1') expect(errors).toEqual([])
    else expect(errors.join('\n')).toContain('pnpm-lock.yaml')
  })

  it('records all three upstream sources and rejects a changed hash through the CLI', async () => {
    const root = await fixture()
    const lock = JSON.parse(await readFile(join(root, 'docs/upstream/source-lock.json'), 'utf8')) as {
      sources: { dsh: { commit: string } }
    }
    expect(Object.keys(lock.sources).sort()).toEqual(['codex', 'dsh', 'pi'])
    lock.sources.dsh.commit = '0'.repeat(40)
    await json(root, 'docs/upstream/source-lock.json', lock)
    const result = spawnSync(process.execPath, ['--import', 'tsx', join(repository, 'scripts/verify-local-harness-sources.ts'), '--root', root], { cwd: repository, encoding: 'utf8' })
    expect(result.status).toBe(1)
    expect(result.stderr).toContain('sources.dsh.commit')
  })

  it('requires the importer peer snapshot and rejects additional Pi versions', async () => {
    const resolution = '0.85.1(zod@4.4.3)'
    for (const snapshots of [
      { [`${ai}@0.85.1`]: {} },
      { [`${ai}@${resolution}`]: {}, [`${ai}@0.85.2(zod@4.4.3)`]: {} },
    ]) {
      const root = await fixture()
      await writeFile(join(root, 'pnpm-lock.yaml'), dump({
        importers: { [adapter]: { dependencies: { [ai]: { specifier: '0.85.1', version: resolution } } } },
        packages: { [`${ai}@0.85.1`]: {} }, snapshots,
      }))
      expect((await verifyLocalHarnessSources(root)).join('\n')).toContain('pnpm-lock.yaml: snapshots')
    }
  })

  it.each(['^0.85.1', '~0.85.1', 'workspace:*', '0.85.2'])('rejects direct dependency %s', async (version) => {
    const root = await fixture()
    await json(root, `${adapter}/package.json`, { dependencies: { [ai]: version } })
    expect((await verifyLocalHarnessSources(root)).join('\n')).toContain(`${adapter}/package.json`)
  })

  it('rejects a floating lock specifier, changed resolution, and missing package resolution', async () => {
    for (const lock of [
      { importers: { [adapter]: { dependencies: { [ai]: { specifier: '^0.85.1', version: '0.85.1' } } } } },
      { importers: { [adapter]: { dependencies: { [ai]: { specifier: '0.85.1', version: '0.85.2' } } } } },
      { importers: { [adapter]: { dependencies: { [ai]: { specifier: '0.85.1', version: '0.85.1' } } } } },
    ]) {
      const root = await fixture()
      await writeFile(join(root, 'pnpm-lock.yaml'), dump(lock))
      expect((await verifyLocalHarnessSources(root)).join('\n')).toContain('pnpm-lock.yaml')
    }
  })

  it('requires both dependencies once the kernel package exists', async () => {
    const root = await fixture(true)
    await json(root, `${kernel}/package.json`, { dependencies: { [core]: '0.85.1' } })
    expect((await verifyLocalHarnessSources(root)).join('\n')).toContain(`${kernel}/package.json`)
  })

  it.each([
    { private: false, version: '0.1.5-alpha.2' },
    { private: true, version: '0.0.0' },
    { private: true, version: '0.1.5-alpha.2', publishConfig: {} },
  ])('rejects invalid dynamically discovered Local package %j', async (fields) => {
    const root = await fixture()
    await json(root, 'packages/util/extra/package.json', { name: '@local-harness/extra', ...fields })
    expect((await verifyLocalHarnessSources(root)).join('\n')).toContain('packages/util/extra/package.json')
  })
})
