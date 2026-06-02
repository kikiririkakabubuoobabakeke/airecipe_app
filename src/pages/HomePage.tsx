import { useEffect, useMemo, useState } from 'react'
import { FeatureCard } from '../components/FeatureCard'
import { HeroPanel } from '../components/HeroPanel'
import { IngredientsPanel } from '../components/IngredientsPanel'
import { RecipesPanel } from '../components/RecipesPanel'
import { SummaryGrid } from '../components/SummaryGrid'
import { Topbar } from '../components/Topbar'
import {
  expiringIngredients,
  primaryFeatures,
  secondaryFeatures,
  suggestedRecipes,
  summaryItems,
} from '../data/home'
import {
  fetchInventory,
  generateRecipes,
  markRecipeCooked,
} from '../lib/recipeApi'
import type { AppDestination, Ingredient, Recipe } from '../types/ui'

function buildSummaryItems(ingredients: Ingredient[], recipes: Recipe[]) {
  const expiringCount = ingredients.filter((ingredient) =>
    ['今日まで', '明日まで', '期限切れ'].includes(ingredient.status),
  ).length

  return [
    {
      label: '登録食材',
      value: String(ingredients.length),
      note:
        expiringCount > 0
          ? `${expiringCount}件は期限が近い`
          : '期限が近い食材なし',
    },
    summaryItems[1],
    {
      label: 'レシピ候補',
      value: String(recipes.length),
      note: recipes.some((recipe) => recipe.recipeId)
        ? 'AI生成済み'
        : 'モック表示中',
    },
    summaryItems[3],
  ]
}

type HomePageProps = {
  onNavigate?: (page: AppDestination) => void
  onSelectRecipe?: (recipe: Recipe) => void
  onLogout?: () => void | Promise<void>
}

export function HomePage({
  onNavigate,
  onSelectRecipe,
  onLogout,
}: HomePageProps) {
  const [ingredients, setIngredients] =
    useState<Ingredient[]>(expiringIngredients)
  const [recipes, setRecipes] = useState<Recipe[]>(suggestedRecipes)
  const [isGenerating, setIsGenerating] = useState(false)
  const [isCooking, setIsCooking] = useState(false)
  const [statusMessage, setStatusMessage] = useState('')
  const [cookingRecipe, setCookingRecipe] = useState<Recipe | null>(null)
  const [servings, setServings] = useState(1)
  const currentSummaryItems = useMemo(
    () => buildSummaryItems(ingredients, recipes),
    [ingredients, recipes],
  )

  useEffect(() => {
    let isMounted = true

    fetchInventory()
      .then((result) => {
        if (isMounted && result.inventory.length) {
          setIngredients(result.inventory)
        }
      })
      .catch((error) => {
        console.warn('[vite] Inventory fetch failed:', error)
      })

    return () => {
      isMounted = false
    }
  }, [])

  async function handleGenerateRecipe() {
    setIsGenerating(true)
    setStatusMessage('')

    try {
      const result = await generateRecipes(2)

      if (result.recipes.length) {
        setRecipes(result.recipes)
        setStatusMessage('レシピ候補を生成しました')
      }
    } catch (error) {
      console.error('[vite] Recipe generation failed:', error)
      setStatusMessage('レシピ生成に失敗しました')
    } finally {
      setIsGenerating(false)
    }
  }

  function openCookedDialog(recipe: Recipe) {
    setCookingRecipe(recipe)
    setServings(1)
    setStatusMessage('')
  }

  async function handleConfirmCooked() {
    if (!cookingRecipe?.recipeId) {
      return
    }

    setIsCooking(true)
    setStatusMessage('')

    try {
      const result = await markRecipeCooked(cookingRecipe.recipeId, servings)
      setIngredients(result.inventory)
      setStatusMessage(`${servings}人分の在庫を更新しました`)
      setCookingRecipe(null)
    } catch (error) {
      console.error('[vite] Cooking update failed:', error)
      setStatusMessage('在庫の更新に失敗しました')
    } finally {
      setIsCooking(false)
    }
  }

  return (
    <div className="app-shell">
      <Topbar onNavigate={onNavigate} onLogout={onLogout} />

      <main className="home">
        <HeroPanel
          isGenerating={isGenerating}
          onGenerateRecipe={handleGenerateRecipe}
          onScanReceipt={() => onNavigate?.('receipt')}
          onShowRecipes={() => onNavigate?.('history')}
        />

        {statusMessage ? (
          <p className="status-message" role="status">
            {statusMessage}
          </p>
        ) : null}

        <SummaryGrid items={currentSummaryItems} />

        <section className="feature-section" aria-label="クイックアクセス">
          <div className="feature-grid">
            {primaryFeatures.map((feature) => (
              <FeatureCard
                key={feature.title}
                feature={feature}
                onAction={
                  feature.title === '調理履歴'
                    ? () => onNavigate?.('history')
                    : undefined
                }
              />
            ))}
          </div>
        </section>

        <div className="dashboard-grid">
          <IngredientsPanel ingredients={ingredients} />
          <RecipesPanel
            recipes={recipes}
            isGenerating={isGenerating}
            onGenerateRecipe={handleGenerateRecipe}
            onSelectRecipe={onSelectRecipe}
            onCookRecipe={openCookedDialog}
          />
        </div>

        <section
          className="secondary-section"
          id="shopping"
          aria-label="アカウントとサポート"
        >
          <div className="secondary-grid">
            {secondaryFeatures.map((feature) => (
              <FeatureCard key={feature.title} feature={feature} />
            ))}
          </div>
        </section>
      </main>

      {cookingRecipe ? (
        <div className="modal-backdrop" role="presentation">
          <section
            className="cook-modal"
            aria-labelledby="cook-modal-title"
            aria-modal="true"
            role="dialog"
          >
            <p className="eyebrow">調理済み</p>
            <h2 id="cook-modal-title">{cookingRecipe.name}</h2>
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
            <div className="modal-actions">
              <button
                type="button"
                className="secondary-button"
                onClick={() => setCookingRecipe(null)}
                disabled={isCooking}
              >
                キャンセル
              </button>
              <button
                type="button"
                className="primary-button"
                onClick={handleConfirmCooked}
                disabled={isCooking}
              >
                {isCooking ? '更新中...' : '在庫を減らす'}
              </button>
            </div>
          </section>
        </div>
      ) : null}
    </div>
  )
}
