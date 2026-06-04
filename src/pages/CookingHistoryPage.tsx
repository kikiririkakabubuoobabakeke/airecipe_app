import { useEffect, useMemo, useState } from 'react'
import { Topbar } from '../components/Topbar'
import { fetchSavedRecipes } from '../lib/recipeApi'
import { useI18n } from '../lib/useI18n'
import type { TranslateFn } from '../lib/i18n'
import type { AppDestination, Recipe } from '../types/ui'

type CookingHistoryPageProps = {
  onNavigate?: (page: AppDestination) => void
  onSelectRecipe: (recipe: Recipe) => void
  onLogout?: () => void | Promise<void>
}

type RecipeFilter = 'all' | 'uncooked' | 'cooked' | 'favorite'

const recipeFilters: Array<{
  labelKey: Parameters<TranslateFn>[0]
  value: RecipeFilter
}> = [
  { labelKey: 'history.filter.all', value: 'all' },
  { labelKey: 'history.filter.uncooked', value: 'uncooked' },
  { labelKey: 'history.filter.cooked', value: 'cooked' },
  { labelKey: 'history.filter.favorite', value: 'favorite' },
]

function formatDateTime(value: string | undefined, language: string) {
  if (!value) {
    return ''
  }

  const date = new Date(value)

  if (Number.isNaN(date.getTime())) {
    return value
  }

  return new Intl.DateTimeFormat(language, {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date)
}

function formatRecipeStatus(
  recipe: Recipe,
  language: string,
  t: TranslateFn,
) {
  if (recipe.cookedAt) {
    return t('history.status.lastCooked', {
      date: formatDateTime(recipe.cookedAt, language),
    })
  }

  return t('history.status.created', {
    date: formatDateTime(recipe.createdAt, language) || t('history.status.noDate'),
  })
}

export function CookingHistoryPage({
  onNavigate,
  onSelectRecipe,
  onLogout,
}: CookingHistoryPageProps) {
  const { language, t } = useI18n()
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

    fetchSavedRecipes(language)
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
              : t('history.fetchFailed'),
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
  }, [language, retryCount, t])

  return (
    <div className="app-shell">
      <Topbar onNavigate={onNavigate} onLogout={onLogout} />

      <main className="history-page">
        <div className="fridge-header">
          <div>
            <p className="eyebrow">{t('history.eyebrow')}</p>
            <h1>{t('history.title')}</h1>
          </div>
          <button
            type="button"
            className="secondary-button back-home-button"
            onClick={() => onNavigate?.('home')}
          >
            {t('common.backHome')}
          </button>
        </div>

        {isLoading ? (
          <p className="status-message">{t('history.loading')}</p>
        ) : null}

        {error ? (
          <div className="status-message history-error" role="alert">
            <span>{t('history.fetchFailed')}: {error}</span>
            <button
              type="button"
              className="small-button"
              onClick={() => {
                setError('')
                setIsLoading(true)
                setRetryCount((count) => count + 1)
              }}
            >
              {t('common.reload')}
            </button>
          </div>
        ) : null}

        {!isLoading && !error && recipes.length === 0 ? (
          <p className="empty-state">{t('history.empty')}</p>
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
                {t(filter.labelKey)}
                <span>{filterCounts[filter.value]}</span>
              </button>
            ))}
          </div>
        ) : null}

        {!isLoading && !error && recipes.length > 0 && filteredRecipes.length === 0 ? (
          <p className="empty-state">{t('history.emptyFilter')}</p>
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
                  {formatRecipeStatus(recipe, language, t)}
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
