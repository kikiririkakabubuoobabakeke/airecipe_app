import { useState } from 'react'
import { Topbar } from '../components/Topbar'
import { Icon } from '../components/Icon'
import { markRecipeCooked, setRecipeFavorite } from '../lib/recipeApi'
import { useI18n } from '../lib/useI18n'
import type { AppDestination, Ingredient, Recipe } from '../types/ui'

type RecipeDetailPageProps = {
  recipe: Recipe
  onBack: () => void
  onNavigate?: (page: AppDestination) => void
  onInventoryUpdated?: (ingredients: Ingredient[]) => void
  onLogout?: () => void | Promise<void>
}

export function RecipeDetailPage({
  recipe,
  onBack,
  onNavigate,
  onInventoryUpdated,
  onLogout,
}: RecipeDetailPageProps) {
  const { language, t } = useI18n()
  const [servings, setServings] = useState(1)
  const [isCooking, setIsCooking] = useState(false)
  const [isFavorite, setIsFavorite] = useState(Boolean(recipe.isFavorite))
  const [isUpdatingFavorite, setIsUpdatingFavorite] = useState(false)
  const [message, setMessage] = useState('')
  const displayTags = isFavorite
    ? Array.from(new Set([t('recipe.favoriteTag'), ...recipe.tags]))
    : recipe.tags.filter(
        (tag) => tag !== 'お気に入り' && tag !== t('recipe.favoriteTag'),
      )
  const steps =
    recipe.steps?.length
      ? recipe.steps
      : recipe.cookProcess
        ? recipe.cookProcess
            .split(/\r?\n/)
            .map((step) => step.trim())
            .filter(Boolean)
        : []

  async function handleCooked() {
    if (!recipe.recipeId) {
      setMessage(t('recipe.savedOnlyInventory'))
      return
    }

    setIsCooking(true)
    setMessage('')

    try {
      const result = await markRecipeCooked(recipe.recipeId, servings, language)
      onInventoryUpdated?.(result.inventory)
      setMessage(t('recipe.inventoryUpdated', { servings }))
    } catch (error) {
      console.error('[vite] Cooking update failed:', error)
      setMessage(t('recipe.inventoryUpdateFailed'))
    } finally {
      setIsCooking(false)
    }
  }

  async function handleFavoriteToggle() {
    if (!recipe.recipeId) {
      setMessage(t('recipe.savedOnlyFavorite'))
      return
    }

    const nextFavorite = !isFavorite
    setIsUpdatingFavorite(true)
    setMessage('')

    try {
      const result = await setRecipeFavorite(recipe.recipeId, nextFavorite)
      setIsFavorite(result.isFavorite)
      setMessage(
        result.isFavorite
          ? t('recipe.favoriteAdded')
          : t('recipe.favoriteRemoved'),
      )
    } catch (error) {
      console.error('[vite] Favorite update failed:', error)
      setMessage(t('recipe.favoriteUpdateFailed'))
    } finally {
      setIsUpdatingFavorite(false)
    }
  }

  return (
    <div className="app-shell">
      <Topbar onNavigate={onNavigate} onLogout={onLogout} />

      <main className="recipe-detail">
        <div className="recipe-detail__toolbar">
          <button type="button" className="secondary-button" onClick={onBack}>
            {t('common.back')}
          </button>
          <button
            type="button"
            className={`favorite-button ${isFavorite ? 'is-active' : ''}`}
            onClick={handleFavoriteToggle}
            disabled={isUpdatingFavorite}
          >
            <Icon name="heart" />
            <span>
              {isUpdatingFavorite
                ? t('common.updating')
                : isFavorite
                  ? t('recipe.favoriteSaved')
                  : t('recipe.favoriteAdd')}
            </span>
          </button>
        </div>

        <section className="recipe-detail__hero">
          <p className="eyebrow">{t('recipe.detailEyebrow')}</p>
          <h1>{recipe.name}</h1>
          <p>
            {recipe.meta}
            {recipe.reason ? ` / ${recipe.reason}` : ''}
          </p>
          <div className="tag-row">
            {displayTags.map((tag) => (
              <span key={tag}>{tag}</span>
            ))}
          </div>
        </section>

        {message ? (
          <p className="status-message" role="status">
            {message}
          </p>
        ) : null}

        <div className="recipe-detail__grid">
          <section className="panel">
            <div className="section-heading">
              <div>
                <p className="eyebrow">{t('recipe.ingredientsEyebrow')}</p>
                <h2>{t('recipe.ingredientsTitle')}</h2>
              </div>
            </div>

            {recipe.ingredients?.length ? (
              <ul className="detail-list">
                {recipe.ingredients.map((ingredient) => (
                  <li key={ingredient.ingredientId}>
                    <span>{ingredient.name}</span>
                    <strong>
                      {ingredient.amount}
                      {ingredient.unit}
                    </strong>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="empty-text">{t('recipe.ingredientsEmpty')}</p>
            )}
          </section>

          <section className="panel">
            <div className="section-heading">
              <div>
                <p className="eyebrow">{t('recipe.stepsEyebrow')}</p>
                <h2>{t('recipe.stepsTitle')}</h2>
              </div>
            </div>

            {steps.length ? (
              <ol className="steps-list">
                {steps.map((step) => (
                  <li key={step}>{step.replace(/^\d+\.\s*/, '')}</li>
                ))}
              </ol>
            ) : (
              <p className="empty-text">{t('recipe.stepsEmpty')}</p>
            )}
          </section>
        </div>

        <section className="cook-complete-panel">
          <label className="serving-field">
            <span>{t('recipe.servingsQuestion')}</span>
            <input
              type="number"
              min="1"
              max="20"
              value={servings}
              onChange={(event) =>
                setServings(Math.max(1, Number(event.target.value) || 1))
              }
            />
          </label>
          <button
            type="button"
            className="primary-button"
            onClick={handleCooked}
            disabled={isCooking}
          >
            {isCooking ? t('common.updating') : t('recipe.markCooked')}
          </button>
        </section>
      </main>
    </div>
  )
}
