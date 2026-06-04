import type { Ingredient } from '../types/ui'
import { useI18n } from '../lib/useI18n'

const visibleExpirationDays = 7

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

export function IngredientsPanel({
  ingredients,
  onAddIngredient,
}: {
  ingredients: Ingredient[]
  onAddIngredient?: () => void
}) {
  const { t } = useI18n()
  const visibleIngredients = [...ingredients]
    .filter((ingredient) => {
      const daysUntilExpiration = getDaysUntilExpiration(ingredient)

      return (
        daysUntilExpiration !== null &&
        daysUntilExpiration >= 0 &&
        daysUntilExpiration <= visibleExpirationDays
      )
    })
    .sort((left, right) => {
      const leftDays = getDaysUntilExpiration(left) ?? Number.MAX_SAFE_INTEGER
      const rightDays = getDaysUntilExpiration(right) ?? Number.MAX_SAFE_INTEGER

      return leftDays - rightDays
    })

  return (
    <section className="panel" id="ingredients" aria-labelledby="ingredients-title">
      <div className="section-heading">
        <div>
          <p className="eyebrow">{t('home.ingredients.eyebrow')}</p>
          <h2 id="ingredients-title">{t('home.ingredients.title')}</h2>
        </div>
        <button type="button" className="small-button" onClick={onAddIngredient}>
          {t('home.ingredients.add')}
        </button>
      </div>

      {visibleIngredients.length ? (
        <ul className="ingredient-list">
          {visibleIngredients.map((ingredient) => (
            <li key={ingredient.inventoryId ?? ingredient.name}>
              <span>
                <strong>{ingredient.name}</strong>
                <small>{ingredient.amount}</small>
              </span>
              <em>{ingredient.status}</em>
            </li>
          ))}
        </ul>
      ) : (
        <p className="empty-state">{t('home.ingredients.empty')}</p>
      )}
    </section>
  )
}
