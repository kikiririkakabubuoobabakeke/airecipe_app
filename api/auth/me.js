import { handleVercelRequest } from '../../server/vercel.js'

export function GET(request) {
  return handleVercelRequest(request)
}
