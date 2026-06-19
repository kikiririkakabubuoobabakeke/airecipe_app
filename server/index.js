import { createServer } from 'node:http'
import { pathToFileURL } from 'node:url'
import {
  checkGroqConnection,
  createGroqChatCompletion,
  defaultGroqModel,
} from './groq.js'
import {
  checkGeminiConnection,
  generateGeminiContent,
  getGeminiUsageSnapshot,
} from './gemini.js'
import {
  AuthError,
  createSessionFromTokens,
  createGoogleLoginUrl,
  ensurePublicUser,
  getUserFromAccessToken,
  refreshSessionFromRefreshToken,
  sendPasswordResetEmail,
  signInWithPassword,
  signUpWithPassword,
  updatePasswordWithTokens,
} from './auth.js'
import {
  createInventoryItemForUser,
  deleteInventoryItemForUser,
  deleteSavedRecipeForUser,
  generateAndSaveRecipes,
  getCookingHistoryForUser,
  getInventoryForUser,
  getSavedRecipesForUser,
  markRecipeCooked,
  setRecipeFavorite,
  updateInventoryItemForUser,
} from './recipes.js'
import {
  fallbackParseReceiptText,
  importReceiptItems,
  importReceiptItemsDetail,
  parseReceiptText,
} from './receipts.js'
import {
  createShoppingListForUser,
  deleteShoppingListForUser,
  getShoppingListForUser,
  getShoppingListsForUser,
  updateShoppingListForUser,
} from './shopping.js'
import {
  getUserPreferences,
  updateUserPreferences,
} from './preferences.js'
import {
  getContactMessagesForAdmin,
  getMessagesForUser,
  markMessagesReadForUser,
  sendContactReplyForAdmin,
  submitContactMessageForUser,
} from './contact.js'
import { checkSupabaseConnection } from './supabase.js'

const port = Number(process.env.PORT ?? 8787)
const authAccessCookieName = 'ai_recipe_access_token'
const authRefreshCookieName = 'ai_recipe_refresh_token'

function sendJson(response, statusCode, payload, extraHeaders = {}) {
  response.writeHead(statusCode, {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'content-type',
    'Access-Control-Allow-Methods': 'GET,POST,PATCH,DELETE,OPTIONS',
    'Content-Type': 'application/json; charset=utf-8',
    ...(response.authCookieHeaders ?? {}),
    ...extraHeaders,
  })
  response.end(JSON.stringify(payload))
}

function parseCookies(cookieHeader = '') {
  return cookieHeader.split(';').reduce((cookies, cookiePart) => {
    const [name, ...valueParts] = cookiePart.trim().split('=')

    if (!name) {
      return cookies
    }

    const value = valueParts.join('=') ?? ''

    try {
      cookies[name] = decodeURIComponent(value)
    } catch {
      cookies[name] = value
    }

    return cookies
  }, {})
}

function isLocalRequest(request) {
  const host = request.headers.host ?? ''
  return host.startsWith('localhost') || host.startsWith('127.0.0.1')
}

function serializeCookie(request, name, value, options = {}) {
  const secure = !isLocalRequest(request)
  const parts = [
    `${name}=${encodeURIComponent(value)}`,
    'Path=/',
    'HttpOnly',
    'SameSite=Lax',
  ]

  if (secure) {
    parts.push('Secure')
  }

  if (options.maxAge !== undefined) {
    parts.push(`Max-Age=${options.maxAge}`)
  }

  return parts.join('; ')
}

function createAuthCookieHeaders(request, session) {
  if (!session?.accessToken || !session?.refreshToken) {
    return {}
  }

  const accessMaxAge =
    session.expiresIn ??
    (session.expiresAt
      ? Math.max(0, session.expiresAt - Math.floor(Date.now() / 1000))
      : 60 * 60)

  return {
    'Set-Cookie': [
      serializeCookie(request, authAccessCookieName, session.accessToken, {
        maxAge: accessMaxAge,
      }),
      serializeCookie(request, authRefreshCookieName, session.refreshToken, {
        maxAge: 60 * 60 * 24 * 30,
      }),
    ],
  }
}

function createClearAuthCookieHeaders(request) {
  return {
    'Set-Cookie': [
      serializeCookie(request, authAccessCookieName, '', { maxAge: 0 }),
      serializeCookie(request, authRefreshCookieName, '', { maxAge: 0 }),
    ],
  }
}

