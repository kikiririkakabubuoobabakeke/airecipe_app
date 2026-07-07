import { memo, useMemo } from 'react'
import type { Recipe } from '../types/ui'
import { useI18n } from '../lib/useI18n'

type RecipesPanelProps = {
  recipes: Recipe[]
  isLoading?: boolean
  isGenerating?: boolean
  onGenerateRecipe?: () => void
  onSelectRecipe?: (recipe: Recipe) => void
  onCookRecipe?: (recipe: Recipe) => void
}

const visibleRecipeCount = 2

function getRecipeTimestamp(recipe: Recipe) {
  const value = recipe.createdAt ?? recipe.cookedAt

  if (!value) {
    return 0
  }

  const timestamp = new Date(value).getTime()

  return Number.isNaN(timestamp) ? 0 : timestamp
}

export const RecipesPanel = memo(function RecipesPanel({
  recipes,
  isLoading = false,
  isGenerating = false,
  onGenerateRecipe,
  onSelectRecipe,
  // onCookRecipe,
}: RecipesPanelProps) {
  const { t } = useI18n()
  const visibleRecipes = useMemo(
    () =>
      [...recipes]
        .sort(
          (left, right) => getRecipeTimestamp(right) - getRecipeTimestamp(left),
        )
        .slice(0, visibleRecipeCount),
    [recipes],
  )

  return (
    <section className="panel" id="recipes" aria-labelledby="recipes-title">
      <div className="section-heading">
        <div>
          <p className="eyebrow">{t('home.recipes.eyebrow')}</p>
          <h2 id="recipes-title">{t('home.recipes.title')}</h2>
        </div>
        <button
          type="button"
          className="small-button"
          onClick={onGenerateRecipe}
          disabled={isGenerating}
        >
          {isGenerating ? t('home.hero.generating') : t('home.recipes.regenerate')}
        </button>
      </div>

      <div className="recipe-stack">
        {recipes.length ? (
          visibleRecipes.map((recipe) => (
            <article
              key={recipe.recipeId ?? recipe.name}
              className="recipe-card"
              onClick={() => onSelectRecipe?.(recipe)}
            >
              <div className="recipe-card__header">
                <h3>{recipe.name}</h3>
              </div>
              <p>{recipe.meta}</p>
              {recipe.ingredients?.length ? (
                <div className="recipe-amounts">
                  <strong>{t('home.recipes.serving')}</strong>
                  <ul>
                    {recipe.ingredients.map((ingredient, index) => (
                      <li
                        key={`${ingredient.ingredientId}-${ingredient.name}-${index}`}
                      >
                        <span>{ingredient.name}</span>
                        <em>
                          {ingredient.amount}
                          {ingredient.unit}
                        </em>
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}
              <div className="tag-row">
                {recipe.tags.map((tag) => (
                  <span key={tag}>{tag}</span>
                ))}
              </div>
              {/* {recipe.recipeId && onCookRecipe ? (
                <div className="recipe-card__actions">
                  <button
                    type="button"
                    className="small-button"
                    onClick={(event) => {
                      event.stopPropagation()
                      onCookRecipe(recipe)
                    }}
                  >
                    {t('home.recipes.cooked')}
                  </button>
                </div>
              ) : null} */}
            </article>
          ))
        ) : isLoading ? (
          <p className="empty-state" aria-live="polite">
            {t('common.loading')}
          </p>
        ) : (
          <p className="empty-state">{t('home.recipes.empty')}</p>
        )}
      </div>
    </section>
  )
})
