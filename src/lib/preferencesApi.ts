import type { UserPreferences } from '../types/ui'

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
      'message' in payload
        ? (payload.message ?? response.statusText)
        : response.statusText,
    )
  }

  if (!payload.ok) {
    throw new Error(payload.message ?? response.statusText)
  }

  return payload as T
}

export const defaultPreferences: UserPreferences = {
  defaultServings: 2,
  avoidedIngredients: '',
  notifications: {
    expiration: true,
    lowStock: false,
    expirationLeadDays: 3,
  },
}

export async function fetchPreferences() {
  const response = await fetch('/api/preferences', {
    cache: 'no-store',
    credentials: 'same-origin',
  })

  return readJson<{
    userId: string
    preferences: UserPreferences
  }>(response)
}

export async function savePreferences(preferences: UserPreferences) {
  const response = await fetch('/api/preferences', {
    method: 'PATCH',
    credentials: 'same-origin',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ preferences }),
  })

  return readJson<{
    userId: string
    preferences: UserPreferences
  }>(response)
}
