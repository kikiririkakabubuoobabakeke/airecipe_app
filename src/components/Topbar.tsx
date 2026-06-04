import { Icon } from './Icon'
import { useI18n } from '../lib/useI18n'
import type { AppDestination } from '../types/ui'

type TopbarProps = {
  onNavigate?: (page: AppDestination) => void
  onLogout?: () => void | Promise<void>
}

export function Topbar({ onNavigate, onLogout }: TopbarProps) {
  const { t } = useI18n()

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
        <button
          type="button"
          className="icon-button"
          aria-label={t('topbar.notifications')}
        >
          <Icon name="bell" />
        </button>
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
