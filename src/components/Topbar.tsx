import { Icon } from './Icon'
import type { AppDestination } from '../types/ui'

type TopbarProps = {
  onNavigate?: (page: AppDestination) => void
  onLogout?: () => void | Promise<void>
}

export function Topbar({ onNavigate, onLogout }: TopbarProps) {
  return (
    <header className="topbar">
      <a
        className="brand"
        href="/"
        aria-label="あいくっくホーム"
        onClick={(event) => {
          event.preventDefault()
          onNavigate?.('home')
        }}
      >
        <span className="brand__mark">
          <img src="/app-icon.png" alt="" />
        </span>
        <span>
          <strong>あいくっく</strong>
          <small>食材管理と献立づくり</small>
        </span>
      </a>

      <nav className="topbar__nav" aria-label="メインメニュー">
        <a
          href="#ingredients"
          onClick={(event) => {
            event.preventDefault()
            onNavigate?.('fridge')
          }}
        >
          食材
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
          レシピ
        </a>
        <a
          href="#receipt"
          onClick={(event) => {
            event.preventDefault()
            onNavigate?.('receipt')
          }}
        >
          レシート
        </a>
        <a
          href="#history"
          onClick={(event) => {
            event.preventDefault()
            onNavigate?.('history')
          }}
        >
          履歴
        </a>
      </nav>

      <div className="topbar__actions">
        <button type="button" className="icon-button" aria-label="通知">
          <Icon name="bell" />
        </button>
        <button
          type="button"
          className="account-button"
          onClick={() => {
            if (onLogout) {
              void onLogout()
              return
            }

            onNavigate?.('login')
          }}
        >
          <Icon name="user" />
          <span>{onLogout ? 'ログアウト' : 'アカウント'}</span>
        </button>
      </div>
    </header>
  )
}
