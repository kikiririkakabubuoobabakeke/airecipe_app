import { createGroqChatCompletion, defaultGroqModel } from './groq.js'
import { isSupabaseServiceRoleConfigured, supabase } from './supabase.js'

const demoUserId = process.env.AI_RECIPE_DEMO_USER_ID

function ensureSupabase() {
  if (!supabase) {
    throw new Error('Supabase is not configured')
  }

  if (!isSupabaseServiceRoleConfigured) {
    throw new Error(
      'SUPABASE_SERVICE_ROLE_KEY is required for recipe and inventory operations',
    )
  }

  return supabase
}

async function resolveUserId(requestedUserId) {
  if (requestedUserId) {
    return requestedUserId
  }

  if (demoUserId) {
    return demoUserId
  }

  throw new Error('AI_RECIPE_DEMO_USER_ID is required in .env.')
}

function formatAmount(row) {
  if (row.gram && row.gram > 0) {
    return `${row.gram}g`
  }

  if (row.quantity && row.quantity > 0) {
    return `${row.quantity}個`
  }

  return '残量未設定'
}

function getExpirationStatus(expirationDate) {
  if (!expirationDate) {
    return '期限未設定'
  }

  const today = new Date()
  today.setHours(0, 0, 0, 0)

  const expiry = new Date(`${expirationDate}T00:00:00`)
  const diffDays = Math.ceil(
    (expiry.getTime() - today.getTime()) / (1000 * 60 * 60 * 24),
  )

  if (diffDays < 0) {
    return '期限切れ'
  }

  if (diffDays === 0) {
    return '今日まで'
  }

  if (diffDays === 1) {
    return '明日まで'
  }

  return `残り${diffDays}日`
}

function mapInventoryRows(rows) {
  return rows.map((row) => {
    const ingredient = row.ingredient_management

    return {
      inventoryId: row.inventory_id,
      ingredientId: row.ingredient_id,
      name: ingredient?.ingredient_name ?? '名称未設定',
      category: ingredient?.category ?? null,
      quantity: row.quantity ?? 0,
      gram: row.gram ?? 0,
      amount: formatAmount(row),
      expirationDate: row.expiration_date,
      status: getExpirationStatus(row.expiration_date),
      memo: row.memo ?? null,
    }
  })
}

export async function getInventoryForUser(requestedUserId) {
  const userId = await resolveUserId(requestedUserId)
  const client = ensureSupabase()
  const { data, error } = await client
    .from('inventory')
    .select(
      `
      inventory_id,
      ingredient_id,
      user_id,
      quantity,
      gram,
      expiration_date,
      purchase_date,
      memo,
      ingredient_management (
        ingredient_id,
        ingredient_name,
        category,
        barcode
      )
    `,
    )
    .eq('user_id', userId)
    .order('expiration_date', { ascending: true, nullsFirst: false })

  if (error) {
    throw new Error(`Failed to fetch inventory: ${error.message}`)
  }

  return {
    userId,
    inventory: mapInventoryRows(data ?? []),
  }
}

function buildRecipePrompt(inventory, servings) {
  const ingredientLines = inventory
    .filter((item) => item.ingredientId)
    .map((item) =>
      [
        `ingredient_id: ${item.ingredientId}`,
        `name: ${item.name}`,
        `amount: ${item.amount}`,
        `expiration: ${item.status}`,
        item.category ? `category: ${item.category}` : null,
      ]
        .filter(Boolean)
        .join(', '),
    )
    .join('\n')

  return `以下の在庫食材だけを優先して、家庭料理のレシピ候補を2件作ってください。

条件:
- 返答はJSONのみ。Markdownや説明文は禁止。
- 各材料の amount は必ず1人前の使用量にしてください。
- ingredient_id は下の在庫一覧にあるものだけを使ってください。
- 在庫にない材料は recipe_ingredients に含めないでください。
- 期限が近い食材を優先してください。
- 調理時間は30分以内を優先してください。
- 日本語で返してください。

想定人数: ${servings}人分を作りやすいレシピ。ただし保存する材料量は1人前。

在庫:
${ingredientLines}

JSON形式:
{
  "recipes": [
    {
      "name": "レシピ名",
      "cook_time": 20,
      "difficulty": "かんたん",
      "reason": "このレシピを提案する理由",
      "tags": ["期限優先", "時短"],
      "steps": ["手順1", "手順2"],
      "ingredients": [
        {
          "ingredient_id": 1,
          "ingredient_name": "食材名",
          "amount": 100,
          "unit": "g"
        }
      ]
    }
  ]
}`
}

