import { readdir, readFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { expect, test } from '@playwright/test'
import {
  deduplicateApplications,
  limitOrbitApplications,
  MAX_ORBIT_APPLICATIONS,
} from '../../src/core/applications'
import type { ScannedApplication } from '../../src/types'

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')

async function findSourceFiles(directory: string): Promise<string[]> {
  const entries = await readdir(directory, { withFileTypes: true })
  const nested = await Promise.all(entries.map(async (entry) => {
    const absolutePath = path.join(directory, entry.name)
    if (entry.isDirectory()) return findSourceFiles(absolutePath)
    return /\.tsx?$/.test(entry.name) ? [absolutePath] : []
  }))
  return nested.flat()
}

function scannedApplication(id: string, name = id): ScannedApplication {
  return {
    id,
    name,
    kind: 'shortcut',
    source: 'start-menu-user',
    launchable: true,
    validation: 'verified',
    launchStatus: 'valid',
    alreadyAdded: false,
    isAdded: false,
  }
}

test('production entry points never import developer demo applications', async () => {
  const entryPoints = ['src/main.tsx', 'src/App.tsx']
  const sources = await Promise.all(
    entryPoints.map((entry) => readFile(path.join(projectRoot, entry), 'utf8')),
  )

  for (const [index, source] of sources.entries()) {
    expect(source, `${entryPoints[index]} must not bundle opt-in demo data`).not.toMatch(
      /\b(?:developerDemoApplications|demoApplications)\b/,
    )
  }
})

test('developer fixtures stay behind an explicit development-only opt-in boundary', async () => {
  const demoModule = await readFile(
    path.join(projectRoot, 'src/data/applications.ts'),
    'utf8',
  )

  expect(demoModule).not.toMatch(/export\s+(?:const|let|var)\s+developerDemoApplications\b/)
  expect(demoModule).not.toMatch(/\bcreateSystemApps\b|Math\.random\s*\(|placeholder/i)
  expect(demoModule).toContain('import.meta.env.DEV')
  expect(demoModule).toContain("localStorage.getItem(DEVELOPER_DEMO_MODE_KEY) === 'true'")
  expect(demoModule).toMatch(/if\s*\(!isDeveloperDemoModeEnabled\(\)\)\s*return\s*\[\]/)
})

test('production source does not import the isolated developer fixture module', async () => {
  const fixturePath = path.join(projectRoot, 'src/data/applications.ts')
  const sourceFiles = (await findSourceFiles(path.join(projectRoot, 'src')))
    .filter((filePath) => filePath !== fixturePath)
  const sources = await Promise.all(
    sourceFiles.map((entry) => readFile(entry, 'utf8')),
  )

  for (const [index, source] of sources.entries()) {
    expect(source, `${path.relative(projectRoot, sourceFiles[index])} must not reach developer fixtures`).not.toMatch(
      /(?:from\s*|import\s*\()['"](?:\.\.?\/)+data\/applications(?:\.ts)?['"]/,
    )
  }
})

test('deduplicates by stable id and normalized display name while preserving priority order', () => {
  const unique = scannedApplication('app-alpha', 'Alpha')
  const duplicateId = scannedApplication('app-alpha', 'Different name')
  const duplicateName = scannedApplication('app-beta', '  ALPHA  ')
  const second = scannedApplication('app-gamma', 'Gamma')

  expect(deduplicateApplications([unique, duplicateId, duplicateName, second])).toEqual([
    unique,
    second,
  ])
})

test('enforces the 32-application rendering/library boundary after deduplication', () => {
  const candidates = Array.from({ length: MAX_ORBIT_APPLICATIONS + 12 }, (_, index) => (
    scannedApplication(`app-${index}`, `Application ${index}`)
  ))
  candidates.splice(4, 0, scannedApplication('app-0', 'Duplicate id'))
  candidates.splice(9, 0, scannedApplication('app-copy', 'APPLICATION 1'))

  const limited = limitOrbitApplications(candidates)

  expect(limited).toHaveLength(32)
  expect(new Set(limited.map(({ id }) => id)).size).toBe(limited.length)
  expect(new Set(limited.map(({ name }) => name.trim().toLocaleLowerCase())).size).toBe(limited.length)
})
