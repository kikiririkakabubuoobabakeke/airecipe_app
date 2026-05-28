import type { Recipe } from '../types/ui'

type RecipesPanelProps = {
  recipes: Recipe[]
  isGenerating?: boolean
  onGenerateRecipe?: () => void
  onSelectRecipe?: (recipe: Recipe) => void
  onCookRecipe?: (recipe: Recipe) => void
}

export function RecipesPanel({
  recipes,
  isGenerating = false,
  onGenerateRecipe,
  onSelectRecipe,
  onCookRecipe,
}: RecipesPanelProps) {
  return (
    <section className="panel" id="recipes" aria-labelledby="recipes-title">
      <div className="section-heading">
        <div>
          <p className="eyebrow">レシピ候補</p>
          <h2 id="recipes-title">在庫から作れる献立</h2>
        </div>
        <button
          type="button"
          className="small-button"
          onClick={onGenerateRecipe}
          disabled={isGenerating}
        >
          {isGenerating ? '生成中...' : '再生成'}
        </button>
      </div>
      <div className="recipe-stack">
        {recipes.map((recipe) => (
          <article
            key={recipe.name}
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
                  調理済み
                </button>
              ) : null}
            </div>
            <p>{recipe.meta}</p>
            {recipe.ingredients?.length ? (
              <div className="recipe-amounts">
                <strong>1人前</strong>
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
        ))}
      </div>
    </section>
  )
}