function getRequestOrigin(request, requestedOrigin) {
  const forwardedProto = request.headers['x-forwarded-proto']
  const forwardedHost = request.headers['x-forwarded-host']
  const host = forwardedHost ?? request.headers.host

  if (host) {
    const proto = forwardedProto ?? (isLocalRequest(request) ? 'http' : 'https')
    return `${proto}://${host}`.replace(/\/$/, '')
  }

  if (requestedOrigin) {
    return requestedOrigin.replace(/\/$/, '')
  }

  return null
}

// Whitelist redirect targets to prevent open-redirect attacks.
// Accepts: missing/null, relative paths (/foo, foo/bar), or absolute URLs
// whose origin matches the current request origin.
function resolveSafeRedirect(request, redirectTo) {
  const requestOrigin = getRequestOrigin(request, null)

  if (!redirectTo) {
    return requestOrigin
  }

  if (typeof redirectTo !== 'string') {
    return requestOrigin
  }

  if (redirectTo.startsWith('/') && !redirectTo.startsWith('//')) {
    return redirectTo
  }

  try {
    const parsed = new URL(redirectTo)

    if (requestOrigin) {
      const targetOrigin = `${parsed.protocol}//${parsed.host}`.replace(/\/$/, '')
      if (targetOrigin === requestOrigin) {
        return redirectTo
      }
    }
  } catch {
    // Fall through to request origin.
  }

  return requestOrigin
}

async function requireAuthenticatedUser(request) {
  const cookies = parseCookies(request.headers.cookie ?? '')
  const accessToken = cookies[authAccessCookieName]
  const refreshToken = cookies[authRefreshCookieName]

  if (accessToken) {
    try {
      const user = await ensurePublicUser(
        await getUserFromAccessToken(accessToken),
      )

      if (user?.id) {
        return {
          user,
          session: null,
        }
      }
    } catch (error) {
      // Only treat access-token errors as transient. Re-throw infrastructure
      // failures (Supabase down, etc.) so the handler returns 5xx, not 401.
      if (!(error instanceof AuthError)) {
        throw error
      }
    }
  }

  if (!refreshToken) {
    throw new AuthError()
  }

  const result = await refreshSessionFromRefreshToken(refreshToken)

  if (!result.user?.id) {
    throw new AuthError()
  }

  return {
    user: result.user,
    session: result.session,
  }
}

