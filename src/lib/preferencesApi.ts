import type { UserPreferences } from '../types/ui'
import { getJson, patchJson } from './apiClient'

export const defaultPreferences: UserPreferences = {
  defaultServings: 2,
  avoidedIngredients: '',
  recipeModel: 'gemini',
  displayLanguage: 'ja',
  seasoningMode: 'unlimited',
  notifications: {
    expiration: true,
    expirationLeadDays: 3,
  },
  voice: {
    enabled: false,
  },
}

export async function fetchPreferences() {
  return getJson<{
    userId: string
    preferences: UserPreferences
  }>('/api/preferences')
}

export function dispatchPreferencesUpdated(preferences: UserPreferences) {
  if (typeof window !== 'undefined') {
    window.dispatchEvent(
      new CustomEvent('preferences-updated', {
        detail: { preferences },
      }),
    )
  }
}

export async function savePreferences(preferences: UserPreferences) {
  const result = await patchJson<{
    userId: string
    preferences: UserPreferences
  }>('/api/preferences', { preferences })

  dispatchPreferencesUpdated(result.preferences)

  return result
}
