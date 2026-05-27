import { useEffect, useState } from 'react'
import { Topbar } from '../components/Topbar'
import { Icon } from '../components/Icon'
import type { AppDestination } from '../types/ui'

type Ingredient = {
  ingredient_id: number
  ingredient_name: string
  category: string
  amount: string
  is_opened: boolean
  best_before_date: string | null
  expiration_date: string | null
}

type Summary = {
  totalCount: number
  uniqueNamesCount: number
  openedCount: number
  nearExpirationCount: number
}

export function FridgePage({
  onNavigate,
}: {
  onNavigate: (page: AppDestination) => void
}) {
  const [data, setData] = useState<{ summary: Summary; ingredients: Ingredient[] } | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [activeCategory, setActiveCategory] = useState<string>('全て')

  useEffect(() => {
    fetch('/api/fridge')
      .then((res) => {
        if (!res.ok) throw new Error('APIの取得に失敗しました')
        return res.json()
      })
      .then((data) => {
        setData(data)
        setLoading(false)
      })
      .catch((err) => {
        setError(err.message)
        setLoading(false)
      })
  }, [])

  const categories = ['全て', '野菜', '肉・卵・魚', '乳製品', '加工品']

  const formatDate = (dateStr: string | null) => {
    if (!dateStr) return '-'
    const date = new Date(dateStr)
    if (isNaN(date.getTime())) return dateStr
    return `${date.getMonth() + 1}月${date.getDate()}日`
  }

  // カテゴリごとにグループ化
  const groupedIngredients = data
    ? data.ingredients.reduce((acc, item) => {
      if (!acc[item.category]) {
        acc[item.category] = []
      }
      acc[item.category].push(item)
      return acc
    }, {} as Record<string, Ingredient[]>)
    : {}
  //テスト2222222222
  if (loading) {
    return (
      <div className="app-shell">
        <Topbar onNavigate={onNavigate} />
        <div className="fridge-loading">
          <div className="loading-spinner"></div>
          <p>冷蔵庫の食材を読み込み中...</p>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="app-shell">
        <Topbar onNavigate={onNavigate} />
        <div className="fridge-error">
          <p>エラーが発生しました: {error}</p>
          <button type="button" className="primary-button" onClick={() => window.location.reload()}>
            再読み込み
          </button>
        </div>
      </div>
    )
  }

  const summary = data?.summary || { totalCount: 0, uniqueNamesCount: 0, openedCount: 0, nearExpirationCount: 0 }

  return (
    <div className="app-shell">
      <Topbar onNavigate={onNavigate} />

      <main className="fridge-container">
        {/* ヘッダーエリア */}
        <div className="fridge-header">
          <h1>冷蔵庫管理一覧</h1>
          <button
            type="button"
            className="secondary-button back-home-button"
            onClick={() => onNavigate('home')}
          >
            <div style={{ transform: 'scaleX(-1)', display: 'inline-flex' }}>
              <Icon name="arrow" />
            </div>
            <span>ホームに戻る</span>
          </button>
        </div>

        {/* 数値カード */}
        <section className="fridge-summary" aria-label="冷蔵庫統計">
          <div className="summary-card">
            <span className="card-label">登録食材数</span>
            <strong className="card-value">{summary.totalCount}</strong>
            <span className="card-note">現在の全食材数</span>
          </div>
          <div className="summary-card">
            <span className="card-label">種類数</span>
            <strong className="card-value">{summary.uniqueNamesCount}</strong>
            <span className="card-note">食材のバリエーション</span>
          </div>
          <div className="summary-card">
            <span className="card-label">使用途中</span>
            <strong className="card-value">{summary.openedCount}</strong>
            <span className="card-note">開封済みの食材数</span>
          </div>
          <div className="summary-card near-expiration">
            <span className="card-label">消費期限が近い</span>
            <strong className="card-value">{summary.nearExpirationCount}</strong>
            <span className="card-note">残り3日以内の食材</span>
          </div>
        </section>

        {/* フィルターボタン */}
        <div className="category-filters">
          {categories.map((cat) => (
            <button
              key={cat}
              type="button"
              className={`filter-pill ${activeCategory === cat ? 'active' : ''}`}
              onClick={() => setActiveCategory(cat)}
            >
              {cat}
            </button>
          ))}
        </div>

        {/* 食材リスト表示 */}
        <div className="fridge-tables">
          {Object.keys(groupedIngredients).length === 0 ? (
            <div className="empty-state">冷蔵庫に食材がありません。</div>
          ) : (
            Object.entries(groupedIngredients)
              .filter(([cat]) => activeCategory === '全て' || activeCategory === cat)
              .map(([cat, items]) => (
                <div key={cat} className="category-table-wrapper">
                  <h2 className="category-title">{cat}</h2>
                  <div className="table-container">
                    <table className="fridge-table">
                      <thead>
                        <tr>
                          <th>食材</th>
                          <th>在庫状況</th>
                          <th>賞味期限</th>
                          <th>消費期限</th>
                        </tr>
                      </thead>
                      <tbody>
                        {items.map((item) => (
                          <tr key={item.ingredient_id} className={item.is_opened ? 'opened-row' : ''}>
                            <td className="ingredient-name-cell">
                              <span className="ingredient-name">{item.ingredient_name}</span>
                              {item.is_opened && <span className="opened-badge">使用途中</span>}
                            </td>
                            <td>
                              <span className="amount-text">{item.amount}</span>
                            </td>
                            <td>{formatDate(item.best_before_date)}</td>
                            <td className="expiration-cell">
                              <span className={
                                item.expiration_date && (new Date(item.expiration_date).getTime() - new Date().getTime() <= 3 * 24 * 60 * 60 * 1000)
                                  ? 'expiry-alert'
                                  : ''
                              }>
                                {formatDate(item.expiration_date)}
                              </span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              ))
          )}
        </div>
      </main>
    </div>
  )
}