export async function handleApiRequest(request, response) {
  if (request.method === 'OPTIONS') {
    response.writeHead(204, {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Headers': 'content-type',
      'Access-Control-Allow-Methods': 'GET,POST,PATCH,DELETE,OPTIONS',
    })
    response.end()
    return
  }

  const url = new URL(request.url ?? '/', `http://${request.headers.host}`)

  if (request.method === 'GET' && url.pathname === '/api/health') {
    sendJson(response, 200, { ok: true })
    return
  }

  if (request.method === 'GET' && url.pathname === '/api/supabase/status') {
    const status = checkSupabaseConnection()
    sendJson(response, status.ok ? 200 : 500, status)
    return
  }

  if (request.method === 'GET' && url.pathname === '/api/groq/status') {
    const status = checkGroqConnection()
    sendJson(response, status.ok ? 200 : 500, status)
    return
  }

  if (request.method === 'GET' && url.pathname === '/api/gemini/status') {
    const status = checkGeminiConnection()
    sendJson(response, status.ok ? 200 : 500, status)
    return
  }

  if (request.method === 'GET' && url.pathname === '/api/gemini/usage') {
    sendJson(response, 200, {
      ok: true,
      usage: getGeminiUsageSnapshot(),
    })
    return
  }

  if (request.method === 'GET' && url.pathname === '/api/auth/me') {
    await handleAuthMe(request, response)
    return
  }

  if (request.method === 'POST' && url.pathname === '/api/auth/login') {
    await handleAuthLogin(request, response)
    return
  }

  if (request.method === 'POST' && url.pathname === '/api/auth/register') {
    await handleAuthRegister(request, response)
    return
  }

  if (request.method === 'POST' && url.pathname === '/api/auth/google') {
    await handleAuthGoogle(request, response)
    return
  }

  if (request.method === 'POST' && url.pathname === '/api/auth/session') {
    await handleAuthSession(request, response)
    return
  }

  if (request.method === 'POST' && url.pathname === '/api/auth/logout') {
    await handleAuthLogout(request, response)
    return
  }

  if (request.method === 'POST' && url.pathname === '/api/auth/password-reset') {
    await handleAuthPasswordReset(request, response)
    return
  }

  if (request.method === 'POST' && url.pathname === '/api/auth/password-update') {
    await handleAuthPasswordUpdate(request, response)
    return
  }

  let authUser

  try {
    const authResult = await requireAuthenticatedUser(request)
    authUser = authResult.user

    if (authResult.session) {
      response.authCookieHeaders = createAuthCookieHeaders(
        request,
        authResult.session,
      )
    }
  } catch (error) {
    if (error instanceof AuthError) {
      sendJson(response, 401, {
        ok: false,
        message: 'Login is required',
      })
      return
    }

    sendJson(response, 500, {
      ok: false,
      message:
        error instanceof Error
          ? error.message
          : 'Internal server error',
    })
    return
  }

  if (request.method === 'GET' && url.pathname === '/api/inventory') {
    await handleInventory(authUser.id, response, url.searchParams.get('language'))
    return
  }

  if (request.method === 'POST' && url.pathname === '/api/inventory') {
    await handleInventoryCreate(request, response, authUser.id)
    return
  }

  if (request.method === 'PATCH' && url.pathname === '/api/inventory') {
    await handleInventoryUpdate(request, response, authUser.id)
    return
  }

  const inventoryDeleteMatch =
    request.method === 'DELETE' &&
    url.pathname.match(/^\/api\/inventory\/(\d+)$/)
  if (inventoryDeleteMatch) {
    const inventoryId = Number(inventoryDeleteMatch[1])
    await handleInventoryDelete(request, response, authUser.id, inventoryId)
    return
  }

  if (request.method === 'GET' && url.pathname === '/api/preferences') {
    await handlePreferences(authUser.id, response)
    return
  }

  if (request.method === 'PATCH' && url.pathname === '/api/preferences') {
    await handlePreferencesUpdate(request, response, authUser.id)
    return
  }

  if (request.method === 'POST' && url.pathname === '/api/contact') {
    await handleContactSubmit(request, response, authUser)
    return
  }

  if (request.method === 'GET' && url.pathname === '/api/admin/contact-messages') {
    await handleAdminContactMessages(authUser, response)
    return
  }

  if (
    request.method === 'POST' &&
    url.pathname === '/api/admin/contact-messages/reply'
  ) {
    await handleAdminContactReply(request, response, authUser)
    return
  }

  if (request.method === 'GET' && url.pathname === '/api/messages') {
    await handleUserMessages(authUser.id, response)
    return
  }

  if (request.method === 'POST' && url.pathname === '/api/messages/read') {
    await handleUserMessagesRead(request, response, authUser.id)
    return
  }

  if (request.method === 'GET' && url.pathname === '/api/cooking-history') {
    await handleCookingHistory(
      authUser.id,
      response,
      url.searchParams.get('language'),
    )
    return
  }

  if (request.method === 'GET' && url.pathname === '/api/recipes/saved') {
    await handleSavedRecipes(
      authUser.id,
      response,
      url.searchParams.get('language'),
    )
    return
  }

  const savedRecipeDeleteMatch = url.pathname.match(
    /^\/api\/recipes\/saved\/([^/]+)$/,
  )
  if (request.method === 'DELETE' && savedRecipeDeleteMatch) {
    await handleDeleteSavedRecipe(
      savedRecipeDeleteMatch[1],
      authUser.id,
      response,
      url.searchParams.get('language'),
    )
    return
  }

  if (request.method === 'POST' && url.pathname === '/api/groq/chat') {
    await handleGroqChat(request, response)
    return
  }

  if (request.method === 'POST' && url.pathname === '/api/gemini/generate') {
    await handleGeminiGenerate(request, response)
    return
  }

  if (request.method === 'GET' && url.pathname === '/api/fridge') {
    await handleUserFridge(authUser.id, response)
    return
  }

  if (request.method === 'POST' && url.pathname === '/api/recipes/generate') {
    await handleRecipeGeneration(request, response, authUser.id)
    return
  }

  if (request.method === 'POST' && url.pathname === '/api/recipes/cooked') {
    await handleRecipeCooked(request, response, authUser.id)
    return
  }

  if (request.method === 'POST' && url.pathname === '/api/recipes/favorite') {
    await handleRecipeFavorite(request, response, authUser.id)
    return
  }

  if (request.method === 'POST' && url.pathname === '/api/receipts/parse') {
    await handleReceiptParse(request, response)
    return
  }

  if (request.method === 'POST' && url.pathname === '/api/receipts/import') {
    await handleReceiptImport(request, response, authUser.id)
    return
  }

  if (request.method === 'POST' && url.pathname === '/api/receipts/import-detail') {
    await handleReceiptImportDetail(request, response, authUser.id)
    return
  }

  if (request.method === 'GET' && url.pathname === '/api/shopping-lists') {
    await handleShoppingLists(authUser.id, response)
    return
  }

  if (request.method === 'POST' && url.pathname === '/api/shopping-lists') {
    await handleShoppingListCreate(request, response, authUser.id)
    return
  }

  const shoppingListMatch = url.pathname.match(/^\/api\/shopping-lists\/([^/]+)$/)

  if (request.method === 'GET' && shoppingListMatch) {
    await handleShoppingList(
      authUser.id,
      response,
      shoppingListMatch[1],
    )
    return
  }

  if (request.method === 'PATCH' && shoppingListMatch) {
    await handleShoppingListUpdate(
      request,
      response,
      authUser.id,
      shoppingListMatch[1],
    )
    return
  }

  if (request.method === 'DELETE' && shoppingListMatch) {
    await handleShoppingListDelete(
      response,
      authUser.id,
      shoppingListMatch[1],
    )
    return
  }

  sendJson(response, 404, {
    ok: false,
    message: 'Not found',
  })
}

