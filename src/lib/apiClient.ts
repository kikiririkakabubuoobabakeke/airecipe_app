export type ApiSuccess<T> = { ok: true } & T
export type ApiFailure = { ok: false; message?: string }
export type ApiResponse<T> = ApiSuccess<T> | ApiFailure

export class ApiError extends Error {
  constructor(message: string, public readonly status: number) {
    super(message)
    this.name = 'ApiError'
  }
}

const pendingGetRequests = new Map<string, Promise<unknown>>()

export async function readJson<T>(response: Response): Promise<T> {
  let payload: ApiResponse<T>

  try {
    payload = (await response.json()) as ApiResponse<T>
  } catch {
    const responseText = await response.text()
    throw new ApiError(
      responseText
        ? `API response was not JSON: ${responseText.slice(0, 120)}`
        : responseText || response.statusText,
      response.status,
    )
  }

  if (!response.ok || !payload.ok) {
    const message =
      'message' in payload && payload.message
        ? payload.message
        : response.statusText
    throw new ApiError(message, response.status)
  }

  return payload as T
}

export async function postJson<T>(
  path: string,
  body: unknown,
  options: { credentials?: RequestCredentials } = {},
): Promise<T> {
  const response = await fetch(path, {
    method: 'POST',
    credentials: options.credentials ?? 'same-origin',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  })
  return readJson<T>(response)
}

export async function patchJson<T>(
  path: string,
  body: unknown,
  options: { credentials?: RequestCredentials } = {},
): Promise<T> {
  const response = await fetch(path, {
    method: 'PATCH',
    credentials: options.credentials ?? 'same-origin',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  })
  return readJson<T>(response)
}

export async function getJson<T>(
  path: string,
  options: { credentials?: RequestCredentials; cache?: RequestCache } = {},
): Promise<T> {
  const credentials = options.credentials ?? 'same-origin'
  const cache = options.cache ?? 'no-store'
  const requestKey = `${path}|${credentials}|${cache}`
  const pendingRequest = pendingGetRequests.get(requestKey) as
    | Promise<T>
    | undefined

  if (pendingRequest) {
    return pendingRequest
  }

  const request = fetch(path, {
    credentials,
    cache,
  }).then((response) => readJson<T>(response))

  pendingGetRequests.set(requestKey, request)

  try {
    return await request
  } finally {
    if (pendingGetRequests.get(requestKey) === request) {
      pendingGetRequests.delete(requestKey)
    }
  }
}

export async function deleteJson<T>(
  path: string,
  options: { credentials?: RequestCredentials } = {},
): Promise<T> {
  const response = await fetch(path, {
    method: 'DELETE',
    credentials: options.credentials ?? 'same-origin',
  })
  return readJson<T>(response)
}
