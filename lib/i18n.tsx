'use client'
import { createContext, useContext, useEffect, useState, useCallback, useMemo } from 'react'
import { pt } from './locales/pt'
import { en } from './locales/en'

export type Locale = 'pt' | 'en'

const DICTS: Record<Locale, typeof pt> = { pt, en }
const STORAGE_KEY = 'pokeros_locale'

interface I18nContextValue {
  locale: Locale
  setLocale: (l: Locale) => void
  toggleLocale: () => void
  t: (path: string, vars?: Record<string, string | number>) => string
}

function getPath(obj: unknown, path: string): unknown {
  return path.split('.').reduce<unknown>((acc, key) => {
    if (acc && typeof acc === 'object' && key in acc) return (acc as Record<string, unknown>)[key]
    return undefined
  }, obj)
}

const I18nContext = createContext<I18nContextValue>({
  locale: 'pt',
  setLocale: () => {},
  toggleLocale: () => {},
  t: (path) => path,
})

export function I18nProvider({ children }: { children: React.ReactNode }) {
  const [locale, setLocaleState] = useState<Locale>('pt')

  useEffect(() => {
    const saved = localStorage.getItem(STORAGE_KEY)
    if (saved === 'pt' || saved === 'en') setLocaleState(saved)
  }, [])

  const setLocale = useCallback((l: Locale) => {
    setLocaleState(l)
    localStorage.setItem(STORAGE_KEY, l)
  }, [])

  const toggleLocale = useCallback(() => {
    setLocaleState((prev) => {
      const next = prev === 'pt' ? 'en' : 'pt'
      localStorage.setItem(STORAGE_KEY, next)
      return next
    })
  }, [])

  const t = useCallback((path: string, vars?: Record<string, string | number>) => {
    const value = getPath(DICTS[locale], path)
    let str = typeof value === 'string' ? value : path
    if (vars) for (const [k, v] of Object.entries(vars)) str = str.replace(`{${k}}`, String(v))
    return str
  }, [locale])

  const value = useMemo(() => ({ locale, setLocale, toggleLocale, t }), [locale, setLocale, toggleLocale, t])
  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>
}

export function useI18n() {
  return useContext(I18nContext)
}