async function readJsonBody(request) {
  const chunks = []

  for await (const chunk of request) {
    chunks.push(chunk)
  }

  const bodyText = Buffer.concat(chunks).toString('utf8')

  if (!bodyText) {
    return null
  }

  return JSON.parse(bodyText)
}

async function handleGroqChat(request, response) {
  try {
    const body = await readJsonBody(request)

    if (!Array.isArray(body?.messages)) {
      sendJson(response, 400, {
        ok: false,
        message: 'messages are required',
      })
      return
    }

    const completion = await createGroqChatCompletion({
      model: body.model ?? defaultGroqModel,
      messages: body.messages,
      temperature: body.temperature,
      max_tokens: body.max_tokens,
    })

    sendJson(response, 200, {
      ok: true,
      completion,
    })
  } catch (error) {
    sendJson(response, 500, {
      ok: false,
      message: error instanceof Error ? error.message : 'Groq request failed',
    })
  }
}

async function handleGeminiGenerate(request, response) {
  try {
    const body = await readJsonBody(request)
    const result = await generateGeminiContent({
      prompt: body?.prompt,
      imageBase64: body?.imageBase64,
      mimeType: body?.mimeType,
      responseMimeType: body?.responseMimeType,
      model: body?.model,
    })

    sendJson(response, 200, {
      ok: true,
      ...result,
    })
  } catch (error) {
    const statusCode = Number.isInteger(error?.statusCode)
      ? error.statusCode
      : 500

    sendJson(response, statusCode, {
      ok: false,
      message:
        error instanceof Error ? error.message : 'Gemini request failed',
      attemptedModels: error?.attemptedModels,
      skippedModels: error?.skippedModels,
      modelErrors: error?.modelErrors,
      usage: error?.usage ?? getGeminiUsageSnapshot(),
      retryAfterMs: error?.retryAfterMs,
    })
  }
}

async function handleAuthLogin(request, response) {
  try {
    const body = await readJsonBody(request)

    if (!body?.email || !body?.password) {
      sendJson(response, 400, {
        ok: false,
        message: 'email and password are required',
      })
      return
    }

    const result = await signInWithPassword({
      email: body.email,
      password: body.password,
    })

    sendJson(
      response,
      200,
      {
        ok: true,
        user: result.user,
        expiresAt: result.expiresAt,
      },
      createAuthCookieHeaders(request, result.session),
    )
  } catch (error) {
    sendJson(response, 401, {
      ok: false,
      message: error instanceof Error ? error.message : 'Login failed',
    })
  }
}

async function handleAuthRegister(request, response) {
  try {
    const body = await readJsonBody(request)

    if (!body?.email || !body?.password) {
      sendJson(response, 400, {
        ok: false,
        message: 'email and password are required',
      })
      return
    }

    const result = await signUpWithPassword({
      email: body.email,
      password: body.password,
    })

    sendJson(
      response,
      200,
      {
        ok: true,
        user: result.user,
        needsEmailConfirmation: result.needsEmailConfirmation,
      },
      createAuthCookieHeaders(request, result.session),
    )
  } catch (error) {
    sendJson(response, 400, {
      ok: false,
      message: error instanceof Error ? error.message : 'Registration failed',
    })
  }
}

