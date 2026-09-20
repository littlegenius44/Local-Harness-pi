/** Shared isolation policy for the application and plugin-management renderers. */
import type { BrowserWindowConstructorOptions } from 'electron'

/**
 * Build an initially hidden window with the shell-owned preload.
 * @param preload - Absolute path to the packaged preload entry.
 * @returns Window settings that keep renderer code outside Node.js.
 */
export function desktopWindowOptions(preload: string): BrowserWindowConstructorOptions {
  return {
    width: 1280,
    height: 840,
    minWidth: 880,
    minHeight: 600,
    show: false,
    webPreferences: {
      preload,
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
      webSecurity: true,
    },
  }
}
