const crypto = require('crypto')
const fs = require('fs')
const path = require('path')
const { execFile } = require('child_process')

const SCAN_LIMIT = 300
const POWERSHELL_TIMEOUT_MS = 30_000
const POWERSHELL_BASE_ARGUMENTS = ['-NoLogo', '-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass']
const VALID_KINDS = new Set(['shortcut', 'executable', 'uwp'])
const VALID_SOURCES = new Set([
  'start-menu-user',
  'start-menu-system',
  'desktop-user',
  'desktop-public',
  'registry',
  'uwp',
  'manual',
])

const SOURCE_PRIORITY = new Map([
  ['manual', 0],
  ['start-menu-user', 1],
  ['start-menu-system', 2],
  ['desktop-user', 3],
  ['desktop-public', 4],
  ['uwp', 5],
  ['registry', 6],
])

const DISALLOWED_WORDS = /(^|[\s._()\-[\]])(?:uninstall(?:er)?|unins\d*|updat(?:e|er)|helper|crash(?:pad)?|crash[\s._-]*reporter|setup|installer|installation|maintenance|maintenancetool|bootstrapper|repair|service|daemon|background)(?=$|[\s._()\-[\]])/i
const DISALLOWED_CJK = /(卸载|更新程序|安装程序|安装向导|安装助手|维护工具|崩溃报告|后台服务)/
const DISALLOWED_COMPACT = /(?:uninstall(?:er)?|unins\d*|updater|updatehelper|crashpad|crashreporter|setup|installer|installagent|maintenancetool|servicehelper|backgroundservice|packagemanagerserver|helper$|daemon$)/i
const NON_APPLICATION_NAME = /(^|[\s._()\-[\]])(?:documentation|docs?|help|manual|readme|release[\s._-]*notes?|migration[\s._-]*guide|website|license|changelog)(?=$|[\s._()\-[\]])/i
const INVALID_NAME = /^@\{|^ms-resource:|^[\s.]*$/i
const VALID_AUMID = /^[a-zA-Z0-9._-]{1,180}![a-zA-Z0-9._-]{1,180}$/
const NON_APPLICATION_TARGET_EXTENSIONS = new Set(['.chm', '.hlp', '.htm', '.html', '.msi', '.msu', '.pdf', '.txt', '.url'])

function existingFile(filePath) {
  if (typeof filePath !== 'string' || !filePath || !path.isAbsolute(filePath)) return false
  try {
    return fs.statSync(filePath).isFile()
  } catch {
    return false
  }
}

function cleanText(value, maxLength = 512) {
  if (typeof value !== 'string') return ''
  return value.replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, maxLength)
}

function cleanPath(value) {
  if (typeof value !== 'string') return ''
  const cleaned = value.replace(/[\u0000-\u001f\u007f]/g, '').trim().replace(/^"|"$/g, '')
  return path.isAbsolute(cleaned) ? path.normalize(cleaned).slice(0, 2_048) : ''
}

function normalizeName(name) {
  return name.toLocaleLowerCase('en-US').replace(/[\s\p{P}\p{S}]+/gu, '')
}

function stableId(application) {
  let launchIdentity = ''
  if (application.kind === 'uwp') {
    launchIdentity = application.aumid.toLocaleLowerCase('en-US')
  } else if (application.targetPath) {
    launchIdentity = `${application.targetPath.toLocaleLowerCase('en-US')}\u0000${application.arguments || ''}`
  } else {
    launchIdentity = application.shortcutPath.toLocaleLowerCase('en-US')
  }
  return `app-${crypto.createHash('sha256').update(`${application.kind}\u0000${launchIdentity}`).digest('hex').slice(0, 24)}`
}