async function handleAuthGoogle(request, response) {
  try {
    const body = await readJsonBody(request)
    const redirectTo = resolveSafeRedirect(request, body?.redirectTo)
    const result = await createGoogleLoginUrl({
      redirectTo,
    })

    sendJson(response, 200, {
      ok: true,
      redirectTo,
      ...result,
    })
  } catch (error) {
    sendJson(response, 400, {
      ok: false,
      message:
        error instanceof Error ? error.message : 'Google login failed',
    })
  }
}

async function handleAuthSession(request, response) {
  try {
    const body = await readJsonBody(request)
    const result = await createSessionFromTokens({
      accessToken: body?.accessToken,
      refreshToken: body?.refreshToken,
    })

    sendJson(
      response,
      200,
      {
        ok: true,
        user: result.user,
        expiresAt: result.expiresAt,
      },
      createAuthCookieHeaders(request, result.session),
    )
  } catch (error) {
    sendJson(response, 401, {
      ok: false,
      message:
        error instanceof Error ? error.message : 'Auth session failed',
    })
  }
}

async function handleAuthMe(request, response) {
  try {
    const authResult = await requireAuthenticatedUser(request)

    if (authResult.session) {
      response.authCookieHeaders = createAuthCookieHeaders(
        request,
        authResult.session,
      )
    }

    sendJson(response, 200, {
      ok: true,
      user: authResult.user,
    })
  } catch (error) {
    if (error instanceof AuthError) {
      sendJson(response, 401, {
        ok: false,
        message: 'Login is required',
      })
      return
    }

    sendJson(response, 500, {
      ok: false,
      message:
        error instanceof Error
          ? error.message
          : 'Internal server error',
    })
  }
}

async function handleAuthLogout(request, response) {
  sendJson(
    response,
    200,
    {
      ok: true,
    },
    createClearAuthCookieHeaders(request),
  )
}

async function handleAuthPasswordReset(request, response) {
  try {
    const body = await readJsonBody(request)

    if (!body?.email) {
      sendJson(response, 400, {
        ok: false,
        message: 'email is required',
      })
      return
    }

    const result = await sendPasswordResetEmail({
      email: body.email,
      redirectTo: resolveSafeRedirect(request, body?.redirectTo),
    })

    sendJson(response, 200, {
      ok: true,
      ...result,
    })
  } catch (error) {
    sendJson(response, 400, {
      ok: false,
      message:
        error instanceof Error ? error.message : 'Password reset failed',
    })
  }
}

async function handleUserFridge(userId, response) {
  try {
    const { inventory } = await getInventoryForUser(userId)
    const ingredients = inventory.map((item, index) => ({
      ingredient_id: item.inventoryId ?? item.ingredientId ?? index + 1,
      ingredient_name: item.name,
      category: item.category ?? 'その他',
      amount: item.amount,
      is_opened: false,
      best_before_date: null,
      expiration_date: item.expirationDate ?? null,
    }))
    const totalCount = ingredients.length
    const categoriesCount = new Set(
      ingredients.map((item) => item.category ?? 'その他'),
    ).size
    const openedCount = ingredients.filter((item) => item.is_opened).length
    const now = new Date()
    now.setHours(0, 0, 0, 0)
    const nearExpirationCount = ingredients.filter((item) => {
      if (!item.expiration_date) {
        return false
      }

      const expiration = new Date(`${item.expiration_date}T00:00:00`)

      if (Number.isNaN(expiration.getTime())) {
        return false
      }

      const diffDays = Math.ceil(
        (expiration.getTime() - now.getTime()) / (1000 * 60 * 60 * 24),
      )

      return diffDays >= 0 && diffDays <= 3
    }).length

    sendJson(response, 200, {
      ok: true,
      userId,
      summary: {
        totalCount,
        categoriesCount,
        openedCount,
        nearExpirationCount,
      },
      ingredients,
    })
  } catch (error) {
    sendJson(response, 500, {
      ok: false,
      message:
        error instanceof Error ? error.message : 'Fridge request failed',
    })
  }
}

