import { describe, expect, it, onTestFinished } from 'vitest'
import { existsSync, mkdtempSync, readFileSync, rmdirSync, unlinkSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  desktopElectronBuilderEnvironment,
  desktopElectronBuilderArguments,
  parseDesktopPackageInvocation,
  resolveDesktopPackageTarget,
  withoutDesktopUploadCredentials,
  withoutWindowsSigningEnvironment,
  writeReleaseRecord,
} from '../scripts/package-target.ts'

describe('desktop package target', () => {
  it.each([
    {},
    { DSH_DESKTOP_AUTO_UPDATE_ENV: 'production' },
    { DSH_DESKTOP_AUTO_UPDATE_ENV: 'invalid' },
  ])('records a manual unsigned Windows installer independently of upstream update configuration %j', (environment) => {
    const artifacts = mkdtempSync(join(tmpdir(), 'local-harness-package-'))
    const recordPath = join(artifacts, 'win-x64-release.json')
    onTestFinished(() => {
      if (existsSync(recordPath)) unlinkSync(recordPath)
      if (existsSync(`${recordPath}.tmp`)) unlinkSync(`${recordPath}.tmp`)
      rmdirSync(artifacts)
    })
    const target = resolveDesktopPackageTarget('win-x64', 'win32', 'x64')
    writeReleaseRecord(target, environment, artifacts)
    const record: unknown = JSON.parse(readFileSync(recordPath, 'utf8'))
    const manifest = JSON.parse(readFileSync(new URL('../../../package.json', import.meta.url), 'utf8')) as { version: string }
    expect(record).toEqual({
      schemaVersion: 1,
      target: 'win-x64',
      version: manifest.version,
      installation: 'manual',
      signed: false,
    })
  })

  it('does not forward Windows signing or COS secrets to electron-builder', () => {
    expect(desktopElectronBuilderEnvironment({
      PATH: 'tools',
      DSH_DESKTOP_TARGET_PLATFORM: 'win32',
      DSH_DESKTOP_TARGET_ARCH: 'x64',
      DSH_DESKTOP_WINDOWS_TOKEN_PIN: 'token-secret',
      DSH_DESKTOP_WINDOWS_CER_FILE: 'certificate',
      DOWNLOAD_PROD_COS_SECRET_KEY: 'upload-secret',
    })).toEqual({
      PATH: 'tools',
      DSH_DESKTOP_TARGET_PLATFORM: 'win32',
      DSH_DESKTOP_TARGET_ARCH: 'x64',
    })
  })

  it('selects matching runtime and electron-builder architectures', () => {
    expect(resolveDesktopPackageTarget('mac-arm64', 'darwin', 'arm64')).toMatchObject({
      platform: 'darwin', arch: 'arm64', builderPlatform: '--mac', builderArch: '--arm64',
    })
    expect(resolveDesktopPackageTarget('mac-x64', 'darwin', 'x64')).toMatchObject({
      platform: 'darwin', arch: 'x64', builderPlatform: '--mac', builderArch: '--x64',
    })
    expect(resolveDesktopPackageTarget('win-x64', 'win32', 'x64')).toMatchObject({
      platform: 'win32', arch: 'x64', builderPlatform: '--win', builderArch: '--x64',
    })
  })

  it('allows an Apple Silicon host to build the Intel target through Rosetta', () => {
    expect(resolveDesktopPackageTarget('mac-x64', 'darwin', 'arm64').arch).toBe('x64')
  })

  it('rejects unsupported targets and hosts before building', () => {
    expect(() => resolveDesktopPackageTarget('linux-x64', 'linux', 'x64')).toThrow(/unsupported target/u)
    expect(() => resolveDesktopPackageTarget('win-x64', 'darwin', 'arm64')).toThrow(/Windows x64/u)
    expect(() => resolveDesktopPackageTarget('mac-arm64', 'darwin', 'x64')).toThrow(/Apple Silicon/u)
    expect(() => resolveDesktopPackageTarget('mac-arm64', 'linux', 'arm64')).toThrow(/macOS/u)
    expect(() => resolveDesktopPackageTarget('mac-x64', 'darwin', 'ppc64')).toThrow(/Rosetta/u)
  })

  it('parses installer and unpacked-directory invocations', () => {
    expect(parseDesktopPackageInvocation(['mac-arm64'], 'darwin', 'arm64').directory).toBe(false)
    expect(parseDesktopPackageInvocation(['mac-arm64', '--dir'], 'darwin', 'arm64').directory).toBe(true)
    expect(parseDesktopPackageInvocation([], 'darwin', 'arm64').target.name).toBe('mac-arm64')
    expect(parseDesktopPackageInvocation(['--prepare-only'], 'darwin', 'arm64').prepareOnly).toBe(true)
    expect(() => parseDesktopPackageInvocation(['mac-arm64', 'mac-x64'], 'darwin', 'arm64'))
      .toThrow(/at most one target/u)
  })

  it('keeps electron-builder publishing disabled for the separate validated upload', () => {
    const target = resolveDesktopPackageTarget('mac-arm64', 'darwin', 'arm64')
    expect(desktopElectronBuilderArguments(target, false)).toEqual([
      'exec',
      'electron-builder',
      '--config',
      'electron-builder.config.mjs',
      '--mac',
      '--arm64',
      '--publish',
      'never',
    ])
    expect(desktopElectronBuilderArguments(target, true)).toContain('--dir')
  })

  it('keeps Windows signing fields out of build and seed preparation subprocesses', () => {
    expect(withoutWindowsSigningEnvironment({
      DSH_DESKTOP_WINDOWS_CER_FILE: 'C:\\release\\server.cer',
      DSH_DESKTOP_WINDOWS_TOKEN_PIN: 'token-secret',
      DSH_DESKTOP_WINDOWS_KEY_CONTAINER: 'container',
      DSH_DESKTOP_WINDOWS_SIGNTOOL: 'C:\\tools\\signtool.exe',
      DSH_DESKTOP_AUTO_UPDATE_ENV: 'production',
    })).toEqual({ DSH_DESKTOP_AUTO_UPDATE_ENV: 'production' })
  })

  it('keeps COS credentials out of every packaging subprocess', () => {
    expect(withoutDesktopUploadCredentials({
      DOWNLOAD_TEST_ORIGIN: 'https://desktop-updates.example.com',
      DOWNLOAD_TEST_COS_BUCKET: 'test-download-bucket',
      DOWNLOAD_TEST_COS_SECRET_ID: 'test-id',
      DOWNLOAD_TEST_COS_SECRET_KEY: 'test-key',
      DOWNLOAD_PROD_COS_BUCKET: 'production-download-bucket',
      DOWNLOAD_PROD_COS_SECRET_ID: 'production-id',
      DOWNLOAD_PROD_COS_SECRET_KEY: 'production-key',
      DSH_DESKTOP_AUTO_UPDATE_ENV: 'production',
    })).toEqual({
      DOWNLOAD_TEST_ORIGIN: 'https://desktop-updates.example.com',
      DOWNLOAD_TEST_COS_BUCKET: 'test-download-bucket',
      DOWNLOAD_PROD_COS_BUCKET: 'production-download-bucket',
      DSH_DESKTOP_AUTO_UPDATE_ENV: 'production',
    })
  })
})
