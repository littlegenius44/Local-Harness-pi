/** Pure About presentation and shell-owned offline notice selection. */
import { resolve } from 'node:path'
import { productIdentity } from '@local-harness/product-identity'

/**
 * Render product attribution using the running Electron application's version.
 * @param version - Version from app.getVersion().
 * @returns Read-only About detail.
 */
export function buildAboutDetail(version: string): string {
  return `${productIdentity.name} ${version}\n\nBuilt on DeepSeek Harness\nDSH commit: ${productIdentity.dsh.commit}\nPi: ${productIdentity.pi.version}\n\n${productIdentity.officialDisclaimer}`
}

/**
 * Select the shell-owned license resource; renderer paths are never accepted.
 * @param isPackaged - Electron app.isPackaged.
 * @param resourcesPath - Electron process.resourcesPath.
 * @param appPath - Electron app.getAppPath().
 * @returns Absolute offline notice path.
 */
export function resolveThirdPartyNoticesPath(isPackaged: boolean, resourcesPath: string, appPath: string): string {
  return isPackaged
    ? resolve(resourcesPath, 'THIRD_PARTY_NOTICES.txt')
    : resolve(appPath, 'resources/THIRD_PARTY_NOTICES.txt')
}
