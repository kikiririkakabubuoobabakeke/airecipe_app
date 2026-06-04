import type { Recipe } from '../types/ui'
import { useI18n } from '../lib/useI18n'

type RecipesPanelProps = {
  recipes: Recipe[]
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

export function RecipesPanel({
  recipes,
  isGenerating = false,
  onGenerateRecipe,
  onSelectRecipe,
  onCookRecipe,
}: RecipesPanelProps) {
  const { t } = useI18n()
  const visibleRecipes = [...recipes]
    .sort((left, right) => getRecipeTimestamp(right) - getRecipeTimestamp(left))
    .slice(0, visibleRecipeCount)

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
                {recipe.recipeId && onCookRecipe ? (
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
                ) : null}
              </div>
              <p>{recipe.meta}</p>
              {recipe.ingredients?.length ? (
                <div className="recipe-amounts">
                  <strong>{t('home.recipes.serving')}</strong>
                  <ul>
                    {recipe.ingredients.map((ingredient) => (
                      <li key={ingredient.ingredientId}>
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
            </article>
          ))
        ) : (
          <p className="empty-state">{t('home.recipes.empty')}</p>
        )}
      </div>
    </section>
  )
}
