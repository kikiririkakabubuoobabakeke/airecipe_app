import { isSupabaseServiceRoleConfigured, supabase } from './supabase.js'

const metadataKey = 'ai_recipe_preferences'

export const defaultUserPreferences = {
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

const allowedRecipeModels = new Set(['gemini', 'groq'])
const allowedSeasoningModes = new Set(['unlimited', 'strict'])
const allowedDisplayLanguages = new Set(['ja', 'en', 'fr'])

function sanitizeRecipeModel(value) {
  return allowedRecipeModels.has(value) ? value : defaultUserPreferences.recipeModel
}

function sanitizeSeasoningMode(value) {
  return allowedSeasoningModes.has(value) ? value : defaultUserPreferences.seasoningMode
}

function sanitizeDisplayLanguage(value) {
  return allowedDisplayLanguages.has(value)
    ? value
    : defaultUserPreferences.displayLanguage
}

function ensureSupabaseAdmin() {
  if (!supabase) {
    throw new Error('Supabase is not configured')
  }

  if (!isSupabaseServiceRoleConfigured) {
    throw new Error('SUPABASE_SERVICE_ROLE_KEY is required for preferences')
  }

  return supabase
}

function sanitizeDefaultServings(value) {
  const servings = Number(value)

  if (!Number.isFinite(servings)) {
    return defaultUserPreferences.defaultServings
  }

  return Math.min(20, Math.max(1, Math.round(servings)))
}

function sanitizeLeadDays(value) {
  const days = Number(value)

  if (!Number.isFinite(days)) {
    return defaultUserPreferences.notifications.expirationLeadDays
  }

  return Math.min(30, Math.max(1, Math.round(days)))
}

export function sanitizeUserPreferences(value) {
  const source = value && typeof value === 'object' ? value : {}
  const notifications =
    source.notifications && typeof source.notifications === 'object'
      ? source.notifications
      : {}
  const voice =
    source.voice && typeof source.voice === 'object' ? source.voice : {}

  return {
    defaultServings: sanitizeDefaultServings(source.defaultServings),
    avoidedIngredients:
      typeof source.avoidedIngredients === 'string'
        ? source.avoidedIngredients.slice(0, 1000)
        : '',
    recipeModel: sanitizeRecipeModel(source.recipeModel),
    displayLanguage: sanitizeDisplayLanguage(
      source.displayLanguage ?? source.language,
    ),
    seasoningMode: sanitizeSeasoningMode(source.seasoningMode),
    notifications: {
      expiration: notifications.expiration !== false,
      expirationLeadDays: sanitizeLeadDays(notifications.expirationLeadDays),
    },
    voice: {
      enabled: voice.enabled === true,
    },
  }
}

async function getAuthUser(userId) {
  const client = ensureSupabaseAdmin()
  const { data, error } = await client.auth.admin.getUserById(userId)

  if (error) {
    throw new Error(`Failed to fetch user preferences: ${error.message}`)
  }

  if (!data?.user) {
    throw new Error('User not found')
  }

  return data.user
}

export async function getUserPreferences(userId) {
  const user = await getAuthUser(userId)
  const storedPreferences = user.user_metadata?.[metadataKey]

  return {
    userId,
    preferences: sanitizeUserPreferences(storedPreferences),
  }
}

export async function updateUserPreferences({ userId, preferences }) {
  const client = ensureSupabaseAdmin()
  const user = await getAuthUser(userId)
  const nextPreferences = sanitizeUserPreferences(preferences)
  const nextMetadata = {
    ...(user.user_metadata ?? {}),
    [metadataKey]: nextPreferences,
  }

  const { error } = await client.auth.admin.updateUserById(userId, {
    user_metadata: nextMetadata,
  })

  if (error) {
    throw new Error(`Failed to update user preferences: ${error.message}`)
  }

  return {
    userId,
    preferences: nextPreferences,
  }
}
