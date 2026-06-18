import { getStoredLanguage } from './i18n'
import { getCache, setCache } from './dataCache'
import {
  fetchInventory,
  fetchSavedRecipes,
} from './recipeApi'
import {
  dispatchPreferencesUpdated,
  fetchPreferences,
} from './preferencesApi'
import type {
  AppDestination,
  Ingredient,
  Recipe,
  UserPreferences,
} from '../types/ui'

type HomeData = {
  ingredients: Ingredient[]
  recipes: Recipe[]
  preferences: UserPreferences
}

type PreloadOptions = {
  currentPage?: AppDestination | 'recipe' | 'receipt-detail'
  userId?: string
}

type PreloadTaskKey = 'inventory' | 'preferences' | 'recipes'

type WindowWithIdleCallback = Window &
  typeof globalThis & {
    requestIdleCallback?: (
      callback: () => void,
      options?: { timeout?: number },
    ) => number
  }

const preloadPriorityByPage: Record<string, PreloadTaskKey[]> = {
  home: ['inventory', 'recipes', 'preferences'],
  fridge: ['inventory', 'preferences', 'recipes'],
  'recipe-generate': ['inventory', 'preferences', 'recipes'],
  history: ['recipes', 'inventory', 'preferences'],
  settings: ['preferences', 'inventory', 'recipes'],
  recipe: ['preferences', 'recipes', 'inventory'],
  'ingredient-register': ['inventory', 'preferences', 'recipes'],
  receipt: ['inventory', 'preferences', 'recipes'],
  'receipt-detail': ['inventory', 'preferences', 'recipes'],
  contact: ['preferences', 'inventory', 'recipes'],
  admin: ['preferences', 'inventory', 'recipes'],
}

function waitForBackgroundSlot(index: number) {
  if (typeof window === 'undefined') {
    return Promise.resolve()
  }

  const delay = index === 0 ? 80 : 180

  return new Promise<void>((resolve) => {
    window.setTimeout(() => {
      const idleWindow = window as WindowWithIdleCallback

      if (idleWindow.requestIdleCallback) {
        idleWindow.requestIdleCallback(resolve, { timeout: 1200 })
        return
      }

      resolve()
    }, delay)
  })
}

function getOrderedTaskKeys(currentPage?: PreloadOptions['currentPage']) {
  const priority = preloadPriorityByPage[currentPage ?? 'home'] ?? []
  const fallback: PreloadTaskKey[] = ['inventory', 'preferences', 'recipes']

  return Array.from(new Set([...priority, ...fallback]))
}

export async function preloadAllPageData(
  options: PreloadOptions = {},
): Promise<void> {
  const language = getStoredLanguage() ?? 'ja'
  const homeCacheKey = `home:${language}`
  const recipeGenerateCacheKey = `recipe-generate:${language}`
  const cachedHomeData = getCache<HomeData>(homeCacheKey)

  let inventoryData = getCache<Ingredient[]>(`inventory:${language}`) ?? undefined
  let recipesData = getCache<Recipe[]>(`cooking-history:${language}`) ?? undefined
  const preferencesCacheKey = options.userId
    ? `preferences:${options.userId}`
    : null
  const cachedUserPreferences = preferencesCacheKey
    ? getCache<UserPreferences>(preferencesCacheKey)
    : null
  let preferencesData = cachedUserPreferences ?? cachedHomeData?.preferences
  let hasFreshUserPreferences = Boolean(cachedUserPreferences)

  if (cachedHomeData) {
    inventoryData = inventoryData ?? cachedHomeData.ingredients
    recipesData = recipesData ?? cachedHomeData.recipes
    setCache(`inventory:${language}`, cachedHomeData.ingredients)
    setCache(`cooking-history:${language}`, cachedHomeData.recipes)
    setCache(recipeGenerateCacheKey, cachedHomeData)
  }

  function syncCompositeCaches() {
    if (!inventoryData || !recipesData || !preferencesData) {
      return
    }

    const homeData: HomeData = {
      ingredients: inventoryData,
      recipes: recipesData,
      preferences: preferencesData,
    }

    setCache(homeCacheKey, homeData)
    setCache(recipeGenerateCacheKey, homeData)
  }

  const tasks: Record<PreloadTaskKey, () => Promise<void>> = {
    async inventory() {
      if (inventoryData) {
        syncCompositeCaches()
        return
      }

      const result = await fetchInventory(language)
      inventoryData = result.inventory
      setCache(`inventory:${language}`, result.inventory)
      syncCompositeCaches()
    },
    async preferences() {
      if (hasFreshUserPreferences) {
        syncCompositeCaches()
        return
      }

      const result = await fetchPreferences()
      preferencesData = result.preferences
      hasFreshUserPreferences = true
      setCache(`preferences:${result.userId}`, result.preferences)
      dispatchPreferencesUpdated(result.preferences)
      syncCompositeCaches()
    },
    async recipes() {
      if (recipesData) {
        syncCompositeCaches()
        return
      }

      const result = await fetchSavedRecipes(language)
      recipesData = result.recipes
      setCache(`cooking-history:${language}`, result.recipes)
      syncCompositeCaches()
    },
  }

  const taskKeys = getOrderedTaskKeys(options.currentPage)

  for (const [index, taskKey] of taskKeys.entries()) {
    await waitForBackgroundSlot(index)

    try {
      await tasks[taskKey]()
    } catch (error) {
      console.warn(`[vite] ${taskKey} preload failed:`, error)
    }
  }

  syncCompositeCaches()
}
