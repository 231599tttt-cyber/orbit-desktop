import { getSettings } from '../settings/store'
import type { SupportedLanguage } from '../types/settings'
import { enUS, type EnglishTranslations, type TranslationKey } from './locales/en-US'
import { zhCN } from './locales/zh-CN'

export const translations = {
  'en-US': enUS,
  'zh-CN': zhCN,
} as const satisfies Record<SupportedLanguage, Record<TranslationKey, string>>

export type InterpolationValue = string | number

type ExtractInterpolationKeys<Value extends string> =
  Value extends `${string}{{${infer Parameter}}}${infer Rest}`
    ? Parameter | ExtractInterpolationKeys<Rest>
    : never

export type TranslationParams<Key extends TranslationKey> = Record<
  ExtractInterpolationKeys<EnglishTranslations[Key]>,
  InterpolationValue
>

type TranslationArguments<Key extends TranslationKey> =
  [ExtractInterpolationKeys<EnglishTranslations[Key]>] extends [never]
    ? [params?: undefined]
    : [params: TranslationParams<Key>]

export type TranslationFunction = <Key extends TranslationKey>(
  key: Key,
  ...args: TranslationArguments<Key>
) => string

function interpolate(
  template: string,
  params?: Readonly<Record<string, InterpolationValue>>,
): string {
  if (!params) return template
  return template.replace(/{{\s*([^{}\s]+)\s*}}/g, (placeholder, key: string) => (
    Object.prototype.hasOwnProperty.call(params, key) ? String(params[key]) : placeholder
  ))
}

export function createTranslator(language: SupportedLanguage): TranslationFunction {
  return ((key: TranslationKey, params?: Record<string, InterpolationValue>) => {
    const template = translations[language][key] ?? enUS[key]
    return interpolate(template, params)
  }) as TranslationFunction
}

/** Non-React convenience translator using the current settings snapshot. */
export const t: TranslationFunction = ((
  key: TranslationKey,
  params?: Record<string, InterpolationValue>,
) => createTranslator(getSettings().language)(key as never, params as never)) as TranslationFunction
