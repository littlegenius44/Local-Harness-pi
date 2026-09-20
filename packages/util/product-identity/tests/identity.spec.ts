import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { productIdentity, thirdPartyNotices } from '../src/index.ts'
const root = resolve(import.meta.dirname, '../../../..')
describe('shared product identity', () => {
  it('pins the release family and upstream attribution', () => {
    for (const path of ['package.json', 'apps/cli/package.json', 'apps/desktop/package.json', 'apps/desktop-host/package.json', 'packages/util/product-identity/package.json']) {
      const manifest = JSON.parse(readFileSync(resolve(root, path), 'utf8')) as { version: string }
      expect(manifest.version).toBe(productIdentity.version)
    }
    expect(productIdentity).toMatchObject({ name: 'Local-Harness-pi', version: '0.1.5-alpha.2', dsh: { commit: 'b2e3b2a0125854567a4a5fcba75782e42fe84901', license: 'MIT' }, pi: { version: '0.85.1', license: 'MIT' }, codex: { commit: '73a1148c9c775c2a4616ce5096291740a00ed68a', usage: 'design-reference-only' } })
    expect(Object.isFrozen(productIdentity)).toBe(true)
    expect(Object.isFrozen(productIdentity.dsh)).toBe(true)
    expect(Object.isFrozen(productIdentity.pi)).toBe(true)
    expect(Object.isFrozen(productIdentity.codex)).toBe(true)
  })
  it('ships byte-identical offline notices with full MIT attributions', () => {
    expect(thirdPartyNotices).toBe(readFileSync(resolve(root,'apps/desktop/resources/THIRD_PARTY_NOTICES.txt'),'utf8'))
    for (const text of ['DeepSeek Harness', 'https://github.com/deepseek-ai/deepseek-harness', productIdentity.dsh.commit, 'MIT License', 'Pi', 'https://github.com/earendil-works/pi', '@earendil-works/pi-agent-core 0.85.1', '@earendil-works/pi-ai 0.85.1', 'OpenAI Codex — design reference only; no Codex source is redistributed', 'https://github.com/openai/codex', productIdentity.codex.commit, 'Apache License 2.0', 'Copyright (c) 2026 DeepSeek', 'Copyright (c) 2025 Mario Zechner']) expect(thirdPartyNotices).toContain(text)
    expect(thirdPartyNotices.match(/THE SOFTWARE IS PROVIDED "AS IS"/gu)).toHaveLength(2)
  })
})
