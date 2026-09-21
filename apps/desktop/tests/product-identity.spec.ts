import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { productIdentity, thirdPartyNotices } from '@local-harness/product-identity'
import { buildAboutDetail, resolveThirdPartyNoticesPath } from '../src/about.ts'
import { en, zh } from '../src/locale.ts'

const root = resolve(import.meta.dirname, '..')
describe('Local-Harness-pi desktop identity', () => {
  it('packages the unsigned Alpha without update servers or signer hooks', async () => {
    const { createElectronBuilderConfig } = await import('../electron-builder.config.mjs')
    const config = createElectronBuilderConfig({}, 'win32', 'x64')
    expect(config).toMatchObject({ productName: 'Local-Harness-pi', appId: 'io.localharness.pi', artifactName: 'local-harness-pi-${version}-${os}-${arch}.${ext}', win: { forceCodeSigning: false, icon: 'build/icon.svg', target: ['nsis'] }, nsis: { oneClick: false, allowToChangeInstallationDirectory: true } })
    expect(config).not.toHaveProperty('publish')
    expect(config).toHaveProperty('win.signExecutable', false)
    expect(config.win).not.toHaveProperty('signtoolOptions')
    expect(config.extraResources).toEqual(expect.arrayContaining([{ from: resolve(root, 'resources/THIRD_PARTY_NOTICES.txt'), to: 'THIRD_PARTY_NOTICES.txt' }]))
  })
  it('shows the product and offline About actions in both locales', () => {
    for (const messages of [en, zh]) {
      expect(messages.startupFailed).toContain('Local-Harness-pi')
      expect(messages.updateTitle).toContain('Local-Harness-pi')
      expect(messages.pluginWindowTitle).toContain('Local-Harness-pi')
      expect(messages).toHaveProperty('aboutMenu')
      expect(messages).toHaveProperty('thirdPartyNoticesMenu')
    }
  })
  it('uses the running version in About and resolves offline notices without renderer input', () => {
    expect(buildAboutDetail('test-running-version')).toBe(
      `Local-Harness-pi test-running-version\n\nBuilt on DeepSeek Harness\nDSH commit: ${productIdentity.dsh.commit}\nPi: 0.85.1\n\n${productIdentity.officialDisclaimer}`,
    )
    expect(resolveThirdPartyNoticesPath(true, '/resources', '/app')).toBe(resolve('/resources/THIRD_PARTY_NOTICES.txt'))
    expect(resolveThirdPartyNoticesPath(false, '/resources', '/app')).toBe(resolve('/app/resources/THIRD_PARTY_NOTICES.txt'))
    expect(readFileSync(resolve(root, 'resources/THIRD_PARTY_NOTICES.txt'))).toEqual(Buffer.from(thirdPartyNotices, 'utf8'))
    const manifest = JSON.parse(readFileSync(resolve(root, 'package.json'), 'utf8')) as { version: string; productName?: string }
    expect(manifest.version).toBe('0.1.5-alpha.2')
    expect(manifest.productName).toBe('Local-Harness-pi')
  })
  it('ships an original geometric icon without font or external resources', () => {
    const svg = readFileSync(resolve(root, 'build/icon.svg'), 'utf8')
    expect(svg).toContain('viewBox="0 0 32 32"')
    const favicon = readFileSync(resolve(root, '../web/public/favicon.svg'))
    expect(createHash('sha256').update(svg).digest('hex')).toBe(createHash('sha256').update(favicon).digest('hex'))
    expect(svg).not.toMatch(/<(?:text|image|use|script)\b/u)
  })
})
