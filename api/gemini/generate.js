import { handleVercelRequest } from '../../server/vercel.js'

export function POST(request) {
  return handleVercelRequest(request)
}