function parseJsonFromModel(content) {
  const trimmed = content.trim()
  const withoutFence = trimmed
    .replace(/^```json\s*/i, '')
    .replace(/^```\s*/i, '')
    .replace(/\s*```$/i, '')

  return JSON.parse(withoutFence)
}

function toRecipeRows(payload) {
  if (!Array.isArray(payload?.recipes)) {
    throw new Error('Groq response did not include recipes')
  }

  return payload.recipes.slice(0, 2).map((recipe) => ({
    name: String(recipe.name ?? '名称未設定'),
    cookTime: Number(recipe.cook_time ?? recipe.cookTime ?? 0),
    difficulty: String(recipe.difficulty ?? 'かんたん'),
    reason: String(recipe.reason ?? ''),
    tags: Array.isArray(recipe.tags) ? recipe.tags.map(String) : [],
    steps: Array.isArray(recipe.steps) ? recipe.steps.map(String) : [],
    ingredients: Array.isArray(recipe.ingredients)
      ? recipe.ingredients.map((ingredient) => ({
          ingredientId: Number(
            ingredient.ingredient_id ?? ingredient.ingredientId,
          ),
          ingredientName: String(
            ingredient.ingredient_name ?? ingredient.ingredientName ?? '',
          ),
          amount: Number(ingredient.amount ?? 0),
          unit: String(ingredient.unit ?? ''),
        }))
      : [],
  }))
}

function buildCookProcess(recipe) {
  const reason = recipe.reason ? [`提案理由: ${recipe.reason}`] : []
  const steps = recipe.steps.map((step, index) => `${index + 1}. ${step}`)
  const tags = recipe.tags.length ? [`タグ: ${recipe.tags.join(', ')}`] : []

  return [...reason, ...steps, ...tags].join('\n')
}

function parseCookProcess(cookProcess) {
  if (!cookProcess) {
    return {
      reason: '',
      tags: [],
      steps: [],
    }
  }

  const lines = cookProcess
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
  const reasonLine = lines.find((line) => line.startsWith('提案理由:'))
  const tagLine = lines.find((line) => line.startsWith('タグ:'))
  const steps = lines
    .filter((line) => !line.startsWith('提案理由:') && !line.startsWith('タグ:'))
    .map((line) => line.replace(/^\d+\.\s*/, ''))

  return {
    reason: reasonLine?.replace('提案理由:', '').trim() ?? '',
    tags:
      tagLine
        ?.replace('タグ:', '')
        .split(',')
        .map((tag) => tag.trim())
        .filter(Boolean) ?? [],
    steps,
  }
}

function buildMeta(recipe) {
  return `${recipe.cook_time ?? 0}分 / 保存済みレシピ`
}

function mapRecipeIngredients(recipe) {
  return (
    recipe?.recipe_ingredients?.map((ingredient) => ({
      ingredientId: ingredient.ingredient_id,
      name: ingredient.ingredient_management?.ingredient_name ?? '名称未設定',
      amount: ingredient.required_amount,
      unit: ingredient.unit,
    })) ?? []
  )
}

function getLatestCookedAt(historyRows) {
  const cookedTimes = (historyRows ?? [])
    .map((history) => history.cooked_at)
    .filter(Boolean)
    .sort((a, b) => new Date(b).getTime() - new Date(a).getTime())

  return cookedTimes[0] ?? null
}

function mapSavedRecipe(recipe, savedRecipe, savedIngredients) {
  const cookProcess = buildCookProcess(recipe)

  return {
    recipeId: savedRecipe.recipe_id,
    name: savedRecipe.name,
    cookTime: savedRecipe.cook_time,
    servings: 1,
    difficulty: recipe.difficulty,
    reason: recipe.reason,
    cookProcess,
    steps: recipe.steps,
    tags: recipe.tags,
    meta: `${savedRecipe.cook_time ?? recipe.cookTime}分 / ${recipe.difficulty}`,
    ingredients: savedIngredients.map((ingredient) => ({
      ingredientId: ingredient.ingredient_id,
      name: ingredient.ingredientName,
      amount: ingredient.required_amount,
      unit: ingredient.unit,
    })),
  }
}

function mapHistoryRecipe(row) {
  const recipe = row.recipes
  const parsed = parseCookProcess(recipe?.cook_process ?? '')
  const ingredients = mapRecipeIngredients(recipe)

  return {
    historyId: row.history_id,
    cookedAt: row.cooked_at,
    recipeId: recipe?.recipe_id,
    name: recipe?.name ?? '名称未設定',
    cookTime: recipe?.cook_time ?? 0,
    servings: 1,
    difficulty: '保存済み',
    reason: parsed.reason,
    cookProcess: recipe?.cook_process ?? '',
    steps: parsed.steps,
    tags: parsed.tags.length ? parsed.tags : ['調理履歴'],
    meta: buildMeta(recipe ?? {}),
    ingredients,
  }
}

function mapStoredRecipe(recipe, userId) {
  const parsed = parseCookProcess(recipe?.cook_process ?? '')
  const cookedCount = recipe?.cooking_history?.length ?? 0
  const cookedAt = getLatestCookedAt(recipe?.cooking_history)
  const isFavorite = (recipe?.favorites ?? []).some(
    (favorite) => favorite.user_id === userId,
  )
  const tags = parsed.tags.length ? parsed.tags : ['保存済み']

  return {
    recipeId: recipe?.recipe_id,
    createdAt: recipe?.created_at,
    cookedAt,
    cookedCount,
    isCooked: cookedCount > 0,
    isFavorite,
    name: recipe?.name ?? '名称未設定',
    cookTime: recipe?.cook_time ?? 0,
    servings: 1,
    difficulty: '保存済み',
    reason: parsed.reason,
    cookProcess: recipe?.cook_process ?? '',
    steps: parsed.steps,
    tags: isFavorite ? ['お気に入り', ...tags] : tags,
    meta: `${recipe?.cook_time ?? 0}分 / ${
      cookedCount > 0 ? `調理${cookedCount}回` : '未調理'
    }`,
    ingredients: mapRecipeIngredients(recipe),
  }
}

export async function generateAndSaveRecipes({ userId: requestedUserId, servings = 2 }) {
  const { userId, inventory } = await getInventoryForUser(requestedUserId)

  if (inventory.length === 0) {
    throw new Error('Inventory is empty')
  }

  const completion = await createGroqChatCompletion({
    model: defaultGroqModel,
    messages: [
      {
        role: 'system',
        content:
          'あなたは家庭料理に詳しいレシピ提案アシスタントです。必ず指定されたJSON形式だけで返答します。',
      },
      {
        role: 'user',
        content: buildRecipePrompt(inventory, servings),
      },
    ],
    temperature: 0.85,
    top_p: 0.9,
    frequency_penalty: 0.25,
    presence_penalty: 0.2,
    max_tokens: 2500,
    response_format: {
      type: 'json_object',
    },
  })

  const content = completion?.choices?.[0]?.message?.content

  if (!content) {
    throw new Error('Groq response was empty')
  }

  const recipes = toRecipeRows(parseJsonFromModel(content))
  const ingredientById = new Map(
    inventory.map((item) => [Number(item.ingredientId), item]),
  )
  const client = ensureSupabase()
  const savedRecipes = []

  for (const recipe of recipes) {
    const { data: savedRecipe, error: recipeError } = await client
      .from('recipes')
      .insert({
        user_id: userId,
        name: recipe.name,
        cook_time: recipe.cookTime || null,
        cook_process: buildCookProcess(recipe),
      })
      .select('recipe_id, name, cook_time, cook_process')
      .single()

    if (recipeError) {
      throw new Error(`Failed to save recipe: ${recipeError.message}`)
    }

    const recipeIngredients = recipe.ingredients
      .filter((ingredient) => ingredientById.has(ingredient.ingredientId))
      .filter((ingredient) => ingredient.amount > 0 && ingredient.unit)
      .map((ingredient) => ({
        recipe_id: savedRecipe.recipe_id,
        ingredient_id: ingredient.ingredientId,
        required_amount: ingredient.amount,
        unit: ingredient.unit,
      }))

    let savedIngredients = []

    if (recipeIngredients.length) {
      const { data, error } = await client
        .from('recipe_ingredients')
        .insert(recipeIngredients)
        .select('ingredient_id, required_amount, unit')

      if (error) {
        throw new Error(`Failed to save recipe ingredients: ${error.message}`)
      }

      savedIngredients = (data ?? []).map((ingredient) => ({
        ...ingredient,
        ingredientName:
          ingredientById.get(Number(ingredient.ingredient_id))?.name ??
          '名称未設定',
      }))
    }

    savedRecipes.push(mapSavedRecipe(recipe, savedRecipe, savedIngredients))
  }

  return {
    userId,
    recipes: savedRecipes,
  }
}

function unitUsesGram(unit) {
  const normalized = unit.trim().toLowerCase()
  return ['g', 'gram', 'grams', 'グラム', 'ml', 'ミリリットル'].includes(
    normalized,
  )
}

async function reduceInventoryAmount({ userId, ingredientId, amount, unit }) {
  const client = ensureSupabase()
  const column = unitUsesGram(unit) ? 'gram' : 'quantity'
  let remaining = column === 'quantity' ? Math.ceil(amount) : Math.ceil(amount)
  const deductions = []

  const { data: rows, error } = await client
    .from('inventory')
    .select('inventory_id, quantity, gram, expiration_date')
    .eq('user_id', userId)
    .eq('ingredient_id', ingredientId)
    .order('expiration_date', { ascending: true, nullsFirst: false })

  if (error) {
    throw new Error(`Failed to fetch inventory for deduction: ${error.message}`)
  }

  for (const row of rows ?? []) {
    if (remaining <= 0) {
      break
    }

    const currentAmount = Number(row[column] ?? 0)

    if (currentAmount <= 0) {
      continue
    }

    const deduction = Math.min(currentAmount, remaining)
    const nextAmount = currentAmount - deduction
    const { error: updateError } = await client
      .from('inventory')
      .update({ [column]: nextAmount })
      .eq('inventory_id', row.inventory_id)

    if (updateError) {
      throw new Error(`Failed to update inventory: ${updateError.message}`)
    }

    deductions.push({
      inventoryId: row.inventory_id,
      ingredientId,
      column,
      used: deduction,
      remaining: nextAmount,
    })
    remaining -= deduction
  }

  return {
    ingredientId,
    requested: amount,
    unit,
    column,
    deducted: amount - Math.max(remaining, 0),
    shortage: Math.max(remaining, 0),
    deductions,
  }
}

export async function markRecipeCooked({
  recipeId,
  servings,
  userId: requestedUserId,
}) {
  if (!recipeId) {
    throw new Error('recipeId is required')
  }

  const userId = await resolveUserId(requestedUserId)
  const servingCount = Math.max(1, Number(servings) || 1)
  const client = ensureSupabase()
  const { data: recipeIngredients, error } = await client
    .from('recipe_ingredients')
    .select(
      `
      ingredient_id,
      required_amount,
      unit,
      ingredient_management (
        ingredient_name
      )
    `,
    )
    .eq('recipe_id', recipeId)

  if (error) {
    throw new Error(`Failed to fetch recipe ingredients: ${error.message}`)
  }

  const results = []

  for (const ingredient of recipeIngredients ?? []) {
    const amount = Number(ingredient.required_amount ?? 0) * servingCount

    if (amount <= 0) {
      continue
    }

    results.push(
      await reduceInventoryAmount({
        userId,
        ingredientId: ingredient.ingredient_id,
        amount,
        unit: ingredient.unit ?? '',
      }),
    )
  }

  const { data: history, error: historyError } = await client
    .from('cooking_history')
    .insert({
      user_id: userId,
      recipe_id: recipeId,
    })
    .select('history_id, cooked_at')
    .single()

  if (historyError) {
    throw new Error(`Failed to save cooking history: ${historyError.message}`)
  }

  const inventory = await getInventoryForUser(userId)

  return {
    userId,
    recipeId,
    servings: servingCount,
    history,
    deductions: results,
    inventory: inventory.inventory,
  }
}

async function ensureRecipeBelongsToUser({ client, recipeId, userId }) {
  const { data, error } = await client
    .from('recipes')
    .select('recipe_id')
    .eq('recipe_id', recipeId)
    .eq('user_id', userId)
    .maybeSingle()

  if (error) {
    throw new Error(`Failed to verify recipe: ${error.message}`)
  }

  if (!data) {
    throw new Error('Recipe not found')
  }
}

export async function setRecipeFavorite({
  recipeId,
  isFavorite,
  userId: requestedUserId,
}) {
  if (!recipeId) {
    throw new Error('recipeId is required')
  }

  const userId = await resolveUserId(requestedUserId)
  const client = ensureSupabase()

  await ensureRecipeBelongsToUser({ client, recipeId, userId })

  if (isFavorite) {
    const { error } = await client
      .from('favorites')
      .upsert({ user_id: userId, recipe_id: recipeId })

    if (error) {
      throw new Error(`Failed to favorite recipe: ${error.message}`)
    }
  } else {
    const { error } = await client
      .from('favorites')
      .delete()
      .eq('user_id', userId)
      .eq('recipe_id', recipeId)

    if (error) {
      throw new Error(`Failed to unfavorite recipe: ${error.message}`)
    }
  }

  return {
    userId,
    recipeId,
    isFavorite: Boolean(isFavorite),
  }
}

export async function getCookingHistoryForUser(requestedUserId) {
  const userId = await resolveUserId(requestedUserId)
  const client = ensureSupabase()
  const { data, error } = await client
    .from('cooking_history')
    .select(
      `
      history_id,
      cooked_at,
      recipes (
        recipe_id,
        name,
        cook_time,
        cook_process,
        recipe_ingredients (
          ingredient_id,
          required_amount,
          unit,
          ingredient_management (
            ingredient_name
          )
        )
      )
    `,
    )
    .eq('user_id', userId)
    .order('cooked_at', { ascending: false })

  if (error) {
    throw new Error(`Failed to fetch cooking history: ${error.message}`)
  }

  return {
    userId,
    recipes: (data ?? []).map(mapHistoryRecipe),
  }
}

export async function getSavedRecipesForUser(requestedUserId) {
  const userId = await resolveUserId(requestedUserId)
  const client = ensureSupabase()
  const { data, error } = await client
    .from('recipes')
    .select(
      `
      recipe_id,
      name,
      user_id,
      cook_time,
      cook_process,
      created_at,
      recipe_ingredients (
        ingredient_id,
        required_amount,
        unit,
        ingredient_management (
          ingredient_name
        )
      ),
      cooking_history (
        history_id,
        cooked_at
      ),
      favorites (
        user_id,
        created_at
      )
    `,
    )
    .eq('user_id', userId)
    .order('created_at', { ascending: false })

  if (error) {
    throw new Error(`Failed to fetch saved recipes: ${error.message}`)
  }

  return {
    userId,
    recipes: (data ?? []).map((recipe) => mapStoredRecipe(recipe, userId)),
  }
}
