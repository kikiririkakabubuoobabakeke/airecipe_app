type ApiResponse<T> =
  | ({ ok: true } & T)
  | {
      ok: false
      message?: string
    }

export type ContactMessage = {
  contactId: string
  userId: string | null
  userEmail: string | null
  subject: string
  message: string
  pageUrl: string | null
  userAgent: string | null
  status: string
  createdAt: string
  updatedAt?: string | null
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

export async function submitContactMessage(input: {
  subject: string
  message: string
  pageUrl?: string | null
}) {
  const response = await fetch('/api/contact', {
    method: 'POST',
    credentials: 'same-origin',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(input),
  })

  return readJson<{
    contactMessage: ContactMessage
  }>(response)
}

export async function fetchAdminContactMessages() {
  const response = await fetch('/api/admin/contact-messages', {
    credentials: 'same-origin',
    cache: 'no-store',
  })

  return readJson<{
    contactMessages: ContactMessage[]
  }>(response)
}
