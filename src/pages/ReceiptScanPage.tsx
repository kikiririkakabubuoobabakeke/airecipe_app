import { useEffect, useRef, useState } from 'react'
import { Icon } from '../components/Icon'
import { parseReceiptText } from '../lib/receiptApi'
import { recognizeReceiptImage } from '../lib/receiptOcr'
import { useI18n } from '../lib/useI18n'
import type { AppDestination, ReceiptIngredientCandidate } from '../types/ui'

type ReceiptScanPageProps = {
  onNavigate?: (page: AppDestination) => void
  onLogout?: () => void
  onProceedToDetail?: (items: ReceiptIngredientCandidate[]) => void
  embedded?: boolean
  allowManualCandidates?: boolean
}

function createCandidateId() {
  const randomId =
    typeof crypto !== 'undefined' && 'randomUUID' in crypto
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(36).slice(2)}`

  return `candidate-${randomId}`
}

function normalizeCandidates(items: ReceiptIngredientCandidate[]) {
  return items.map((item) => ({
    ...item,
    id: item.id ?? createCandidateId(),
    selected: item.selected !== false,
  }))
}

function todayLocalIsoDate() {
  const date = new Date()
  const offsetDate = new Date(date.getTime() - date.getTimezoneOffset() * 60000)
  return offsetDate.toISOString().slice(0, 10)
}

const ignoredReceiptLinePattern =
  /(合計|小計|税込|税率|消費税|現計|釣銭|お預り|お預かり|ポイント|袋|レジ|領収|電話|TEL|カード|クレジット|割引|値引|対象|店舗|担当|No\.|合計点数|買上|お買上|単価|外税|内税|軽減|登録番号|インボイス|ありがとうございました)/i

const localNameCorrections: Array<[RegExp, string, string]> = [
  [/^(サケ|鮭|さけ|シャケ|しやけ).*?(キリミ|切身|切り身|切み)?$/iu, '鮭切り身', '肉・卵・魚'],
  [/^(コマツナ|小松菜|こまつな)$/iu, '小松菜', '野菜'],
  [/^(タマゴ|玉子|卵|たまご).*$/iu, '卵', '肉・卵・魚'],
  [/^(ギュウニュウ|牛乳|ぎゅうにゅう).*$/iu, '牛乳', '乳製品'],
  [/^(タマネギ|玉ねぎ|玉葱|たまねぎ).*$/iu, '玉ねぎ', '野菜'],
  [/^(キャベツ|きゃべつ).*$/iu, 'キャベツ', '野菜'],
  [/^(ニンジン|人参|にんじん).*$/iu, 'にんじん', '野菜'],
  [/^(ジャガイモ|じゃがいも|馬鈴薯).*$/iu, 'じゃがいも', '野菜'],
  [/^(ナットウ|納豆).*$/iu, '納豆', '加工品'],
  [/^(トウフ|豆腐).*$/iu, '豆腐', '加工品'],
]

function inferLocalCategory(name: string) {
  if (/(小松菜|玉ねぎ|キャベツ|にんじん|じゃがいも|トマト|野菜|ねぎ|白菜|大根)/u.test(name)) {
    return '野菜'
  }

  if (/(鮭|サーモン|魚|さば|鯖|さんま|まぐろ|刺身)/u.test(name)) {
    return '肉・卵・魚'
  }

  if (/(豚|鶏|牛肉|肉|ハム|ベーコン|ウインナー)/u.test(name)) {
    return '肉・卵・魚'
  }

  if (/(卵|玉子|たまご)/u.test(name)) {
    return '肉・卵・魚'
  }

  if (/(牛乳|チーズ|ヨーグルト|乳)/u.test(name)) {
    return '乳製品'
  }

  if (/(米|パン|麺|うどん|そば|パスタ)/u.test(name)) {
    return '主食'
  }

  if (/(納豆|豆腐|ちくわ|缶|冷凍|惣菜)/u.test(name)) {
    return '加工品'
  }

  return 'その他'
}

function normalizeLocalName(line: string) {
  const base = line
    .replace(/[＊*※]/g, '')
    .replace(/[¥￥]?\s*\d{2,6}\s*円?$/u, '')
    .replace(/\s+/g, '')
    .replace(/[|｜:：]/g, '')
    .trim()
  const name = base
    .replace(/\d+(?:\.\d+)?\s*(g|ｇ|グラム|ml|mL|ML|ミリリットル|個|コ|本|枚|袋|パック|P)$/iu, '')
    .trim()

  for (const [pattern, replacement] of localNameCorrections) {
    if (pattern.test(name)) {
      return replacement
    }
  }

  return name || base
}

function localFallbackParseReceiptText(text: string) {
  return text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line && !ignoredReceiptLinePattern.test(line))
    .filter((line) => !/^[\d\s¥￥,.-]+$/u.test(line))
    .slice(0, 12)
    .map((line, index) => {
      const name = normalizeLocalName(line)
      const correction = localNameCorrections.find(([pattern]) =>
        pattern.test(name),
      )
      const gramMatch = line.match(/(\d+(?:\.\d+)?)\s*(g|ｇ|グラム|ml|mL|ML|ミリリットル)/iu)
      const quantityMatch = line.match(/(\d+)\s*(個|コ|本|枚|袋|パック|P)/iu)

      return {
        id: `local-receipt-${index + 1}`,
        name,
        category: correction?.[2] ?? inferLocalCategory(name),
        quantity: quantityMatch ? Number(quantityMatch[1]) : 1,
        gram: gramMatch ? Math.round(Number(gramMatch[1])) : null,
        expirationDate: null,
        memo: 'レシートOCR',
        selected: true,
        sourceLine: line,
      }
    })
    .filter((item) => item.name)
}

export function ReceiptScanPage({
  onNavigate,
  onProceedToDetail,
  embedded = false,
  allowManualCandidates = true,
}: ReceiptScanPageProps) {
  const { t } = useI18n()
  const videoRef = useRef<HTMLVideoElement | null>(null)
  const cameraStreamRef = useRef<MediaStream | null>(null)
  const activeTaskRef = useRef<string | null>(null)
  const [previewUrl, setPreviewUrl] = useState('')
  const [ocrText, setOcrText] = useState('')
  const [candidates, setCandidates] = useState<ReceiptIngredientCandidate[]>([])
  const [progress, setProgress] = useState(0)
  const [progressLabel, setProgressLabel] = useState('')
  const [statusMessage, setStatusMessage] = useState('')
  const [errorMessage, setErrorMessage] = useState('')
  const [isReading, setIsReading] = useState(false)
  const [isParsing, setIsParsing] = useState(false)
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

  useEffect(() => {
    return () => {
      if (previewUrl) {
        URL.revokeObjectURL(previewUrl)
      }
    }
  }, [previewUrl])

  async function parseOcrText(text: string, successMessage: string, taskId?: string) {
    if (!text.trim()) {
      if (!taskId || activeTaskRef.current === taskId) {
        setErrorMessage(t('receipt.ocrEmpty'))
      }
      return
    }

    if (!taskId || activeTaskRef.current === taskId) {
      setIsParsing(true)
      setStatusMessage(t('receipt.parseStatus'))
      setErrorMessage('')
    }

    try {
      const result = await parseReceiptText(text, todayLocalIsoDate())

      if (taskId && activeTaskRef.current !== taskId) {
        return
      }

      setCandidates(normalizeCandidates(result.items))
      setStatusMessage(successMessage)
      setIsParsing(false)
    } catch (error) {
      console.error('[vite] Receipt parse failed:', error)

      if (taskId && activeTaskRef.current !== taskId) {
        return
      }

      const fallbackItems = localFallbackParseReceiptText(text)

      if (fallbackItems.length) {
        setCandidates(normalizeCandidates(fallbackItems))
        setStatusMessage(t('receipt.parseFallback'))
        setErrorMessage('')
      } else {
        setErrorMessage(t('receipt.parseFailed'))
        setStatusMessage('')
      }
      setIsParsing(false)
    }
  }

  async function handleFileChange(file: File | null) {
    if (!file) {
      return
    }

    const taskId = createCandidateId()
    activeTaskRef.current = taskId

    setPreviewUrl(URL.createObjectURL(file))
    setOcrText('')
    setCandidates([])
    setStatusMessage('')
    setErrorMessage('')
    setProgress(0)
    setProgressLabel(t('receipt.ocrPreparing'))
    setIsReading(true)

    try {
      const text = await recognizeReceiptImage(file, (nextProgress, status) => {
        if (activeTaskRef.current !== taskId) {
          return
        }
        setProgress(nextProgress)
        setProgressLabel(status)
      })

      if (activeTaskRef.current !== taskId) {
        return
      }

      setOcrText(text)
      await parseOcrText(text, t('receipt.parseSuccess'), taskId)

      if (activeTaskRef.current === taskId) {
        setIsReading(false)
      }
    } catch (error) {
      console.error('[vite] Receipt OCR failed:', error)

      if (activeTaskRef.current === taskId) {
        setErrorMessage(t('receipt.readFailed'))
        setIsReading(false)
      }
    }
  }

  async function startCamera() {
    if (!navigator.mediaDevices?.getUserMedia) {
      setErrorMessage(t('receipt.cameraUnavailable'))
      return
    }

    setErrorMessage('')
    setStatusMessage('')

    try {
      cameraStreamRef.current?.getTracks().forEach((track) => track.stop())
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: 'environment' } },
        audio: false,
      })
      cameraStreamRef.current = stream
      setIsCameraOpen(true)
    } catch (error) {
      console.error('[vite] Camera start failed:', error)
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

  async function captureCameraImage() {
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
    await handleFileChange(
      new File([blob], `receipt-${Date.now()}.jpg`, { type: 'image/jpeg' }),
    )
  }

  async function handleParseText() {
    await parseOcrText(
      ocrText,
      t('receipt.reparseSuccess'),
    )
  }

  function updateCandidate(
    id: string | undefined,
    patch: Partial<ReceiptIngredientCandidate>,
  ) {
    setCandidates((current) =>
      current.map((item) => (item.id === id ? { ...item, ...patch } : item)),
    )
  }

  function addManualCandidate() {
    setCandidates((current) => [
      ...current,
      {
        id: createCandidateId(),
        name: '',
        category: 'その他',
        quantity: 1,
        gram: null,
        expirationDate: null,
        memo: t('receipt.addItem'),
        selected: true,
        sourceLine: t('receipt.addItem'),
      },
    ])
    setStatusMessage(t('receipt.manualAdded'))
    setErrorMessage('')
  }

  function handleProceed() {
    const selectedItems = candidates.filter((item) => item.selected)

    if (!selectedItems.length) {
      setErrorMessage(t('receipt.selectRequired'))
      return
    }

    onProceedToDetail?.(selectedItems)
  }

  const content = (
    <main className={`receipt-page ${embedded ? 'receipt-page--embedded' : ''}`}>
      {!embedded ? (
        <div className="fridge-header">
          <div>
            <p className="eyebrow">{t('receipt.eyebrow')}</p>
            <h1>{t('receipt.title')}</h1>
          </div>
          <button
            type="button"
            className="secondary-button back-home-button"
            onClick={() => onNavigate?.('home')}
          >
            <div style={{ transform: 'scaleX(-1)', display: 'inline-flex' }}>
              <Icon name="arrow" />
            </div>
            <span>{t('common.backHome')}</span>
          </button>
        </div>
      ) : null}

        <section className="receipt-layout">
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
                  disabled={isReading || isParsing}
                  onChange={(event) =>
                    handleFileChange(event.currentTarget.files?.[0] ?? null)
                  }
                />
                <span>{t('receipt.chooseImage')}</span>
              </label>
              <button
                type="button"
                className="secondary-button"
                onClick={isCameraOpen ? stopCamera : startCamera}
                disabled={isReading || isParsing}
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
                  onClick={captureCameraImage}
                  disabled={isReading || isParsing}
                >
                  {t('receipt.capture')}
                </button>
              </div>
            ) : null}

            {previewUrl ? (
              <img
                className="receipt-preview"
                src={previewUrl}
                alt={t('receipt.previewAlt')}
              />
            ) : (
              <div className="receipt-placeholder">{t('receipt.noImage')}</div>
            )}

            {isReading ? (
              <div className="receipt-progress" aria-live="polite">
                <span>{progressLabel || t('receipt.ocrProcessing')}</span>
                <strong>{progress}%</strong>
              </div>
            ) : null}
          </div>

          <div className="panel receipt-text-panel">
            <div className="section-heading">
              <div>
                <p className="eyebrow">{t('receipt.textEyebrow')}</p>
                <h2>{t('receipt.textTitle')}</h2>
              </div>
              <button
                type="button"
                className="small-button"
                onClick={handleParseText}
                disabled={isReading || isParsing || !ocrText.trim()}
              >
                {isParsing ? t('receipt.parsing') : t('receipt.reparse')}
              </button>
            </div>

            <textarea
              value={ocrText}
              onChange={(event) => setOcrText(event.target.value)}
              placeholder={t('receipt.textPlaceholder')}
            />
          </div>
        </section>

        {statusMessage ? (
          <div className="status-message receipt-status" role="status">
            <span>{statusMessage}</span>
          </div>
        ) : null}

        {errorMessage ? (
          <p className="status-message" role="alert">
            {errorMessage}
          </p>
        ) : null}

        {candidates.length ? (
          <section className="panel receipt-candidates">
            <div className="section-heading">
              <div>
                <p className="eyebrow">{t('receipt.candidatesEyebrow')}</p>
                <h2>{t('receipt.candidatesTitle')}</h2>
              </div>
              <div className="receipt-candidate-actions">
                {allowManualCandidates ? (
                  <button
                    type="button"
                    className="secondary-button"
                    onClick={addManualCandidate}
                    disabled={isReading || isParsing}
                  >
                    {t('receipt.addItem')}
                  </button>
                ) : null}
                <button
                  type="button"
                  className="primary-button"
                  onClick={handleProceed}
                  disabled={isReading || isParsing}
                >
                  {t('receipt.proceedToDetail')}
                </button>
              </div>
            </div>

            <div className="receipt-candidate-list">
              {candidates.map((item) => (
                <article key={item.id} className="receipt-candidate">
                  <label className="receipt-check">
                    <input
                      type="checkbox"
                      checked={item.selected}
                      onChange={(event) =>
                        updateCandidate(item.id, {
                          selected: event.currentTarget.checked,
                        })
                      }
                    />
                    <span>{t('receipt.register')}</span>
                  </label>
                  <label>
                    <span>{t('receipt.candidate.name')}</span>
                    <input
                      value={item.name}
                      onChange={(event) =>
                        updateCandidate(item.id, { name: event.target.value })
                      }
                    />
                  </label>
                  <label>
                    <span>{t('receipt.candidate.category')}</span>
                    <input
                      value={item.category}
                      onChange={(event) =>
                        updateCandidate(item.id, {
                          category: event.target.value,
                        })
                      }
                    />
                  </label>
                  <label>
                    <span>{t('receipt.candidate.quantity')}</span>
                    <input
                      type="number"
                      min="0"
                      value={item.quantity ?? ''}
                      onChange={(event) =>
                        updateCandidate(item.id, {
                          quantity: event.target.value
                            ? Number(event.target.value)
                            : null,
                        })
                      }
                    />
                  </label>
                  <label>
                    <span>{t('receipt.candidate.gram')}</span>
                    <input
                      type="number"
                      min="0"
                      value={item.gram ?? ''}
                      onChange={(event) =>
                        updateCandidate(item.id, {
                          gram: event.target.value
                            ? Number(event.target.value)
                            : null,
                        })
                      }
                    />
                  </label>
                  <label>
                    <span>{t('receipt.candidate.expiration')}</span>
                    <input
                      type="date"
                      value={item.expirationDate ?? ''}
                      onChange={(event) =>
                        updateCandidate(item.id, {
                          expirationDate: event.target.value || null,
                        })
                      }
                    />
                  </label>
                </article>
              ))}
            </div>
          </section>
        ) : allowManualCandidates ? (
          <section className="panel receipt-candidates">
            <div className="section-heading">
              <div>
                <p className="eyebrow">{t('receipt.candidatesEyebrow')}</p>
                <h2>{t('receipt.manualTitle')}</h2>
              </div>
              <button
                type="button"
                className="secondary-button"
                onClick={addManualCandidate}
              >
                {t('receipt.addItem')}
              </button>
            </div>
            <p className="empty-text">
              {t('receipt.manualEmpty')}
            </p>
          </section>
        ) : null}
    </main>
  )

  if (embedded) {
    return content
  }

  return (
    <>
      {content}
    </>
  )
}
