import { useEffect, useRef, useState } from 'react'
import { Icon } from '../components/Icon'
import { Topbar } from '../components/Topbar'
import { generateGeminiContent } from '../lib/geminiApi'
import { useI18n } from '../lib/useI18n'
import { ReceiptDetailRegisterPage } from './ReceiptDetailRegisterPage'
import { ReceiptScanPage } from './ReceiptScanPage'
import type { AppDestination, ReceiptIngredientCandidate } from '../types/ui'

type RegisterMethod = 'receipt' | 'image'

type IngredientRegisterPageProps = {
  onNavigate?: (page: AppDestination) => void
  onLogout?: () => void | Promise<void>
  /** 詳細登録画面へ渡すときに App から受け取る */
  onContinue?: (names: string[]) => void
  onContinueCandidates?: (items: ReceiptIngredientCandidate[]) => void
}

const foodRecognitionModel = 'gemma-4-31b-it'

const foodRecognitionPrompt = `画像に写っている食品・食材だけを抽出してください。
レシート、値札、食器、調理器具、背景、人物は食材として扱わないでください。
返答はJSONのみ。Markdown、説明文、コードフェンスは禁止。

カテゴリは次から選んでください: 肉・卵・魚, 野菜, 乳製品, 加工品, その他
個数が推定できる場合は quantity、重量や容量が推定できる場合は gram に数値を入れてください。不明なら null にしてください。

形式:
{
  "items": [
    {
      "name": "食材名",
      "category": "野菜",
      "quantity": 1,
      "gram": null,
      "memo": "画像認識"
    }
  ]
}`

function readFileAsDataUrl(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result ?? ''))
    reader.onerror = () => reject(reader.error)
    reader.readAsDataURL(file)
  })
}

