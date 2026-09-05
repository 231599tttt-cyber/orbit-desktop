import { createRequire } from 'node:module'
import { expect, test } from '@playwright/test'

const require = createRequire(import.meta.url)
const {
  applyUwpRegistrationStatus,
  parsePowerShellJson,
  revalidateUwpApplications,
} = require('../../electron/platform/windows/applications.cjs') as {
  applyUwpRegistrationStatus: (application: Record<string, unknown>, registration: {
    ok: boolean
    error?: string
    aumids: Set<string>
  }) => Record<string, unknown>
  parsePowerShellJson: (stdout: string) => {
    ok: boolean
    error?: string
    values: unknown[]
  }
  revalidateUwpApplications: (
    applications: Record<string, unknown>[],
    registrationReader: () => Promise<{ ok: boolean; error?: string; aumids: Set<string> }>,
  ) => Promise<Record<string, unknown>[]>
}

const calculator = {
  id: 'app-calculator',
  name: 'Calculator',
  kind: 'uwp',
  aumid: 'Microsoft.WindowsCalculator_8wekyb3d8bbwe!App',
  launchable: true,
  launchStatus: 'valid',
  statusReason: 'registered-uwp-entry',
}

test('PowerShell scan output distinguishes empty or malformed output from a valid empty result', () => {
  expect(parsePowerShellJson('[]')).toEqual({ ok: true, values: [] })
  expect(parsePowerShellJson('')).toEqual({
    ok: false,
    error: 'scanner-empty-output',
    values: [],
  })
  expect(parsePowerShellJson('not-json')).toEqual({
    ok: false,
    error: 'scanner-invalid-output',
    values: [],
  })
})

test('stored UWP entries are valid only while their AUMID remains registered', () => {
  const registered = applyUwpRegistrationStatus(calculator, {
    ok: true,
    aumids: new Set([String(calculator.aumid).toLocaleLowerCase('en-US')]),
  })
  expect(registered).toMatchObject({ launchable: true, launchStatus: 'valid' })

  const removed = applyUwpRegistrationStatus(calculator, { ok: true, aumids: new Set() })
  expect(removed).toMatchObject({
    launchable: false,
    launchStatus: 'invalid',
    statusReason: 'uwp-not-registered',
  })

  const unavailable = applyUwpRegistrationStatus(calculator, {
    ok: false,
    error: 'powershell-unavailable',
    aumids: new Set(),
  })
  expect(unavailable).toMatchObject({
    launchable: false,
    launchStatus: 'unverified',
    statusReason: 'powershell-unavailable',
  })
})

test('UWP revalidation batches one registration lookup and leaves Win32 entries unchanged', async () => {
  let lookups = 0
  const executable = {
    id: 'app-editor',
    name: 'Editor',
    kind: 'executable',
    launchable: true,
    launchStatus: 'valid',
  }
  const result = await revalidateUwpApplications(
    [calculator, executable],
    async () => {
      lookups += 1
      return { ok: true, aumids: new Set() }
    },
  )

  expect(lookups).toBe(1)
  expect(result[0]).toMatchObject({ launchStatus: 'invalid', statusReason: 'uwp-not-registered' })
  expect(result[1]).toBe(executable)
})
