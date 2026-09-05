const fs = require('fs')
const path = require('path')

const STORE_VERSION = 1

function readJson(filePath, fallback) {
  try {
    const raw = fs.readFileSync(filePath, 'utf8')
    return JSON.parse(raw)
  } catch {
    return fallback
  }
}

function writeJsonAtomic(filePath, value) {
  const directory = path.dirname(filePath)
  fs.mkdirSync(directory, { recursive: true })

  const temporaryPath = `${filePath}.${process.pid}.tmp`
  fs.writeFileSync(temporaryPath, `${JSON.stringify(value, null, 2)}\n`, {
    encoding: 'utf8',
    mode: 0o600,
  })
  fs.renameSync(temporaryPath, filePath)
}

class PersistentStore {
  constructor(userDataDirectory) {
    this.directory = path.join(userDataDirectory, 'orbit-data')
    this.settingsPath = path.join(this.directory, 'settings.json')
    this.libraryPath = path.join(this.directory, 'applications.json')
    this.iconDirectory = path.join(this.directory, 'icon-cache')
    fs.mkdirSync(this.iconDirectory, { recursive: true })
  }

  readSettings(defaults) {
    const stored = readJson(this.settingsPath, {})
    const value = stored && typeof stored === 'object' && stored.value && typeof stored.value === 'object'
      ? stored.value
      : stored
    return { ...defaults, ...value }
  }

  writeSettings(settings) {
    writeJsonAtomic(this.settingsPath, { version: STORE_VERSION, value: settings })
  }

  readLibrary() {
    const stored = readJson(this.libraryPath, { applications: [] })
    return Array.isArray(stored?.applications) ? stored.applications : []
  }

  writeLibrary(applications) {
    writeJsonAtomic(this.libraryPath, {
      version: STORE_VERSION,
      applications,
    })
  }
}

module.exports = {
  PersistentStore,
}
