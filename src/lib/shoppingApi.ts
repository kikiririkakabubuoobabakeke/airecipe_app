import type { ShoppingList, ShoppingListItem, ShoppingListSummary } from '../types/ui'
import {
  deleteJson,
  getJson,
  patchJson,
  postJson,
} from './apiClient'

export type ShoppingListInput = {
  name: string
  items: ShoppingListItem[]
}

export async function fetchShoppingLists() {
  return getJson<{
    userId: string
    shoppingLists: ShoppingListSummary[]
  }>('/api/shopping-lists')
}

export async function fetchShoppingList(shoppingListId: string) {
  return getJson<{
    userId: string
    shoppingList: ShoppingList
  }>(`/api/shopping-lists/${encodeURIComponent(shoppingListId)}`)
}

export async function createShoppingList(input: ShoppingListInput) {
  return postJson<{
    userId: string
    shoppingList: ShoppingList
  }>('/api/shopping-lists', input)
}

export async function updateShoppingList(
  shoppingListId: string,
  input: Partial<ShoppingListInput>,
) {
  return patchJson<{
    userId: string
    shoppingList: ShoppingList
  }>(`/api/shopping-lists/${encodeURIComponent(shoppingListId)}`, input)
}

export async function deleteShoppingList(shoppingListId: string) {
  return deleteJson<{
    userId: string
    shoppingLists: ShoppingListSummary[]
  }>(`/api/shopping-lists/${encodeURIComponent(shoppingListId)}`)
}

export async function importShoppingListToInventory(
  shoppingListId: string,
  itemIds?: string[],
) {
  return postJson<{
    userId: string
    shoppingList: ShoppingList
    importedCount: number
  }>(
    `/api/shopping-lists/${encodeURIComponent(shoppingListId)}/import-to-inventory`,
    { itemIds },
  )
}
