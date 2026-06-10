import type { Ingredient, Recipe } from '../types/ui'
import type { LanguageCode } from './i18n'

type ApiResponse<T> =
  | ({ ok: true } & T)
  | {
      ok: false
      message?: string
    }

async function readJson<T>(response: Response): Promise<T> {
  const responseText = await response.text()
  let payload: ApiResponse<T>

  try {
    payload = responseText
      ? (JSON.parse(responseText) as ApiResponse<T>)
      : ({ ok: false, message: response.statusText } as ApiResponse<T>)
  } catch {
    throw new Error(
      responseText
        ? `API response was not JSON: ${responseText.slice(0, 120)}`
        : response.statusText,
    )
  }

  if (!response.ok) {
    throw new Error(
      'message' in payload ? (payload.message ?? response.statusText) : response.statusText,
    )
  }

  if (!payload.ok) {
    throw new Error((payload as { message?: string }).message ?? response.statusText)
  }

  return payload as T
}

function withLanguage(path: string, language?: LanguageCode) {
  if (!language) {
    return path
  }

  const params = new URLSearchParams({ language })
  return `${path}?${params.toString()}`
}

export async function fetchInventory(language?: LanguageCode) {
  const response = await fetch(withLanguage('/api/inventory', language), {
    credentials: 'same-origin',
  })
  return readJson<{
    userId: string
    inventory: Ingredient[]
  }>(response)
}

export type InventoryMutationInput = {
  inventoryId?: number
  name: string
  category?: string | null
  quantity?: number | null
  gram?: number | null
  expirationDate?: string | null
  bestBeforeDate?: string | null
  isOpened?: boolean | null
  memo?: string | null
}

export async function createInventoryItem(item: InventoryMutationInput) {
  const response = await fetch('/api/inventory', {
    method: 'POST',
    credentials: 'same-origin',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(item),
  })

  const result = await readJson<{
    userId: string
    inventory: Ingredient[]
  }>(response)

  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('inventory-updated'))
  }

  return result
}

export async function updateInventoryItem(item: InventoryMutationInput) {
  const response = await fetch('/api/inventory', {
    method: 'PATCH',
    credentials: 'same-origin',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(item),
  })

  const result = await readJson<{
    userId: string
    inventory: Ingredient[]
  }>(response)

  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('inventory-updated'))
  }

  return result
}

export async function deleteInventoryItem(inventoryId: number) {
  const response = await fetch('/api/inventory', {
    method: 'DELETE',
    credentials: 'same-origin',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ inventoryId }),
  })

  const result = await readJson<{
    userId: string
    inventory: Ingredient[]
  }>(response)

  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('inventory-updated'))
  }

  return result
}

export async function generateRecipes(
  servings = 2,
  language?: LanguageCode,
  avoidedIngredients?: string,
) {
  const response = await fetch('/api/recipes/generate', {
    method: 'POST',
    credentials: 'same-origin',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      servings,
      language,
      avoidedIngredients,
    }),
  })

  return readJson<{
    userId: string
    recipes: Recipe[]
  }>(response)
}

export async function markRecipeCooked(
  recipeId: string,
  servings: number,
  language?: LanguageCode,
) {
  const response = await fetch('/api/recipes/cooked', {
    method: 'POST',
    credentials: 'same-origin',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      recipeId,
      servings,
      language,
    }),
  })

  const result = await readJson<{
    userId: string
    recipeId: string
    servings: number
    inventory: Ingredient[]
  }>(response)

  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('inventory-updated'))
  }

  return result
}

export async function fetchCookingHistory(language?: LanguageCode) {
  const response = await fetch(withLanguage('/api/cooking-history', language), {
    cache: 'no-store',
    credentials: 'same-origin',
  })
  return readJson<{
    userId: string
    recipes: Recipe[]
  }>(response)
}

export async function fetchSavedRecipes(language?: LanguageCode) {
  const response = await fetch(withLanguage('/api/recipes/saved', language), {
    cache: 'no-store',
    credentials: 'same-origin',
  })
  return readJson<{
    userId: string
    recipes: Recipe[]
  }>(response)
}

export async function setRecipeFavorite(
  recipeId: string,
  isFavorite: boolean,
) {
  const response = await fetch('/api/recipes/favorite', {
    method: 'POST',
    credentials: 'same-origin',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      recipeId,
      isFavorite,
    }),
  })

  return readJson<{
    userId: string
    recipeId: string
    isFavorite: boolean
  }>(response)
}