function statusFor(application) {
  if (application.kind === 'uwp') {
    return VALID_AUMID.test(application.aumid)
      ? { launchable: true, launchStatus: 'valid', statusReason: 'registered-uwp-entry' }
      : { launchable: false, launchStatus: 'invalid', statusReason: 'invalid-aumid' }
  }

  if (application.kind === 'executable') {
    return existingFile(application.targetPath) && path.extname(application.targetPath).toLowerCase() === '.exe'
      ? { launchable: true, launchStatus: 'valid', statusReason: 'executable-exists' }
      : { launchable: false, launchStatus: 'invalid', statusReason: 'executable-missing' }
  }

  if (!existingFile(application.shortcutPath)) {
    return { launchable: false, launchStatus: 'invalid', statusReason: 'shortcut-missing' }
  }
  if (!application.targetPath) {
    return { launchable: false, launchStatus: 'unverified', statusReason: 'shortcut-target-not-resolved' }
  }
  if (!existingFile(application.targetPath)) {
    return { launchable: false, launchStatus: 'invalid', statusReason: 'shortcut-target-missing' }
  }
  if (NON_APPLICATION_TARGET_EXTENSIONS.has(path.extname(application.targetPath).toLowerCase())) {
    return { launchable: false, launchStatus: 'invalid', statusReason: 'not-an-application-entry' }
  }
  return { launchable: true, launchStatus: 'valid', statusReason: 'shortcut-target-exists' }
}

function sanitizeRawApplication(raw, { allowFilteredName = false } = {}) {
  const kind = cleanText(raw?.Kind || raw?.kind, 24).toLowerCase()
  const sourceValue = cleanText(raw?.Source || raw?.source, 32).toLowerCase()
  const source = VALID_SOURCES.has(sourceValue) ? sourceValue : 'registry'
  const name = cleanText(raw?.Name || raw?.name, 160)
  const shortcutPath = cleanPath(raw?.ShortcutPath || raw?.shortcutPath)
  const targetPath = cleanPath(raw?.TargetPath || raw?.targetPath)
  const workingDirectory = cleanPath(raw?.WorkingDirectory || raw?.workingDirectory)
  const logoPath = cleanPath(raw?.LogoPath || raw?.logoPath)
  const iconLocation = cleanText(raw?.IconLocation || raw?.iconLocation, 2_048)
  const argumentsValue = cleanText(raw?.Arguments || raw?.arguments, 2_048)
  const aumid = cleanText(raw?.Aumid || raw?.aumid, 380)

  if (!VALID_KINDS.has(kind) || !name || INVALID_NAME.test(name)) return null

  if (!allowFilteredName) {
    const filterSubject = [name, path.basename(targetPath || ''), path.basename(shortcutPath || '')].join(' ')
    const compactCandidates = [name, path.basename(targetPath || '', path.extname(targetPath || ''))]
      .map((part) => part.replace(/[\s._()\-[\]]+/g, ''))
    if (
      DISALLOWED_WORDS.test(filterSubject)
      || DISALLOWED_CJK.test(filterSubject)
      || NON_APPLICATION_NAME.test(name)
      || compactCandidates.some((part) => DISALLOWED_COMPACT.test(part))
      || (source === 'registry' && /[\\/]WindowsApps[\\/]/i.test(targetPath))
    ) return null
  }

  const application = {
    id: '',
    name,
    kind,
    source,
    shortcutPath: kind === 'shortcut' ? shortcutPath : '',
    targetPath: kind === 'uwp' ? '' : targetPath,
    arguments: argumentsValue,
    workingDirectory,
    iconLocation,
    aumid: kind === 'uwp' ? aumid : '',
    logoPath,
  }

  if (kind === 'shortcut' && !shortcutPath) return null
  if (kind === 'executable' && !targetPath) return null
  if (kind === 'uwp' && !aumid) return null

  application.id = stableId(application)
  return { ...application, ...statusFor(application) }
}

