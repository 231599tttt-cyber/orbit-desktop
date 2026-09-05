const fs = require('fs')
const path = require('path')
const { app, nativeImage } = require('electron')

const UNKNOWN_ICON_SVG = `
<svg xmlns="http://www.w3.org/2000/svg" width="128" height="128" viewBox="0 0 128 128">
  <defs>
    <linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
      <stop stop-color="#17233d"/><stop offset="1" stop-color="#0a1020"/>
    </linearGradient>
  </defs>
  <rect x="8" y="8" width="112" height="112" rx="28" fill="url(#g)" stroke="#617399" stroke-width="4"/>
  <path d="M46 48c2-13 12-20 26-20 16 0 27 9 27 23 0 12-7 18-17 24-7 4-10 8-10 17H55c0-16 5-23 16-30 7-4 10-7 10-12 0-5-4-9-11-9-7 0-11 4-12 11L46 48Z" fill="#b7c6e5"/>
  <circle cx="63.5" cy="102" r="8" fill="#5fb6ff"/>
</svg>`

const UNKNOWN_ICON_DATA_URL = `data:image/svg+xml;base64,${Buffer.from(UNKNOWN_ICON_SVG).toString('base64')}`

function readCachedIcon(filePath) {
  try {
    const buffer = fs.readFileSync(filePath)
    if (!buffer.length || buffer.length > 4 * 1024 * 1024) return null
    return `data:image/png;base64,${buffer.toString('base64')}`
  } catch {
    return null
  }
}

function usableFile(filePath) {
  if (typeof filePath !== 'string' || !filePath || !path.isAbsolute(filePath)) return null
  try {
    return fs.statSync(filePath).isFile() ? filePath : null
  } catch {
    return null
  }
}

function iconLocationPath(value) {
  if (typeof value !== 'string') return null
  const expanded = value.replace(/%([^%]+)%/g, (match, name) => process.env[name] || process.env[name.toUpperCase()] || match)
  const trimmed = expanded.trim().replace(/^"|"$/g, '')
  const withoutIndex = trimmed.replace(/,\s*-?\d+\s*$/, '').replace(/^"|"$/g, '')
  return usableFile(withoutIndex)
}

class IconCache {
  constructor(directory) {
    this.directory = directory
    fs.mkdirSync(directory, { recursive: true })
  }

  cachePathFor(id) {
    const safeId = String(id).replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 80)
    return path.join(this.directory, `${safeId || 'unknown'}.png`)
  }

  async resolve(application) {
    const cachePath = this.cachePathFor(application.id)
    const cached = readCachedIcon(cachePath)
    if (cached) {
      return { iconDataUrl: cached, iconStatus: 'cached', iconCachePath: cachePath }
    }

    const logoPath = usableFile(application.logoPath)
    if (logoPath) {
      try {
        const image = nativeImage.createFromPath(logoPath)
        if (!image.isEmpty()) return this.persist(image, cachePath)
      } catch {}
    }

    const candidates = [
      iconLocationPath(application.iconLocation),
      usableFile(application.targetPath),
      usableFile(application.shortcutPath),
    ].filter(Boolean)

    for (const candidate of [...new Set(candidates)]) {
      try {
        const image = await app.getFileIcon(candidate, { size: 'large' })
        if (!image.isEmpty()) return this.persist(image, cachePath)
      } catch {}
    }

    return {
      iconDataUrl: UNKNOWN_ICON_DATA_URL,
      iconStatus: 'missing',
      iconCachePath: null,
    }
  }

  persist(image, cachePath) {
    try {
      const png = image.toPNG()
      if (!png.length) throw new Error('empty icon')
      fs.writeFileSync(cachePath, png, { mode: 0o600 })
      return {
        iconDataUrl: `data:image/png;base64,${png.toString('base64')}`,
        iconStatus: 'extracted',
        iconCachePath: cachePath,
      }
    } catch {
      return {
        iconDataUrl: UNKNOWN_ICON_DATA_URL,
        iconStatus: 'missing',
        iconCachePath: null,
      }
    }
  }
}

module.exports = {
  IconCache,
  UNKNOWN_ICON_DATA_URL,
}
