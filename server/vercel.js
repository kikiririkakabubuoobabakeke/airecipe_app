import { handleApiRequest } from './index.js'

export async function handleVercelRequest(request) {
  const requestUrl = new URL(request.url)
  const rewrittenApiPath = requestUrl.searchParams.get('path')

  if (requestUrl.pathname === '/api/index.js' && rewrittenApiPath) {
    requestUrl.pathname = `/api/${rewrittenApiPath}`
    requestUrl.searchParams.delete('path')
  }

  const headers = Object.fromEntries(request.headers.entries())
  headers.host ??= requestUrl.host

  const bodyText =
    request.method === 'GET' || request.method === 'HEAD'
      ? ''
      : await request.text()

  const nodeRequest = {
    method: request.method,
    url: `${requestUrl.pathname}${requestUrl.search}`,
    headers,
    async *[Symbol.asyncIterator]() {
      if (bodyText) {
        yield Buffer.from(bodyText)
      }
    },
  }

  let status = 200
  const responseHeaders = new Headers()
  let responseBody = ''

  const nodeResponse = {
    writeHead(statusCode, headersToWrite = {}) {
      status = statusCode

      for (const [name, value] of Object.entries(headersToWrite)) {
        if (Array.isArray(value)) {
          value.forEach((item) => responseHeaders.append(name, item))
        } else {
          responseHeaders.set(name, value)
        }
      }
    },
    end(body = '') {
      responseBody = body
    },
  }

  await handleApiRequest(nodeRequest, nodeResponse)

  return new Response(responseBody, {
    status,
    headers: responseHeaders,
  })
}
