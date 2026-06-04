import { useEffect, useState } from 'react'
import { Topbar } from '../components/Topbar'
import { generateGeminiContent } from '../lib/geminiApi'
import { useI18n } from '../lib/useI18n'
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
  const { t } = useI18n()
  const [prompt, setPrompt] = useState(t('gemini.promptDefault'))
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

  useEffect(() => {
    return () => {
      if (previewUrl) {
        URL.revokeObjectURL(previewUrl)
      }
    }
  }, [previewUrl])

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
    setStatusMessage(t('gemini.imageLoaded'))
  }

  async function handleSubmit() {
    if (!prompt.trim()) {
      setErrorMessage(t('gemini.promptRequired'))
      return
    }

    setIsSending(true)
    setStatusMessage(t('gemini.sendingStatus'))
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

      setResponseText(result.text || t('gemini.noText'))
      setResponseImages(result.images)
      setRawResponse(JSON.stringify(result.raw, null, 2))
      setStatusMessage(
        t('gemini.success', { model: result.model }),
      )
    } catch (error) {
      console.error('[vite] Gemini test failed:', error)
      setErrorMessage(
        error instanceof Error ? error.message : t('gemini.failed'),
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
            <h1>{t('gemini.title')}</h1>
          </div>
          <button
            type="button"
            className="secondary-button back-home-button"
            onClick={() => onNavigate?.('home')}
          >
            {t('common.backHome')}
          </button>
        </div>

        <section className="test-layout">
          <div className="panel test-input-panel">
            <div className="section-heading">
              <div>
                <p className="eyebrow">Input</p>
                <h2>{t('gemini.inputTitle')}</h2>
              </div>
            </div>

            <div className="test-model-label">
              <span>{t('gemini.model')}</span>
              <strong>{geminiTestModel}</strong>
            </div>

            <label>
              <span>{t('gemini.prompt')}</span>
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
              <span>{t('gemini.chooseImage')}</span>
            </label>

            {previewUrl ? (
              <img
                className="test-image-preview"
                src={previewUrl}
                alt={t('gemini.imageAlt')}
              />
            ) : (
              <div className="receipt-placeholder">{t('gemini.noImage')}</div>
            )}

            <button
              type="button"
              className="primary-button"
              onClick={handleSubmit}
              disabled={isSending}
            >
              {isSending ? t('gemini.sending') : t('gemini.submit')}
            </button>
          </div>

          <div className="panel test-output-panel">
            <div className="section-heading">
              <div>
                <p className="eyebrow">Output</p>
                <h2>{t('gemini.outputTitle')}</h2>
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
              {responseText || t('gemini.noResponse')}
            </div>

            {responseImages.length ? (
              <div className="test-response-images">
                {responseImages.map((image, index) => (
                  <img
                    key={`${image.mimeType}-${index}`}
                    src={`data:${image.mimeType};base64,${image.data}`}
                    alt={t('gemini.responseImageAlt', { number: index + 1 })}
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
