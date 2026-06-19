import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react'
import { Icon } from '../components/Icon'
import { RecipesPanel } from '../components/RecipesPanel'
import { getCache, setCache } from '../lib/dataCache'
import {
  fetchInventory,
  fetchSavedRecipes,
  generateRecipes,
} from '../lib/recipeApi'
import { getRecipeModelDisplayName } from '../lib/recipeModelLabel'
import { defaultPreferences, fetchPreferences } from '../lib/preferencesApi'
import { useI18n } from '../lib/useI18n'
import type {
  AppDestination,
  Ingredient,
  Recipe,
  UserPreferences,
} from '../types/ui'

type RecipeGeneratePageProps = {
  onNavigate?: (page: AppDestination) => void
  onSelectRecipe?: (recipe: Recipe) => void
  onLogout?: () => void | Promise<void>
}

function formatIngredientAmount(
  ingredient: Ingredient,
  language: string,
  stockAvailable: string,
) {
  const parts: string[] = []

  if (ingredient.quantity && ingredient.quantity > 0) {
    parts.push(`${ingredient.quantity}${language === 'ja' ? '個' : ' pc(s)'}`)
  }

  if (ingredient.gram && ingredient.gram > 0) {
    parts.push(`${ingredient.gram}g`)
  }

  return parts.join(' / ') || ingredient.amount || stockAvailable
}

