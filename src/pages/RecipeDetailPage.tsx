import { useState } from 'react'
import { Topbar } from '../components/Topbar'
import { markRecipeCooked } from '../lib/recipeApi'
import type { AppDestination, Ingredient, Recipe } from '../types/ui'

type RecipeDetailPageProps = {
  recipe: Recipe
  onBack: () => void
  onNavigate?: (page: AppDestination) => void
  onInventoryUpdated?: (ingredients: Ingredient[]) => void
}

export function RecipeDetailPage({
  recipe,
  onBack,
  onNavigate,
  onInventoryUpdated,
}: RecipeDetailPageProps) {
  const [servings, setServings] = useState(1)
  const [isCooking, setIsCooking] = useState(false)
  const [message, setMessage] = useState('')
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
      setMessage('保存済みレシピだけ在庫を更新できます')
      return
    }

    setIsCooking(true)
    setMessage('')

    try {
      const result = await markRecipeCooked(recipe.recipeId, servings)
      onInventoryUpdated?.(result.inventory)
      setMessage(`${servings}人分の在庫を更新しました`)
    } catch (error) {
      console.error('[vite] Cooking update failed:', error)
      setMessage('在庫の更新に失敗しました')
    } finally {
      setIsCooking(false)
    }
  }

  return (
    <div className="app-shell">
      <Topbar onNavigate={onNavigate} />

      <main className="recipe-detail">
        <button type="button" className="secondary-button" onClick={onBack}>
          戻る
        </button>

        <section className="recipe-detail__hero">
          <p className="eyebrow">レシピ詳細</p>
          <h1>{recipe.name}</h1>
          <p>
            {recipe.meta}
            {recipe.reason ? ` / ${recipe.reason}` : ''}
          </p>
          <div className="tag-row">
            {recipe.tags.map((tag) => (
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
                <p className="eyebrow">材料</p>
                <h2>1人前の量</h2>
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
              <p className="empty-text">材料情報がありません。</p>
            )}
          </section>

          <section className="panel">
            <div className="section-heading">
              <div>
                <p className="eyebrow">手順</p>
                <h2>調理工程</h2>
              </div>
            </div>

            {steps.length ? (
              <ol className="steps-list">
                {steps.map((step) => (
                  <li key={step}>{step.replace(/^\d+\.\s*/, '')}</li>
                ))}
              </ol>
            ) : (
              <p className="empty-text">調理工程がありません。</p>
            )}
          </section>
        </div>

        <section className="cook-complete-panel">
          <label className="serving-field">
            <span>何人分作りましたか</span>
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
            {isCooking ? '更新中...' : '調理済みにして在庫を減らす'}
          </button>
        </section>
      </main>
    </div>
  )
}
