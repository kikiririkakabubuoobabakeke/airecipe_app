import { Icon } from './Icon'
import type { AppDestination } from '../types/ui'

export function Topbar({
  onNavigate,
}: {
  onNavigate?: (page: AppDestination) => void
}) {
  return (
    <header className="topbar">
      <a
        className="brand"
        href="/"
        aria-label="あいくっく ホーム"
        onClick={(e) => {
          e.preventDefault()
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
          onClick={(e) => {
            e.preventDefault()
            onNavigate?.('fridge')
          }}
        >
          食材
        </a>
        <a
          href="#recipes"
          onClick={(e) => {
            e.preventDefault()
            onNavigate?.('home')
            setTimeout(() => {
              document.getElementById('recipes')?.scrollIntoView({ behavior: 'smooth' })
            }, 100)
          }}
        >
          レシピ
        </a>
        <a
          href="#shopping"
          onClick={(e) => {
            e.preventDefault()
            onNavigate?.('home')
            setTimeout(() => {
              document.getElementById('shopping')?.scrollIntoView({ behavior: 'smooth' })
            }, 100)
          }}
        >
          買い物
        </a>
        <a
          href="#history"
          onClick={(e) => {
            e.preventDefault()
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
        <button type="button" className="account-button">
          <Icon name="user" />
          <span>アカウント</span>
        </button>
      </div>
    </header>
  )
}
