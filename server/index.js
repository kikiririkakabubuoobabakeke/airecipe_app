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
} from './gemini.js'
import {
  createGoogleLoginUrl,
  sendPasswordResetEmail,
  signInWithPassword,
  signUpWithPassword,
} from './auth.js'
import {
  generateAndSaveRecipes,
  getCookingHistoryForUser,
  getInventoryForUser,
  getSavedRecipesForUser,
  markRecipeCooked,
  setRecipeFavorite,
} from './recipes.js'
import {
  fallbackParseReceiptText,
  importReceiptItems,
  parseReceiptText,
} from './receipts.js'
import { checkSupabaseConnection } from './supabase.js'
import pg from 'pg'
const { Pool } = pg

const port = Number(process.env.PORT ?? 8787)

// PostgreSQL Pool Initialization
let pool = null
if (process.env.DATABASE_URL) {
  console.log('[node] DATABASE_URL is configured. Initializing DB pool...')
  pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.DATABASE_URL.includes('supabase') ? { rejectUnauthorized: false } : false
  })
} else {
  console.warn('[node] DATABASE_URL is not configured. Fridge API will use mock data.')
}

// Initialize Database Table if database is connected
async function initializeDatabase() {
  if (!pool) return
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS ingredient_management (
        ingredient_id SERIAL PRIMARY KEY,
        user_id UUID NOT NULL,
        ingredient_name VARCHAR(255) NOT NULL,
        category VARCHAR(100) NOT NULL,
        barcode VARCHAR(100),
        amount VARCHAR(50),
        is_opened BOOLEAN DEFAULT FALSE,
        best_before_date DATE,
        expiration_date DATE,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `)

    const columnsToCheck = [
      { name: 'amount', type: 'VARCHAR(50)' },
      { name: 'is_opened', type: 'BOOLEAN DEFAULT FALSE' },
      { name: 'best_before_date', type: 'DATE' },
      { name: 'expiration_date', type: 'DATE' }
    ]

    for (const col of columnsToCheck) {
      const res = await pool.query(`
        SELECT column_name 
        FROM information_schema.columns 
        WHERE table_name='ingredient_management' AND column_name='${col.name}'
      `)
      if (res.rowCount === 0) {
        console.log(`[node] Adding column ${col.name} to ingredient_management...`)
        await pool.query(`ALTER TABLE ingredient_management ADD COLUMN ${col.name} ${col.type}`)
      }
    }

    const dataCheck = await pool.query('SELECT COUNT(*) FROM ingredient_management')
    if (parseInt(dataCheck.rows[0].count, 10) === 0) {
      console.log('[node] Inserting initial sample data to ingredient_management...')
      const now = new Date()
      const addDays = (d, n) => {
        const res = new Date(d)
        res.setDate(res.getDate() + n)
        return res.toISOString().split('T')[0]
      }
      await pool.query(`
        INSERT INTO ingredient_management 
        (user_id, ingredient_name, category, amount, is_opened, best_before_date, expiration_date)
        VALUES 
        ('00000000-0000-0000-0000-000000000000', '鮭切り身', '肉・卵・魚', '320g', FALSE, '${addDays(now, 0)}', '${addDays(now, 0)}'),
        ('00000000-0000-0000-0000-000000000000', '小松菜', '野菜', '1束', FALSE, '${addDays(now, 1)}', '${addDays(now, 1)}'),
        ('00000000-0000-0000-0000-000000000000', '牛乳', '乳製品', '500ml', TRUE, '${addDays(now, 2)}', '${addDays(now, 2)}'),
        ('00000000-0000-0000-0000-000000000000', 'キャベツ', '野菜', '1玉', FALSE, '${addDays(now, 5)}', '${addDays(now, 7)}'),
        ('00000000-0000-0000-0000-000000000000', '納豆', '加工品', '3パック', FALSE, '${addDays(now, 4)}', '${addDays(now, 6)}')
      `)
    }
    console.log('[node] Database initialization completed successfully.')
  } catch (err) {
    console.error('[node] Failed to initialize database:', err)
  }
}

if (pool) {
  initializeDatabase()
}

function sendJson(response, statusCode, payload) {
  response.writeHead(statusCode, {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'content-type',
    'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
    'Content-Type': 'application/json; charset=utf-8',
  })
  response.end(JSON.stringify(payload))
}

export async function handleApiRequest(request, response) {
  if (request.method === 'OPTIONS') {
    response.writeHead(204, {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Headers': 'content-type',
      'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
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

  if (request.method === 'GET' && url.pathname === '/api/inventory') {
    await handleInventory(url, response)
    return
  }

  if (request.method === 'GET' && url.pathname === '/api/cooking-history') {
    await handleCookingHistory(url, response)
    return
  }

  if (request.method === 'GET' && url.pathname === '/api/recipes/saved') {
    await handleSavedRecipes(url, response)
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

  if (request.method === 'POST' && url.pathname === '/api/auth/password-reset') {
    await handleAuthPasswordReset(request, response)
    return
  }

  if (request.method === 'GET' && url.pathname === '/api/fridge') {
    await handleGetFridge(request, response)
    return
  }

  if (request.method === 'POST' && url.pathname === '/api/recipes/generate') {
    await handleRecipeGeneration(request, response)
    return
  }

  if (request.method === 'POST' && url.pathname === '/api/recipes/cooked') {
    await handleRecipeCooked(request, response)
    return
  }

  if (request.method === 'POST' && url.pathname === '/api/recipes/favorite') {
    await handleRecipeFavorite(request, response)
    return
  }

  if (request.method === 'POST' && url.pathname === '/api/receipts/parse') {
    await handleReceiptParse(request, response)
    return
  }

  if (request.method === 'POST' && url.pathname === '/api/receipts/import') {
    await handleReceiptImport(request, response)
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
      model: body?.model,
    })

    sendJson(response, 200, {
      ok: true,
      ...result,
    })
  } catch (error) {
    sendJson(response, 500, {
      ok: false,
      message:
        error instanceof Error ? error.message : 'Gemini request failed',
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

    sendJson(response, 200, {
      ok: true,
      ...result,
    })
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

    sendJson(response, 200, {
      ok: true,
      ...result,
    })
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
    const result = await createGoogleLoginUrl({
      redirectTo: body?.redirectTo,
    })

    sendJson(response, 200, {
      ok: true,
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
      redirectTo: body?.redirectTo,
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

function getMockData() {
  const now = new Date()
  const addDays = (n) => {
    const res = new Date(now)
    res.setDate(res.getDate() + n)
    return res.toISOString().split('T')[0]
  }
  const mockIngredients = [
    { ingredient_id: 1, ingredient_name: '鮭切り身', category: '肉・卵・魚', amount: '320g', is_opened: false, best_before_date: addDays(0), expiration_date: addDays(0) },
    { ingredient_id: 2, ingredient_name: '小松菜', category: '野菜', amount: '1束', is_opened: false, best_before_date: addDays(1), expiration_date: addDays(1) },
    { ingredient_id: 3, ingredient_name: '牛乳', category: '乳製品', amount: '500ml', is_opened: true, best_before_date: addDays(2), expiration_date: addDays(2) },
    { ingredient_id: 4, ingredient_name: 'キャベツ', category: '野菜', amount: '1玉', is_opened: false, best_before_date: addDays(5), expiration_date: addDays(7) },
    { ingredient_id: 5, ingredient_name: '納豆', category: '加工品', amount: '3パック', is_opened: false, best_before_date: addDays(4), expiration_date: addDays(6) },
  ]

  const totalCount = mockIngredients.length
  const uniqueNamesCount = new Set(mockIngredients.map(i => i.ingredient_name)).size
  const openedCount = mockIngredients.filter(i => i.is_opened).length
  
  const nearExpirationCount = mockIngredients.filter(i => {
    const exp = new Date(i.expiration_date)
    const diffTime = exp - now
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24))
    return diffDays >= 0 && diffDays <= 3
  }).length

  return {
    summary: {
      totalCount,
      uniqueNamesCount,
      openedCount,
      nearExpirationCount
    },
    ingredients: mockIngredients
  }
}

async function handleGetFridge(request, response) {
  if (!pool) {
    sendJson(response, 200, getMockData())
    return
  }

  try {
    const res = await pool.query('SELECT * FROM ingredient_management ORDER BY category, ingredient_name')
    const ingredients = res.rows.map(row => ({
      ingredient_id: row.ingredient_id,
      ingredient_name: row.ingredient_name,
      category: row.category,
      amount: row.amount || '1個',
      is_opened: !!row.is_opened,
      best_before_date: row.best_before_date ? new Date(row.best_before_date).toISOString().split('T')[0] : null,
      expiration_date: row.expiration_date ? new Date(row.expiration_date).toISOString().split('T')[0] : null
    }))

    const totalCount = ingredients.length
    const uniqueNamesCount = new Set(ingredients.map(i => i.ingredient_name)).size
    const openedCount = ingredients.filter(i => i.is_opened).length

    const now = new Date()
    now.setHours(0, 0, 0, 0)
    const nearExpirationCount = ingredients.filter(i => {
      if (!i.expiration_date) return false
      const exp = new Date(i.expiration_date)
      exp.setHours(0, 0, 0, 0)
      const diffTime = exp - now
      const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24))
      return diffDays >= 0 && diffDays <= 3
    }).length

    sendJson(response, 200, {
      summary: {
        totalCount,
        uniqueNamesCount,
        openedCount,
        nearExpirationCount
      },
      ingredients
    })
  } catch (error) {
    console.error('[node] Database query failed, returning mock data:', error)
    sendJson(response, 200, getMockData())
  }
}

async function handleInventory(url, response) {
  try {
    const inventory = await getInventoryForUser(url.searchParams.get('userId'))
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

async function handleRecipeGeneration(request, response) {
  try {
    const body = await readJsonBody(request)
    const result = await generateAndSaveRecipes({
      userId: body?.userId,
      servings: body?.servings,
    })

    sendJson(response, 200, {
      ok: true,
      ...result,
    })
  } catch (error) {
    sendJson(response, 500, {
      ok: false,
      message:
        error instanceof Error ? error.message : 'Recipe generation failed',
    })
  }
}

async function handleCookingHistory(url, response) {
  try {
    const history = await getCookingHistoryForUser(url.searchParams.get('userId'))
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

async function handleSavedRecipes(url, response) {
  try {
    const recipes = await getSavedRecipesForUser(url.searchParams.get('userId'))
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

async function handleRecipeCooked(request, response) {
  try {
    const body = await readJsonBody(request)
    const result = await markRecipeCooked({
      recipeId: body?.recipeId,
      servings: body?.servings,
      userId: body?.userId,
    })

    sendJson(response, 200, {
      ok: true,
      ...result,
    })
  } catch (error) {
    sendJson(response, 500, {
      ok: false,
      message: error instanceof Error ? error.message : 'Cooking failed',
    })
  }
}

async function handleRecipeFavorite(request, response) {
  try {
    const body = await readJsonBody(request)
    const result = await setRecipeFavorite({
      recipeId: body?.recipeId,
      isFavorite: body?.isFavorite,
      userId: body?.userId,
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

async function handleReceiptImport(request, response) {
  try {
    const body = await readJsonBody(request)
    const result = await importReceiptItems({
      items: body?.items,
      userId: body?.userId,
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

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const server = createServer(handleApiRequest)

  server.listen(port, () => {
    console.info(`[node] API server listening on http://localhost:${port}`)
  })
}
