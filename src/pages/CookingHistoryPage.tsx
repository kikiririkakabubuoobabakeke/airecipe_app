import { useEffect, useMemo, useRef, useState } from 'react'
import { deleteSavedRecipe, fetchSavedRecipes } from '../lib/recipeApi'
import { getCache, setCache } from '../lib/dataCache'
import { useI18n } from '../lib/useI18n'
import type { TranslateFn } from '../lib/i18n'
import type { AppDestination, Recipe } from '../types/ui'

type CookingHistoryPageProps = {
  onNavigate?: (page: AppDestination) => void
  onSelectRecipe: (recipe: Recipe) => void
  onLogout?: () => void | Promise<void>
  initialFilter?: RecipeFilter
}

export type RecipeFilter = 'all' | 'uncooked' | 'cooked' | 'favorite'
type RecipeSortMode = 'createdDesc' | 'createdAsc' | 'cookedDesc' | 'nameAsc'

const recipeFilters: Array<{
  labelKey: Parameters<TranslateFn>[0]
  value: RecipeFilter
}> = [
  { labelKey: 'history.filter.all', value: 'all' },
  { labelKey: 'history.filter.uncooked', value: 'uncooked' },
  { labelKey: 'history.filter.cooked', value: 'cooked' },
  { labelKey: 'history.filter.favorite', value: 'favorite' },
]