function parsePowerShellJson(stdout) {
  const text = String(stdout || '').replace(/^\uFEFF/, '').trim()
  if (!text) return { ok: false, error: 'scanner-empty-output', values: [] }
  try {
    const parsed = JSON.parse(text)
    return { ok: true, values: Array.isArray(parsed) ? parsed : [parsed] }
  } catch {
    const start = Math.min(...['[', '{'].map((marker) => {
      const index = text.indexOf(marker)
      return index < 0 ? Number.POSITIVE_INFINITY : index
    }))
    if (!Number.isFinite(start)) return { ok: false, error: 'scanner-invalid-output', values: [] }
    try {
      const parsed = JSON.parse(text.slice(start))
      return { ok: true, values: Array.isArray(parsed) ? parsed : [parsed] }
    } catch {
      return { ok: false, error: 'scanner-invalid-output', values: [] }
    }
  }
}

function powerShellErrorCode(error) {
  if (!error) return null
  if (error.killed || error.code === 'ETIMEDOUT' || /timed?\s*out/i.test(String(error.message || ''))) {
    return 'scanner-timeout'
  }
  if (error.code === 'ENOENT') return 'powershell-unavailable'
  return 'scanner-execution-failed'
}

function runPowerShell(argumentsValue) {
  return new Promise((resolve) => {
    execFile(
      'powershell.exe',
      [...POWERSHELL_BASE_ARGUMENTS, ...argumentsValue],
      {
        windowsHide: true,
        encoding: 'utf8',
        maxBuffer: 8 * 1024 * 1024,
        timeout: POWERSHELL_TIMEOUT_MS,
      },
      (error, stdout) => {
        const errorCode = powerShellErrorCode(error)
        if (errorCode) {
          resolve({ ok: false, error: errorCode, values: [] })
          return
        }
        resolve(parsePowerShellJson(stdout))
      },
    )
  })
}

function runPowerShellScript(scriptPath) {
  return runPowerShell(['-File', scriptPath])
}

async function readRegisteredUwpAumids() {
  if (process.platform !== 'win32') {
    return { ok: false, error: 'platform-not-supported', aumids: new Set() }
  }

  const command = [
    "$ErrorActionPreference = 'Stop'",
    '[Console]::OutputEncoding = [System.Text.Encoding]::UTF8',
    '$OutputEncoding = [System.Text.Encoding]::UTF8',
    "$ids = @(Get-StartApps -ErrorAction Stop | Where-Object { ([string]$_.AppID).Contains('!') } | ForEach-Object { [string]$_.AppID })",
    'ConvertTo-Json -InputObject $ids -Compress',
  ].join('; ')
  const result = await runPowerShell(['-Command', command])
  if (!result.ok) return { ok: false, error: result.error, aumids: new Set() }

  const aumids = new Set(
    result.values
      .filter((value) => typeof value === 'string' && VALID_AUMID.test(value))
      .map((value) => value.toLocaleLowerCase('en-US')),
  )
  return { ok: true, aumids }
}

function applyUwpRegistrationStatus(application, registration) {
  if (application.kind !== 'uwp') return application
  if (!VALID_AUMID.test(application.aumid)) {
    return { ...application, launchable: false, launchStatus: 'invalid', statusReason: 'invalid-aumid' }
  }
  if (!registration?.ok) {
    return {
      ...application,
      launchable: false,
      launchStatus: 'unverified',
      statusReason: registration?.error || 'uwp-registration-check-failed',
    }
  }
  if (!registration.aumids.has(application.aumid.toLocaleLowerCase('en-US'))) {
    return { ...application, launchable: false, launchStatus: 'invalid', statusReason: 'uwp-not-registered' }
  }
  return { ...application, launchable: true, launchStatus: 'valid', statusReason: 'registered-uwp-entry' }
}

async function revalidateUwpApplications(applications, registrationReader = readRegisteredUwpAumids) {
  if (!applications.some((application) => application.kind === 'uwp')) return applications
  let registration
  try {
    registration = await registrationReader()
  } catch {
    registration = { ok: false, error: 'uwp-registration-check-failed', aumids: new Set() }
  }
  return applications.map((application) => applyUwpRegistrationStatus(application, registration))
}

function launchIdentity(application) {
  if (application.kind === 'uwp') return `uwp:${application.aumid.toLowerCase()}`
  if (application.targetPath) {
    return `file:${application.targetPath.toLowerCase()}\u0000${application.arguments.toLowerCase()}`
  }
  return `shortcut:${application.shortcutPath.toLowerCase()}`
}

