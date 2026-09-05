export {
  DEFAULT_FALLBACK_LANGUAGE,
  detectSystemLanguage,
  getSystemLanguages,
  isSupportedLanguage,
  resolveLanguage,
  SUPPORTED_LANGUAGES,
} from './language'
export { enUS } from './locales/en-US'
export type { EnglishTranslations, TranslationKey } from './locales/en-US'
export { zhCN } from './locales/zh-CN'
export {
  createTranslator,
  t,
  translations,
} from './translator'
export type {
  InterpolationValue,
  TranslationFunction,
  TranslationParams,
} from './translator'
export { useI18n } from './useI18n'
export type { UseI18nResult } from './useI18n'
export type { SupportedLanguage } from '../types/settings'