export function RecipeGeneratePage({
  onNavigate,
  onSelectRecipe,
}: RecipeGeneratePageProps) {
  const { language, t } = useI18n()
  const [ingredients, setIngredients] = useState<Ingredient[]>(() => {
    const cacheKey = `recipe-generate:${language}`
    const cached = getCache<{
      ingredients: Ingredient[]
      recipes: Recipe[]
      preferences: UserPreferences
    }>(cacheKey)
    return cached?.ingredients ?? []
  })
  const [recipes, setRecipes] = useState<Recipe[]>(() => {
    const cacheKey = `recipe-generate:${language}`
    const cached = getCache<{
      ingredients: Ingredient[]
      recipes: Recipe[]
      preferences: UserPreferences
    }>(cacheKey)
    return cached?.recipes ?? []
  })
  const [preferences, setPreferences] = useState<UserPreferences>(() => {
    const cacheKey = `recipe-generate:${language}`
    const cached = getCache<{
      ingredients: Ingredient[]
      recipes: Recipe[]
      preferences: UserPreferences
    }>(cacheKey)
    return cached?.preferences ?? defaultPreferences
  })
  const [servings, setServings] = useState(() => {
    const cacheKey = `recipe-generate:${language}`
    const cached = getCache<{
      ingredients: Ingredient[]
      recipes: Recipe[]
      preferences: UserPreferences
    }>(cacheKey)
    return cached?.preferences.defaultServings ?? defaultPreferences.defaultServings
  })
  const [isLoading, setIsLoading] = useState(() => {
    const cacheKey = `recipe-generate:${language}`
    const cached = getCache<{
      ingredients: Ingredient[]
      recipes: Recipe[]
      preferences: UserPreferences
    }>(cacheKey)
    return !cached
  })

  const [prevLanguage, setPrevLanguage] = useState(language)
  if (language !== prevLanguage) {
    setPrevLanguage(language)
    const cacheKey = `recipe-generate:${language}`
    const cached = getCache<{
      ingredients: Ingredient[]
      recipes: Recipe[]
      preferences: UserPreferences
    }>(cacheKey)
    if (cached) {
      setIngredients(cached.ingredients)
      setRecipes(cached.recipes)
      setPreferences(cached.preferences)
      setServings(cached.preferences.defaultServings)
      setIsLoading(false)
    } else {
      setIngredients([])
      setRecipes([])
      setPreferences(defaultPreferences)
      setServings(defaultPreferences.defaultServings)
      setIsLoading(true)
    }
  }

  const [cookingRequest, setCookingRequest] = useState('')
  const [statusMessage, setStatusMessage] = useState('')
  const [toastMessage, setToastMessage] = useState('')
  const [isGenerating, setIsGenerating] = useState(false)
  const toastTimerRef = useRef<number | null>(null)
  const [prevLoadLanguage, setPrevLoadLanguage] = useState<string | null>(null)

  if (prevLoadLanguage !== language) {
    setPrevLoadLanguage(language)
    const cachedGenerate = getCache<{
      ingredients: Ingredient[]
      recipes: Recipe[]
      preferences: UserPreferences
    }>(`recipe-generate:${language}`)
    if (cachedGenerate) {
      setIngredients(cachedGenerate.ingredients)
      setRecipes(cachedGenerate.recipes)
      setPreferences(cachedGenerate.preferences)
      setServings(cachedGenerate.preferences.defaultServings)
      setIsLoading(false)
    }
  }

  const visibleIngredients = useMemo(
    () => ingredients.slice(0, 12),
    [ingredients],
  )

  useEffect(() => {
    let isMounted = true
    const cacheKey = `recipe-generate:${language}`

    const cached = getCache<{
      ingredients: Ingredient[]
      recipes: Recipe[]
      preferences: UserPreferences
    }>(cacheKey)

    async function loadPageData() {
      setIsLoading(!cached)

      try {
        const [inventoryResult, recipesResult, preferencesResult] =
          await Promise.all([
            fetchInventory(language),
            fetchSavedRecipes(language),
            fetchPreferences(),
          ])

        if (!isMounted) {
          return
        }

        setCache(cacheKey, {
          ingredients: inventoryResult.inventory,
          recipes: recipesResult.recipes,
          preferences: preferencesResult.preferences,
        })
        setIngredients(inventoryResult.inventory)
        setRecipes(recipesResult.recipes)
        setPreferences(preferencesResult.preferences)
        setServings(preferencesResult.preferences.defaultServings)
        setIsLoading(false)
      } catch (error) {
        if (isMounted) {
          setStatusMessage(
            error instanceof Error
              ? error.message
              : t('recipeGenerate.loadFailed'),
          )
          setIsLoading(false)
        }
      }
    }

    void loadPageData()

    return () => {
      isMounted = false
    }
  }, [language, t])

  useEffect(() => {
    function handlePreferencesUpdated(event: Event) {
      const nextPreferences = (
        event as CustomEvent<{ preferences?: UserPreferences }>
      ).detail?.preferences

      if (!nextPreferences) {
        return
      }

      setPreferences(nextPreferences)
      setServings(nextPreferences.defaultServings)
    }

    window.addEventListener('preferences-updated', handlePreferencesUpdated)

    return () => {
      window.removeEventListener('preferences-updated', handlePreferencesUpdated)
    }
  }, [])

  useEffect(() => {
    return () => {
      if (toastTimerRef.current !== null) {
        window.clearTimeout(toastTimerRef.current)
        toastTimerRef.current = null
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
    }, 2400)
  }

  async function handleGenerate(event?: FormEvent<HTMLFormElement>) {
    event?.preventDefault()

    if (!ingredients.length) {
      setStatusMessage(t('recipeGenerate.generateEmpty'))
      return
    }

    setIsGenerating(true)
    setStatusMessage('')

    try {
      const result = await generateRecipes(
        servings,
        language,
        preferences.avoidedIngredients,
        cookingRequest,
        preferences.seasoningMode,
      )

      setRecipes(result.recipes)
      showToast(
        t('recipeGenerate.generatedByModel', {
          model: getRecipeModelDisplayName(result.modelProvider),
        }),
      )
      setIsGenerating(false)
    } catch (error) {
      setStatusMessage(
        error instanceof Error ? error.message : t('recipeGenerate.generateFailed'),
      )
      setIsGenerating(false)
    }
  }

  return (
    <>
      <main className="recipe-generate-page">
        <div className="fridge-header">
          <div>
            <p className="eyebrow">{t('recipeGenerate.eyebrow')}</p>
            <h1>{t('recipeGenerate.title')}</h1>
            <p className="recipe-generate-page__lead">
              {t('recipeGenerate.lead')}
            </p>
          </div>
          <button
            type="button"
            className="secondary-button back-home-button"
            onClick={() => onNavigate?.('home')}
          >
            <div style={{ transform: 'scaleX(-1)', display: 'inline-flex' }}>
              <Icon name="arrow" />
            </div>
            <span>{t('common.backHome')}</span>
          </button>
        </div>

        {statusMessage ? (
          <p className="status-message" role="status">
            {statusMessage}
          </p>
        ) : null}

        {isLoading ? (
          <div className="fridge-loading">
            <div className="loading-spinner" />
            <p>{t('common.loading')}</p>
          </div>
        ) : (
          <div className="content-appear">
            <section className="recipe-generate-layout">
              <form className="panel recipe-prompt-panel" onSubmit={handleGenerate}>
            <div className="section-heading">
              <div>
                <p className="eyebrow">{t('recipeGenerate.conditionEyebrow')}</p>
                <h2>{t('recipeGenerate.conditionTitle')}</h2>
              </div>
            </div>

            <label className="recipe-prompt-field">
              <span>{t('recipeGenerate.requestLabel')}</span>
              <textarea
                value={cookingRequest}
                onChange={(event) => setCookingRequest(event.target.value)}
                placeholder={t('recipeGenerate.requestPlaceholder')}
              />
            </label>

            <label className="recipe-servings-field">
              <span>{t('recipeGenerate.servingsLabel')}</span>
              <input
                type="number"
                min="1"
                max="12"
                value={servings}
                onChange={(event) =>
                  setServings(Math.max(1, Number(event.target.value) || 1))
                }
              />
            </label>

            <button
              type="submit"
              className="primary-button"
              disabled={isGenerating || isLoading}
            >
              {isGenerating
                ? t('recipeGenerate.generating')
                : t('recipeGenerate.submit')}
              <Icon name="spark" />
            </button>
          </form>

          <aside className="panel recipe-inventory-panel">
            <div className="section-heading">
              <div>
                <p className="eyebrow">{t('recipeGenerate.inventoryEyebrow')}</p>
                <h2>{t('recipeGenerate.inventoryTitle')}</h2>
              </div>
              <button
                type="button"
                className="small-button"
                onClick={() => onNavigate?.('ingredient-register')}
              >
                {t('recipeGenerate.register')}
              </button>
            </div>

            {visibleIngredients.length ? (
              <div className="recipe-inventory-list">
                {visibleIngredients.map((ingredient, index) => (
                  <span
                    key={ingredient.inventoryId ?? `${ingredient.name}-${index}`}
                    className="recipe-inventory-chip"
                  >
                    <strong>{ingredient.name}</strong>
                    <small>
                      {formatIngredientAmount(
                        ingredient,
                        language,
                        t('recipeGenerate.stockAvailable'),
                      )}
                    </small>
                  </span>
                ))}
              </div>
            ) : (
              <p className="empty-text">
                {t('recipeGenerate.emptyInventory')}
              </p>
            )}
          </aside>
        </section>

        <RecipesPanel
          recipes={recipes}
          isGenerating={isGenerating}
          onGenerateRecipe={() => void handleGenerate()}
          onSelectRecipe={onSelectRecipe}
        />
          </div>
        )}
      </main>

      {toastMessage ? (
        <div className="toast-message" role="status">
          {toastMessage}
        </div>
      ) : null}
    </>
  )
}
