import { useEffect, useMemo, useState } from 'react'
import { Topbar } from '../components/Topbar'
import { fetchSavedRecipes } from '../lib/recipeApi'
import type { AppDestination, Recipe } from '../types/ui'

type CookingHistoryPageProps = {
  onNavigate?: (page: AppDestination) => void
  onSelectRecipe: (recipe: Recipe) => void
}

type RecipeFilter = 'all' | 'uncooked' | 'cooked' | 'favorite'

const recipeFilters: Array<{
  label: string
  value: RecipeFilter
}> = [
  { label: '全て', value: 'all' },
  { label: '未調理', value: 'uncooked' },
  { label: '調理済み', value: 'cooked' },
  { label: 'お気に入り', value: 'favorite' },
]

function formatDateTime(value?: string) {
  if (!value) {
    return ''
  }

  const date = new Date(value)

  if (Number.isNaN(date.getTime())) {
    return value
  }

  return `${date.getMonth() + 1}月${date.getDate()}日 ${date
    .getHours()
    .toString()
    .padStart(2, '0')}:${date.getMinutes().toString().padStart(2, '0')}`
}

function formatRecipeStatus(recipe: Recipe) {
  if (recipe.cookedAt) {
    return `最終調理 ${formatDateTime(recipe.cookedAt)}`
  }

  return `作成 ${formatDateTime(recipe.createdAt) || '日時未設定'}`
}

export function CookingHistoryPage({
  onNavigate,
  onSelectRecipe,
}: CookingHistoryPageProps) {
  const [recipes, setRecipes] = useState<Recipe[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState('')
  const [retryCount, setRetryCount] = useState(0)
  const [activeFilter, setActiveFilter] = useState<RecipeFilter>('all')
  const filteredRecipes = useMemo(
    () =>
      recipes.filter((recipe) => {
        if (activeFilter === 'cooked') {
          return recipe.isCooked
        }

        if (activeFilter === 'uncooked') {
          return !recipe.isCooked
        }

        if (activeFilter === 'favorite') {
          return recipe.isFavorite
        }

        return true
      }),
    [activeFilter, recipes],
  )
  const filterCounts = useMemo(
    () => ({
      all: recipes.length,
      uncooked: recipes.filter((recipe) => !recipe.isCooked).length,
      cooked: recipes.filter((recipe) => recipe.isCooked).length,
      favorite: recipes.filter((recipe) => recipe.isFavorite).length,
    }),
    [recipes],
  )

  useEffect(() => {
    let isMounted = true

    fetchSavedRecipes()
      .then((result) => {
        if (isMounted) {
          setRecipes(result.recipes)
          setError('')
        }
      })
      .catch((fetchError) => {
        console.error('[vite] Saved recipes fetch failed:', fetchError)

        if (isMounted) {
          setError(
            fetchError instanceof Error
              ? fetchError.message
              : '作成したレシピの取得に失敗しました',
          )
        }
      })
      .finally(() => {
        if (isMounted) {
          setIsLoading(false)
        }
      })

    return () => {
      isMounted = false
    }
  }, [retryCount])

  return (
    <div className="app-shell">
      <Topbar onNavigate={onNavigate} />

      <main className="history-page">
        <div className="fridge-header">
          <div>
            <p className="eyebrow">保存済みレシピ</p>
            <h1>作成したレシピ</h1>
          </div>
          <button
            type="button"
            className="secondary-button back-home-button"
            onClick={() => onNavigate?.('home')}
          >
            ホームに戻る
          </button>
        </div>

        {isLoading ? (
          <p className="status-message">作成したレシピを読み込み中...</p>
        ) : null}

        {error ? (
          <div className="status-message history-error" role="alert">
            <span>作成したレシピの取得に失敗しました: {error}</span>
            <button
              type="button"
              className="small-button"
              onClick={() => {
                setError('')
                setIsLoading(true)
                setRetryCount((count) => count + 1)
              }}
            >
              再読み込み
            </button>
          </div>
        ) : null}

        {!isLoading && !error && recipes.length === 0 ? (
          <p className="empty-state">まだ作成したレシピがありません。</p>
        ) : null}

        {!isLoading && !error && recipes.length > 0 ? (
          <div className="category-filters history-filters">
            {recipeFilters.map((filter) => (
              <button
                key={filter.value}
                type="button"
                className={`filter-pill ${
                  activeFilter === filter.value ? 'active' : ''
                }`}
                onClick={() => setActiveFilter(filter.value)}
              >
                {filter.label}
                <span>{filterCounts[filter.value]}</span>
              </button>
            ))}
          </div>
        ) : null}

        {!isLoading && !error && recipes.length > 0 && filteredRecipes.length === 0 ? (
          <p className="empty-state">この条件のレシピはありません。</p>
        ) : null}

        <div className="history-list">
          {filteredRecipes.map((recipe) => (
            <button
              key={recipe.recipeId}
              type="button"
              className="history-card"
              onClick={() => onSelectRecipe(recipe)}
            >
              <div>
                <span className="status-pill">
                  {formatRecipeStatus(recipe)}
                </span>
                <h2>{recipe.name}</h2>
                <p>{recipe.meta}</p>
              </div>
              <div className="tag-row">
                {recipe.tags.map((tag) => (
                  <span key={tag}>{tag}</span>
                ))}
              </div>
            </button>
          ))}
        </div>
      </main>
    </div>
  )
}
