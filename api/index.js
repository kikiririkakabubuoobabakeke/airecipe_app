import { handleVercelRequest } from '../server/vercel.js'

export function GET(request) {
  return handleVercelRequest(request)
}

export function POST(request) {
  return handleVercelRequest(request)
}

export function PATCH(request) {
  return handleVercelRequest(request)
}

export function DELETE(request) {
  return handleVercelRequest(request)
}

export function OPTIONS(request) {
  return handleVercelRequest(request)
}
