import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react'
import { I18nContext } from './i18nContext'
import {
  getInitialLanguage,
  saveLanguage,
  translate,
  type LanguageCode,
  type TranslateFn,
} from './i18n'

export function I18nProvider({ children }: { children: ReactNode }) {
  const [language, setLanguageState] = useState<LanguageCode>(
    getInitialLanguage,
  )

  const setLanguage = useCallback((nextLanguage: LanguageCode) => {
    setLanguageState(nextLanguage)
  }, [])

  const t = useMemo<TranslateFn>(
    () => (key, values) => translate(language, key, values),
    [language],
  )

  const value = useMemo(
    () => ({ language, setLanguage, t }),
    [language, setLanguage, t],
  )

  useEffect(() => {
    saveLanguage(language)
    document.documentElement.lang = language
  }, [language])

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>
}
