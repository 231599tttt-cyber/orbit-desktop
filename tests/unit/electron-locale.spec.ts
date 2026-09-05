import { createRequire } from 'node:module'
import { expect, test } from '@playwright/test'

const require = createRequire(import.meta.url)
const { mainText } = require('../../electron/services/locale.cjs') as {
  mainText: (language: string, key: string, parameters?: Record<string, string>) => string
}

test('Electron-owned menus and launch messages use the selected language', () => {
  expect(mainText('zh-CN', 'tray.quit')).toBe('退出')
  expect(mainText('en-US', 'tray.quit')).toBe('Quit')
  expect(mainText('zh-CN', 'launch.failed', { name: '测试应用' })).toContain('测试应用')
  expect(mainText('fr-FR', 'tray.hide')).toBe('Hide')
})
