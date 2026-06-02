import { useState } from 'react'
import { Topbar } from '../components/Topbar'
import { generateGeminiContent } from '../lib/geminiApi'
import type { AppDestination } from '../types/ui'

type GeminiTestPageProps = {
  onNavigate?: (page: AppDestination) => void
  onLogout?: () => void | Promise<void>
}

const geminiTestModel = 'gemma-4-31b-it'

function readFileAsDataUrl(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader()
    reader.addEventListener('load', () => resolve(String(reader.result ?? '')))
    reader.addEventListener('error', () => reject(reader.error))
    reader.readAsDataURL(file)
  })
}

export function GeminiTestPage({
  onNavigate,
  onLogout,
}: GeminiTestPageProps) {
  const [prompt, setPrompt] = useState(
    'この画像に写っているものを日本語で簡潔に説明してください。',
  )
  const [imageBase64, setImageBase64] = useState('')
  const [imageMimeType, setImageMimeType] = useState('')
  const [previewUrl, setPreviewUrl] = useState('')
  const [responseText, setResponseText] = useState('')
  const [responseImages, setResponseImages] = useState<
    Array<{ mimeType: string; data: string }>
  >([])
  const [rawResponse, setRawResponse] = useState('')
  const [statusMessage, setStatusMessage] = useState('')
  const [errorMessage, setErrorMessage] = useState('')
  const [isSending, setIsSending] = useState(false)

  async function handleImageChange(file: File | null) {
    setResponseText('')
    setResponseImages([])
    setRawResponse('')
    setErrorMessage('')

    if (!file) {
      setImageBase64('')
      setImageMimeType('')
      setPreviewUrl('')
      return
    }

    setImageMimeType(file.type || 'image/jpeg')
    setPreviewUrl(URL.createObjectURL(file))
    setImageBase64(await readFileAsDataUrl(file))
    setStatusMessage('画像を読み込みました')
  }

  async function handleSubmit() {
    if (!prompt.trim()) {
      setErrorMessage('プロンプトを入力してください')
      return
    }

    setIsSending(true)
    setStatusMessage('Geminiに送信しています...')
    setErrorMessage('')
    setResponseText('')
    setResponseImages([])
    setRawResponse('')

    try {
      const result = await generateGeminiContent({
        prompt,
        imageBase64,
        mimeType: imageMimeType,
        model: geminiTestModel,
      })

      setResponseText(result.text || 'テキストレスポンスはありませんでした')
      setResponseImages(result.images)
      setRawResponse(JSON.stringify(result.raw, null, 2))
      setStatusMessage(
        `Geminiからレスポンスを受け取りました。使用モデル: ${result.model}`,
      )
    } catch (error) {
      console.error('[vite] Gemini test failed:', error)
      setErrorMessage(
        error instanceof Error ? error.message : 'Geminiリクエストに失敗しました',
      )
      setStatusMessage('')
    } finally {
      setIsSending(false)
    }
  }

  return (
    <div className="app-shell">
      <Topbar onNavigate={onNavigate} onLogout={onLogout} />

      <main className="test-page">
        <div className="fridge-header">
          <div>
            <p className="eyebrow">Gemini API Test</p>
            <h1>画像受け渡しテスト</h1>
          </div>
          <button
            type="button"
            className="secondary-button back-home-button"
            onClick={() => onNavigate?.('home')}
          >
            ホームに戻る
          </button>
        </div>

        <section className="test-layout">
          <div className="panel test-input-panel">
            <div className="section-heading">
              <div>
                <p className="eyebrow">Input</p>
                <h2>Geminiに送る内容</h2>
              </div>
            </div>

            <div className="test-model-label">
              <span>モデル</span>
              <strong>{geminiTestModel}</strong>
            </div>

            <label>
              <span>プロンプト</span>
              <textarea
                value={prompt}
                onChange={(event) => setPrompt(event.target.value)}
              />
            </label>

            <label className="receipt-file-field">
              <input
                type="file"
                accept="image/*"
                onChange={(event) =>
                  handleImageChange(event.currentTarget.files?.[0] ?? null)
                }
              />
              <span>画像を選ぶ</span>
            </label>

            {previewUrl ? (
              <img
                className="test-image-preview"
                src={previewUrl}
                alt="Geminiに送る画像"
              />
            ) : (
              <div className="receipt-placeholder">画像未選択</div>
            )}

            <button
              type="button"
              className="primary-button"
              onClick={handleSubmit}
              disabled={isSending}
            >
              {isSending ? '送信中...' : 'Geminiに送信'}
            </button>
          </div>

          <div className="panel test-output-panel">
            <div className="section-heading">
              <div>
                <p className="eyebrow">Output</p>
                <h2>レスポンス</h2>
              </div>
            </div>

            {statusMessage ? (
              <p className="status-message" role="status">
                {statusMessage}
              </p>
            ) : null}

            {errorMessage ? (
              <p className="status-message" role="alert">
                {errorMessage}
              </p>
            ) : null}

            <div className="test-response-box">
              {responseText || 'まだレスポンスはありません。'}
            </div>

            {responseImages.length ? (
              <div className="test-response-images">
                {responseImages.map((image, index) => (
                  <img
                    key={`${image.mimeType}-${index}`}
                    src={`data:${image.mimeType};base64,${image.data}`}
                    alt={`Geminiから返された画像 ${index + 1}`}
                  />
                ))}
              </div>
            ) : null}

            <details className="test-raw-response">
              <summary>Raw JSON</summary>
              <pre>{rawResponse || '{}'}</pre>
            </details>
          </div>
        </section>
      </main>
    </div>
  )
}
