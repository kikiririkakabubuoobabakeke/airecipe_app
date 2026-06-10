import './env.js'

const geminiApiKey = process.env.GEMINI_API_KEY
export const defaultGeminiModel = 'gemma-4-31b-it'
const geminiBaseUrl = 'https://generativelanguage.googleapis.com/v1beta'

export function checkGeminiConnection() {
  if (!geminiApiKey) {
    return {
      ok: false,
      configured: false,
      message: 'Gemini is not configured',
    }
  }

  return {
    ok: true,
    configured: true,
    message: 'Gemini is configured on the server',
  }
}

function stripDataUrl(value) {
  return String(value ?? '').replace(/^data:[^;]+;base64,/i, '')
}

function extractText(parts = []) {
  return parts
    .map((part) => part?.text)
    .filter(Boolean)
    .join('\n')
    .trim()
}

function extractInlineImages(parts = []) {
  return parts
    .map((part) => part?.inlineData ?? part?.inline_data)
    .filter((part) => part?.data && part?.mimeType)
    .map((part) => ({
      mimeType: part.mimeType,
      data: part.data,
    }))
}

async function requestGeminiModel({ model, body }) {
  const endpoint = `${geminiBaseUrl}/models/${encodeURIComponent(
    model,
  )}:generateContent?key=${encodeURIComponent(geminiApiKey)}`

  const response = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  })

  const responseText = await response.text()
  const payload = responseText ? JSON.parse(responseText) : null

  if (!response.ok) {
    const error = new Error(payload?.error?.message ?? 'Gemini request failed')
    error.statusCode = response.status
    error.model = model
    throw error
  }

  return payload
}

export async function generateGeminiContent({
  prompt,
  imageBase64,
  mimeType,
  responseMimeType,
  model = defaultGeminiModel,
}) {
  if (!geminiApiKey) {
    throw new Error('GEMINI_API_KEY is required for Gemini operations')
  }

  if (!prompt?.trim()) {
    throw new Error('prompt is required')
  }

  const parts = [{ text: prompt.trim() }]

  if (imageBase64) {
    parts.push({
      inline_data: {
        mime_type: mimeType || 'image/jpeg',
        data: stripDataUrl(imageBase64),
      },
    })
  }

  const body = {
    contents: [
      {
        role: 'user',
        parts,
      },
    ],
  }

  if (responseMimeType) {
    body.generationConfig = {
      responseMimeType,
    }
  }

  let payload

  try {
    payload = await requestGeminiModel({
      model,
      body,
    })
  } catch (error) {
    const message = String(error?.message ?? '')

    if (!responseMimeType || !/responseMimeType|generationConfig|mime/i.test(message)) {
      throw error
    }

    const { generationConfig, ...bodyWithoutGenerationConfig } = body
    void generationConfig
    payload = await requestGeminiModel({
      model,
      body: bodyWithoutGenerationConfig,
    })
  }

  const outputParts = payload?.candidates?.[0]?.content?.parts ?? []

  return {
    model,
    text: extractText(outputParts),
    images: extractInlineImages(outputParts),
    raw: payload,
  }
}
