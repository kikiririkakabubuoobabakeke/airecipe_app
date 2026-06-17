import { memo, useMemo, useState } from 'react'
import type { Ingredient } from '../types/ui'
import { useI18n } from '../lib/useI18n'

const visibleExpirationDays = 7
const MAX_VISIBLE_ITEMS = 7

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
}: {
  ingredients: Ingredient[]
  isLoading?: boolean
  onAddIngredient?: () => void
}) {
  const { t } = useI18n()
  const [isExpanded, setIsExpanded] = useState(false)

  const visibleIngredients = useMemo(() => {
    const withDays = ingredients
      .map((ingredient) => ({
        ingredient,
        days: getDaysUntilExpiration(ingredient),
      }))
      .filter(
        (entry): entry is { ingredient: Ingredient; days: number } =>
          entry.days !== null &&
          entry.days >= 0 &&
          entry.days <= visibleExpirationDays,
      )

    withDays.sort((left, right) => left.days - right.days)
    return withDays.map((entry) => entry.ingredient)
  }, [ingredients])

  const hasMore = visibleIngredients.length > MAX_VISIBLE_ITEMS
  const displayedIngredients = isExpanded || !hasMore
    ? visibleIngredients
    : visibleIngredients.slice(0, MAX_VISIBLE_ITEMS)

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
          onClick={() => setIsExpanded((current) => !current)}
        >
          {isExpanded
            ? t('home.ingredients.expandLess')
            : t('home.ingredients.expandMore', { remaining: visibleIngredients.length - MAX_VISIBLE_ITEMS })}
        </button>
      ) : null}
    </section>
  )
})
