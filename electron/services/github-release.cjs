function githubRepository(value) {
  if (typeof value !== 'string' || value.length > 300) return null
  try {
    const url = new URL(value)
    if (url.protocol !== 'https:' || url.hostname.toLowerCase() !== 'github.com') return null
    const parts = url.pathname.split('/').filter(Boolean)
    if (parts.length < 2 || !/^[a-zA-Z0-9_.-]+$/.test(parts[0]) || !/^[a-zA-Z0-9_.-]+$/.test(parts[1])) return null
    const repository = parts[1].replace(/\.git$/i, '')
    if (!repository) return null
    return { owner: parts[0], repository, url: `https://github.com/${parts[0]}/${repository}` }
  } catch {
    return null
  }
}

function versionParts(value) {
  const match = String(value || '').trim().match(/^v?(\d+)\.(\d+)\.(\d+)(?:[-+].*)?$/i)
  return match ? match.slice(1).map(Number) : null
}

function isNewerVersion(candidate, current) {
  const next = versionParts(candidate)
  const installed = versionParts(current)
  if (!next || !installed) return false
  for (let index = 0; index < 3; index += 1) {
    if (next[index] !== installed[index]) return next[index] > installed[index]
  }
  return false
}

async function checkGitHubRelease(repositoryUrl, currentVersion, fetchImplementation = globalThis.fetch) {
  const repository = githubRepository(repositoryUrl)
  if (!repository || !versionParts(currentVersion) || typeof fetchImplementation !== 'function') {
    return { ok: false, code: 'invalid-request' }
  }
  try {
    const response = await fetchImplementation(
      `https://api.github.com/repos/${repository.owner}/${repository.repository}/releases/latest`,
      {
        headers: { Accept: 'application/vnd.github+json', 'User-Agent': `Orbit-Desktop/${currentVersion}` },
        signal: AbortSignal.timeout(8_000),
      },
    )
    if (response.status === 404) return { ok: false, code: 'no-release' }
    if (!response.ok) return { ok: false, code: `github-${response.status}` }
    const release = await response.json()
    const version = typeof release?.tag_name === 'string' ? release.tag_name.replace(/^v/i, '') : ''
    const url = typeof release?.html_url === 'string' ? release.html_url : `${repository.url}/releases/latest`
    if (!versionParts(version)) return { ok: false, code: 'invalid-release-version' }
    return { ok: true, code: 'checked', updateAvailable: isNewerVersion(version, currentVersion), version, url }
  } catch {
    return { ok: false, code: 'network-error' }
  }
}

module.exports = { checkGitHubRelease, githubRepository, isNewerVersion }
