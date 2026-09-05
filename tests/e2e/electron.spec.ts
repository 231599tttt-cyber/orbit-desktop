import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  _electron as electron,
  expect,
  test,
  type ElectronApplication,
  type Page,
} from '@playwright/test'

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')

type PublicApplication = {
  id: string
  name: string
  kind?: string
  source?: string
  launchable?: boolean
  validation?: string
  launchStatus?: string
  alreadyAdded?: boolean
  isAdded?: boolean
}

function applicationsFrom(value: unknown): PublicApplication[] {
  if (Array.isArray(value)) return value as PublicApplication[]
  if (value && typeof value === 'object' && Array.isArray((value as { apps?: unknown }).apps)) {
    return (value as { apps: PublicApplication[] }).apps
  }
  return []
}

function normalizedApplicationName(name: string): string {
  return name.normalize('NFKC').toLocaleLowerCase().replace(/[\s\p{P}\p{S}]+/gu, '')
}

async function readLibrary(page: Page): Promise<PublicApplication[]> {
  return applicationsFrom(await page.evaluate(async () => {
    const api = (window as typeof window & {
      orbit?: { getLibrary?: () => Promise<unknown> }
    }).orbit
    return api?.getLibrary?.() ?? []
  }))
}

test.describe('Orbit Desktop Electron daily-launcher flow', () => {
  test.skip(process.platform !== 'win32', 'The Windows application scanner is Windows-only.')
  test.describe.configure({ mode: 'serial' })
  test.setTimeout(180_000)

  let electronApp: ElectronApplication
  let page: Page
  let temporaryUserData = ''
  const rendererErrors: string[] = []

  test.beforeAll(async () => {
    temporaryUserData = await mkdtemp(path.join(os.tmpdir(), 'orbit-desktop-e2e-'))
    const storeDirectory = path.join(temporaryUserData, 'orbit-data')
    await mkdir(storeDirectory, { recursive: true })
    await writeFile(path.join(storeDirectory, 'settings.json'), JSON.stringify({
      version: 1,
      value: {
        language: 'zh-CN',
        autoScan: false,
        fullscreenLauncher: false,
        // Deliberately invalid so the test process never claims a real global shortcut.
        globalShortcut: 'E2E-disabled',
      },
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
    page = await electronApp.firstWindow({ timeout: 60_000 })
    page.on('pageerror', (error) => rendererErrors.push(error.message))
    await page.waitForLoadState('domcontentloaded')
    await page.waitForFunction(() => Boolean((window as typeof window & { orbit?: unknown }).orbit))

    const actualUserData = await electronApp.evaluate(({ app }) => app.getPath('userData'))
    expect(path.resolve(actualUserData).toLocaleLowerCase()).toBe(
      path.resolve(temporaryUserData).toLocaleLowerCase(),
    )
  })

  test.afterAll(async () => {
    if (electronApp) await electronApp.close().catch(() => undefined)
    if (temporaryUserData) {
      const resolved = path.resolve(temporaryUserData)
      const temporaryRoot = path.resolve(os.tmpdir())
      if (resolved.startsWith(temporaryRoot) && path.basename(resolved).startsWith('orbit-desktop-e2e-')) {
        await rm(resolved, { force: true, recursive: true })
      }
    }
  })

  test('review, add, manage, localize, and hide without launching a user application', async ({}, testInfo) => {
    await expect.poll(() => readLibrary(page)).toEqual([])

    const rawScan = await page.evaluate(async () => {
      const api = (window as typeof window & {
        orbit?: { scanApplications?: () => Promise<unknown> }
      }).orbit
      return api?.scanApplications?.() ?? []
    })
    const scanned = applicationsFrom(rawScan)

    expect(scanned.length, 'A real Windows installation should expose at least one application entry').toBeGreaterThan(0)
    expect(scanned.every((app) => app.kind !== 'developer-demo')).toBe(true)
    expect(scanned.every((app) => app.source !== 'developer-demo')).toBe(true)
    expect(scanned.every((app) => !/^demo-/i.test(app.id))).toBe(true)
    expect(new Set(scanned.map((app) => app.id)).size).toBe(scanned.length)
    expect(new Set(scanned.map((app) => normalizedApplicationName(app.name))).size).toBe(scanned.length)
    await expect.poll(() => readLibrary(page)).toEqual([])

    await page.getByTestId('scan-apps').click()
    const picker = page.getByTestId('application-picker')
    await expect(picker).toBeVisible({ timeout: 90_000 })
    await expect.poll(() => readLibrary(page)).toEqual([])

    const rowStates = await picker.locator('.application-row').evaluateAll((rows) => rows.map((row) => {
      const checkbox = row.querySelector<HTMLInputElement>('input[type="checkbox"]')
      const status = row.querySelector<HTMLElement>('.application-row__status')
      return {
        disabled: checkbox?.disabled ?? true,
        verified: status?.classList.contains('is-verified') ?? false,
      }
    }))
    expect(rowStates.length).toBeGreaterThan(0)
    expect(rowStates.filter((row) => !row.disabled).length).toBeGreaterThan(0)
    expect(rowStates.every((row) => row.disabled || row.verified)).toBe(true)

    await testInfo.attach('application-picker.png', {
      body: await page.screenshot({ type: 'png' }),
      contentType: 'image/png',
    })

    const clearSelection = picker.getByRole('button', { name: /取消全选|Clear selection/i })
    if (await clearSelection.isEnabled()) await clearSelection.click()

    const selectableRows = picker.locator('.application-row:has(input[type="checkbox"]:not(:disabled))')
    await expect(selectableRows).not.toHaveCount(0)
    expect(await selectableRows.count()).toBeGreaterThan(1)
    const selectedRows = [selectableRows.nth(0), selectableRows.nth(1)]
    const selectedNames: string[] = []
    for (const selectedRow of selectedRows) {
      selectedNames.push((await selectedRow.locator('.application-row__identity strong').innerText()).trim())
      const selectedCheckbox = selectedRow.locator('input[type="checkbox"]')
      await selectedRow.click()
      await expect(selectedCheckbox).toBeChecked()
    }

    await picker.getByTestId('add-selected-apps').click()
    await expect(picker).toBeHidden()
    await expect.poll(() => readLibrary(page)).toHaveLength(2)

    const libraryAfterAdd = await readLibrary(page)
    expect(new Set(libraryAfterAdd.map((application) => application.name))).toEqual(new Set(selectedNames))
    await expect(page.getByRole('button', {
      name: new RegExp(`(?:启动|Launch)\\s+${selectedNames[0].replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`, 'i'),
    })).toBeVisible()

    const searchInput = page.locator('.search-box input')
    await searchInput.fill(selectedNames[0])
    await expect(page.getByTestId('focused-application-name')).toHaveText(selectedNames[0], { timeout: 5_000 })
    await expect(searchInput).toHaveValue(selectedNames[0])

    await page.getByTestId('manage-apps').click()
    const manager = page.getByTestId('application-manager')
    await expect(manager).toBeVisible()
    for (const application of libraryAfterAdd) {
      const managedRow = manager.locator('.managed-application').filter({ hasText: application.name })
      await expect(managedRow).toHaveCount(1)
      const removeButton = manager.getByTestId(`remove-app-${application.id}`)
      await removeButton.click()
      await removeButton.click()
      await expect(managedRow).toHaveCount(0)
    }
    await expect.poll(() => readLibrary(page)).toEqual([])

    await manager.getByRole('button', { name: /关闭|Close/i }).click()
    await page.getByTestId('open-settings').click()
    let settingsDialog = page.getByTestId('settings-panel')
    await expect(settingsDialog).toBeVisible()
    const languageSelect = settingsDialog.getByTestId('language-select')
    await languageSelect.selectOption('en-US')
    await expect(settingsDialog.getByRole('heading', { name: 'Settings' })).toBeVisible()
    await expect.poll(async () => page.evaluate(async () => {
      const api = (window as typeof window & {
        orbit?: { getSettings?: () => Promise<{ language?: string }> }
      }).orbit
      return (await api?.getSettings?.())?.language
    })).toBe('en-US')

    await settingsDialog.getByRole('button', { name: 'Close' }).click()
    await page.getByTestId('open-settings').click()
    settingsDialog = page.getByTestId('settings-panel')
    await expect(settingsDialog.getByTestId('language-select')).toHaveValue('en-US')
    await settingsDialog.getByTestId('language-select').selectOption('zh-CN')
    await expect(settingsDialog.getByRole('heading', { name: '设置' })).toBeVisible()
    await settingsDialog.getByRole('button', { name: '关闭' }).click()

    await page.keyboard.press('Escape')
    await expect.poll(() => electronApp.evaluate(({ BrowserWindow }) => (
      BrowserWindow.getAllWindows()[0]?.isVisible() ?? false
    ))).toBe(false)
    expect(rendererErrors).toEqual([])
  })
})
