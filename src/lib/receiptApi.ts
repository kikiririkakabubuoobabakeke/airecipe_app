import type { Ingredient, ReceiptIngredientCandidate } from '../types/ui'

type ApiResponse<T> =
  | ({ ok: true } & T)
  | {
      ok: false
      message?: string
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

  if (!response.ok) {
    throw new Error(
      'message' in payload
        ? (payload.message ?? response.statusText)
        : response.statusText,
    )
  }

  if (!payload.ok) {
    throw new Error((payload as { message?: string }).message ?? response.statusText)
  }

  return payload as T
}

export async function parseReceiptText(ocrText: string) {
  const response = await fetch('/api/receipts/parse', {
    method: 'POST',
    credentials: 'same-origin',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ ocrText }),
  })

  return readJson<{
    items: ReceiptIngredientCandidate[]
  }>(response)
}

export async function importReceiptItems(
  items: ReceiptIngredientCandidate[],
) {
  const response = await fetch('/api/receipts/import', {
    method: 'POST',
    credentials: 'same-origin',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ items }),
  })

  const result = await readJson<{
    userId: string
    importedCount: number
    inventory: Ingredient[]
  }>(response)

  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('inventory-updated'))
  }

  return result
}

export async function importReceiptItemsDetail(
  items: ReceiptIngredientCandidate[],
) {
  const response = await fetch('/api/receipts/import-detail', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ items }),
  })

  const result = await readJson<{
    userId: string
    importedCount: number
  }>(response)

  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('inventory-updated'))
  }

  return result
}
