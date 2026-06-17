import { useEffect, useMemo, useRef, useState } from 'react'
import { Icon } from '../components/Icon'
import { supportedLanguages } from '../lib/i18n'
import { getCache, setCache } from '../lib/dataCache'
import { useI18n } from '../lib/useI18n'
import {
  defaultPreferences,
  dispatchPreferencesUpdated,
  fetchPreferences,
  savePreferences,
} from '../lib/preferencesApi'
import type { AuthUser } from '../lib/authApi'
import type { AppDestination, UserPreferences } from '../types/ui'

type PreferencesFeedbackArea = 'ai' | 'preferences' | 'account'

type SettingsPageProps = {
  user: AuthUser
  onNavigate?: (page: AppDestination) => void
}

export function SettingsPage({
  user,
  onNavigate,
}: SettingsPageProps) {
  const { language, setLanguage, t } = useI18n()
  const [preferences, setPreferences] =
    useState<UserPreferences>(defaultPreferences)
  const [isLoadingPreferences, setIsLoadingPreferences] = useState(true)
  const [preferencesError, setPreferencesError] = useState('')
  const [preferencesFeedbackArea, setPreferencesFeedbackArea] =
    useState<PreferencesFeedbackArea>('preferences')
  const [toastMessage, setToastMessage] = useState('')
  const preferencesRef = useRef<UserPreferences>(defaultPreferences)
  const saveTimerRef = useRef<number | null>(null)
  const toastTimerRef = useRef<number | null>(null)
  const currentLanguage = useMemo(
    () =>
      supportedLanguages.find((item) => item.code === language) ??
      supportedLanguages[0],
    [language],
  )

  useEffect(() => {
    let isMounted = true
    const cacheKey = `preferences:${user.id}`

    const cached = getCache<UserPreferences>(cacheKey)
    if (cached) {
      queueMicrotask(() => {
        if (isMounted) {
          preferencesRef.current = cached
          setPreferences(cached)
          setIsLoadingPreferences(false)
        }
      })
    }

    fetchPreferences()
      .then((result) => {
        if (isMounted) {
          setCache(cacheKey, result.preferences)
          preferencesRef.current = result.preferences
          setPreferences(result.preferences)
          setPreferencesError('')
          setIsLoadingPreferences(false)
        }
      })
      .catch((error) => {
        console.warn('[vite] Preferences fetch failed:', error)
        if (isMounted) {
          setPreferencesError(
            error instanceof Error
              ? error.message
              : 'settings.preferencesLoadFailed',
          )
          setIsLoadingPreferences(false)
        }
      })

    return () => {
      isMounted = false
    }
  }, [user.id])

  useEffect(() => {
    return () => {
      if (toastTimerRef.current !== null) {
        window.clearTimeout(toastTimerRef.current)
        toastTimerRef.current = null
      }
      if (saveTimerRef.current !== null) {
        window.clearTimeout(saveTimerRef.current)
        saveTimerRef.current = null
        void savePreferences(preferencesRef.current)
          .then((result) => {
            setCache(`preferences:${user.id}`, result.preferences)
          })
          .catch((error) => {
            console.warn('[vite] Pending preferences save failed:', error)
          })
      }
    }
  }, [user.id])

  function showToast(message: string) {
    if (toastTimerRef.current !== null) {
      window.clearTimeout(toastTimerRef.current)
    }

    setToastMessage(message)
    toastTimerRef.current = window.setTimeout(() => {
      setToastMessage('')
      toastTimerRef.current = null
    }, 2400)
  }

  function updatePreference<K extends keyof UserPreferences>(
    key: K,
    value: UserPreferences[K],
    feedbackArea: PreferencesFeedbackArea,
    delayMs = 0,
  ) {
    applyPreferences(
      {
        ...preferencesRef.current,
        [key]: value,
      },
      feedbackArea,
      delayMs,
    )
  }

  function updateNotificationPreference(
    key: keyof UserPreferences['notifications'],
    value: boolean | number,
    delayMs = 0,
  ) {
    applyPreferences(
      {
        ...preferencesRef.current,
        notifications: {
          ...preferencesRef.current.notifications,
          [key]: value,
        },
      },
      'account',
      delayMs,
    )
  }

  function updateVoicePreference(
    key: keyof UserPreferences['voice'],
    value: boolean,
    delayMs = 0,
  ) {
    applyPreferences(
      {
        ...preferencesRef.current,
        voice: {
          ...(preferencesRef.current.voice ?? defaultPreferences.voice),
          [key]: value,
        },
      },
      'preferences',
      delayMs,
    )
  }

  function updateDisplayLanguage(nextLanguage: UserPreferences['displayLanguage']) {
    setLanguage(nextLanguage)
    updatePreference('displayLanguage', nextLanguage, 'preferences')
  }

  function applyPreferences(
    nextPreferences: UserPreferences,
    feedbackArea: PreferencesFeedbackArea,
    delayMs = 0,
  ) {
    preferencesRef.current = nextPreferences
    setPreferences(nextPreferences)
    setCache(`preferences:${user.id}`, nextPreferences)
    dispatchPreferencesUpdated(nextPreferences)
    setPreferencesFeedbackArea(feedbackArea)
    setPreferencesError('')

    if (saveTimerRef.current !== null) {
      window.clearTimeout(saveTimerRef.current)
    }

    if (delayMs <= 0) {
      void persistPreferences(nextPreferences)
      return
    }

    saveTimerRef.current = window.setTimeout(() => {
      saveTimerRef.current = null
      void persistPreferences(nextPreferences)
    }, delayMs)
  }

  async function persistPreferences(nextPreferences: UserPreferences) {
    try {
      const result = await savePreferences(nextPreferences)

      setCache(`preferences:${user.id}`, result.preferences)
      preferencesRef.current = result.preferences
      setPreferences(result.preferences)
      showToast(t('settings.preferencesSaved'))
    } catch (error) {
      console.error('[vite] Preferences save failed:', error)
      setPreferencesError(
        error instanceof Error
          ? error.message
          : t('settings.preferencesSaveFailed'),
      )
    }
  }

  return (
    <>
      <main className="settings-page">
        <div className="fridge-header">
          <div>
            <p className="eyebrow">{t('settings.eyebrow')}</p>
            <h1>{t('settings.title')}</h1>
          </div>
          <button
            type="button"
            className="secondary-button back-home-button"
            onClick={() => onNavigate?.('home')}
          >
            <div style={{ transform: 'scaleX(-1)', display: 'inline-flex' }}>
              <Icon name="arrow" />
            </div>
            <span>{t('common.backHome')}</span>
          </button>
        </div>

        <section className="settings-grid" aria-label={t('settings.title')}>
          <article
            className="panel settings-section settings-preferences-form settings-ai-card"
          >
            <div className="section-heading">
              <div>
                <p className="eyebrow">AI</p>
                <h2>{t('settings.recipeModelTitle')}</h2>
              </div>
            </div>
            <p className="settings-section__description">
              {t('settings.recipeModelDescription')}
            </p>

            {preferencesError && preferencesFeedbackArea === 'ai' ? (
              <p className="status-message" role="alert">
                {preferencesError === 'settings.preferencesLoadFailed'
                  ? t('settings.preferencesLoadFailed')
                  : preferencesError}
              </p>
            ) : null}

            <fieldset className="settings-fieldset settings-fieldset--plain">
              <legend>{t('settings.recipeModelTitle')}</legend>
              <div className="language-options" role="radiogroup">
                {(['gemini', 'groq'] as const).map((modelOption) => (
                  <button
                    key={modelOption}
                    type="button"
                    className={`language-option ${
                      preferences.recipeModel === modelOption ? 'is-active' : ''
                    }`}
                    role="radio"
                    aria-checked={preferences.recipeModel === modelOption}
                    disabled={isLoadingPreferences}
                    onClick={() =>
                      updatePreference('recipeModel', modelOption, 'ai')
                    }
                  >
                    <strong>
                      {modelOption === 'gemini'
                        ? t('settings.recipeModelGemini')
                        : t('settings.recipeModelGpt')}
                    </strong>
                    <span>
                      {modelOption === 'gemini'
                        ? t('settings.recipeModelGeminiNote')
                        : t('settings.recipeModelGptNote')}
                    </span>
                  </button>
                ))}
              </div>
            </fieldset>
          </article>

          <article className="panel settings-section">
            <div className="section-heading">
              <div>
                <p className="eyebrow">{t('settings.currentLanguage')}</p>
                <h2>{t('settings.languageTitle')}</h2>
              </div>
            </div>
            <p className="settings-section__description">
              {t('settings.languageDescription')}
            </p>
            <div className="language-options" role="radiogroup">
              {supportedLanguages.map((item) => (
                <button
                  key={item.code}
                  type="button"
                  className={`language-option ${
                    language === item.code ? 'is-active' : ''
                  }`}
                  role="radio"
                  aria-checked={language === item.code}
                  disabled={isLoadingPreferences}
                  onClick={() => updateDisplayLanguage(item.code)}
                >
                  <strong>{item.label}</strong>
                  <span>{item.description}</span>
                </button>
              ))}
            </div>
            <p className="settings-note">
              {t('settings.currentLanguage')}: {currentLanguage.label}
            </p>
          </article>

          <article
            className="panel settings-section settings-preferences-form"
          >
            <div className="section-heading">
              <div>
                <p className="eyebrow">{t('settings.preferencesTitle')}</p>
                <h2>{t('settings.preferencesTitle')}</h2>
              </div>
            </div>
            <p className="settings-section__description">
              {t('settings.preferencesDescription')}
            </p>

            {preferencesError && preferencesFeedbackArea === 'preferences' ? (
              <p className="status-message" role="alert">
                {preferencesError === 'settings.preferencesLoadFailed'
                  ? t('settings.preferencesLoadFailed')
                  : preferencesError}
              </p>
            ) : null}

            <div className="settings-field">
              <label htmlFor="default-servings">
                <strong>{t('settings.defaultServings')}</strong>
                <span>{t('settings.defaultServingsDescription')}</span>
              </label>
              <input
                id="default-servings"
                type="number"
                min="1"
                max="20"
                value={preferences.defaultServings}
                disabled={isLoadingPreferences}
                onChange={(event) =>
                  updatePreference(
                    'defaultServings',
                    Math.max(1, Number(event.target.value) || 1),
                    'preferences',
                  )
                }
              />
            </div>

            <div className="settings-field settings-field--full">
              <label htmlFor="avoided-ingredients">
                <strong>{t('settings.dietary')}</strong>
                <span>{t('settings.dietaryDescription')}</span>
              </label>
              <textarea
                id="avoided-ingredients"
                rows={4}
                value={preferences.avoidedIngredients}
                placeholder={t('settings.avoidPlaceholder')}
                disabled={isLoadingPreferences}
                onChange={(event) =>
                  updatePreference(
                    'avoidedIngredients',
                    event.target.value,
                    'preferences',
                    400,
                  )
                }
              />
            </div>

            <fieldset className="settings-fieldset settings-fieldset--plain">
              <legend>{t('settings.seasoningMode')}</legend>
              <p className="settings-section__description">
                {t('settings.seasoningModeDescription')}
              </p>
              <div className="language-options" role="radiogroup">
                {([
                  ['unlimited', t('settings.seasoningUnlimited'), t('settings.seasoningUnlimitedNote')],
                  ['strict', t('settings.seasoningStrict'), t('settings.seasoningStrictNote')],
                ] as const).map(([value, label, note]) => (
                  <button
                    key={value}
                    type="button"
                    className={`language-option ${
                      preferences.seasoningMode === value ? 'is-active' : ''
                    }`}
                    role="radio"
                    aria-checked={preferences.seasoningMode === value}
                    disabled={isLoadingPreferences}
                    onClick={() =>
                      updatePreference('seasoningMode', value, 'preferences')
                    }
                  >
                    <strong>{label}</strong>
                    <span>{note}</span>
                  </button>
                ))}
              </div>
            </fieldset>

            <fieldset className="settings-fieldset">
              <legend>{t('settings.voiceTitle')}</legend>
              <p>{t('settings.voiceDescription')}</p>
              <label className="settings-toggle">
                <input
                  type="checkbox"
                  checked={Boolean(preferences.voice?.enabled)}
                  disabled={isLoadingPreferences}
                  onChange={(event) =>
                    updateVoicePreference('enabled', event.currentTarget.checked)
                  }
                />
                <span>{t('settings.voiceEnabled')}</span>
              </label>
              <p className="settings-note">{t('settings.voiceDefaultOff')}</p>
            </fieldset>

          </article>

          <article
            className="panel settings-section settings-account-card settings-preferences-form"
          >
            <div className="section-heading">
              <div>
                <p className="eyebrow">{t('settings.signedIn')}</p>
                <h2>{t('settings.accountTitle')}</h2>
              </div>
            </div>
            <dl className="settings-list">
              <div>
                <dt>{t('settings.email')}</dt>
                <dd>{user.email ?? '-'}</dd>
              </div>
              <div>
                <dt>{t('settings.userId')}</dt>
                <dd className="settings-mono">{user.id}</dd>
              </div>
              <div>
                <dt>{t('settings.authStatus')}</dt>
                <dd>
                  <span className="status-pill">{t('settings.signedIn')}</span>
                </dd>
              </div>
              {user.isAdmin ? (
                <div>
                  <dt>{t('settings.adminStatus')}</dt>
                  <dd>
                    <span className="status-pill">{t('settings.adminUser')}</span>
                  </dd>
                </div>
              ) : null}
            </dl>
            {user.isAdmin ? (
              <button
                type="button"
                className="secondary-button settings-admin-button"
                onClick={() => onNavigate?.('admin')}
              >
                <Icon name="message" />
                <span>{t('settings.openAdminConsole')}</span>
              </button>
            ) : null}
            <fieldset className="settings-fieldset">
              <legend>{t('settings.notifications')}</legend>

              <label className="settings-toggle">
                <input
                  type="checkbox"
                  checked={preferences.notifications.expiration}
                  disabled={isLoadingPreferences}
                  onChange={(event) =>
                    updateNotificationPreference(
                      'expiration',
                      event.currentTarget.checked,
                    )
                  }
                />
                <span>{t('settings.expirationNotification')}</span>
              </label>

              <label className="settings-field settings-field--inline">
                <span>{t('settings.expirationLeadDays')}</span>
                <input
                  type="number"
                  min="1"
                  max="30"
                  value={preferences.notifications.expirationLeadDays}
                  disabled={isLoadingPreferences}
                  onChange={(event) =>
                    updateNotificationPreference(
                      'expirationLeadDays',
                      Math.max(1, Number(event.target.value) || 1),
                    )
                  }
                />
              </label>
            </fieldset>

            {preferencesError && preferencesFeedbackArea === 'account' ? (
              <p className="status-message" role="alert">
                {preferencesError === 'settings.preferencesLoadFailed'
                  ? t('settings.preferencesLoadFailed')
                  : preferencesError}
              </p>
            ) : null}

          </article>
        </section>
      </main>

      {toastMessage ? (
        <div className="toast-message" role="status">
          {toastMessage}
        </div>
      ) : null}
    </>
  )
}
