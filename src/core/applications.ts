import type { OrbitApp, ScannedApplication } from '../types'

export const MAX_ORBIT_APPLICATIONS = 32

const accentPalette = ['#45b9ff', '#6f8fff', '#55d6b0', '#f5b95c', '#e77fc4', '#a38cff']

export function applicationAccent(name: string): string {
  let hash = 0
  for (const character of name) hash = ((hash << 5) - hash + character.charCodeAt(0)) | 0
  return accentPalette[Math.abs(hash) % accentPalette.length]
}

export function toOrbitApplication(application: ScannedApplication): OrbitApp {
  return {
    ...application,
    category: application.category || application.kind,
    color: applicationAccent(application.name),
    isSystemApp: true,
    launchId: application.id,
  }
}

export function deduplicateApplications<T extends { id: string; name: string }>(applications: T[]): T[] {
  const ids = new Set<string>()
  const names = new Set<string>()
  return applications.filter((application) => {
    const normalizedName = application.name.trim().toLocaleLowerCase()
    if (!application.id || !normalizedName || ids.has(application.id) || names.has(normalizedName)) return false
    ids.add(application.id)
    names.add(normalizedName)
    return true
  })
}

export function limitOrbitApplications(applications: ScannedApplication[]): ScannedApplication[] {
  return deduplicateApplications(applications).slice(0, MAX_ORBIT_APPLICATIONS)
}
