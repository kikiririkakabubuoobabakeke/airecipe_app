import './env.js'
import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.SUPABASE_URL
const supabasePublishableKey = process.env.SUPABASE_PUBLISHABLE_KEY

const authClient =
  supabaseUrl && supabasePublishableKey
    ? createClient(supabaseUrl, supabasePublishableKey, {
        auth: {
          autoRefreshToken: false,
          persistSession: false,
        },
      })
    : null

function requireAuthClient() {
  if (!authClient) {
    throw new Error('Supabase auth is not configured')
  }

  return authClient
}

function normalizeUser(user) {
  if (!user) {
    return null
  }

  return {
    id: user.id,
    email: user.email,
  }
}

export async function signInWithPassword({ email, password }) {
  const client = requireAuthClient()

  const { data, error } = await client.auth.signInWithPassword({
    email,
    password,
  })

  if (error) {
    throw new Error(error.message)
  }

  return {
    user: normalizeUser(data.user),
    expiresAt: data.session?.expires_at ?? null,
  }
}

export async function signUpWithPassword({ email, password }) {
  const client = requireAuthClient()

  const { data, error } = await client.auth.signUp({
    email,
    password,
  })

  if (error) {
    throw new Error(error.message)
  }

  return {
    user: normalizeUser(data.user),
    needsEmailConfirmation: !data.session,
  }
}

export async function createGoogleLoginUrl({ redirectTo }) {
  const client = requireAuthClient()

  const { data, error } = await client.auth.signInWithOAuth({
    provider: 'google',
    options: {
      redirectTo,
    },
  })

  if (error) {
    throw new Error(error.message)
  }

  return {
    url: data.url,
  }
}

export async function sendPasswordResetEmail({ email, redirectTo }) {
  const client = requireAuthClient()

  const { error } = await client.auth.resetPasswordForEmail(email, {
    redirectTo,
  })

  if (error) {
    throw new Error(error.message)
  }

  return {
    sent: true,
  }
}
