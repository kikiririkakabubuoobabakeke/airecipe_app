import { useEffect, useMemo, useRef, useState } from 'react'
import { FeatureCard } from '../components/FeatureCard'
import { HeroPanel } from '../components/HeroPanel'
import { IngredientsPanel } from '../components/IngredientsPanel'
import { RecipesPanel } from '../components/RecipesPanel'
import { SummaryGrid } from '../components/SummaryGrid'
import { getSecondaryFeatures } from '../data/home'
import { getCache, setCache } from '../lib/dataCache'
import type { TranslateFn } from '../lib/i18n'
import { useI18n } from '../lib/useI18n'
import {
  fetchInventory,
  fetchSavedRecipes,
  generateRecipes,
  markRecipeCooked,
} from '../lib/recipeApi'
import { getRecipeModelDisplayName } from '../lib/recipeModelLabel'
import {
  defaultPreferences,
  fetchPreferences,
} from '../lib/preferencesApi'
import type {
  AppDestination,
  Ingredient,
  Recipe,
  UserPreferences,
} from '../types/ui'

type HomePageProps = {
  onNavigate?: (page: AppDestination) => void
  onSelectRecipe?: (recipe: Recipe) => void
  onLogout?: () => void | Promise<void>
  onShowFavorites?: () => void
}

type HomeData = {
  ingredients: Ingredient[]
  recipes: Recipe[]
  preferences: UserPreferences
}

type HomeLoadingState = {
  ingredients: boolean
  recipes: boolean
  preferences: boolean
}

function isNearExpiration(ingredient: Ingredient, leadDays = 3) {
  if (!ingredient.expirationDate) {
    return false
  }

  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const expiration = new Date(`${ingredient.expirationDate}T00:00:00`)

  if (Number.isNaN(expiration.getTime())) {
    return false
  }

  const diffDays = Math.ceil(
    (expiration.getTime() - today.getTime()) / (1000 * 60 * 60 * 24),
  )

  return diffDays >= 0 && diffDays <= leadDays
}

function buildSummaryItems(
  ingredients: Ingredient[],
  recipes: Recipe[],
  preferences: UserPreferences,
  t: TranslateFn,
  loadingState: HomeLoadingState,
) {
  const leadDays = preferences.notifications.expiration
    ? preferences.notifications.expirationLeadDays
    : 0
  const nearExpirationCount =
    leadDays > 0
      ? ingredients.filter((ingredient) =>
          isNearExpiration(ingredient, leadDays),
        ).length
      : 0
  const favoriteCount = recipes.filter((recipe) => recipe.isFavorite).length

  return [
    {
      label: t('home.summary.ingredientsLabel'),
      value: String(ingredients.length),
      note: ingredients.length
        ? t('home.summary.ingredientsNote')
        : t('home.summary.ingredientsEmptyNote'),
      isLoading: loadingState.ingredients,
    },
    {
      label: t('home.summary.nearExpirationLabel'),
      value: String(nearExpirationCount),
      note:
        nearExpirationCount > 0
          ? t('home.summary.nearExpirationNote', { days: leadDays })
          : t('home.summary.nearExpirationEmptyNote'),
      isLoading: loadingState.ingredients || loadingState.preferences,
    },
    {
      label: t('home.summary.recipesLabel'),
      value: String(recipes.length),
      note: recipes.length
        ? t('home.summary.recipesNote')
        : t('home.summary.recipesEmptyNote'),
      isLoading: loadingState.recipes,
    },
    {
      label: t('home.summary.favoritesLabel'),
      value: String(favoriteCount),
      note: t('home.summary.favoritesNote'),
      isLoading: loadingState.recipes,
    },
  ]
}

