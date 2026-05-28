import { useState } from 'react'
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

export function ReceiptScanPage({ onNavigate }: ReceiptScanPageProps) {
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

  async function handleFileChange(file: File | null) {
    if (!file) {
      return
    }

    setPreviewUrl(URL.createObjectURL(file))
    setOcrText('')
    setCandidates([])
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
      setStatusMessage('文字を読み取りました。内容をAIで整形できます。')
    } catch (error) {
      console.error('[vite] Receipt OCR failed:', error)
      setErrorMessage('レシート画像の読み取りに失敗しました')
    } finally {
      setIsReading(false)
    }
  }

  async function handleParseText() {
    if (!ocrText.trim()) {
      setErrorMessage('OCR結果が空です')
      return
    }

    setIsParsing(true)
    setStatusMessage('')
    setErrorMessage('')

    try {
      const result = await parseReceiptText(ocrText)
      setCandidates(normalizeCandidates(result.items))
      setStatusMessage('登録候補を作成しました。必要に応じて修正してください。')
    } catch (error) {
      console.error('[vite] Receipt parse failed:', error)
      setErrorMessage('登録候補の作成に失敗しました')
    } finally {
      setIsParsing(false)
    }
  }

  function updateCandidate(
    id: string | undefined,
    patch: Partial<ReceiptIngredientCandidate>,
  ) {
    setCandidates((current) =>
      current.map((item) => (item.id === id ? { ...item, ...patch } : item)),
    )
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
                <p className="eyebrow">画像</p>
                <h2>レシートを選択</h2>
              </div>
            </div>

            <label className="receipt-file-field">
              <input
                type="file"
                accept="image/*"
                capture="environment"
                onChange={(event) =>
                  handleFileChange(event.currentTarget.files?.[0] ?? null)
                }
              />
              <span>画像を選ぶ</span>
            </label>

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
                {isParsing ? '整形中...' : 'AIで整形'}
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
          <p className="status-message" role="status">
            {statusMessage}
          </p>
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
              <button
                type="button"
                className="primary-button"
                onClick={handleImport}
                disabled={isImporting}
              >
                {isImporting ? '登録中...' : '選択した食材を登録'}
              </button>
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
        ) : null}
      </main>
    </div>
  )
}
