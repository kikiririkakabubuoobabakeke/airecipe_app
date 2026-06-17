import { getStoredLanguage } from './i18n'
import { getCache, setCache } from './dataCache'
import {
  fetchInventory,
  fetchSavedRecipes,
} from './recipeApi'
import {
  defaultPreferences,
  dispatchPreferencesUpdated,
  fetchPreferences,
} from './preferencesApi'
import type { Ingredient, Recipe, UserPreferences } from '../types/ui'

export async function preloadAllPageData(): Promise<void> {
  const language = getStoredLanguage() ?? 'ja'
  const cachedHomeData = getCache<{
    ingredients: Ingredient[]
    recipes: Recipe[]
    preferences: UserPreferences
  }>(`home:${language}`)

  if (cachedHomeData) {
    setCache(`inventory:${language}`, cachedHomeData.ingredients)
    setCache(`cooking-history:${language}`, cachedHomeData.recipes)
    setCache(`recipe-generate:${language}`, cachedHomeData)
    dispatchPreferencesUpdated(cachedHomeData.preferences)
    return
  }

  let inventoryData: Ingredient[] = []
  let recipesData: Recipe[] = []
  let preferencesData: UserPreferences | undefined
  let userId: string | undefined

  try {
    const results = await Promise.allSettled([
      fetchInventory(language),
      fetchSavedRecipes(language),
      fetchPreferences(),
    ])

    if (results[0].status === 'fulfilled') {
      inventoryData = results[0].value.inventory
      userId = userId ?? results[0].value.userId
    }
    if (results[1].status === 'fulfilled') {
      recipesData = results[1].value.recipes
    }
    if (results[2].status === 'fulfilled') {
      preferencesData = results[2].value.preferences
      userId = userId ?? results[2].value.userId
    }
  } catch {
    return
  }

  if (inventoryData.length || recipesData.length || preferencesData) {
    const homeData = {
      ingredients: inventoryData,
      recipes: recipesData,
      preferences: preferencesData ?? defaultPreferences,
    }
    setCache(`inventory:${language}`, inventoryData)
    setCache(`home:${language}`, homeData)
    setCache(`cooking-history:${language}`, recipesData)
    setCache(`recipe-generate:${language}`, homeData)
  }

  if (userId && preferencesData) {
    setCache(`preferences:${userId}`, preferencesData)
    dispatchPreferencesUpdated(preferencesData)
  }
}
