import { describe, expect, it } from 'vitest'
import { desktopWindowOptions } from '../src/window-options.ts'

describe('desktop renderer isolation', () => {
  it.each(['preload-app.cjs', 'preload.cjs'])('confines the %s renderer', (preload) => {
    const options = desktopWindowOptions(preload)
    expect(options.webPreferences).toEqual({
      preload,
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
      webSecurity: true,
    })
    expect(options.show).toBe(false)
    expect(options.minWidth).toBe(880)
    expect(options.minHeight).toBe(600)
  })
})
