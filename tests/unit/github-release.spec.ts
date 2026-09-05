import { createRequire } from 'node:module'
import { expect, test } from '@playwright/test'

const require = createRequire(import.meta.url)
const { githubRepository, isNewerVersion, checkGitHubRelease } = require('../../electron/services/github-release.cjs') as {
  githubRepository: (value: string) => { owner: string; repository: string; url: string } | null
  isNewerVersion: (candidate: string, current: string) => boolean
  checkGitHubRelease: (
    repositoryUrl: string,
    currentVersion: string,
    fetchImplementation: (url: string) => Promise<unknown>,
  ) => Promise<{ ok: boolean; updateAvailable?: boolean; version?: string; code?: string }>
}

test('GitHub release integration rejects non-GitHub and malformed repository URLs', () => {
  expect(githubRepository('https://github.com/example/orbit-desktop')).toEqual({
    owner: 'example',
    repository: 'orbit-desktop',
    url: 'https://github.com/example/orbit-desktop',
  })
  expect(githubRepository('https://example.com/example/orbit-desktop')).toBeNull()
  expect(githubRepository('file:///C:/secrets')).toBeNull()
})

test('release comparison and check report only a newer semantic version', async () => {
  expect(isNewerVersion('v0.2.0', '0.1.0')).toBe(true)
  expect(isNewerVersion('0.1.0', '0.1.0')).toBe(false)

  const result = await checkGitHubRelease(
    'https://github.com/example/orbit-desktop',
    '0.1.0',
    async () => ({
      ok: true,
      status: 200,
      json: async () => ({ tag_name: 'v0.2.0', html_url: 'https://github.com/example/orbit-desktop/releases/tag/v0.2.0' }),
    }),
  )
  expect(result).toMatchObject({ ok: true, updateAvailable: true, version: '0.2.0' })
})
