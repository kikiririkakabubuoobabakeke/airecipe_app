import { createInventoryItemForUser } from './recipes.js'
import { isSupabaseServiceRoleConfigured, supabase } from './supabase.js'

function ensureSupabase() {
  if (!supabase) {
    throw new Error('Supabase is not configured')
  }

  if (!isSupabaseServiceRoleConfigured) {
    throw new Error(
      'SUPABASE_SERVICE_ROLE_KEY is required for shopping list operations',
    )
  }

  return supabase
}

function sanitizeText(value, fallback = '') {
  const text = typeof value === 'string' ? value.trim() : ''
  return text || fallback
}

function sanitizeNumber(value) {
  const number = Number(value)
  return Number.isFinite(number) && number > 0 ? number : null
}

function sanitizeItem(item, index = 0) {
  const name = sanitizeText(item?.name)

  if (!name) {
    throw new Error('Item name is required')
  }

  return {
    name,
    category: sanitizeText(item?.category, 'その他'),
    quantity: sanitizeNumber(item?.quantity),
    gram: sanitizeNumber(item?.gram),
    unit: sanitizeText(item?.unit, item?.gram ? 'g' : '個'),
    memo: sanitizeText(item?.memo) || null,
    checked: item?.checked === true,
    sort_order: Number.isFinite(Number(item?.sortOrder))
      ? Number(item.sortOrder)
      : index,
  }
}

function mapListRow(row, items = []) {
  return {
    shoppingListId: row.shopping_list_id,
    name: row.name,
    itemCount: Number(row.item_count ?? items.length ?? 0),
    checkedCount: Number(row.checked_count ?? 0),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    items: items.map(mapItemRow),
  }
}