function parseJsonFromModel(text: string, errorMessage: string) {
  const normalized = text
    .trim()
    .replace(/^```json\s*/i, '')
    .replace(/^```\s*/i, '')
    .replace(/\s*```$/i, '')
    .trim()

  try {
    return JSON.parse(normalized)
  } catch {
    const jsonText = extractJsonObjectText(normalized)

    if (!jsonText) {
      throw new Error(errorMessage)
    }

    return JSON.parse(repairModelJson(jsonText))
  }
}

function repairModelJson(text: string) {
  return text
    .replace(/,\s*(?:\.{3}|…)\s*(?=[}\]])/g, '')
    .replace(/(?:\.{3}|…)\s*,?/g, '')
    .replace(/,\s*([}\]])/g, '$1')
    .trim()
}

function extractJsonObjectText(text: string) {
  const start = text.indexOf('{')

  if (start === -1) {
    return null
  }

  let depth = 0
  let isInString = false
  let isEscaped = false

  for (let index = start; index < text.length; index += 1) {
    const char = text[index]

    if (isEscaped) {
      isEscaped = false
      continue
    }

    if (char === '\\') {
      isEscaped = true
      continue
    }

    if (char === '"') {
      isInString = !isInString
      continue
    }

    if (isInString) {
      continue
    }

    if (char === '{') {
      depth += 1
    }

    if (char === '}') {
      depth -= 1

      if (depth === 0) {
        return text.slice(start, index + 1)
      }
    }
  }

  return null
}

function normalizeFoodCandidates(
  payload: unknown,
  recognitionMemo: string,
): ReceiptIngredientCandidate[] {
  const items = Array.isArray((payload as { items?: unknown }).items)
    ? ((payload as { items: unknown[] }).items)
    : []

  return items
    .map((item, index) => {
      const source = item as Record<string, unknown>
      const name = String(source.name ?? '').trim()

      if (!name) {
        return null
      }

      const quantity = Number(source.quantity)
      const gram = Number(source.gram)

      const candidate: ReceiptIngredientCandidate = {
        id: `food-image-${index + 1}`,
        name,
        category: String(source.category ?? 'その他').trim() || 'その他',
        quantity: Number.isFinite(quantity) && quantity > 0 ? quantity : null,
        gram: Number.isFinite(gram) && gram > 0 ? Math.round(gram) : null,
        expirationDate: null,
        bestBeforeDate: null,
        memo: String(source.memo ?? recognitionMemo).trim() || recognitionMemo,
        selected: true,
        sourceLine: recognitionMemo,
      }

      return candidate
    })
    .filter((item): item is ReceiptIngredientCandidate => Boolean(item))
}

/**
 * 食材登録（ステップ1）
 * 食材名の入力のみ。数量・期限などは詳細登録画面で扱う。
 */
export function IngredientRegisterPage({
  onNavigate,
  onLogout,
}: IngredientRegisterPageProps) {
  const { t } = useI18n()
  const videoRef = useRef<HTMLVideoElement | null>(null)
  const cameraStreamRef = useRef<MediaStream | null>(null)
  const [method, setMethod] = useState<RegisterMethod>('receipt')
  const [statusMessage, setStatusMessage] = useState('')
  const [errorMessage, setErrorMessage] = useState('')
  const [imagePreviewUrl, setImagePreviewUrl] = useState('')
  const [isRecognizing, setIsRecognizing] = useState(false)
  const [detailItems, setDetailItems] = useState<ReceiptIngredientCandidate[]>([])
  const [recognizedItems, setRecognizedItems] = useState<
    ReceiptIngredientCandidate[]
  >([])
  const [isCameraOpen, setIsCameraOpen] = useState(false)

  useEffect(() => {
    if (isCameraOpen && videoRef.current && cameraStreamRef.current) {
      videoRef.current.srcObject = cameraStreamRef.current
      void videoRef.current.play()
    }
  }, [isCameraOpen])

  useEffect(() => {
    return () => {
      cameraStreamRef.current?.getTracks().forEach((track) => track.stop())
      cameraStreamRef.current = null
    }
  }, [])

  async function handleFoodImageChange(file: File | null) {
    if (!file) {
      return
    }

    setImagePreviewUrl(URL.createObjectURL(file))
    setRecognizedItems([])
    setDetailItems([])
    setStatusMessage(t('ingredientRegister.reading'))
    setErrorMessage('')
    setIsRecognizing(true)

    try {
      const imageBase64 = await readFileAsDataUrl(file)
      const result = await generateGeminiContent({
        prompt: foodRecognitionPrompt,
        imageBase64,
        mimeType: file.type || 'image/jpeg',
        model: foodRecognitionModel,
        responseMimeType: 'application/json',
      })
      const items = normalizeFoodCandidates(
        parseJsonFromModel(result.text, t('ingredientRegister.parseFailed')),
        t('ingredientRegister.imageSub'),
      )

      if (!items.length) {
        setErrorMessage(t('ingredientRegister.emptyRecognition'))
        setStatusMessage('')
        return
      }

      setRecognizedItems(items)
      setStatusMessage(
        t('ingredientRegister.recognizedCount', { count: items.length }),
      )
    } catch (error) {
      console.error('[vite] Food image recognition failed:', error)
      setErrorMessage(
        error instanceof Error
          ? error.message
          : t('ingredientRegister.failed'),
      )
      setStatusMessage('')
    } finally {
      setIsRecognizing(false)
    }
  }

  async function startCamera() {
    if (!navigator.mediaDevices?.getUserMedia) {
      setErrorMessage(t('receipt.cameraUnavailable'))
      return
    }

    setStatusMessage('')
    setErrorMessage('')

    try {
      cameraStreamRef.current?.getTracks().forEach((track) => track.stop())
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: 'environment' } },
        audio: false,
      })
      cameraStreamRef.current = stream
      setIsCameraOpen(true)
    } catch (error) {
      console.error('[vite] Food camera start failed:', error)
      setErrorMessage(t('receipt.cameraStartFailed'))
    }
  }

  function stopCamera() {
    cameraStreamRef.current?.getTracks().forEach((track) => track.stop())
    cameraStreamRef.current = null
    if (videoRef.current) {
      videoRef.current.srcObject = null
    }
    setIsCameraOpen(false)
  }

  async function captureFoodImage() {
    const video = videoRef.current

    if (!video || !video.videoWidth || !video.videoHeight) {
      setErrorMessage(t('receipt.cameraNotReady'))
      return
    }

    const canvas = document.createElement('canvas')
    canvas.width = video.videoWidth
    canvas.height = video.videoHeight
    const context = canvas.getContext('2d')

    if (!context) {
      setErrorMessage(t('receipt.captureFailed'))
      return
    }

    context.drawImage(video, 0, 0, canvas.width, canvas.height)

    const blob = await new Promise<Blob | null>((resolve) => {
      canvas.toBlob(resolve, 'image/jpeg', 0.92)
    })

    if (!blob) {
      setErrorMessage(t('receipt.captureFailed'))
      return
    }

    stopCamera()
    await handleFoodImageChange(
      new File([blob], `food-${Date.now()}.jpg`, { type: 'image/jpeg' }),
    )
  }

  function toggleRecognizedItem(index: number, selected: boolean) {
    setRecognizedItems((current) =>
      current.map((item, itemIndex) =>
        itemIndex === index ? { ...item, selected } : item,
      ),
    )
  }

  function continueWithRecognizedItems() {
    const selectedItems = recognizedItems.filter((item) => item.selected)

    if (!selectedItems.length) {
      setErrorMessage(t('ingredientRegister.selectRequired'))
      return
    }

    setErrorMessage('')

    setDetailItems(selectedItems)
  }

  function selectMethod(nextMethod: RegisterMethod) {
    setMethod(nextMethod)
    setStatusMessage('')
    setErrorMessage('')
    setDetailItems([])
    if (nextMethod !== 'image') {
      stopCamera()
    }
  }

  if (detailItems.length) {
    return (
      <div className="app-shell">
        <Topbar onNavigate={onNavigate} onLogout={onLogout} />
        <main className="ingredient-register-page ingredient-register-page--wide">
          <ReceiptDetailRegisterPage
            embedded
            items={detailItems}
            onBack={() => setDetailItems([])}
            onNavigate={(page) => onNavigate?.(page)}
            onLogout={onLogout}
          />
        </main>
      </div>
    )
  }

  return (
    <div className="app-shell">
      <Topbar onNavigate={onNavigate} onLogout={onLogout} />

      <main className="ingredient-register-page">
        <div className="fridge-header">
          <div>
            <p className="eyebrow">{t('ingredientRegister.eyebrow')}</p>
            <h1>{t('ingredientRegister.title')}</h1>
            <p className="ingredient-register-page__lead">
              {t('ingredientRegister.lead')}
            </p>
          </div>
          <button
            type="button"
            className="secondary-button back-home-button"
            onClick={() => onNavigate?.('home')}
          >
            {t('common.backHome')}
          </button>
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

        <section className="register-card" aria-labelledby="input-method-title">
          <h2 className="register-card__title" id="input-method-title">
            {t('ingredientRegister.methodTitle')}
          </h2>
          <p className="register-card__desc">
            {t('ingredientRegister.methodDescription')}
          </p>

          <div
            className="register-method-labels register-method-labels--two"
            role="tablist"
            aria-label={t('ingredientRegister.methodAria')}
          >
            <button
              type="button"
              role="tab"
              aria-selected={method === 'receipt'}
              aria-controls="panel-receipt"
              className={`register-method-label ${
                method === 'receipt' ? 'is-active' : ''
              }`}
              onClick={() => selectMethod('receipt')}
            >
              <span className="register-method-label__icon" aria-hidden="true">
                {t('ingredientRegister.receiptIcon')}
              </span>
              {t('ingredientRegister.receipt')}
              <span className="register-method-label__sub">
                {t('ingredientRegister.receiptSub')}
              </span>
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={method === 'image'}
              aria-controls="panel-image"
              className={`register-method-label ${
                method === 'image' ? 'is-active' : ''
              }`}
              onClick={() => selectMethod('image')}
            >
              <span className="register-method-label__icon" aria-hidden="true">
                {t('ingredientRegister.imageIcon')}
              </span>
              {t('ingredientRegister.image')}
              <span className="register-method-label__sub">
                {t('ingredientRegister.imageSub')}
              </span>
            </button>
          </div>

          {method === 'receipt' ? (
            <div id="panel-receipt" role="tabpanel">
              <ReceiptScanPage
                embedded
                allowManualCandidates={false}
                onNavigate={onNavigate}
                onLogout={onLogout}
                onProceedToDetail={(items) => setDetailItems(items)}
              />
            </div>
          ) : (
            <div id="panel-image" role="tabpanel">
              <p className="register-image-lead">
                {t('ingredientRegister.imageLead')}
              </p>

              <div className="panel receipt-uploader">
                <div className="section-heading">
                  <div>
                    <p className="eyebrow">{t('receipt.sourceEyebrow')}</p>
                    <h2>{t('receipt.sourceTitle')}</h2>
                  </div>
                </div>

                <div className="receipt-source-actions">
                  <label className="receipt-file-field">
                  <input
                    type="file"
                    accept="image/*"
                    onChange={(event) =>
                      void handleFoodImageChange(
                        event.currentTarget.files?.[0] ?? null,
                      )
                    }
                  />
                    <span>{t('receipt.chooseImage')}</span>
                  </label>
                  <button
                    type="button"
                    className="secondary-button"
                    onClick={isCameraOpen ? stopCamera : startCamera}
                    disabled={isRecognizing}
                  >
                    {isCameraOpen ? t('receipt.stopCamera') : t('receipt.startCamera')}
                  </button>
                </div>

                {isCameraOpen ? (
                  <div className="receipt-camera-panel">
                    <video
                      ref={videoRef}
                      className="receipt-camera-preview"
                      playsInline
                      muted
                    />
                    <button
                      type="button"
                      className="primary-button"
                      onClick={captureFoodImage}
                      disabled={isRecognizing}
                    >
                      {t('receipt.capture')}
                    </button>
                  </div>
                ) : null}

                {imagePreviewUrl ? (
                  <img
                    className="receipt-preview"
                    src={imagePreviewUrl}
                    alt={t('ingredientRegister.previewAlt')}
                  />
                ) : (
                  <div className="receipt-placeholder">{t('receipt.noImage')}</div>
                )}
              </div>

              {recognizedItems.length ? (
                <div className="register-recognition-result">
                  <h3>{t('ingredientRegister.resultTitle')}</h3>
                  <div className="register-recognition-list">
                    {recognizedItems.map((item, index) => (
                      <label
                        key={item.id ?? `${item.name}-${index}`}
                        className="register-recognition-item"
                      >
                        <input
                          type="checkbox"
                          checked={item.selected}
                          onChange={(event) =>
                            toggleRecognizedItem(
                              index,
                              event.currentTarget.checked,
                            )
                          }
                        />
                        <span>
                          <strong>{item.name}</strong>
                          <small>
                            {item.category}
                            {item.quantity ? ` / ${item.quantity}` : ''}
                            {item.gram ? ` / ${item.gram}g` : ''}
                          </small>
                        </span>
                      </label>
                    ))}
                  </div>
                </div>
              ) : null}

              <div className="register-form-actions">
                <button
                  type="button"
                  className="secondary-button"
                  onClick={() => {
                    setRecognizedItems([])
                    setImagePreviewUrl('')
                    setStatusMessage('')
                    setErrorMessage('')
                    stopCamera()
                  }}
                >
                  {t('common.cancel')}
                </button>
                <button
                  type="button"
                  className="primary-button"
                  onClick={continueWithRecognizedItems}
                  disabled={isRecognizing || !recognizedItems.length}
                >
                  {isRecognizing
                    ? t('ingredientRegister.recognizing')
                    : t('ingredientRegister.detailButton')}
                  <Icon name="arrow" />
                </button>
              </div>
            </div>
          )}
        </section>
      </main>
    </div>
  )
}