function qualityScore(application) {
  const validScore = application.launchStatus === 'valid' ? 1_000 : application.launchStatus === 'unverified' ? 100 : 0
  return validScore - (SOURCE_PRIORITY.get(application.source) ?? 20)
}

function deduplicate(applications) {
  const sorted = [...applications].sort((left, right) => {
    const qualityDifference = qualityScore(right) - qualityScore(left)
    if (qualityDifference) return qualityDifference
    return left.name.localeCompare(right.name, undefined, { sensitivity: 'base', numeric: true })
  })
  const seenNames = new Set()
  const seenLaunchEntries = new Set()
  const result = []

  for (const application of sorted) {
    const nameKey = normalizeName(application.name)
    const launchKey = launchIdentity(application)
    if (!nameKey || seenNames.has(nameKey) || seenLaunchEntries.has(launchKey)) continue
    seenNames.add(nameKey)
    seenLaunchEntries.add(launchKey)
    result.push(application)
    if (result.length >= SCAN_LIMIT) break
  }

  return result.sort((left, right) => left.name.localeCompare(right.name, undefined, { sensitivity: 'base', numeric: true }))
}

async function scanWindowsApplications() {
  if (process.platform !== 'win32') return { ok: false, applications: [], error: 'platform-not-supported' }
  const unpackedScriptPath = typeof process.resourcesPath === 'string'
    ? path.join(process.resourcesPath, 'platform', 'windows', 'scan-applications.ps1')
    : ''
  const scriptPath = existingFile(unpackedScriptPath)
    ? unpackedScriptPath
    : path.join(__dirname, 'scan-applications.ps1')
  if (!existingFile(scriptPath)) return { ok: false, applications: [], error: 'scanner-script-missing' }
  const result = await runPowerShellScript(scriptPath)
  if (!result.ok) return { ok: false, applications: [], error: result.error }
  return {
    ok: true,
    applications: deduplicate(result.values.map((raw) => sanitizeRawApplication(raw)).filter(Boolean)),
  }
}

async function applicationFromManualPath(filePath, shell) {
  const selectedPath = cleanPath(filePath)
  if (!selectedPath || !existingFile(selectedPath)) return null
  const extension = path.extname(selectedPath).toLowerCase()
  if (extension !== '.exe' && extension !== '.lnk') return null

  if (extension === '.exe') {
    return sanitizeRawApplication({
      Name: path.basename(selectedPath, extension),
      Kind: 'executable',
      Source: 'manual',
      TargetPath: selectedPath,
      IconLocation: selectedPath,
    }, { allowFilteredName: true })
  }

  let shortcutDetails = {}
  try {
    shortcutDetails = shell.readShortcutLink(selectedPath)
  } catch {}

  return sanitizeRawApplication({
    Name: path.basename(selectedPath, extension),
    Kind: 'shortcut',
    Source: 'manual',
    ShortcutPath: selectedPath,
    TargetPath: shortcutDetails.target,
    Arguments: shortcutDetails.args,
    WorkingDirectory: shortcutDetails.cwd,
    IconLocation: shortcutDetails.icon,
  }, { allowFilteredName: true })
}

function validateStoredApplication(raw) {
  if (!raw || typeof raw !== 'object') return null
  const application = sanitizeRawApplication(raw, { allowFilteredName: raw.source === 'manual' })
  if (!application || application.id !== raw.id) return null
  return {
    ...application,
    iconCachePath: cleanPath(raw.iconCachePath),
    addedAt: Number.isFinite(raw.addedAt) ? raw.addedAt : Date.now(),
  }
}

module.exports = {
  SCAN_LIMIT,
  applyUwpRegistrationStatus,
  applicationFromManualPath,
  parsePowerShellJson,
  readRegisteredUwpAumids,
  revalidateUwpApplications,
  scanWindowsApplications,
  statusFor,
  validateStoredApplication,
}
