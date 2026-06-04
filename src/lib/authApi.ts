type ApiResponse<T> =
  | ({ ok: true } & T)
  | {
      ok: false
      message?: string
    }

export type AuthUser = {
  id: string
  email?: string
}

export type AuthSessionResult = {
  user: AuthUser
  expiresAt: number | null
}

export type AuthTokenPair = {
  accessToken: string
  refreshToken: string
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

  if (!response.ok || !payload.ok) {
    throw new Error(
      'message' in payload
        ? (payload.message ?? response.statusText)
        : response.statusText,
    )
  }

  return payload as T
}

export async function loginWithPassword(email: string, password: string) {
  const response = await fetch('/api/auth/login', {
    method: 'POST',
    credentials: 'same-origin',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ email, password }),
  })

  return readJson<AuthSessionResult>(response)
}

export async function registerWithPassword(email: string, password: string) {
  const response = await fetch('/api/auth/register', {
    method: 'POST',
    credentials: 'same-origin',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ email, password }),
  })

  return readJson<{
    user: AuthUser | null
    needsEmailConfirmation: boolean
  }>(response)
}

export async function createGoogleLoginUrl(redirectTo?: string) {
  const response = await fetch('/api/auth/google', {
    method: 'POST',
    credentials: 'same-origin',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ redirectTo }),
  })

  return readJson<{ url: string }>(response)
}

export async function createSessionFromOAuthTokens({
  accessToken,
  refreshToken,
}: AuthTokenPair) {
  const response = await fetch('/api/auth/session', {
    method: 'POST',
    credentials: 'same-origin',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ accessToken, refreshToken }),
  })

  return readJson<AuthSessionResult>(response)
}

export async function updatePasswordWithTokens(
  tokens: AuthTokenPair,
  password: string,
) {
  const response = await fetch('/api/auth/password-update', {
    method: 'POST',
    credentials: 'same-origin',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      ...tokens,
      password,
    }),
  })

  return readJson<AuthSessionResult>(response)
}

export async function getCurrentUser() {
  const response = await fetch('/api/auth/me', {
    credentials: 'same-origin',
    cache: 'no-store',
  })

  return readJson<{ user: AuthUser }>(response)
}

export async function logout() {
  const response = await fetch('/api/auth/logout', {
    method: 'POST',
    credentials: 'same-origin',
  })

  return readJson<Record<string, never>>(response)
}

export async function sendPasswordResetEmail(
  email: string,
  redirectTo?: string,
) {
  const response = await fetch('/api/auth/password-reset', {
    method: 'POST',
    credentials: 'same-origin',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ email, redirectTo }),
  })

  return readJson<{ sent: boolean }>(response)
}
