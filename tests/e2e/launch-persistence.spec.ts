import { existsSync } from 'node:fs'
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import crypto from 'node:crypto'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  _electron as electron,
  expect,
  test,
  type ElectronApplication,
} from '@playwright/test'

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')

function executableId(targetPath: string): string {
  const identity = `executable\u0000${targetPath.toLocaleLowerCase('en-US')}\u0000`
  return `app-${crypto.createHash('sha256').update(identity).digest('hex').slice(0, 24)}`
}

test.describe('Orbit Desktop external launch persistence', () => {
  test.skip(process.platform !== 'win32', 'This regression covers the Windows external process launcher.')
  test.setTimeout(120_000)

  let electronApp: ElectronApplication | undefined
  let temporaryUserData = ''

  test.afterEach(async () => {
    if (electronApp) await electronApp.close().catch(() => undefined)
    electronApp = undefined

    if (temporaryUserData) {
      const resolved = path.resolve(temporaryUserData)
      const temporaryRoot = path.resolve(os.tmpdir())
      if (resolved.startsWith(temporaryRoot) && path.basename(resolved).startsWith('orbit-desktop-launch-e2e-')) {
        await rm(resolved, { force: true, recursive: true })
      }
    }
    temporaryUserData = ''
  })

  test('keeps the launcher visible after starting an external executable', async () => {
    const systemRoot = process.env.SystemRoot || process.env.WINDIR || 'C:\\Windows'
    const targetPath = path.join(systemRoot, 'System32', 'where.exe')
    test.skip(!existsSync(targetPath), 'Windows where.exe is required for this regression test.')

    temporaryUserData = await mkdtemp(path.join(os.tmpdir(), 'orbit-desktop-launch-e2e-'))
    const storeDirectory = path.join(temporaryUserData, 'orbit-data')
    await mkdir(storeDirectory, { recursive: true })

    const id = executableId(targetPath)
    await writeFile(path.join(storeDirectory, 'settings.json'), JSON.stringify({
      version: 1,
      value: {
        language: 'en-US',
        autoScan: false,
        fullscreenLauncher: false,
        globalShortcut: 'E2E-disabled',
      },
    }), 'utf8')
    await writeFile(path.join(storeDirectory, 'applications.json'), JSON.stringify({
      version: 1,
      applications: [{
        id,
        name: 'Orbit launch persistence probe',
        kind: 'executable',
        source: 'manual',
        targetPath,
        arguments: '',
        workingDirectory: '',
        iconLocation: targetPath,
        addedAt: Date.now(),
      }],
    }), 'utf8')

    electronApp = await electron.launch({
      args: [`--user-data-dir=${temporaryUserData}`, '.'],
      cwd: projectRoot,
      env: {
        ...process.env,
        ELECTRON_DISABLE_SECURITY_WARNINGS: 'true',
      },
      timeout: 60_000,
    })
    const page = await electronApp.firstWindow({ timeout: 60_000 })
    await page.waitForLoadState('domcontentloaded')
    await page.waitForFunction(() => Boolean((window as typeof window & { orbit?: unknown }).orbit))

    const windowState = () => electronApp!.evaluate(({ BrowserWindow }) => {
      const window = BrowserWindow.getAllWindows()[0]
      return { visible: window?.isVisible() ?? false, minimized: window?.isMinimized() ?? false }
    })

    await expect.poll(windowState).toEqual({ visible: true, minimized: false })

    const result = await page.evaluate(async (applicationId) => {
      const api = (window as typeof window & {
        orbit?: { launchApp?: (id: string) => Promise<{ ok: boolean }> }
      }).orbit
      return api?.launchApp?.(applicationId) ?? { ok: false }
    }, id)
    expect(result.ok).toBe(true)

    // where.exe exits quickly; persistence here proves the launcher did not hide
    // itself as a side effect of a successful external launch.
    await expect.poll(windowState).toEqual({ visible: true, minimized: false })
  })
})
