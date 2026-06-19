import { supabase } from './supabase.js'

const demoUserId = process.env.AI_RECIPE_DEMO_USER_ID

function ensureSupabase() {
  if (!supabase) {
    throw new Error('Supabase is not configured')
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

function sanitizeText(value, fallback = '') {
  const text = typeof value === 'string' ? value.trim() : ''
  return text || fallback
}

function sanitizeShoppingListPayload(payload) {
  const name = sanitizeText(payload?.name)

  if (!name) {
    throw new Error('買い物リストの名前を入力してください')
  }

  const rawItems = Array.isArray(payload?.items) ? payload.items : []
  const items = rawItems.map((item, index) => {
    const itemName = sanitizeText(item?.name)

    if (!itemName) {
      throw new Error('買い物項目の名前を入力してください')
    }

    const quantity = Number(item?.quantity ?? 0)
    const gram = Number(item?.gram ?? 0)

    return {
      name: itemName,
      category: sanitizeText(item?.category, 'その他'),
      quantity: Number.isFinite(quantity) && quantity > 0 ? Math.floor(quantity) : null,
      gram: Number.isFinite(gram) && gram > 0 ? Math.floor(gram) : null,
      memo: sanitizeText(item?.memo) || null,
      checked: item?.checked === true,
      sort_order: index,
    }
  })

  return { name, items }
}

function mapShoppingList(row) {
  return {
    shoppingListId: row.shopping_id,
    name: row.name,
    itemCount: row.item_count ?? 0,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

function mapShoppingListItem(row) {
  return {
    itemId: row.item_id,
    name: row.name,
    category: row.category,
    quantity: row.quantity,
    gram: row.gram,
    memo: row.memo,
    checked: row.checked,
    sortOrder: row.sort_order,
  }
}

export async function getShoppingListsForUser(requestedUserId) {
  const userId = await resolveUserId(requestedUserId)
  const client = ensureSupabase()

  const { data, error } = await client
    .from('shopping')
    .select(
      `
      shopping_id,
      name,
      created_at,
      updated_at,
      shopping_items (count)
    `,
    )
    .eq('user_id', userId)
    .order('updated_at', { ascending: false })

  if (error) {
    throw new Error(`Failed to fetch shopping: ${error.message}`)
  }

  return {
    userId,
    shoppingLists: (data ?? []).map((row) =>
      mapShoppingList({ ...row, item_count: row.shopping_items?.[0]?.count ?? 0 }),
    ),
  }
}

export async function getShoppingListForUser(requestedUserId, shoppingListId) {
  const userId = await resolveUserId(requestedUserId)
  const client = ensureSupabase()

  if (!shoppingListId) {
    throw new Error('shoppingListId is required')
  }

  const { data: list, error: listError } = await client
    .from('shopping')
    .select('shopping_id, name, created_at, updated_at')
    .eq('user_id', userId)
    .eq('shopping_id', shoppingListId)
    .maybeSingle()

  if (listError) {
    throw new Error(`Failed to fetch shopping list: ${listError.message}`)
  }

  if (!list) {
    throw new Error('Shopping list not found')
  }

  const { data: items, error: itemsError } = await client
    .from('shopping_items')
    .select('item_id, name, category, quantity, gram, memo, checked, sort_order')
    .eq('shopping_id', shoppingListId)
    .order('sort_order', { ascending: true })

  if (itemsError) {
    throw new Error(`Failed to fetch shopping list items: ${itemsError.message}`)
  }

  return {
    userId,
    shoppingList: {
      ...mapShoppingList(list),
      items: (items ?? []).map(mapShoppingListItem),
    },
  }
}

export async function createShoppingListForUser({ userId: requestedUserId, payload }) {
  const userId = await resolveUserId(requestedUserId)
  const client = ensureSupabase()
  const { name, items } = sanitizeShoppingListPayload(payload)

  const { data: list, error: listError } = await client
    .from('shopping')
    .insert({ user_id: userId, name })
    .select('shopping_id, name, created_at, updated_at')
    .single()

  if (listError) {
    throw new Error(`Failed to create shopping list: ${listError.message}`)
  }

  if (items.length > 0) {
    const { error: itemsError } = await client
      .from('shopping_items')
      .insert(
        items.map((item) => ({
          shopping_id: list.shopping_id,
          ...item,
        })),
      )

    if (itemsError) {
      throw new Error(`Failed to create shopping list items: ${itemsError.message}`)
    }
  }

  return getShoppingListForUser(userId, list.shopping_id)
}

export async function updateShoppingListForUser({
  userId: requestedUserId,
  shoppingListId,
  payload,
}) {
  const userId = await resolveUserId(requestedUserId)
  const client = ensureSupabase()

  if (!shoppingListId) {
    throw new Error('shoppingListId is required')
  }

  const { name, items } = sanitizeShoppingListPayload(payload)

  const { error: listError } = await client
    .from('shopping')
    .update({ name, updated_at: new Date().toISOString() })
    .eq('user_id', userId)
    .eq('shopping_id', shoppingListId)

  if (listError) {
    throw new Error(`Failed to update shopping list: ${listError.message}`)
  }

  const { error: deleteError } = await client
    .from('shopping_items')
    .delete()
    .eq('shopping_id', shoppingListId)

  if (deleteError) {
    throw new Error(`Failed to update shopping list items: ${deleteError.message}`)
  }

  if (items.length > 0) {
    const { error: itemsError } = await client
      .from('shopping_items')
      .insert(
        items.map((item) => ({
          shopping_id: shoppingListId,
          ...item,
        })),
      )

    if (itemsError) {
      throw new Error(`Failed to create shopping list items: ${itemsError.message}`)
    }
  }

  return getShoppingListForUser(userId, shoppingListId)
}

export async function deleteShoppingListForUser({ userId: requestedUserId, shoppingListId }) {
  const userId = await resolveUserId(requestedUserId)
  const client = ensureSupabase()

  if (!shoppingListId) {
    throw new Error('shoppingListId is required')
  }

  const { error } = await client
    .from('shopping')
    .delete()
    .eq('user_id', userId)
    .eq('shopping_id', shoppingListId)

  if (error) {
    throw new Error(`Failed to delete shopping list: ${error.message}`)
  }

  return getShoppingListsForUser(userId)
}