function getRecipeId(recipe: Recipe) {
  return recipe.recipeId ?? ''
}

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
  initialFilter = 'all',
}: CookingHistoryPageProps) {
  const { language, t } = useI18n()
  const [recipes, setRecipes] = useState<Recipe[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState('')
  const [retryCount, setRetryCount] = useState(0)
  const [activeFilter, setActiveFilter] = useState<RecipeFilter>(initialFilter)
  const [searchQuery, setSearchQuery] = useState('')
  const [activeTag, setActiveTag] = useState('')
  const [sortMode, setSortMode] = useState<RecipeSortMode>('createdDesc')
  const [isSelectionMode, setIsSelectionMode] = useState(false)
  const [selectedRecipeIds, setSelectedRecipeIds] = useState<Set<string>>(
    () => new Set(),
  )
  const [deleteConfirmIds, setDeleteConfirmIds] = useState<string[] | null>(null)
  const [toastMessage, setToastMessage] = useState('')
  const [isDeleting, setIsDeleting] = useState(false)
  const toastTimerRef = useRef<number | null>(null)
  const filteredRecipes = useMemo(
    () => {
      const normalizedSearch = searchQuery.trim().toLocaleLowerCase()
      const normalizedActiveTag = activeTag.trim().toLocaleLowerCase()

      return recipes
        .filter((recipe) => {
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
        })
        .filter((recipe) => {
          if (!normalizedActiveTag) {
            return true
          }

          return (recipe.tags ?? []).some(
            (tag) => tag.trim().toLocaleLowerCase() === normalizedActiveTag,
          )
        })
        .filter((recipe) => {
          if (!normalizedSearch) {
            return true
          }

          return [
            recipe.name,
            recipe.meta,
            recipe.difficulty ?? '',
            recipe.reason ?? '',
            ...(recipe.tags ?? []),
            ...(recipe.ingredients ?? []).map((ingredient) => ingredient.name),
          ]
            .join(' ')
            .toLocaleLowerCase()
            .includes(normalizedSearch)
        })
        .toSorted((left, right) => {
          if (sortMode === 'nameAsc') {
            return left.name.localeCompare(right.name, language)
          }

          const leftCreated = new Date(left.createdAt ?? '').getTime() || 0
          const rightCreated = new Date(right.createdAt ?? '').getTime() || 0
          const leftCooked = new Date(left.cookedAt ?? '').getTime() || 0
          const rightCooked = new Date(right.cookedAt ?? '').getTime() || 0

          if (sortMode === 'createdAsc') {
            return leftCreated - rightCreated
          }

          if (sortMode === 'cookedDesc') {
            return rightCooked - leftCooked || rightCreated - leftCreated
          }

          return rightCreated - leftCreated
        })
    },
    [activeFilter, activeTag, language, recipes, searchQuery, sortMode],
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
  const selectedCount = selectedRecipeIds.size
  const isFilterActive =
    activeFilter !== 'all' ||
    activeTag.trim() !== '' ||
    searchQuery.trim() !== '' ||
    sortMode !== 'createdDesc'

  useEffect(() => {
    let isMounted = true
    const cacheKey = `cooking-history:${language}`

    const cached = getCache<Recipe[]>(cacheKey)
    if (cached) {
      queueMicrotask(() => {
        if (isMounted) {
          setRecipes(cached)
          setIsLoading(false)
        }
      })
    }

    fetchSavedRecipes(language)
      .then((result) => {
        if (isMounted) {
          setCache(cacheKey, result.recipes)
          setRecipes(result.recipes)
          setError('')
          setIsLoading(false)
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
          setIsLoading(false)
        }
      })

    return () => {
      isMounted = false
    }
  }, [language, retryCount, t])

  useEffect(() => {
    return () => {
      if (toastTimerRef.current !== null) {
        window.clearTimeout(toastTimerRef.current)
      }
    }
  }, [])

  function showToast(message: string) {
    if (toastTimerRef.current !== null) {
      window.clearTimeout(toastTimerRef.current)
    }

    setToastMessage(message)
    toastTimerRef.current = window.setTimeout(() => {
      setToastMessage('')
      toastTimerRef.current = null
    }, 2600)
  }

  function clearFilters() {
    setActiveFilter('all')
    setActiveTag('')
    setSearchQuery('')
    setSortMode('createdDesc')
  }

  function handleTagFilter(tag: string) {
    const nextTag = tag.trim()

    if (!nextTag) {
      return
    }

    setActiveTag(nextTag)
    setActiveFilter('all')
    setSearchQuery('')
  }

  function isTagActive(tag: string) {
    return (
      activeTag.trim().toLocaleLowerCase() === tag.trim().toLocaleLowerCase()
    )
  }

  function toggleRecipeSelection(recipeId: string) {
    if (!recipeId) {
      return
    }

    setSelectedRecipeIds((current) => {
      const next = new Set(current)

      if (next.has(recipeId)) {
        next.delete(recipeId)
      } else {
        next.add(recipeId)
      }

      if (next.size === 0) {
        setIsSelectionMode(false)
      }

      return next
    })
  }

  function exitSelectionMode() {
    setSelectedRecipeIds(new Set())
    setIsSelectionMode(false)
  }

  function handleCardAction(recipe: Recipe) {
    const recipeId = getRecipeId(recipe)

    if (isSelectionMode) {
      toggleRecipeSelection(recipeId)
      return
    }

    onSelectRecipe(recipe)
  }

  async function executeDeleteRecipes(recipeIds: string[]) {
    const uniqueIds = Array.from(new Set(recipeIds)).filter(Boolean)

    if (!uniqueIds.length) {
      showToast(t('history.delete.none'))
      return
    }

    setIsDeleting(true)
    setError('')

    try {
      let latestRecipes = recipes

      for (const recipeId of uniqueIds) {
        const result = await deleteSavedRecipe(recipeId, language)
        latestRecipes = result.recipes
      }

      setCache(`cooking-history:${language}`, latestRecipes)
      setRecipes(latestRecipes)
      setSelectedRecipeIds(new Set())
      setIsSelectionMode(false)
      setDeleteConfirmIds(null)
      showToast(t('history.delete.deletedCount', { count: uniqueIds.length }))
    } catch (deleteError) {
      setError(
        deleteError instanceof Error
          ? deleteError.message
          : t('history.delete.failed'),
      )
      setDeleteConfirmIds(null)
    } finally {
      setIsDeleting(false)
    }
  }

  return (
    <>
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
          <div className="fridge-loading">
            <div className="loading-spinner" />
            <p>{t('history.loading')}</p>
          </div>
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
          <div className="content-appear">
            <div className="history-tool-panel">
              <label className="history-search-field">
                <span>{t('history.search.label')}</span>
                <input
                  type="search"
                  value={searchQuery}
                  placeholder={t('history.search.placeholder')}
                  onChange={(event) => setSearchQuery(event.target.value)}
                />
              </label>

              <label className="history-sort-field">
                <span>{t('history.sort.label')}</span>
                <select
                  value={sortMode}
                  onChange={(event) =>
                    setSortMode(event.target.value as RecipeSortMode)
                  }
                >
                  <option value="createdDesc">{t('history.sort.createdDesc')}</option>
                  <option value="createdAsc">{t('history.sort.createdAsc')}</option>
                  <option value="cookedDesc">{t('history.sort.cookedDesc')}</option>
                  <option value="nameAsc">{t('history.sort.nameAsc')}</option>
                </select>
              </label>

              <div className="history-actions">
                {isFilterActive ? (
                  <button
                    type="button"
                    className="secondary-button"
                    onClick={clearFilters}
                  >
                    {t('history.filter.clear')}
                  </button>
                ) : null}
                {isSelectionMode ? (
                  <>
                    <button
                      type="button"
                      className="secondary-button danger-button"
                      disabled={selectedCount === 0 || isDeleting}
                      onClick={() =>
                        setDeleteConfirmIds(Array.from(selectedRecipeIds))
                      }
                    >
                      {t('history.selection.deleteSelected', {
                        count: selectedCount,
                      })}
                    </button>
                    <button
                      type="button"
                      className="secondary-button"
                      onClick={exitSelectionMode}
                    >
                      {t('history.selection.cancel')}
                    </button>
                  </>
                ) : (
                  <button
                    type="button"
                    className="secondary-button"
                    onClick={() => setIsSelectionMode(true)}
                  >
                    {t('history.selection.start')}
                  </button>
                )}
              </div>
            </div>

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

            {activeTag ? (
              <div className="history-active-tag" role="status">
                <span>
                  {t('history.tagFilter.label')}: {activeTag}
                </span>
                <button
                  type="button"
                  className="history-tag-clear"
                  onClick={() => setActiveTag('')}
                >
                  {t('history.tagFilter.clear')}
                </button>
              </div>
            ) : null}

            {filteredRecipes.length === 0 ? (
              <p className="empty-state">{t('history.emptyFilter')}</p>
            ) : (
              <div className="history-list card-stagger">
                {filteredRecipes.map((recipe) => (
                  <article
                    key={getRecipeId(recipe)}
                    className={`history-card ${
                      selectedRecipeIds.has(getRecipeId(recipe)) ? 'selected' : ''
                    }`}
                  >
                    {isSelectionMode ? (
                      <label className="history-select-box">
                        <input
                          type="checkbox"
                          checked={selectedRecipeIds.has(getRecipeId(recipe))}
                          onChange={() => toggleRecipeSelection(getRecipeId(recipe))}
                        />
                        <span>{t('history.selection.item')}</span>
                      </label>
                    ) : null}
                    <div className="history-card-main">
                      <button
                        type="button"
                        className="history-card-open"
                        onClick={() => handleCardAction(recipe)}
                      >
                        <div>
                          <span className="status-pill">
                            {formatRecipeStatus(recipe, language, t)}
                          </span>
                          <h2>{recipe.name}</h2>
                          <p>{recipe.meta}</p>
                        </div>
                      </button>
                      {recipe.tags?.length ? (
                        <div className="tag-row history-card-tags">
                          {recipe.tags.map((tag, index) => (
                            <button
                              key={`${tag}-${index}`}
                              type="button"
                              className={`history-tag-button ${
                                isTagActive(tag) ? 'is-active' : ''
                              }`}
                              onClick={() => handleTagFilter(tag)}
                            >
                              {tag}
                            </button>
                          ))}
                        </div>
                      ) : null}
                    </div>
                    <div className="history-card-actions">
                      <button
                        type="button"
                        className="danger-text-button"
                        disabled={isDeleting || !getRecipeId(recipe)}
                        onClick={() => setDeleteConfirmIds([getRecipeId(recipe)])}
                      >
                        {t('common.delete')}
                      </button>
                    </div>
                  </article>
                ))}
              </div>
            )}
          </div>
        ) : null}
      </main>

      {toastMessage ? (
        <div className="toast-message" role="status">
          {toastMessage}
        </div>
      ) : null}

      {deleteConfirmIds ? (
        <div className="modal-backdrop" role="presentation">
          <section
            className="cook-modal history-delete-modal"
            aria-labelledby="history-delete-title"
            aria-modal="true"
            role="dialog"
          >
            <p className="eyebrow">{t('common.delete')}</p>
            <h2 id="history-delete-title">{t('history.delete.title')}</h2>
            <p>
              {t('history.delete.confirm', {
                count: deleteConfirmIds.length,
              })}
            </p>
            <div className="modal-actions">
              <button
                type="button"
                className="secondary-button"
                disabled={isDeleting}
                onClick={() => setDeleteConfirmIds(null)}
              >
                {t('common.cancel')}
              </button>
              <button
                type="button"
                className="secondary-button danger-button"
                disabled={isDeleting}
                onClick={() => {
                  void executeDeleteRecipes(deleteConfirmIds)
                }}
              >
                {isDeleting ? t('common.deleting') : t('common.delete')}
              </button>
            </div>
          </section>
        </div>
      ) : null}
    </>
  )
}
