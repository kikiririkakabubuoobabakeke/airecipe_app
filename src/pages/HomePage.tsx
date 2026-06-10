import { useEffect, useMemo, useState } from 'react'
import { FeatureCard } from '../components/FeatureCard'
import { HeroPanel } from '../components/HeroPanel'
import { IngredientsPanel } from '../components/IngredientsPanel'
import { RecipesPanel } from '../components/RecipesPanel'
import { SummaryGrid } from '../components/SummaryGrid'
import { Topbar } from '../components/Topbar'
import { getSecondaryFeatures } from '../data/home'
import type { TranslateFn } from '../lib/i18n'
import { useI18n } from '../lib/useI18n'
import {
  fetchInventory,
  fetchSavedRecipes,
  generateRecipes,
  markRecipeCooked,
} from '../lib/recipeApi'
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
    },
    {
      label: t('home.summary.nearExpirationLabel'),
      value: String(nearExpirationCount),
      note:
        nearExpirationCount > 0
          ? t('home.summary.nearExpirationNote', { days: leadDays })
          : t('home.summary.nearExpirationEmptyNote'),
    },
    {
      label: t('home.summary.recipesLabel'),
      value: String(recipes.length),
      note: recipes.length
        ? t('home.summary.recipesNote')
        : t('home.summary.recipesEmptyNote'),
    },
    {
      label: t('home.summary.favoritesLabel'),
      value: String(favoriteCount),
      note: t('home.summary.favoritesNote'),
    },
  ]
}

export function HomePage({
  onNavigate,
  onSelectRecipe,
  onLogout,
  onShowFavorites,
}: HomePageProps) {
  const { language, t } = useI18n()
  const [ingredients, setIngredients] = useState<Ingredient[]>([])
  const [recipes, setRecipes] = useState<Recipe[]>([])
  const [isGenerating, setIsGenerating] = useState(false)
  const [isCooking, setIsCooking] = useState(false)
  const [statusMessage, setStatusMessage] = useState('')
  const [cookingRecipe, setCookingRecipe] = useState<Recipe | null>(null)
  const [servings, setServings] = useState(1)
  const [preferences, setPreferences] =
    useState<UserPreferences>(defaultPreferences)
  const secondaryFeatures = useMemo(() => getSecondaryFeatures(t), [t])
  const currentSummaryItems = useMemo(
    () => buildSummaryItems(ingredients, recipes, preferences, t),
    [ingredients, preferences, recipes, t],
  )

  useEffect(() => {
    let isMounted = true

    fetchInventory(language)
      .then((result) => {
        if (isMounted) {
          setIngredients(result.inventory)
        }
      })
      .catch((error) => {
        console.warn('[vite] Inventory fetch failed:', error)
        if (isMounted) {
          setStatusMessage(
            error instanceof Error
              ? error.message
              : t('home.status.inventoryFetchFailed'),
          )
        }
      })

    fetchSavedRecipes(language)
      .then((result) => {
        if (isMounted) {
          setRecipes(result.recipes)
        }
      })
      .catch((error) => {
        console.warn('[vite] Saved recipes fetch failed:', error)
      })

    fetchPreferences()
      .then((result) => {
        if (isMounted) {
          setPreferences(result.preferences)
        }
      })
      .catch((error) => {
        console.warn('[vite] Preferences fetch failed:', error)
      })

    return () => {
      isMounted = false
    }
  }, [language, t])

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
      )

      if (result.recipes.length) {
        setRecipes(result.recipes)
        setStatusMessage(t('home.status.generateSuccess'))
      }
    } catch (error) {
      console.error('[vite] Recipe generation failed:', error)
      setStatusMessage(
        error instanceof Error ? error.message : t('home.status.generateFailed'),
      )
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
      const result = await markRecipeCooked(
        cookingRecipe.recipeId,
        servings,
        language,
      )
      setIngredients(result.inventory)
      setStatusMessage(t('home.status.cookingUpdated', { servings }))
      setCookingRecipe(null)
    } catch (error) {
      console.error('[vite] Cooking update failed:', error)
      setStatusMessage(
        error instanceof Error
          ? error.message
          : t('home.status.inventoryUpdateFailed'),
      )
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

        <SummaryGrid items={currentSummaryItems} />

        <div className="dashboard-grid">
          <IngredientsPanel
            ingredients={ingredients}
            onAddIngredient={() => onNavigate?.('ingredient-register')}
          />
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
                    : feature.icon === 'heart'
                      ? onShowFavorites
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
    </div>
  )
}
