import { expect, test } from '@playwright/test'
import { createTranslator, enUS, zhCN } from '../../src/i18n'

test('English and Simplified Chinese catalogs expose the exact same non-empty keys', () => {
  const englishKeys = Object.keys(enUS).sort()
  const chineseKeys = Object.keys(zhCN).sort()

  expect(chineseKeys).toEqual(englishKeys)
  expect(Object.values(enUS).every((value) => value.trim().length > 0)).toBe(true)
  expect(Object.values(zhCN).every((value) => value.trim().length > 0)).toBe(true)
})

test('translator interpolates dynamic UI values in both languages', () => {
  expect(createTranslator('en-US')('scanner.addSelected', { count: 3 })).toContain('3')
  expect(createTranslator('zh-CN')('scanner.addSelected', { count: 3 })).toContain('3')
})
