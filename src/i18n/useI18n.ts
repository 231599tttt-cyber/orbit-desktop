import { useCallback, useMemo } from 'react'
import { useSettings } from '../hooks/useSettings'
import type { SupportedLanguage } from '../types/settings'
import { createTranslator, type TranslationFunction } from './translator'

export interface UseI18nResult {
  language: SupportedLanguage
  setLanguage: (language: SupportedLanguage) => void
  t: TranslationFunction
}

export function useI18n(): UseI18nResult {
  const { settings, setSetting } = useSettings()
  const t = useMemo(() => createTranslator(settings.language), [settings.language])
  const setLanguage = useCallback((language: SupportedLanguage) => {
    setSetting('language', language)
  }, [setSetting])

  return { language: settings.language, setLanguage, t }
}