async function handleInventory(userId, response, language) {
  try {
    const inventory = await getInventoryForUser(userId, language)
    sendJson(response, 200, {
      ok: true,
      ...inventory,
    })
  } catch (error) {
    sendJson(response, 500, {
      ok: false,
      message:
        error instanceof Error ? error.message : 'Inventory request failed',
    })
  }
}

async function handleInventoryCreate(request, response, userId) {
  try {
    const body = await readJsonBody(request)
    const result = await createInventoryItemForUser({
      userId,
      item: body,
    })

    sendJson(response, 200, {
      ok: true,
      ...result,
    })
  } catch (error) {
    sendJson(response, 500, {
      ok: false,
      message:
        error instanceof Error ? error.message : 'Inventory create failed',
    })
  }
}

async function handleInventoryUpdate(request, response, userId) {
  try {
    const body = await readJsonBody(request)
    const result = await updateInventoryItemForUser({
      userId,
      inventoryId: body?.inventoryId,
      item: body,
    })

    sendJson(response, 200, {
      ok: true,
      ...result,
    })
  } catch (error) {
    sendJson(response, 500, {
      ok: false,
      message:
        error instanceof Error ? error.message : 'Inventory update failed',
    })
  }
}

async function handleInventoryDelete(request, response, userId, inventoryId) {
  try {
    const result = await deleteInventoryItemForUser({
      userId,
      inventoryId,
    })

    sendJson(response, 200, {
      ok: true,
      ...result,
    })
  } catch (error) {
    sendJson(response, 500, {
      ok: false,
      message:
        error instanceof Error ? error.message : 'Inventory delete failed',
    })
  }
}

async function handlePreferences(userId, response) {
  try {
    const result = await getUserPreferences(userId)

    sendJson(response, 200, {
      ok: true,
      ...result,
    })
  } catch (error) {
    sendJson(response, 500, {
      ok: false,
      message:
        error instanceof Error ? error.message : 'Preferences request failed',
    })
  }
}

async function handleAuthPasswordUpdate(request, response) {
  try {
    const body = await readJsonBody(request)
    const result = await updatePasswordWithTokens({
      accessToken: body?.accessToken,
      refreshToken: body?.refreshToken,
      password: body?.password,
    })

    sendJson(
      response,
      200,
      {
        ok: true,
        user: result.user,
        expiresAt: result.expiresAt,
      },
      createAuthCookieHeaders(request, result.session),
    )
  } catch (error) {
    sendJson(response, 400, {
      ok: false,
      message:
        error instanceof Error ? error.message : 'Password update failed',
    })
  }
}

async function handlePreferencesUpdate(request, response, userId) {
  try {
    const body = await readJsonBody(request)
    const result = await updateUserPreferences({
      userId,
      preferences: body?.preferences,
    })

    sendJson(response, 200, {
      ok: true,
      ...result,
    })
  } catch (error) {
    sendJson(response, 500, {
      ok: false,
      message:
        error instanceof Error ? error.message : 'Preferences update failed',
    })
  }
}

async function handleContactSubmit(request, response, user) {
  try {
    const body = await readJsonBody(request)
    const contactMessage = await submitContactMessageForUser(user, {
      ...body,
      userAgent: request.headers['user-agent'] ?? null,
    })

    sendJson(response, 200, {
      ok: true,
      contactMessage,
    })
  } catch (error) {
    const message =
      error instanceof Error ? error.message : 'Contact request failed'
    const statusCode = /required/.test(message) ? 400 : 500

    sendJson(response, statusCode, {
      ok: false,
      message,
    })
  }
}

async function handleAdminContactMessages(user, response) {
  try {
    const contactMessages = await getContactMessagesForAdmin(user)

    sendJson(response, 200, {
      ok: true,
      contactMessages,
    })
  } catch (error) {
    const message =
      error instanceof Error ? error.message : 'Admin contact request failed'
    const statusCode = /Admin permission/.test(message) ? 403 : 500

    sendJson(response, statusCode, {
      ok: false,
      message,
    })
  }
}

async function handleAdminContactReply(request, response, user) {
  try {
    const body = await readJsonBody(request)
    const userMessages = await sendContactReplyForAdmin(user, body)

    sendJson(response, 200, {
      ok: true,
      userMessages,
    })
  } catch (error) {
    const message =
      error instanceof Error ? error.message : 'Admin contact reply failed'
    const statusCode = /Admin permission/.test(message)
      ? 403
      : /required|missing/.test(message)
        ? 400
        : 500

    sendJson(response, statusCode, {
      ok: false,
      message,
    })
  }
}

