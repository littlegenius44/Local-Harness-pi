/** Verify fixed source provenance, Pi resolutions, and private product packages. */
import { readFile, readdir, access } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { parseArgs } from 'node:util'
import { load } from 'js-yaml'

const piVersion = '0.85.1'
const productVersion = '0.1.5-alpha.2'
const adapter = 'packages/llm/llm-pi-ai'
const kernel = 'packages/core/agent-loop-pi'
const ai = '@earendil-works/pi-ai'
const core = '@earendil-works/pi-agent-core'
const expectedSourceLock = {
  schemaVersion: 1,
  sources: {
    dsh: { repository: 'https://github.com/deepseek-ai/deepseek-harness.git', commit: 'b2e3b2a0125854567a4a5fcba75782e42fe84901', license: 'MIT' },
    pi: { repository: 'https://github.com/earendil-works/pi.git', commit: 'acaa253cc8e3f159e6100b6f3874861b1f0bfc99', agentCoreVersion: piVersion, piAiVersion: piVersion, license: 'MIT' },
    codex: { repository: 'https://github.com/openai/codex.git', commit: '73a1148c9c775c2a4616ce5096291740a00ed68a', usage: 'design-reference-only', license: 'Apache-2.0' },
  },
}

function record(value: unknown): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return {}
  return value as Record<string, unknown>
}

/** pnpm snapshot resolutions append peer contexts in parentheses to the package version. */
function baseVersion(value: unknown): string | undefined {
  return typeof value === 'string' ? value.split('(')[0] : undefined
}

async function json(path: string): Promise<Record<string, unknown>> {
  return record(JSON.parse(await readFile(path, 'utf8')))
}

function compare(actual: unknown, expected: Record<string, unknown>, path: string, errors: string[]): void {
  const fields = record(actual)
  for (const [key, value] of Object.entries(expected)) {
    if (typeof value === 'object' && value !== null) compare(fields[key], record(value), `${path}.${key}`, errors)
    else if (fields[key] !== value) errors.push(`${path}.${key}: expected ${JSON.stringify(value)}`)
  }
  for (const key of Object.keys(fields)) {
    if (!Object.hasOwn(expected, key)) errors.push(`${path}.${key}: unexpected provenance field`)
  }
}

async function exists(path: string): Promise<boolean> {
  try { await access(path); return true }
  catch (error) {
    if (record(error).code === 'ENOENT') return false
    throw error
  }
}

/**
 * Inspect one repository without changing source or package-manager state.
 * @param root - Absolute repository directory, or an isolated test fixture.
 * @returns Path-qualified violations; unreadable or malformed inputs reject.
 */
export async function verifyLocalHarnessSources(root: string): Promise<string[]> {
  const errors: string[] = []
  compare(await json(join(root, 'docs/upstream/source-lock.json')), expectedSourceLock, 'docs/upstream/source-lock.json', errors)
  const manifest = await json(join(root, 'package.json'))
  if (manifest.version !== productVersion) errors.push(`package.json: expected version ${productVersion}`)
  const lock = record(load(await readFile(join(root, 'pnpm-lock.yaml'), 'utf8')))
  const importers = record(lock.importers)
  const required: [string, string[]][] = [[adapter, [ai]]]
  if (await exists(join(root, kernel, 'package.json'))) required.push([kernel, [ai, core]])
  for (const [directory, names] of required) {
    const dependencies = record((await json(join(root, directory, 'package.json'))).dependencies)
    const locked = record(record(importers[directory]).dependencies)
    for (const name of names) {
      if (dependencies[name] !== piVersion) errors.push(`${directory}/package.json: dependencies.${name} must be exactly ${piVersion}`)
      const entry = record(locked[name])
      if (entry.specifier !== piVersion || baseVersion(entry.version) !== piVersion) errors.push(`pnpm-lock.yaml: ${directory} dependencies.${name} must have specifier and version ${piVersion}`)
      for (const section of ['packages', 'snapshots']) {
        const resolution = section === 'packages' ? piVersion : String(entry.version)
        if (!Object.hasOwn(record(lock[section]), `${name}@${resolution}`)) errors.push(`pnpm-lock.yaml: ${section} must resolve ${name}@${resolution}`)
        for (const key of Object.keys(record(lock[section]))) {
          const version = key.slice(`${name}@`.length)
          if (key.startsWith(`${name}@`) && (section === 'packages' ? version : baseVersion(version)) !== piVersion) errors.push(`pnpm-lock.yaml: ${section} contains unpinned ${key}`)
        }
      }
    }
  }
  for (const group of await readdir(join(root, 'packages'), { withFileTypes: true })) {
    if (!group.isDirectory() || group.name === 'node_modules') continue
    for (const pkg of await readdir(join(root, 'packages', group.name), { withFileTypes: true })) {
      if (!pkg.isDirectory() || pkg.name === 'node_modules') continue
      const path = `packages/${group.name}/${pkg.name}/package.json`
      if (!await exists(join(root, path))) continue
      const local = await json(join(root, path))
      if (typeof local.name !== 'string' || !local.name.startsWith('@local-harness/')) continue
      if (local.private !== true) errors.push(`${path}: must set private: true`)
      if (local.version !== productVersion || local.version !== manifest.version) errors.push(`${path}: version must match root ${productVersion}`)
      if (Object.hasOwn(local, 'publishConfig')) errors.push(`${path}: must omit publishConfig`)
    }
  }
  return errors
}

if (process.argv[1] !== undefined && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try {
    const { values } = parseArgs({ options: { root: { type: 'string' } }, allowPositionals: false })
    const errors = await verifyLocalHarnessSources(resolve(values.root ?? join(import.meta.dirname, '..')))
    if (errors.length > 0) {
      console.error(errors.join('\n'))
      process.exitCode = 1
    }
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error))
    process.exitCode = 1
  }
}
