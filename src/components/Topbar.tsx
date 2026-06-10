import { useState, useEffect, useMemo, useRef, useCallback } from 'react'
import { Icon } from './Icon'
import { useI18n } from '../lib/useI18n'
import { fetchInventory } from '../lib/recipeApi'
import { fetchPreferences, defaultPreferences } from '../lib/preferencesApi'
import type { AppDestination, Ingredient, UserPreferences } from '../types/ui'

type TopbarProps = {
  onNavigate?: (page: AppDestination) => void
  onLogout?: () => void | Promise<void>
}

function getDaysRemaining(dateStr: string | null | undefined) {
  if (!dateStr) {
    return null
  }
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const dateVal = new Date(`${dateStr}T00:00:00`)
  if (Number.isNaN(dateVal.getTime())) {
    return null
  }
  const diffTime = dateVal.getTime() - today.getTime()
  return Math.ceil(diffTime / (1000 * 60 * 60 * 24))
}

function getExpiringInfo(ingredient: Ingredient, leadDays: number) {
  const expDays = getDaysRemaining(ingredient.expirationDate)
  const bbDays = getDaysRemaining(ingredient.bestBeforeDate)

  let days: number | null = null
  let type: 'expiration' | 'bestBefore' = 'expiration'

  if (expDays !== null && bbDays !== null) {
    if (expDays <= bbDays) {
      days = expDays
      type = 'expiration'
    } else {
      days = bbDays
      type = 'bestBefore'
    }
  } else if (expDays !== null) {
    days = expDays
    type = 'expiration'
  } else if (bbDays !== null) {
    days = bbDays
    type = 'bestBefore'
  }

  if (days === null) {
    return null
  }

  if (days <= leadDays) {
    return {
      days,
      type,
      date: type === 'expiration' ? ingredient.expirationDate : ingredient.bestBeforeDate,
    }
  }

  return null
}

