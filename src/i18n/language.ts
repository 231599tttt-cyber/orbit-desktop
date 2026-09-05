import {
  SUPPORTED_LANGUAGES,
  type SupportedLanguage,
} from '../types/settings'

export { SUPPORTED_LANGUAGES }
export type { SupportedLanguage }

export const DEFAULT_FALLBACK_LANGUAGE: SupportedLanguage = 'en-US'

export function isSupportedLanguage(value: unknown): value is SupportedLanguage {
  return typeof value === 'string'
    && (SUPPORTED_LANGUAGES as readonly string[]).includes(value)
}

/**
 * Product rule: every Chinese OS locale currently uses Simplified Chinese.
 * Once zh-TW is shipped, this is the single place where locale negotiation changes.
 */
export function resolveLanguage(language: unknown): SupportedLanguage {
  if (typeof language !== 'string') return DEFAULT_FALLBACK_LANGUAGE

  const normalized = language.trim().toLowerCase()
  if (normalized.startsWith('zh')) return 'zh-CN'
  if (normalized === 'en-us' || normalized.startsWith('en')) return 'en-US'
  return DEFAULT_FALLBACK_LANGUAGE
}

export function getSystemLanguages(): readonly string[] {
  if (typeof navigator === 'undefined') return []

  const candidates = navigator.languages?.length
    ? navigator.languages
    : navigator.language
      ? [navigator.language]
      : []

  return candidates.filter((language): language is string => typeof language === 'string')
}

export function detectSystemLanguage(
  preferredLanguages: readonly string[] = getSystemLanguages(),
): SupportedLanguage {
  for (const language of preferredLanguages) {
    if (language.trim()) return resolveLanguage(language)
  }
  return DEFAULT_FALLBACK_LANGUAGE
}
