import { memo, useMemo } from 'react'
import type { Ingredient } from '../types/ui'
import { useI18n } from '../lib/useI18n'

const visibleExpirationDays = 7
const MAX_VISIBLE_ITEMS = 5

function getDaysUntilExpiration(ingredient: Ingredient) {
  if (!ingredient.expirationDate) {
    return null
  }

  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const expiration = new Date(`${ingredient.expirationDate}T00:00:00`)

  if (Number.isNaN(expiration.getTime())) {
    return null
  }

  return Math.ceil(
    (expiration.getTime() - today.getTime()) / (1000 * 60 * 60 * 24),
  )
}

export const IngredientsPanel = memo(function IngredientsPanel({
  ingredients,
  isLoading = false,
  onAddIngredient,
  onViewAll,
}: {
  ingredients: Ingredient[]
  isLoading?: boolean
  onAddIngredient?: () => void
  onViewAll?: () => void
}) {
  const { t } = useI18n()

  const visibleIngredients = useMemo(() => {
    const withDays = ingredients.map((ingredient) => ({
      ingredient,
      days: getDaysUntilExpiration(ingredient),
    }))

    withDays.sort((left, right) => {
      const leftUrgent =
        left.days !== null && left.days <= visibleExpirationDays
      const rightUrgent =
        right.days !== null && right.days <= visibleExpirationDays

      // 期限切れ間近〜当日〜1週間以内のものを最優先で上部へ
      if (leftUrgent && !rightUrgent) return -1
      if (!leftUrgent && rightUrgent) return 1

      // 両方とも「期限が近いグループ」なら、日数が少ない順（緊急度が高い順）
      if (leftUrgent && rightUrgent) {
        return (left.days as number) - (right.days as number)
      }

      // 両方とも「期限が近くない・未設定」グループなら、元の登録順を維持
      return 0
    })

    return withDays.map((entry) => entry.ingredient)
  }, [ingredients])

  const hasMore = visibleIngredients.length > MAX_VISIBLE_ITEMS
  const displayedIngredients = hasMore
    ? visibleIngredients.slice(0, MAX_VISIBLE_ITEMS)
    : visibleIngredients

  return (
    <section
      className="panel"
      id="ingredients"
      aria-labelledby="ingredients-title"
    >
      <div className="section-heading">
        <div>
          <p className="eyebrow">{t('home.ingredients.eyebrow')}</p>
          <h2 id="ingredients-title">{t('home.ingredients.title')}</h2>
        </div>
        <button type="button" className="small-button" onClick={onAddIngredient}>
          {t('home.ingredients.add')}
        </button>
      </div>

      {displayedIngredients.length ? (
        <ul className="ingredient-list">
          {displayedIngredients.map((ingredient) => (
            <li key={ingredient.inventoryId ?? ingredient.name}>
              <span>
                <strong>{ingredient.name}</strong>
                <small>{ingredient.amount}</small>
              </span>
              {/* 登録済み食材一覧表示画面 */}
              <em>{ingredient.status}</em>
            </li>
          ))}
        </ul>
      ) : isLoading ? (
        <p className="empty-state" aria-live="polite">
          {t('common.loading')}
        </p>
      ) : (
        <p className="empty-state">{t('home.ingredients.empty')}</p>
      )}

      {hasMore ? (
        <button
          type="button"
          className="small-button ingredients-expand-toggle"
          onClick={onViewAll}
        >
          {t('home.ingredients.expandMore', { remaining: visibleIngredients.length - MAX_VISIBLE_ITEMS })}
        </button>
      ) : null}
    </section>
  )
})