async function handleUserMessages(userId, response) {
  try {
    const messages = await getMessagesForUser(userId)

    sendJson(response, 200, {
      ok: true,
      messages,
    })
  } catch (error) {
    sendJson(response, 500, {
      ok: false,
      message:
        error instanceof Error ? error.message : 'Messages request failed',
    })
  }
}

async function handleUserMessagesRead(request, response, userId) {
  try {
    const body = await readJsonBody(request)
    const messages = await markMessagesReadForUser(userId, body?.messageIds)

    sendJson(response, 200, {
      ok: true,
      messages,
    })
  } catch (error) {
    sendJson(response, 500, {
      ok: false,
      message:
        error instanceof Error ? error.message : 'Messages update failed',
    })
  }
}

async function handleRecipeGeneration(request, response, userId) {
  let body = null

  try {
    body = await readJsonBody(request)
    const { preferences } = await getUserPreferences(userId)
    const result = await generateAndSaveRecipes({
      userId,
      servings: body?.servings,
      language: body?.language,
      avoidedIngredients: body?.avoidedIngredients,
      cookingRequest: body?.cookingRequest,
      modelChoice: preferences.recipeModel,
      seasoningMode: body?.seasoningMode,
    })

    sendJson(response, 200, {
      ok: true,
      ...result,
    })
  } catch (error) {
    const statusCode = Number.isInteger(error?.statusCode)
      ? error.statusCode
      : 500
    const message =
      error instanceof Error && error.message === 'Inventory is empty'
        ? body?.language === 'en'
          ? 'Add ingredients before generating recipes.'
          : body?.language === 'fr'
            ? 'Ajoutez des ingrédients avant de générer des recettes.'
            : '食材を登録してからレシピを生成してください。'
        : error instanceof Error
          ? error.message
          : 'Recipe generation failed'

    sendJson(response, statusCode, {
      ok: false,
      message,
    })
  }
}

async function handleCookingHistory(userId, response, language) {
  try {
    const history = await getCookingHistoryForUser(userId, language)
    sendJson(response, 200, {
      ok: true,
      ...history,
    })
  } catch (error) {
    sendJson(response, 500, {
      ok: false,
      message:
        error instanceof Error
          ? error.message
          : 'Cooking history request failed',
    })
  }
}

async function handleSavedRecipes(userId, response, language) {
  try {
    const recipes = await getSavedRecipesForUser(userId, language)
    sendJson(response, 200, {
      ok: true,
      ...recipes,
    })
  } catch (error) {
    sendJson(response, 500, {
      ok: false,
      message:
        error instanceof Error
          ? error.message
          : 'Saved recipes request failed',
    })
  }
}

async function handleDeleteSavedRecipe(recipeId, userId, response, language) {
  try {
    const recipes = await deleteSavedRecipeForUser({
      recipeId: decodeURIComponent(recipeId),
      userId,
      language,
    })
    sendJson(response, 200, {
      ok: true,
      ...recipes,
    })
  } catch (error) {
    const statusCode =
      error instanceof Error && error.message === 'Recipe not found' ? 404 : 500
    sendJson(response, statusCode, {
      ok: false,
      message:
        error instanceof Error ? error.message : 'Saved recipe delete failed',
    })
  }
}

async function handleRecipeCooked(request, response, userId) {
  try {
    const body = await readJsonBody(request)
    const result = await markRecipeCooked({
      recipeId: body?.recipeId,
      servings: body?.servings,
      userId,
      language: body?.language,
    })

    sendJson(response, 200, {
      ok: true,
      ...result,
    })
  } catch (error) {
    const statusCode = Number.isInteger(error?.statusCode)
      ? error.statusCode
      : 500

    sendJson(response, statusCode, {
      ok: false,
      message: error instanceof Error ? error.message : 'Cooking failed',
    })
  }
}

async function handleRecipeFavorite(request, response, userId) {
  try {
    const body = await readJsonBody(request)
    const result = await setRecipeFavorite({
      recipeId: body?.recipeId,
      isFavorite: body?.isFavorite,
      userId,
    })

    sendJson(response, 200, {
      ok: true,
      ...result,
    })
  } catch (error) {
    sendJson(response, 500, {
      ok: false,
      message:
        error instanceof Error ? error.message : 'Favorite update failed',
    })
  }
}