function mapSummaryRow(row) {
  return {
    shoppingListId: row.shopping_list_id,
    name: row.name,
    itemCount: Number(row.item_count ?? 0),
    checkedCount: Number(row.checked_count ?? 0),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

function mapItemRow(row) {
  return {
    itemId: row.item_id,
    name: row.name,
    category: row.category,
    quantity: row.quantity === null ? null : Number(row.quantity),
    gram: row.gram === null ? null : Number(row.gram),
    unit: row.unit ?? null,
    memo: row.memo ?? null,
    checked: row.checked === true,
    sortOrder: row.sort_order ?? 0,
  }
}

async function assertOwnList(client, userId, shoppingListId) {
  const { data, error } = await client
    .from('shopping_lists')
    .select('shopping_list_id, user_id, name, created_at, updated_at')
    .eq('user_id', userId)
    .eq('shopping_list_id', shoppingListId)
    .maybeSingle()

  if (error) {
    throw new Error(`Failed to verify shopping list: ${error.message}`)
  }

  if (!data) {
    throw new Error('Shopping list not found')
  }

  return data
}

export async function getShoppingListsForUser(userId) {
  const client = ensureSupabase()
  const { data, error } = await client
    .from('shopping_lists')
    .select(
      `
      shopping_list_id,
      name,
      created_at,
      updated_at,
      shopping_list_items (
        item_id,
        checked
      )
    `,
    )
    .eq('user_id', userId)
    .order('updated_at', { ascending: false })

  if (error) {
    throw new Error(`Failed to fetch shopping lists: ${error.message}`)
  }

  return {
    userId,
    shoppingLists: (data ?? []).map((row) =>
      mapSummaryRow({
        ...row,
        item_count: row.shopping_list_items?.length ?? 0,
        checked_count:
          row.shopping_list_items?.filter((item) => item.checked).length ?? 0,
      }),
    ),
  }
}

export async function getShoppingListForUser({ userId, shoppingListId }) {
  const client = ensureSupabase()
  const list = await assertOwnList(client, userId, shoppingListId)
  const { data: items, error } = await client
    .from('shopping_list_items')
    .select(
      'item_id, name, category, quantity, gram, unit, memo, checked, sort_order, created_at',
    )
    .eq('shopping_list_id', shoppingListId)
    .order('sort_order', { ascending: true })
    .order('created_at', { ascending: true })

  if (error) {
    throw new Error(`Failed to fetch shopping list items: ${error.message}`)
  }

  return {
    userId,
    shoppingList: mapListRow(
      {
        ...list,
        item_count: items?.length ?? 0,
        checked_count: items?.filter((item) => item.checked).length ?? 0,
      },
      items ?? [],
    ),
  }
}

export async function createShoppingListForUser({ userId, name, items }) {
  const client = ensureSupabase()
  const listName = sanitizeText(name, '買い物リスト')
  const nextItems = Array.isArray(items) ? items.map(sanitizeItem) : []

  const { data: list, error: listError } = await client
    .from('shopping_lists')
    .insert({
      user_id: userId,
      name: listName,
    })
    .select('shopping_list_id, user_id, name, created_at, updated_at')
    .single()

  if (listError) {
    throw new Error(`Failed to create shopping list: ${listError.message}`)
  }

  if (nextItems.length > 0) {
    const { error: itemError } = await client.from('shopping_list_items').insert(
      nextItems.map((item) => ({
        ...item,
        shopping_list_id: list.shopping_list_id,
      })),
    )

    if (itemError) {
      throw new Error(`Failed to create shopping list items: ${itemError.message}`)
    }
  }

  return getShoppingListForUser({
    userId,
    shoppingListId: list.shopping_list_id,
  })
}

export async function updateShoppingListForUser({
  userId,
  shoppingListId,
  name,
  items,
}) {
  const client = ensureSupabase()
  await assertOwnList(client, userId, shoppingListId)

  const updatePayload = {}
  if (name !== undefined) {
    updatePayload.name = sanitizeText(name, '買い物リスト')
  }

  if (Object.keys(updatePayload).length > 0) {
    const { error } = await client
      .from('shopping_lists')
      .update(updatePayload)
      .eq('user_id', userId)
      .eq('shopping_list_id', shoppingListId)

    if (error) {
      throw new Error(`Failed to update shopping list: ${error.message}`)
    }
  }

  if (Array.isArray(items)) {
    const nextItems = items.map(sanitizeItem)
    const { error: deleteError } = await client
      .from('shopping_list_items')
      .delete()
      .eq('shopping_list_id', shoppingListId)

    if (deleteError) {
      throw new Error(`Failed to replace shopping list items: ${deleteError.message}`)
    }

    if (nextItems.length > 0) {
      const { error: insertError } = await client
        .from('shopping_list_items')
        .insert(
          nextItems.map((item) => ({
            ...item,
            shopping_list_id: shoppingListId,
          })),
        )

      if (insertError) {
        throw new Error(`Failed to save shopping list items: ${insertError.message}`)
      }
    }
  }

  return getShoppingListForUser({ userId, shoppingListId })
}

export async function deleteShoppingListForUser({ userId, shoppingListId }) {
  const client = ensureSupabase()
  await assertOwnList(client, userId, shoppingListId)

  const { error } = await client
    .from('shopping_lists')
    .delete()
    .eq('user_id', userId)
    .eq('shopping_list_id', shoppingListId)

  if (error) {
    throw new Error(`Failed to delete shopping list: ${error.message}`)
  }

  return getShoppingListsForUser(userId)
}

export async function importShoppingListToInventoryForUser({
  userId,
  shoppingListId,
  itemIds,
}) {
  const client = ensureSupabase()
  await assertOwnList(client, userId, shoppingListId)

  let query = client
    .from('shopping_list_items')
    .select('item_id, name, category, quantity, gram, unit, memo, checked')
    .eq('shopping_list_id', shoppingListId)

  if (Array.isArray(itemIds) && itemIds.length > 0) {
    query = query.in('item_id', itemIds)
  } else {
    query = query.eq('checked', true)
  }

  const { data: items, error } = await query

  if (error) {
    throw new Error(`Failed to fetch purchased items: ${error.message}`)
  }

  const targetItems = items ?? []

  if (targetItems.length === 0) {
    throw new Error('No purchased shopping items selected')
  }

  for (const item of targetItems) {
    await createInventoryItemForUser({
      userId,
      item: {
        name: item.name,
        category: item.category,
        quantity: item.quantity,
        gram: item.gram,
        memo: item.memo || '買い物リストから購入',
      },
    })
  }

  const { error: deleteError } = await client
    .from('shopping_list_items')
    .delete()
    .eq('shopping_list_id', shoppingListId)
    .in(
      'item_id',
      targetItems.map((item) => item.item_id),
    )

  if (deleteError) {
    throw new Error(`Failed to clear purchased items: ${deleteError.message}`)
  }

  const shoppingList = await getShoppingListForUser({ userId, shoppingListId })

  return {
    ...shoppingList,
    importedCount: targetItems.length,
  }
}
