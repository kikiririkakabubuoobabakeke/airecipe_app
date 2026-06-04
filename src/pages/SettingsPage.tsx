import { useEffect, useMemo, useState, type FormEvent } from 'react'
import { Icon } from '../components/Icon'
import { Topbar } from '../components/Topbar'
import { supportedLanguages } from '../lib/i18n'
import { useI18n } from '../lib/useI18n'
import {
  defaultPreferences,
  fetchPreferences,
  savePreferences,
} from '../lib/preferencesApi'
import type { AuthUser } from '../lib/authApi'
import type { AppDestination, UserPreferences } from '../types/ui'

type SettingsPageProps = {
  user: AuthUser
  onNavigate?: (page: AppDestination) => void
  onLogout?: () => void | Promise<void>
}

export function SettingsPage({
  user,
  onNavigate,
  onLogout,
}: SettingsPageProps) {
  const { language, setLanguage, t } = useI18n()
  const [isLoggingOut, setIsLoggingOut] = useState(false)
  const [preferences, setPreferences] =
    useState<UserPreferences>(defaultPreferences)
  const [isLoadingPreferences, setIsLoadingPreferences] = useState(true)
  const [isSavingPreferences, setIsSavingPreferences] = useState(false)
  const [preferencesMessage, setPreferencesMessage] = useState('')
  const [preferencesError, setPreferencesError] = useState('')
  const currentLanguage = useMemo(
    () =>
      supportedLanguages.find((item) => item.code === language) ??
      supportedLanguages[0],
    [language],
  )

  useEffect(() => {
    let isMounted = true

    fetchPreferences()
      .then((result) => {
        if (isMounted) {
          setPreferences(result.preferences)
          setPreferencesError('')
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
        }
      })
      .finally(() => {
        if (isMounted) {
          setIsLoadingPreferences(false)
        }
      })

    return () => {
      isMounted = false
    }
  }, [user.id])

  function updatePreference<K extends keyof UserPreferences>(
    key: K,
    value: UserPreferences[K],
  ) {
    setPreferences((current) => ({ ...current, [key]: value }))
    setPreferencesMessage('')
    setPreferencesError('')
  }

  function updateNotificationPreference(
    key: keyof UserPreferences['notifications'],
    value: boolean | number,
  ) {
    setPreferences((current) => ({
      ...current,
      notifications: {
        ...current.notifications,
        [key]: value,
      },
    }))
    setPreferencesMessage('')
    setPreferencesError('')
  }

  async function handlePreferencesSubmit(event: FormEvent) {
    event.preventDefault()
    setIsSavingPreferences(true)
    setPreferencesMessage('')
    setPreferencesError('')

    try {
      const result = await savePreferences(preferences)
      setPreferences(result.preferences)
      setPreferencesMessage(t('settings.preferencesSaved'))
    } catch (error) {
      console.error('[vite] Preferences save failed:', error)
      setPreferencesError(
        error instanceof Error
          ? error.message
          : t('settings.preferencesSaveFailed'),
      )
    } finally {
      setIsSavingPreferences(false)
    }
  }

  async function handleLogout() {
    if (!onLogout) {
      return
    }

    setIsLoggingOut(true)
    await onLogout()
  }

  return (
    <div className="app-shell">
      <Topbar onNavigate={onNavigate} onLogout={onLogout} />

      <main className="settings-page">
        <div className="fridge-header">
          <div>
            <p className="eyebrow">{t('settings.eyebrow')}</p>
            <h1>{t('settings.title')}</h1>
            <p className="settings-lead">{t('settings.subtitle')}</p>
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
          <article className="panel settings-section">
            <div className="section-heading">
              <div>
                <p className="eyebrow">{t('settings.signedIn')}</p>
                <h2>{t('settings.accountTitle')}</h2>
              </div>
            </div>
            <p className="settings-section__description">
              {t('settings.accountDescription')}
            </p>
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
            </dl>
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
                  onClick={() => setLanguage(item.code)}
                >
                  <strong>{item.label}</strong>
                  <span>{item.nativeName}</span>
                </button>
              ))}
            </div>
            <p className="settings-note">
              {t('settings.currentLanguage')}: {currentLanguage.label}
            </p>
          </article>

          <form
            className="panel settings-section settings-preferences-form"
            onSubmit={handlePreferencesSubmit}
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

            {preferencesError ? (
              <p className="status-message" role="alert">
                {preferencesError === 'settings.preferencesLoadFailed'
                  ? t('settings.preferencesLoadFailed')
                  : preferencesError}
              </p>
            ) : null}

            {preferencesMessage ? (
              <p className="status-message" role="status">
                {preferencesMessage}
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
                disabled={isLoadingPreferences || isSavingPreferences}
                onChange={(event) =>
                  updatePreference(
                    'defaultServings',
                    Math.max(1, Number(event.target.value) || 1),
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
                disabled={isLoadingPreferences || isSavingPreferences}
                onChange={(event) =>
                  updatePreference('avoidedIngredients', event.target.value)
                }
              />
            </div>

            <fieldset className="settings-fieldset">
              <legend>{t('settings.notifications')}</legend>
              <p>{t('settings.notificationsDescription')}</p>

              <label className="settings-toggle">
                <input
                  type="checkbox"
                  checked={preferences.notifications.expiration}
                  disabled={isLoadingPreferences || isSavingPreferences}
                  onChange={(event) =>
                    updateNotificationPreference(
                      'expiration',
                      event.currentTarget.checked,
                    )
                  }
                />
                <span>{t('settings.expirationNotification')}</span>
              </label>

              <label className="settings-toggle">
                <input
                  type="checkbox"
                  checked={preferences.notifications.lowStock}
                  disabled={isLoadingPreferences || isSavingPreferences}
                  onChange={(event) =>
                    updateNotificationPreference(
                      'lowStock',
                      event.currentTarget.checked,
                    )
                  }
                />
                <span>{t('settings.lowStockNotification')}</span>
              </label>

              <label className="settings-field settings-field--inline">
                <span>{t('settings.expirationLeadDays')}</span>
                <input
                  type="number"
                  min="1"
                  max="30"
                  value={preferences.notifications.expirationLeadDays}
                  disabled={isLoadingPreferences || isSavingPreferences}
                  onChange={(event) =>
                    updateNotificationPreference(
                      'expirationLeadDays',
                      Math.max(1, Number(event.target.value) || 1),
                    )
                  }
                />
              </label>
            </fieldset>

            <button
              type="submit"
              className="primary-button settings-save-button"
              disabled={isLoadingPreferences || isSavingPreferences}
            >
              {isSavingPreferences
                ? t('settings.savingPreferences')
                : t('settings.savePreferences')}
            </button>
          </form>

          <article className="panel settings-section">
            <div className="section-heading">
              <div>
                <p className="eyebrow">{t('common.logout')}</p>
                <h2>{t('settings.dataSecurityTitle')}</h2>
              </div>
            </div>
            <p className="settings-section__description">
              {t('settings.dataSecurityDescription')}
            </p>
            <div className="settings-session-row">
              <div>
                <strong>{t('settings.logoutTitle')}</strong>
                <span>{t('settings.logoutDescription')}</span>
              </div>
              <button
                type="button"
                className="secondary-button danger-button"
                onClick={handleLogout}
                disabled={isLoggingOut}
              >
                {isLoggingOut
                  ? t('settings.loggingOut')
                  : t('settings.logoutButton')}
              </button>
            </div>
          </article>
        </section>
      </main>
    </div>
  )
}
