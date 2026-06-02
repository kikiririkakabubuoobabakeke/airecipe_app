import './env.js'
import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.SUPABASE_URL
const supabasePublishableKey = normalizePublishableKey(
  process.env.SUPABASE_PUBLISHABLE_KEY,
)
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY
const supabaseKey = supabaseServiceRoleKey ?? supabasePublishableKey

function normalizePublishableKey(key) {
  return key?.replace(/^sb_publishable_(?=sb_publishable_)/, '')
}

export const isSupabaseServiceRoleConfigured = Boolean(supabaseServiceRoleKey)
export const isSupabaseConfigured = Boolean(
  supabaseUrl && supabaseKey,
)

export const supabase = isSupabaseConfigured
  ? createClient(supabaseUrl, supabaseKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    })
  : null

export function checkSupabaseConnection() {
  if (!supabase || !supabaseUrl || !supabaseKey) {
    return {
      ok: false,
      configured: false,
      message: 'Supabase is not configured',
    }
  }

  try {
    new URL(supabaseUrl)
  } catch {
    return {
      ok: false,
      configured: true,
      message: 'Supabase URL is invalid',
    }
  }

  return {
    ok: true,
    configured: true,
    serviceRole: Boolean(supabaseServiceRoleKey),
    message: supabaseServiceRoleKey
      ? 'Supabase is configured on the server with service role'
      : 'Supabase is configured on the server, but service role is missing',
  }
}
