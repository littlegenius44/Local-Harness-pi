/** Electron-builder fields asserted by the Desktop release tests. */
export interface DesktopElectronBuilderConfig {
  readonly appId: string
  readonly productName: string
  readonly artifactName: string
  readonly win: { readonly forceCodeSigning: boolean; readonly signExecutable: boolean; readonly icon: string; readonly target: readonly string[] }
  readonly nsis: { readonly oneClick: boolean; readonly allowToChangeInstallationDirectory: boolean }
  readonly directories: {
    readonly output: string
  }
  readonly extraResources: readonly { readonly from: string; readonly to: string }[]
  readonly mac: {
    readonly identity: string | undefined
    readonly forceCodeSigning: boolean
    readonly notarize: boolean
  }
  readonly dmg: {
    readonly sign: boolean
    readonly writeUpdateInfo: boolean
  }
  readonly artifactBuildCompleted: (artifact: { readonly file: string }) => Promise<void> | undefined
}

/**
 * Create electron-builder configuration from one release environment.
 * @param env - Packaging environment.
 * @param hostPlatform - Build-host platform used when no explicit target is present.
 * @param hostArch - Build-host architecture used when no explicit target is present.
 * @returns electron-builder configuration.
 */
export function createElectronBuilderConfig(
  env?: NodeJS.ProcessEnv,
  hostPlatform?: NodeJS.Platform,
  hostArch?: string,
): DesktopElectronBuilderConfig

declare const electronBuilderConfig: DesktopElectronBuilderConfig

export default electronBuilderConfig
