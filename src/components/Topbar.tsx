import { useState, useEffect, useMemo, useRef, useCallback } from 'react'
import { Icon } from './Icon'
import { useI18n } from '../lib/useI18n'
import {
  fetchUserMessages,
  markUserMessagesRead,
  type UserMessage,
} from '../lib/contactApi'
import { fetchInventory } from '../lib/recipeApi'
import { fetchPreferences, defaultPreferences } from '../lib/preferencesApi'
import type { AppDestination, Ingredient, UserPreferences } from '../types/ui'

type TopbarProps = {
  currentPage?: string
  onNavigate?: (page: AppDestination) => void
  onLogout?: () => void | Promise<void>
}

const viewedNotificationsStorageKey = 'ai-recipe-viewed-notifications'

type ExpiringIngredientEntry = {
  item: Ingredient
  days: number
  type: 'expiration' | 'bestBefore'
  date: string | null | undefined
}

function getNotificationKey({ item, type, date }: ExpiringIngredientEntry) {
  return `${item.inventoryId ?? item.ingredientId ?? item.name}:${type}:${date ?? ''}`
}

function readViewedNotifications() {
  if (typeof window === 'undefined') {
    return new Set<string>()
  }

  try {
    const value = window.localStorage.getItem(viewedNotificationsStorageKey)
    const parsed = value ? JSON.parse(value) : []

    return new Set(Array.isArray(parsed) ? parsed.filter(Boolean) : [])
  } catch {
    return new Set<string>()
  }
}