export function Topbar({ onNavigate, onLogout }: TopbarProps) {
  const { language, t } = useI18n()
  const [isOpen, setIsOpen] = useState(false)
  const [ingredients, setIngredients] = useState<Ingredient[]>([])
  const [preferences, setPreferences] = useState<UserPreferences>(defaultPreferences)
  const notificationRef = useRef<HTMLDivElement | null>(null)

  const loadData = useCallback(() => {
    fetchInventory(language)
      .then((result) => {
        setIngredients(result.inventory)
      })
      .catch((err) => {
        console.warn('[Topbar] Failed to fetch inventory:', err)
      })

    fetchPreferences()
      .then((result) => {
        setPreferences(result.preferences)
      })
      .catch((err) => {
        console.warn('[Topbar] Failed to fetch preferences:', err)
      })
  }, [language])

  useEffect(() => {
    loadData()

    const handleInventoryUpdated = () => {
      loadData()
    }
    window.addEventListener('inventory-updated', handleInventoryUpdated)
    return () => {
      window.removeEventListener('inventory-updated', handleInventoryUpdated)
    }
  }, [loadData])

  useEffect(() => {
    if (!isOpen) {
      return
    }

    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target

      if (
        target instanceof Node &&
        notificationRef.current?.contains(target)
      ) {
        return
      }

      setIsOpen(false)
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setIsOpen(false)
      }
    }

    document.addEventListener('pointerdown', handlePointerDown, true)
    document.addEventListener('keydown', handleKeyDown)

    return () => {
      document.removeEventListener('pointerdown', handlePointerDown, true)
      document.removeEventListener('keydown', handleKeyDown)
    }
  }, [isOpen])

  const expiringIngredients = useMemo(() => {
    const leadDays = preferences.notifications.expiration
      ? preferences.notifications.expirationLeadDays
      : 3

    if (!preferences.notifications.expiration) {
      return []
    }

    return ingredients
      .map((item) => {
        const info = getExpiringInfo(item, leadDays)
        return info ? { item, ...info } : null
      })
      .filter((entry): entry is NonNullable<typeof entry> => entry !== null)
      .sort((a, b) => a.days - b.days)
  }, [ingredients, preferences])

  const nearExpirationCount = expiringIngredients.length

  const getDaysText = (days: number) => {
    if (days < 0) {
      return t('notification.yesterdayOrBefore')
    }
    if (days === 0) {
      return t('notification.today')
    }
    if (days === 1) {
      return t('notification.tomorrow')
    }
    return t('notification.daysRemaining', { days })
  }

  const getDaysClass = (days: number) => {
    if (days <= 0) {
      return 'urgent'
    }
    if (days === 1) {
      return 'warning'
    }
    return 'info'
  }

  return (
    <header className="topbar">
      <a
        className="brand"
        href="/"
        aria-label={t('app.name')}
        onClick={(event) => {
          event.preventDefault()
          onNavigate?.('home')
        }}
      >
        <span className="brand__mark">
          <img src="/app-icon.png" alt="" />
        </span>
        <span>
          <strong>{t('app.name')}</strong>
          <small>{t('app.tagline')}</small>
        </span>
      </a>

      <nav className="topbar__nav" aria-label={t('topbar.menuLabel')}>
        <a
          href="#ingredients"
          onClick={(event) => {
            event.preventDefault()
            onNavigate?.('fridge')
          }}
        >
          {t('topbar.ingredients')}
        </a>
        <a
          href="#recipes"
          onClick={(event) => {
            event.preventDefault()
            onNavigate?.('home')
            setTimeout(() => {
              document
                .getElementById('recipes')
                ?.scrollIntoView({ behavior: 'smooth' })
            }, 100)
          }}
        >
          {t('topbar.recipes')}
        </a>
        <a
          href="#receipt"
          onClick={(event) => {
            event.preventDefault()
            onNavigate?.('receipt')
          }}
        >
          {t('topbar.receipt')}
        </a>
        <a
          href="#history"
          onClick={(event) => {
            event.preventDefault()
            onNavigate?.('history')
          }}
        >
          {t('topbar.history')}
        </a>
      </nav>

      <div className="topbar__actions">
        <div
          ref={notificationRef}
          className="notification-trigger-container"
          style={{ position: 'relative' }}
        >
          <button
            type="button"
            className="icon-button"
            aria-label={t('topbar.notifications')}
            aria-expanded={isOpen}
            onClick={() => setIsOpen((current) => !current)}
          >
            <Icon name="bell" />
            {nearExpirationCount > 0 && (
              <span className="notification-badge">{nearExpirationCount}</span>
            )}
          </button>

          {isOpen && (
            <div className="notifications-dropdown">
              <div className="notifications-header">
                <h4>{t('notification.title')}</h4>
              </div>
              <div className="notifications-list">
                {expiringIngredients.length === 0 ? (
                  <div className="notifications-empty">
                    {t('notification.none')}
                  </div>
                ) : (
                  expiringIngredients.map(({ item, days, date }) => (
                    <button
                      key={item.inventoryId ?? item.name}
                      type="button"
                      className="notification-item"
                      onClick={() => {
                        onNavigate?.('fridge')
                        setIsOpen(false)
                      }}
                    >
                      <div className="notification-item__icon">
                        <Icon name="bell" />
                      </div>
                      <div className="notification-item__content">
                        <p className="notification-item__title">{item.name}</p>
                        <p className="notification-item__desc">
                          {t('notification.expiring', { name: item.name })}
                        </p>
                        <span className={`notification-item__days ${getDaysClass(days)}`}>
                          {getDaysText(days)} ({date})
                        </span>
                      </div>
                    </button>
                  ))
                )}
              </div>
            </div>
          )}
        </div>

        <button
          type="button"
          className="account-button"
          onClick={() => onNavigate?.('settings')}
        >
          <Icon name="settings" />
          <span>{t('topbar.settings')}</span>
        </button>
        {onLogout ? (
          <button
            type="button"
            className="account-button"
            onClick={() => void onLogout()}
          >
            <Icon name="user" />
            <span>{t('common.logout')}</span>
          </button>
        ) : null}
      </div>
    </header>
  )
}
