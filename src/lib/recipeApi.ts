import type { Ingredient, Recipe } from '../types/ui'

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
    throw new Error(payload.message ?? response.statusText)
  }

  return payload as T
}

export async function fetchInventory() {
  const response = await fetch('/api/inventory')
  return readJson<{
    userId: string
    inventory: Ingredient[]
  }>(response)
}

export async function generateRecipes(servings = 2) {
  const response = await fetch('/api/recipes/generate', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      servings,
    }),
  })

  return readJson<{
    userId: string
    recipes: Recipe[]
  }>(response)
}

export async function markRecipeCooked(recipeId: string, servings: number) {
  const response = await fetch('/api/recipes/cooked', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      recipeId,
      servings,
    }),
  })

  return readJson<{
    userId: string
    recipeId: string
    servings: number
    inventory: Ingredient[]
  }>(response)
}

export async function fetchCookingHistory() {
  const response = await fetch('/api/cooking-history', { cache: 'no-store' })
  return readJson<{
    userId: string
    recipes: Recipe[]
  }>(response)
}

export async function fetchSavedRecipes() {
  const response = await fetch('/api/recipes/saved', { cache: 'no-store' })
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
