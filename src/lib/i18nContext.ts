import { createContext } from 'react'
import type { LanguageCode, TranslateFn } from './i18n'

export type I18nContextValue = {
  language: LanguageCode
  setLanguage: (language: LanguageCode) => void
  t: TranslateFn
}

export const I18nContext = createContext<I18nContextValue | null>(null)
