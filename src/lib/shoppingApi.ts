import type { ShoppingList, ShoppingListItem, ShoppingListSummary } from '../types/ui'

const localShoppingListsKey = 'ai-recipe-shopping-lists'

export type ShoppingListInput = {
  name: string
  items: ShoppingListItem[]
}

function canUseLocalStorage() {
  return typeof window !== 'undefined' && Boolean(window.localStorage)
}

function readLocalShoppingLists(): ShoppingList[] {
  if (!canUseLocalStorage()) {
    return []
  }

  try {
    const raw = window.localStorage.getItem(localShoppingListsKey)
    const parsed = raw ? JSON.parse(raw) : []
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

function writeLocalShoppingLists(lists: ShoppingList[]) {
  if (!canUseLocalStorage()) {
    return
  }

  window.localStorage.setItem(localShoppingListsKey, JSON.stringify(lists))
}

function toSummary(list: ShoppingList): ShoppingListSummary {
  return {
    shoppingListId: list.shoppingListId,
    name: list.name,
    itemCount: list.items.length,
    createdAt: list.createdAt,
    updatedAt: list.updatedAt,
  }
}

function sortLists(lists: ShoppingList[]) {
  return [...lists].sort(
    (left, right) =>
      new Date(right.updatedAt).getTime() - new Date(left.updatedAt).getTime(),
  )
}

function normalizeItem(item: ShoppingListItem, index: number): ShoppingListItem {
  return {
    itemId: item.itemId ?? `local-item-${Date.now()}-${index}`,
    name: item.name,
    category: item.category,
    quantity: item.quantity ?? null,
    gram: item.gram ?? null,
    memo: item.memo ?? null,
    checked: item.checked === true,
    sortOrder: item.sortOrder ?? index,
  }
}

function createLocalShoppingList(input: ShoppingListInput) {
  const now = new Date().toISOString()
  const shoppingList: ShoppingList = {
    shoppingListId: `local-shopping-${Date.now()}`,
    name: input.name,
    itemCount: input.items.length,
    createdAt: now,
    updatedAt: now,
    items: input.items.map(normalizeItem),
  }
  const lists = sortLists([shoppingList, ...readLocalShoppingLists()])
  writeLocalShoppingLists(lists)

  return {
    userId: 'local',
    shoppingList,
  }
}

function updateLocalShoppingList(shoppingListId: string, input: ShoppingListInput) {
  const lists = readLocalShoppingLists()
  const current = lists.find((list) => list.shoppingListId === shoppingListId)
  if (!current) {
    throw new Error('Shopping list not found')
  }

  const updated: ShoppingList = {
    ...current,
    name: input.name,
    itemCount: input.items.length,
    updatedAt: new Date().toISOString(),
    items: input.items.map(normalizeItem),
  }
  const nextLists = sortLists(
    lists.map((list) =>
      list.shoppingListId === shoppingListId ? updated : list,
    ),
  )
  writeLocalShoppingLists(nextLists)

  return {
    userId: 'local',
    shoppingList: updated,
  }
}

export async function fetchShoppingLists() {
  const shoppingLists = sortLists(readLocalShoppingLists()).map(toSummary)
  return { userId: 'local', shoppingLists }
}

export async function fetchShoppingList(shoppingListId: string) {
  const shoppingList = readLocalShoppingLists().find(
    (list) => list.shoppingListId === shoppingListId,
  )
  if (!shoppingList) {
    throw new Error('Shopping list not found')
  }
  return { userId: 'local', shoppingList }
}

export async function createShoppingList(input: ShoppingListInput) {
  return createLocalShoppingList(input)
}

export async function updateShoppingList(
  shoppingListId: string,
  input: ShoppingListInput,
) {
  return updateLocalShoppingList(shoppingListId, input)
}

export async function deleteShoppingList(shoppingListId: string) {
  const lists = readLocalShoppingLists().filter(
    (list) => list.shoppingListId !== shoppingListId,
  )
  writeLocalShoppingLists(lists)
  return { userId: 'local', shoppingLists: sortLists(lists).map(toSummary) }
}
