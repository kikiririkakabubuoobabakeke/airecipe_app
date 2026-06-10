import './env.js'
import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.SUPABASE_URL
const supabasePublishableKey = normalizePublishableKey(
  process.env.SUPABASE_PUBLISHABLE_KEY,
)
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY
const supabaseVerifierKey = supabaseServiceRoleKey ?? supabasePublishableKey

function normalizePublishableKey(key) {
  return key?.replace(/^sb_publishable_(?=sb_publishable_)/, '')
}

if (
  process.env.SUPABASE_PUBLISHABLE_KEY &&
  process.env.SUPABASE_PUBLISHABLE_KEY !== supabasePublishableKey
) {
  console.warn(
    '[node] SUPABASE_PUBLISHABLE_KEY has a duplicated sb_publishable_ prefix. Using the normalized key.',
  )
}

const authClient =
  supabaseUrl && supabasePublishableKey
    ? createClient(supabaseUrl, supabasePublishableKey, {
        auth: {
          autoRefreshToken: false,
          persistSession: false,
        },
      })
    : null

const authVerifierClient =
  supabaseUrl && supabaseVerifierKey
    ? createClient(supabaseUrl, supabaseVerifierKey, {
        auth: {
          autoRefreshToken: false,
          persistSession: false,
        },
      })
    : null

const authAdminClient =
  supabaseUrl && supabaseServiceRoleKey
    ? createClient(supabaseUrl, supabaseServiceRoleKey, {
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

function requireAuthVerifierClient() {
  if (!authVerifierClient) {
    throw new Error('Supabase auth is not configured')
  }

  return authVerifierClient
}

function requireAuthAdminClient() {
  if (!authAdminClient) {
    throw new Error('SUPABASE_SERVICE_ROLE_KEY is required for user sync')
  }

  return authAdminClient
}

function normalizeUser(user) {
  if (!user) {
    return null
  }

  return {
    id: user.id,
    email: user.email,
    isAdmin: Boolean(user.isAdmin),
  }
}

function getFallbackEmail(userId) {
  return `user-${userId}@aicook.local`
}

export async function ensurePublicUser(user) {
  if (!user?.id) {
    return null
  }

  const client = requireAuthAdminClient()
  const userMail = user.email || getFallbackEmail(user.id)
  const { error } = await client
    .from('users')
    .upsert(
      {
        user_id: user.id,
        user_mail: userMail,
        user_name: user.email?.split('@')[0] ?? 'ユーザー',
      },
      {
        onConflict: 'user_id',
      },
    )

  if (error) {
    throw new Error(`Failed to sync public user: ${error.message}`)
  }

  const { data: publicUser, error: fetchError } = await client
    .from('users')
    .select('is_admin')
    .eq('user_id', user.id)
    .maybeSingle()

  if (fetchError?.code === '42703') {
    return {
      ...user,
      isAdmin: false,
    }
  }

  if (fetchError) {
    throw new Error(`Failed to fetch public user: ${fetchError.message}`)
  }

  return {
    ...user,
    isAdmin: Boolean(publicUser?.is_admin),
  }
}

function normalizeSession(session) {
  if (!session) {
    return null
  }

  return {
    accessToken: session.access_token,
    refreshToken: session.refresh_token,
    expiresAt: session.expires_at ?? null,
    expiresIn: session.expires_in ?? null,
  }
}

function decodeJwtPayload(accessToken) {
  const [, payload] = String(accessToken).split('.')

  if (!payload) {
    return {}
  }

  try {
    const normalizedPayload = payload.replace(/-/g, '+').replace(/_/g, '/')
    const paddedPayload = normalizedPayload.padEnd(
      Math.ceil(normalizedPayload.length / 4) * 4,
      '=',
    )

    return JSON.parse(Buffer.from(paddedPayload, 'base64').toString('utf8'))
  } catch {
    return {}
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

  const user = await ensurePublicUser(normalizeUser(data.user))

  return {
    user,
    session: normalizeSession(data.session),
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

  const user = await ensurePublicUser(normalizeUser(data.user))

  return {
    user,
    session: normalizeSession(data.session),
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

export async function createSessionFromTokens({ accessToken, refreshToken }) {
  if (!accessToken || !refreshToken) {
    throw new Error('accessToken and refreshToken are required')
  }

  const user = await ensurePublicUser(await getUserFromAccessToken(accessToken))
  const payload = decodeJwtPayload(accessToken)
  const timeNow = Math.floor(Date.now() / 1000)
  const expiresAt = Number.isFinite(payload.exp) ? payload.exp : null
  const expiresIn = expiresAt ? Math.max(0, expiresAt - timeNow) : null

  return {
    user,
    session: {
      accessToken,
      refreshToken,
      expiresAt,
      expiresIn,
    },
    expiresAt,
  }
}

export async function refreshSessionFromRefreshToken(refreshToken) {
  if (!refreshToken) {
    throw new Error('refresh token is required')
  }

  const client = requireAuthClient()
  const { data, error } = await client.auth.refreshSession({
    refresh_token: refreshToken,
  })

  if (error) {
    throw new Error(error.message)
  }

  const session = normalizeSession(data.session)

  if (!session?.accessToken) {
    throw new Error('Refresh session did not return an access token')
  }

  const user = await ensurePublicUser(
    normalizeUser(data.user) ?? (await getUserFromAccessToken(session.accessToken)),
  )

  return {
    user,
    session,
    expiresAt: data.session?.expires_at ?? null,
  }
}

export async function updatePasswordWithTokens({
  accessToken,
  refreshToken,
  password,
}) {
  if (!accessToken || !refreshToken) {
    throw new Error('accessToken and refreshToken are required')
  }

  if (!password || String(password).length < 6) {
    throw new Error('password must be at least 6 characters')
  }

  const user = await ensurePublicUser(await getUserFromAccessToken(accessToken))
  const client = requireAuthAdminClient()
  const { error } = await client.auth.admin.updateUserById(user.id, {
    password,
  })

  if (error) {
    throw new Error(error.message)
  }

  const session = await refreshSessionFromRefreshToken(refreshToken)

  return {
    user: session.user,
    session: session.session,
    expiresAt: session.expiresAt,
  }
}

export async function getUserFromAccessToken(accessToken) {
  const client = requireAuthVerifierClient()

  if (!accessToken) {
    throw new Error('access token is required')
  }

  const { data, error } = await client.auth.getUser(accessToken)

  if (error) {
    throw new Error(error.message)
  }

  return normalizeUser(data.user)
}