function saveViewedNotifications(keys: Set<string>) {
  if (typeof window === 'undefined') {
    return
  }

  window.localStorage.setItem(
    viewedNotificationsStorageKey,
    JSON.stringify(Array.from(keys)),
  )
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

function getDaysText(days: number, t: ReturnType<typeof useI18n>['t']) {
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

function getDaysClass(days: number) {
  if (days <= 0) {
    return 'urgent'
  }
  if (days === 1) {
    return 'warning'
  }
  return 'info'
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

  if (days === null || days < 0) {
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

export function Topbar({ currentPage, onNavigate, onLogout }: TopbarProps) {
  const { language, t } = useI18n()
  const [isOpen, setIsOpen] = useState(false)
  const [isMenuOpen, setIsMenuOpen] = useState(false)
  const [ingredients, setIngredients] = useState<Ingredient[]>([])
  const [userMessages, setUserMessages] = useState<UserMessage[]>([])
  const [preferences, setPreferences] = useState<UserPreferences>(defaultPreferences)
  const [viewedNotificationKeys, setViewedNotificationKeys] = useState(
    readViewedNotifications,
  )
  const notificationRef = useRef<HTMLDivElement | null>(null)
  const menuRef = useRef<HTMLDivElement | null>(null)

  const loadInventoryAndPreferences = useCallback(() => {
    void Promise.all([
      fetchInventory(language)
        .then((result) => {
          setIngredients(result.inventory)
        })
        .catch((err) => {
          console.warn('[Topbar] Failed to fetch inventory:', err)
        }),
      fetchPreferences()
        .then((result) => {
          setPreferences(result.preferences)
        })
        .catch((err) => {
          console.warn('[Topbar] Failed to fetch preferences:', err)
        }),
    ])
  }, [language])

  const loadMessages = useCallback(() => {
    fetchUserMessages()
      .then((result) => {
        setUserMessages(result.messages)
      })
      .catch((err) => {
        console.warn('[Topbar] Failed to fetch messages:', err)
      })
  }, [])

  const loadAll = useCallback(() => {
    loadInventoryAndPreferences()
    loadMessages()
  }, [loadInventoryAndPreferences, loadMessages])

  useEffect(() => {
    loadAll()

    const handleInventoryUpdated = (event: Event) => {
      const nextInventory = (event as CustomEvent<{ inventory?: Ingredient[] }>)
        .detail?.inventory

      if (nextInventory) {
        setIngredients(nextInventory)
        return
      }

      loadInventoryAndPreferences()
    }
    const handleMessagesUpdated = () => {
      loadMessages()
    }
    const handlePreferencesUpdated = (event: Event) => {
      const nextPreferences = (
        event as CustomEvent<{ preferences?: UserPreferences }>
      ).detail?.preferences

      if (nextPreferences) {
        setPreferences(nextPreferences)
      } else {
        loadInventoryAndPreferences()
      }
    }
    window.addEventListener('inventory-updated', handleInventoryUpdated)
    window.addEventListener('messages-updated', handleMessagesUpdated)
    window.addEventListener('preferences-updated', handlePreferencesUpdated)
    return () => {
      window.removeEventListener('inventory-updated', handleInventoryUpdated)
      window.removeEventListener('messages-updated', handleMessagesUpdated)
      window.removeEventListener('preferences-updated', handlePreferencesUpdated)
    }
  }, [loadAll, loadInventoryAndPreferences, loadMessages])

  useEffect(() => {
    if (!isOpen && !isMenuOpen) {
      return
    }

    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target
      if (!(target instanceof Node)) {
        return
      }

      if (isOpen && !notificationRef.current?.contains(target)) {
        setIsOpen(false)
      }

      if (isMenuOpen && !menuRef.current?.contains(target)) {
        setIsMenuOpen(false)
      }
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setIsOpen(false)
        setIsMenuOpen(false)
      }
    }

    document.addEventListener('pointerdown', handlePointerDown, true)
    document.addEventListener('keydown', handleKeyDown)

    return () => {
      document.removeEventListener('pointerdown', handlePointerDown, true)
      document.removeEventListener('keydown', handleKeyDown)
    }
  }, [isOpen, isMenuOpen])

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

  const unreadExpirationCount = expiringIngredients.filter(
    (entry) => !viewedNotificationKeys.has(getNotificationKey(entry)),
  ).length
  const unreadMessages = userMessages.filter((message) => !message.readAt)
  const unreadNotificationCount =
    unreadExpirationCount + unreadMessages.length

  const navigationItems: Array<{
    page: AppDestination
    href: string
    label: string
  }> = [
    { page: 'fridge', href: '#ingredients', label: t('topbar.ingredients') },
    { page: 'recipe-generate', href: '#recipes', label: t('topbar.recipes') },
    { page: 'ingredient-register', href: '#receipt', label: t('topbar.receipt') },
    { page: 'history', href: '#history', label: t('topbar.history') },
  ]

  function navigateTo(page: AppDestination) {
    setIsMenuOpen(false)
    setIsOpen(false)
    onNavigate?.(page)
  }

  function markNotificationsViewed(entries: ExpiringIngredientEntry[]) {
    if (entries.length === 0) {
      return
    }

    setViewedNotificationKeys((current) => {
      const next = new Set(current)
      entries.forEach((entry) => next.add(getNotificationKey(entry)))
      saveViewedNotifications(next)
      return next
    })
  }

  function toggleNotifications() {
    setIsMenuOpen(false)
    setIsOpen((current) => {
      const nextIsOpen = !current

      if (nextIsOpen) {
        markNotificationsViewed(expiringIngredients)
        if (unreadMessages.length > 0) {
          void markUserMessagesRead(
            unreadMessages.map((message) => message.messageId),
          )
            .then((result) => {
              setUserMessages(result.messages)
              window.dispatchEvent(new Event('messages-updated'))
            })
            .catch((error) => {
              console.warn('[Topbar] Failed to mark messages read:', error)
            })
        }
      }

      return nextIsOpen
    })
  }

  return (
    <header className="topbar">
      <a
        className="brand"
        href="/"
        aria-label={t('app.name')}
        onClick={(event) => {
          event.preventDefault()
          navigateTo('home')
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
        {navigationItems.map((item) => (
          <a
            key={item.page}
            className={currentPage === item.page ? 'active' : ''}
            href={item.href}
            onClick={(event) => {
              event.preventDefault()
              navigateTo(item.page)
            }}
          >
            {item.label}
          </a>
        ))}
      </nav>

      <div className="topbar__actions">
        <div className="mobile-menu" ref={menuRef}>
          <button
            type="button"
            className={`hamburger-button ${isMenuOpen ? 'is-active' : ''}`}
            aria-label={t('topbar.menuLabel')}
            aria-controls="mobile-navigation-menu"
            aria-expanded={isMenuOpen}
            onClick={() => {
              setIsOpen(false)
              setIsMenuOpen((current) => !current)
            }}
          >
            <span aria-hidden="true" />
            <span aria-hidden="true" />
            <span aria-hidden="true" />
          </button>

          {isMenuOpen ? (
            <div
              id="mobile-navigation-menu"
              className="mobile-menu__panel"
              role="menu"
              aria-label={t('topbar.menuLabel')}
            >
              {navigationItems.map((item) => (
                <a
                  key={item.page}
                  className={`mobile-menu__item ${
                    currentPage === item.page ? 'is-active' : ''
                  }`}
                  href={item.href}
                  role="menuitem"
                  onClick={(event) => {
                    event.preventDefault()
                    navigateTo(item.page)
                  }}
                >
                  <span>{item.label}</span>
                </a>
              ))}

              <div className="mobile-menu__separator" role="presentation" />

              <button
                type="button"
                className={`mobile-menu__item ${
                  currentPage === 'settings' ? 'is-active' : ''
                }`}
                role="menuitem"
                onClick={() => navigateTo('settings')}
              >
                <Icon name="settings" />
                <span>{t('topbar.settings')}</span>
              </button>
              {onLogout ? (
                <button
                  type="button"
                  className="mobile-menu__item mobile-menu__item--danger"
                  role="menuitem"
                  onClick={() => {
                    setIsMenuOpen(false)
                    setIsOpen(false)
                    void onLogout()
                  }}
                >
                  <Icon name="user" />
                  <span>{t('common.logout')}</span>
                </button>
              ) : null}
            </div>
          ) : null}
        </div>

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
            onClick={toggleNotifications}
          >
            <Icon name="bell" />
            {unreadNotificationCount > 0 && (
              <span className="notification-badge">{unreadNotificationCount}</span>
            )}
          </button>

          {isOpen && (
            <div className="notifications-dropdown">
              <div className="notifications-header">
                <h4>{t('notification.title')}</h4>
              </div>
              <div className="notifications-list">
                {expiringIngredients.length === 0 && userMessages.length === 0 ? (
                  <div className="notifications-empty">
                    {t('notification.none')}
                  </div>
                ) : (
                  <>
                    {userMessages.map((message) => (
                      <button
                        key={message.messageId}
                        type="button"
                        className="notification-item"
                        onClick={() => {
                          setIsOpen(false)
                        }}
                      >
                        <div className="notification-item__icon notification-item__icon--message">
                          <Icon name="message" />
                        </div>
                        <div className="notification-item__content">
                          <p className="notification-item__title">
                            {message.title}
                          </p>
                          <p className="notification-item__desc">
                            {message.body}
                          </p>
                          {!message.readAt ? (
                            <span className="notification-item__days info">
                              {t('notification.unreadMessage')}
                            </span>
                          ) : null}
                        </div>
                      </button>
                    ))}
                    {expiringIngredients.map(({ item, days, date }) => (
                      <button
                        key={item.inventoryId ?? item.name}
                        type="button"
                        className="notification-item"
                        onClick={() => {
                          navigateTo('fridge')
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
                            {getDaysText(days, t)} ({date})
                          </span>
                        </div>
                      </button>
                    ))}
                  </>
                )}
              </div>
            </div>
          )}
        </div>

        {/* 🖥️ PC上のみ：背景が黒、文字を表示する設定ボタン（スマホ時はCSSで非表示） */}
        <button
          type="button"
          className="account-button topbar__desktop-action"
          onClick={() => navigateTo('settings')}
        >
          <Icon name="settings" />
          <span>{t('topbar.settings')}</span>
        </button>
        
        {/* 🖥️ PC上のみ：背景が黒、文字を表示するログアウトボタン（スマホ時はCSSで非表示） */}
        {onLogout ? (
          <button
            type="button"
            className="account-button topbar__desktop-action"
            onClick={() => {
              setIsMenuOpen(false)
              setIsOpen(false)
              void onLogout()
            }}
          >
            <Icon name="user" />
            <span>{t('common.logout')}</span>
          </button>
        ) : null}
      </div>
    </header>
  )
}