export function HomePage({
  onNavigate,
  onSelectRecipe,
}: HomePageProps) {
  const { language, t } = useI18n()
  const [ingredients, setIngredients] = useState<Ingredient[]>(() => {
    const cacheKey = `home:${language}`
    const cached = getCache<HomeData>(cacheKey)
    return cached?.ingredients ?? []
  })
  const [recipes, setRecipes] = useState<Recipe[]>(() => {
    const cacheKey = `home:${language}`
    const cached = getCache<HomeData>(cacheKey)
    return cached?.recipes ?? []
  })
  const [preferences, setPreferences] = useState<UserPreferences>(() => {
    const cacheKey = `home:${language}`
    const cached = getCache<HomeData>(cacheKey)
    return cached?.preferences ?? defaultPreferences
  })
  const [loadingState, setLoadingState] = useState<HomeLoadingState>(() => {
    const cacheKey = `home:${language}`
    const cached = getCache<HomeData>(cacheKey)
    return {
      ingredients: !cached,
      recipes: !cached,
      preferences: !cached,
    }
  })

  const [prevLanguage, setPrevLanguage] = useState(language)
  if (language !== prevLanguage) {
    setPrevLanguage(language)
    const cacheKey = `home:${language}`
    const cached = getCache<HomeData>(cacheKey)
    if (cached) {
      setIngredients(cached.ingredients)
      setRecipes(cached.recipes)
      setPreferences(cached.preferences)
      setLoadingState({
        ingredients: false,
        recipes: false,
        preferences: false,
      })
    } else {
      setIngredients([])
      setRecipes([])
      setPreferences(defaultPreferences)
      setLoadingState({
        ingredients: true,
        recipes: true,
        preferences: true,
      })
    }
  }

  const [isGenerating, setIsGenerating] = useState(false)
  const [isCooking, setIsCooking] = useState(false)
  const [statusMessage, setStatusMessage] = useState('')
  const [toastMessage, setToastMessage] = useState('')
  const [cookingRecipe, setCookingRecipe] = useState<Recipe | null>(null)
  const [servings, setServings] = useState(1)
  const toastTimerRef = useRef<number | null>(null)
  const [prevLoadLanguage, setPrevLoadLanguage] = useState<string | null>(null)

  if (prevLoadLanguage !== language) {
    setPrevLoadLanguage(language)
    const cachedHome = getCache<HomeData>(`home:${language}`)
    if (cachedHome) {
      setIngredients(cachedHome.ingredients)
      setRecipes(cachedHome.recipes)
      setPreferences(cachedHome.preferences)
      setLoadingState({
        ingredients: false,
        recipes: false,
        preferences: false,
      })
    } else {
      setIngredients([])
      setRecipes([])
      setPreferences(defaultPreferences)
      setLoadingState({
        ingredients: true,
        recipes: true,
        preferences: true,
      })
    }
  }

  const secondaryFeatures = useMemo(() => getSecondaryFeatures(t), [t])
  const currentSummaryItems = useMemo(
    () => buildSummaryItems(ingredients, recipes, preferences, t, loadingState),
    [ingredients, loadingState, preferences, recipes, t],
  )

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

  useEffect(() => {
    let isMounted = true
    const cacheKey = `home:${language}`

    const cached = getCache<HomeData>(cacheKey)
    let nextIngredients = cached?.ingredients ?? []
    let nextRecipes = cached?.recipes ?? []
    let nextPreferences = cached?.preferences ?? defaultPreferences

    const inventoryRequest = fetchInventory(language)
      .then((result) => {
        nextIngredients = result.inventory
        setCache(`inventory:${language}`, result.inventory)
        if (isMounted) {
          setIngredients(result.inventory)
        }
      })
      .catch((error) => {
        console.warn('[vite] Inventory fetch failed:', error)
        if (isMounted) {
          const innerCached = getCache<HomeData>(cacheKey)
          if (!innerCached) {
            setStatusMessage(
              error instanceof Error
                ? error.message
                : t('home.status.inventoryFetchFailed'),
            )
          }
        }
      })
      .finally(() => {
        if (isMounted) {
          setLoadingState((current) => ({
            ...current,
            ingredients: false,
          }))
        }
      })

    const recipesRequest = fetchSavedRecipes(language)
      .then((result) => {
        nextRecipes = result.recipes
        setCache(`cooking-history:${language}`, result.recipes)
        if (isMounted) {
          setRecipes(result.recipes)
        }
      })
      .catch((error) => {
        console.warn('[vite] Saved recipes fetch failed:', error)
      })
      .finally(() => {
        if (isMounted) {
          setLoadingState((current) => ({
            ...current,
            recipes: false,
          }))
        }
      })

    const preferencesRequest = fetchPreferences()
      .then((result) => {
        nextPreferences = result.preferences
        if (isMounted) {
          setPreferences(result.preferences)
        }
      })
      .catch((error) => {
        console.warn('[vite] Preferences fetch failed:', error)
      })
      .finally(() => {
        if (isMounted) {
          setLoadingState((current) => ({
            ...current,
            preferences: false,
          }))
        }
      })

    void Promise.all([inventoryRequest, recipesRequest, preferencesRequest]).then(
      () => {
        setCache(cacheKey, {
          ingredients: nextIngredients,
          recipes: nextRecipes,
          preferences: nextPreferences,
        })
        setCache(`recipe-generate:${language}`, {
          ingredients: nextIngredients,
          recipes: nextRecipes,
          preferences: nextPreferences,
        })
      },
    )

    return () => {
      isMounted = false
    }
  }, [language, t])

  useEffect(() => {
    let isMounted = true

    function handlePreferencesUpdated(event: Event) {
      const nextPreferences = (
        event as CustomEvent<{ preferences?: UserPreferences }>
      ).detail?.preferences

      if (nextPreferences) {
        setPreferences(nextPreferences)
        return
      }

      void fetchPreferences()
        .then((result) => {
          if (isMounted) {
            setPreferences(result.preferences)
          }
        })
        .catch((error) => {
          console.warn('[vite] Preferences refresh failed:', error)
        })
    }

    window.addEventListener('preferences-updated', handlePreferencesUpdated)

    return () => {
      isMounted = false
      window.removeEventListener('preferences-updated', handlePreferencesUpdated)
    }
  }, [])

  async function handleGenerateRecipe() {
    if (!ingredients.length) {
      setStatusMessage(t('home.status.generateEmpty'))
      return
    }

    setIsGenerating(true)
    setStatusMessage('')

    try {
      const result = await generateRecipes(
        preferences.defaultServings,
        language,
        preferences.avoidedIngredients,
        undefined,
        preferences.seasoningMode,
      )

      if (result.recipes.length) {
        setRecipes(result.recipes)
        showToast(
          t('recipeGenerate.generatedByModel', {
            model: getRecipeModelDisplayName(result.modelProvider),
          }),
        )
      }
      setIsGenerating(false)
    } catch (error) {
      console.error('[vite] Recipe generation failed:', error)
      setStatusMessage(
        error instanceof Error ? error.message : t('home.status.generateFailed'),
      )
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
      const result = await markRecipeCooked(
        cookingRecipe.recipeId,
        servings,
        language,
      )
      setIngredients(result.inventory)
      setStatusMessage(t('home.status.cookingUpdated', { servings }))
      setCookingRecipe(null)
      setIsCooking(false)
    } catch (error) {
      console.error('[vite] Cooking update failed:', error)
      setStatusMessage(
        error instanceof Error
          ? error.message
          : t('home.status.inventoryUpdateFailed'),
      )
      setIsCooking(false)
    }
  }

  return (
    <>
      <main className="home">
        <HeroPanel
          isGenerating={isGenerating}
          onGenerateRecipe={() => onNavigate?.('recipe-generate')}
          onAddIngredient={() => onNavigate?.('fridge')}
          onScanReceipt={() => onNavigate?.('ingredient-register')}
          onShowRecipes={() => onNavigate?.('history')}
        />

        {statusMessage ? (
          <p className="status-message" role="status">
            {statusMessage}
          </p>
        ) : null}

        <div className="content-appear">
          <SummaryGrid items={currentSummaryItems} />

          <div className="dashboard-grid">
            <IngredientsPanel
              ingredients={ingredients}
              isLoading={loadingState.ingredients}
              onAddIngredient={() => onNavigate?.('ingredient-register')}
            />
            <RecipesPanel
              recipes={recipes}
              isLoading={loadingState.recipes}
              isGenerating={isGenerating}
              onGenerateRecipe={handleGenerateRecipe}
              onSelectRecipe={onSelectRecipe}
              onCookRecipe={openCookedDialog}
            />
          </div>
        </div>

        <section
          className="secondary-section"
          id="shopping"
          aria-label={t('home.secondaryLabel')}
        >
          <div className="secondary-grid">
            {secondaryFeatures.map((feature) => (
              <FeatureCard
                key={feature.title}
                feature={feature}
                onAction={
                  feature.icon === 'settings'
                    ? () => onNavigate?.('settings')
                    : feature.icon === 'list'
                      ? () => onNavigate?.('shopping-list')
                      : feature.icon === 'message'
                        ? () => onNavigate?.('contact')
                        : undefined
                }
              />
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
            <p className="eyebrow">{t('home.modal.cooked')}</p>
            <h2 id="cook-modal-title">{cookingRecipe.name}</h2>
            <label className="serving-field">
              <span>{t('home.modal.servingsQuestion')}</span>
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
                {t('home.modal.cancel')}
              </button>
              <button
                type="button"
                className="primary-button"
                onClick={handleConfirmCooked}
                disabled={isCooking}
              >
                {isCooking
                  ? t('home.modal.updating')
                  : t('home.modal.reduceInventory')}
              </button>
            </div>
          </section>
        </div>
      ) : null}

      {toastMessage ? (
        <div className="toast-message" role="status">
          {toastMessage}
        </div>
      ) : null}
    </>
  )
}