async function handleReceiptParse(request, response) {
  let body = null

  try {
    body = await readJsonBody(request)
    const result = await parseReceiptText({
      ocrText: body?.ocrText,
      registrationDate: body?.registrationDate,
    })

    sendJson(response, 200, {
      ok: true,
      ...result,
    })
  } catch (error) {
    const fallbackItems = fallbackParseReceiptText(body?.ocrText ?? '')

    if (fallbackItems.length) {
      sendJson(response, 200, {
        ok: true,
        items: fallbackItems,
        fallback: true,
        message:
          error instanceof Error ? error.message : 'Receipt parse failed',
      })
      return
    }

    sendJson(response, 500, {
      ok: false,
      message:
        error instanceof Error ? error.message : 'Receipt parse failed',
    })
  }
}

async function handleReceiptImport(request, response, userId) {
  try {
    const body = await readJsonBody(request)
    const result = await importReceiptItems({
      items: body?.items,
      userId,
    })
    const inventory = await getInventoryForUser(result.userId)

    sendJson(response, 200, {
      ok: true,
      ...result,
      inventory: inventory.inventory,
    })
  } catch (error) {
    sendJson(response, 500, {
      ok: false,
      message:
        error instanceof Error ? error.message : 'Receipt import failed',
    })
  }
}

async function handleReceiptImportDetail(request, response, userId) {
  try {
    const body = await readJsonBody(request)
    const result = await importReceiptItemsDetail({
      items: body?.items,
      userId,
    })
    const inventory = await getInventoryForUser(result.userId)

    sendJson(response, 200, {
      ok: true,
      ...result,
      inventory: inventory.inventory,
    })
  } catch (error) {
    sendJson(response, 500, {
      ok: false,
      message:
        error instanceof Error ? error.message : 'Receipt import detail failed',
    })
  }
}

async function handleShoppingLists(userId, response) {
  try {
    const result = await getShoppingListsForUser(userId)
    sendJson(response, 200, {
      ok: true,
      ...result,
    })
  } catch (error) {
    sendJson(response, 500, {
      ok: false,
      message:
        error instanceof Error ? error.message : 'Shopping lists request failed',
    })
  }
}

async function handleShoppingList(userId, response, shoppingListId) {
  try {
    const result = await getShoppingListForUser(userId, shoppingListId)
    sendJson(response, 200, {
      ok: true,
      ...result,
    })
  } catch (error) {
    const statusCode =
      error instanceof Error && error.message === 'Shopping list not found'
        ? 404
        : 500
    sendJson(response, statusCode, {
      ok: false,
      message:
        error instanceof Error ? error.message : 'Shopping list request failed',
    })
  }
}

async function handleShoppingListCreate(request, response, userId) {
  try {
    const body = await readJsonBody(request)
    const result = await createShoppingListForUser({
      userId,
      payload: body,
    })
    sendJson(response, 200, {
      ok: true,
      ...result,
    })
  } catch (error) {
    const statusCode =
      error instanceof Error && /required|名前/.test(error.message) ? 400 : 500
    sendJson(response, statusCode, {
      ok: false,
      message:
        error instanceof Error ? error.message : 'Shopping list create failed',
    })
  }
}

async function handleShoppingListUpdate(request, response, userId, shoppingListId) {
  try {
    const body = await readJsonBody(request)
    const result = await updateShoppingListForUser({
      userId,
      shoppingListId,
      payload: body,
    })
    sendJson(response, 200, {
      ok: true,
      ...result,
    })
  } catch (error) {
    const statusCode =
      error instanceof Error && error.message === 'Shopping list not found'
        ? 404
        : error instanceof Error && /required|名前/.test(error.message)
          ? 400
          : 500
    sendJson(response, statusCode, {
      ok: false,
      message:
        error instanceof Error ? error.message : 'Shopping list update failed',
    })
  }
}

async function handleShoppingListDelete(response, userId, shoppingListId) {
  try {
    const result = await deleteShoppingListForUser({
      userId,
      shoppingListId,
    })
    sendJson(response, 200, {
      ok: true,
      ...result,
    })
  } catch (error) {
    sendJson(response, 500, {
      ok: false,
      message:
        error instanceof Error ? error.message : 'Shopping list delete failed',
    })
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const server = createServer(handleApiRequest)

  server.listen(port, () => {
    console.info(`[node] API server listening on http://localhost:${port}`)
  })
}
