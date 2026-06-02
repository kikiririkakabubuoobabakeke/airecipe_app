import { useEffect, useRef, useState } from 'react'
import { Topbar } from '../components/Topbar'
import { importReceiptItems, parseReceiptText } from '../lib/receiptApi'
import { recognizeReceiptImage } from '../lib/receiptOcr'
import type { AppDestination, ReceiptIngredientCandidate } from '../types/ui'

type ReceiptScanPageProps = {
  onNavigate?: (page: AppDestination) => void
}

function createCandidateId() {
  return `candidate-${crypto.randomUUID()}`
}

function normalizeCandidates(items: ReceiptIngredientCandidate[]) {
  return items.map((item) => ({
    ...item,
    id: item.id ?? createCandidateId(),
    selected: item.selected !== false,
  }))
}

const ignoredReceiptLinePattern =
  /(合計|小計|税込|税率|消費税|現計|釣銭|お預り|お預かり|ポイント|袋|レジ|領収|電話|TEL|カード|クレジット|割引|値引|対象|店舗|担当|No\.|合計点数|買上|お買上|単価|外税|内税|軽減|登録番号|インボイス|ありがとうございました)/i

const localNameCorrections: Array<[RegExp, string, string]> = [
  [/^(サケ|鮭|さけ|シャケ|しやけ).*?(キリミ|切身|切り身|切み)?$/iu, '鮭切り身', '魚'],
  [/^(コマツナ|小松菜|こまつな)$/iu, '小松菜', '野菜'],
  [/^(タマゴ|玉子|卵|たまご).*$/iu, '卵', '卵'],
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
    return '魚'
  }

  if (/(豚|鶏|牛肉|肉|ハム|ベーコン|ウインナー)/u.test(name)) {
    return '肉'
  }

  if (/(卵|玉子|たまご)/u.test(name)) {
    return '卵'
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

export function ReceiptScanPage({ onNavigate }: ReceiptScanPageProps) {
  const videoRef = useRef<HTMLVideoElement | null>(null)
  const cameraStreamRef = useRef<MediaStream | null>(null)
  const [previewUrl, setPreviewUrl] = useState('')
  const [ocrText, setOcrText] = useState('')
  const [candidates, setCandidates] = useState<ReceiptIngredientCandidate[]>([])
  const [progress, setProgress] = useState(0)
  const [progressLabel, setProgressLabel] = useState('')
  const [statusMessage, setStatusMessage] = useState('')
  const [errorMessage, setErrorMessage] = useState('')
  const [isReading, setIsReading] = useState(false)
  const [isParsing, setIsParsing] = useState(false)
  const [isImporting, setIsImporting] = useState(false)
  const [isCameraOpen, setIsCameraOpen] = useState(false)
  const [importedCount, setImportedCount] = useState(0)

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

  async function parseOcrText(text: string, successMessage: string) {
    if (!text.trim()) {
      setErrorMessage('OCR結果が空です')
      return
    }

    setIsParsing(true)
    setStatusMessage('AIで登録候補を整形しています...')
    setErrorMessage('')

    try {
      const result = await parseReceiptText(text)
      setCandidates(normalizeCandidates(result.items))
      setStatusMessage(successMessage)
    } catch (error) {
      console.error('[vite] Receipt parse failed:', error)
      const fallbackItems = localFallbackParseReceiptText(text)

      if (fallbackItems.length) {
        setCandidates(normalizeCandidates(fallbackItems))
        setStatusMessage(
          'AI整形に失敗したため、OCR結果から登録候補を作成しました。必要に応じて修正してください。',
        )
        setErrorMessage('')
      } else {
        setErrorMessage('登録候補の作成に失敗しました')
        setStatusMessage('')
      }
    } finally {
      setIsParsing(false)
    }
  }

  async function handleFileChange(file: File | null) {
    if (!file) {
      return
    }

    setPreviewUrl(URL.createObjectURL(file))
    setOcrText('')
    setCandidates([])
    setImportedCount(0)
    setStatusMessage('')
    setErrorMessage('')
    setProgress(0)
    setProgressLabel('OCR準備中')
    setIsReading(true)

    try {
      const text = await recognizeReceiptImage(file, (nextProgress, status) => {
        setProgress(nextProgress)
        setProgressLabel(status)
      })
      setOcrText(text)
      setIsReading(false)
      await parseOcrText(
        text,
        '登録候補を自動作成しました。必要に応じて修正してください。',
      )
    } catch (error) {
      console.error('[vite] Receipt OCR failed:', error)
      setErrorMessage('レシート画像の読み取りに失敗しました')
    } finally {
      setIsReading(false)
    }
  }

  async function startCamera() {
    if (!navigator.mediaDevices?.getUserMedia) {
      setErrorMessage('このブラウザではカメラを利用できません')
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
      setErrorMessage('カメラを起動できませんでした')
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
      setErrorMessage('カメラ画像の準備ができていません')
      return
    }

    const canvas = document.createElement('canvas')
    canvas.width = video.videoWidth
    canvas.height = video.videoHeight
    const context = canvas.getContext('2d')

    if (!context) {
      setErrorMessage('撮影画像を作成できませんでした')
      return
    }

    context.drawImage(video, 0, 0, canvas.width, canvas.height)

    const blob = await new Promise<Blob | null>((resolve) => {
      canvas.toBlob(resolve, 'image/jpeg', 0.92)
    })

    if (!blob) {
      setErrorMessage('撮影画像を作成できませんでした')
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
      '登録候補を再作成しました。必要に応じて修正してください。',
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
        memo: '手動追加',
        selected: true,
        sourceLine: '手動追加',
      },
    ])
    setImportedCount(0)
    setStatusMessage('手動入力用の項目を追加しました')
    setErrorMessage('')
  }

  async function handleImport() {
    const selectedItems = candidates.filter((item) => item.selected)

    if (!selectedItems.length) {
      setErrorMessage('登録する食材を選択してください')
      return
    }

    setIsImporting(true)
    setStatusMessage('')
    setErrorMessage('')

    try {
      const result = await importReceiptItems(selectedItems)
      setImportedCount(result.importedCount)
      setStatusMessage(`${result.importedCount}件の食材を在庫に登録しました`)
    } catch (error) {
      console.error('[vite] Receipt import failed:', error)
      setErrorMessage('食材の登録に失敗しました')
    } finally {
      setIsImporting(false)
    }
  }

  return (
    <div className="app-shell">
      <Topbar onNavigate={onNavigate} />

      <main className="receipt-page">
        <div className="fridge-header">
          <div>
            <p className="eyebrow">レシート撮影</p>
            <h1>購入食材を読み取る</h1>
          </div>
          <button
            type="button"
            className="secondary-button back-home-button"
            onClick={() => onNavigate?.('home')}
          >
            ホームに戻る
          </button>
        </div>

        <section className="receipt-layout">
          <div className="panel receipt-uploader">
            <div className="section-heading">
              <div>
                <p className="eyebrow">画像 / カメラ</p>
                <h2>レシートを読み取る</h2>
              </div>
            </div>

            <div className="receipt-source-actions">
              <label className="receipt-file-field">
                <input
                  type="file"
                  accept="image/*"
                  onChange={(event) =>
                    handleFileChange(event.currentTarget.files?.[0] ?? null)
                  }
                />
                <span>画像を選ぶ</span>
              </label>
              <button
                type="button"
                className="secondary-button"
                onClick={isCameraOpen ? stopCamera : startCamera}
                disabled={isReading || isParsing}
              >
                {isCameraOpen ? 'カメラ停止' : 'カメラを起動'}
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
                  撮影して読み取る
                </button>
              </div>
            ) : null}

            {previewUrl ? (
              <img
                className="receipt-preview"
                src={previewUrl}
                alt="選択したレシート"
              />
            ) : (
              <div className="receipt-placeholder">画像未選択</div>
            )}

            {isReading ? (
              <div className="receipt-progress" aria-live="polite">
                <span>{progressLabel || 'OCR処理中'}</span>
                <strong>{progress}%</strong>
              </div>
            ) : null}
          </div>

          <div className="panel receipt-text-panel">
            <div className="section-heading">
              <div>
                <p className="eyebrow">OCR結果</p>
                <h2>読み取りテキスト</h2>
              </div>
              <button
                type="button"
                className="small-button"
                onClick={handleParseText}
                disabled={isReading || isParsing || !ocrText.trim()}
              >
                {isParsing ? '整形中...' : 'AIで再整形'}
              </button>
            </div>

            <textarea
              value={ocrText}
              onChange={(event) => setOcrText(event.target.value)}
              placeholder="OCR結果がここに入ります。手入力で貼り付けても整形できます。"
            />
          </div>
        </section>

        {statusMessage ? (
          <div className="status-message receipt-status" role="status">
            <span>{statusMessage}</span>
            {importedCount > 0 ? (
              <button
                type="button"
                className="small-button"
                onClick={() => onNavigate?.('fridge')}
              >
                在庫を見る
              </button>
            ) : null}
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
                <p className="eyebrow">登録候補</p>
                <h2>確認して在庫に追加</h2>
              </div>
              <div className="receipt-candidate-actions">
                <button
                  type="button"
                  className="secondary-button"
                  onClick={addManualCandidate}
                  disabled={isImporting}
                >
                  項目追加
                </button>
                <button
                  type="button"
                  className="primary-button"
                  onClick={handleImport}
                  disabled={isImporting}
                >
                  {isImporting ? '登録中...' : '選択した食材を登録'}
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
                    <span>登録</span>
                  </label>
                  <label>
                    <span>食材名</span>
                    <input
                      value={item.name}
                      onChange={(event) =>
                        updateCandidate(item.id, { name: event.target.value })
                      }
                    />
                  </label>
                  <label>
                    <span>カテゴリ</span>
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
                    <span>個数</span>
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
                    <span>g/ml</span>
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
                    <span>期限</span>
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
        ) : (
          <section className="panel receipt-candidates">
            <div className="section-heading">
              <div>
                <p className="eyebrow">登録候補</p>
                <h2>手動で追加</h2>
              </div>
              <button
                type="button"
                className="secondary-button"
                onClick={addManualCandidate}
              >
                項目追加
              </button>
            </div>
            <p className="empty-text">
              レシピ登録で認識しない食材は手動で追加できます。
            </p>
          </section>
        )}
      </main>
    </div>
  )
}
