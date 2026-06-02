import { useEffect, useMemo, useState } from 'react'
import { Topbar } from '../components/Topbar'
import { Icon } from '../components/Icon'
import { fetchInventory } from '../lib/recipeApi'
import type { AppDestination, Ingredient } from '../types/ui'

type Summary = {
  totalCount: number
  uniqueNamesCount: number
  openedCount: number
  nearExpirationCount: number
}

const allCategoryLabel = 'すべて'

function isNearExpiration(expirationDate: string | null | undefined) {
  if (!expirationDate) {
    return false
  }

  const today = new Date()
  today.setHours(0, 0, 0, 0)

  const expiry = new Date(`${expirationDate}T00:00:00`)

  if (Number.isNaN(expiry.getTime())) {
    return false
  }

  const diffDays = Math.ceil(
    (expiry.getTime() - today.getTime()) / (1000 * 60 * 60 * 24),
  )

  return diffDays >= 0 && diffDays <= 3
}

function formatDate(value: string | null | undefined) {
  if (!value) {
    return '-'
  }

  const date = new Date(`${value}T00:00:00`)

  if (Number.isNaN(date.getTime())) {
    return value
  }

  return `${date.getMonth() + 1}月${date.getDate()}日`
}

function buildSummary(ingredients: Ingredient[]): Summary {
  return {
    totalCount: ingredients.length,
    uniqueNamesCount: new Set(ingredients.map((item) => item.name)).size,
    openedCount: 0,
    nearExpirationCount: ingredients.filter((item) =>
      isNearExpiration(item.expirationDate),
    ).length,
  }
}

export function FridgePage({
  onNavigate,
  onLogout,
}: {
  onNavigate: (page: AppDestination) => void
  onLogout?: () => void | Promise<void>
}) {
  const [ingredients, setIngredients] = useState<Ingredient[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [activeCategory, setActiveCategory] = useState(allCategoryLabel)
  const summary = useMemo(() => buildSummary(ingredients), [ingredients])
  const groupedIngredients = useMemo(
    () =>
      ingredients.reduce(
        (groups, item) => {
          const category = item.category ?? 'その他'
          groups[category] ??= []
          groups[category].push(item)
          return groups
        },
        {} as Record<string, Ingredient[]>,
      ),
    [ingredients],
  )
  const categories = useMemo(
    () => [allCategoryLabel, ...Object.keys(groupedIngredients)],
    [groupedIngredients],
  )

  useEffect(() => {
    let isMounted = true

    fetchInventory()
      .then((result) => {
        if (isMounted) {
          setIngredients(result.inventory)
          setError(null)
        }
      })
      .catch((fetchError) => {
        if (isMounted) {
          setError(
            fetchError instanceof Error
              ? fetchError.message
              : '食材の取得に失敗しました',
          )
        }
      })
      .finally(() => {
        if (isMounted) {
          setLoading(false)
        }
      })

    return () => {
      isMounted = false
    }
  }, [])

  if (loading) {
    return (
      <div className="app-shell">
        <Topbar onNavigate={onNavigate} onLogout={onLogout} />
        <div className="fridge-loading">
          <div className="loading-spinner" />
          <p>冷蔵庫の食材を読み込み中...</p>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="app-shell">
        <Topbar onNavigate={onNavigate} onLogout={onLogout} />
        <div className="fridge-error">
          <p>食材の取得に失敗しました: {error}</p>
          <button
            type="button"
            className="primary-button"
            onClick={() => window.location.reload()}
          >
            再読み込み
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="app-shell">
      <Topbar onNavigate={onNavigate} onLogout={onLogout} />

      <main className="fridge-container">
        <div className="fridge-header">
          <h1>冷蔵庫の食材一覧</h1>
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

        <section className="fridge-summary" aria-label="冷蔵庫の集計">
          <div className="summary-card">
            <span className="card-label">登録食材数</span>
            <strong className="card-value">{summary.totalCount}</strong>
            <span className="card-note">ログイン中のユーザーの食材</span>
          </div>
          <div className="summary-card">
            <span className="card-label">種類数</span>
            <strong className="card-value">{summary.uniqueNamesCount}</strong>
            <span className="card-note">食材名のバリエーション</span>
          </div>
          <div className="summary-card">
            <span className="card-label">使用中</span>
            <strong className="card-value">{summary.openedCount}</strong>
            <span className="card-note">開封状態は未連携</span>
          </div>
          <div className="summary-card near-expiration">
            <span className="card-label">期限が近い</span>
            <strong className="card-value">{summary.nearExpirationCount}</strong>
            <span className="card-note">残り3日以内の食材</span>
          </div>
        </section>

        <div className="category-filters">
          {categories.map((category) => (
            <button
              key={category}
              type="button"
              className={`filter-pill ${
                activeCategory === category ? 'active' : ''
              }`}
              onClick={() => setActiveCategory(category)}
            >
              {category}
            </button>
          ))}
        </div>

        <div className="fridge-tables">
          {ingredients.length === 0 ? (
            <div className="empty-state">
              このユーザーの食材はまだ登録されていません。
            </div>
          ) : (
            Object.entries(groupedIngredients)
              .filter(
                ([category]) =>
                  activeCategory === allCategoryLabel ||
                  activeCategory === category,
              )
              .map(([category, items]) => (
                <div key={category} className="category-table-wrapper">
                  <h2 className="category-title">{category}</h2>
                  <div className="table-container">
                    <table className="fridge-table">
                      <thead>
                        <tr>
                          <th>食材</th>
                          <th>在庫</th>
                          <th>メモ</th>
                          <th>消費期限</th>
                        </tr>
                      </thead>
                      <tbody>
                        {items.map((item, index) => {
                          const rowKey =
                            item.inventoryId ??
                            item.ingredientId ??
                            `${item.name}-${index}`
                          const isWarning = isNearExpiration(
                            item.expirationDate,
                          )

                          return (
                            <tr key={rowKey}>
                              <td className="ingredient-name-cell">
                                <span className="ingredient-name">
                                  {item.name}
                                </span>
                              </td>
                              <td>
                                <span className="amount-text">
                                  {item.amount}
                                </span>
                              </td>
                              <td>{item.memo ?? '-'}</td>
                              <td className="expiration-cell">
                                <span
                                  className={
                                    isWarning ? 'expiration-warning' : ''
                                  }
                                >
                                  {formatDate(item.expirationDate)}
                                </span>
                              </td>
                            </tr>
                          )
                        })}
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
