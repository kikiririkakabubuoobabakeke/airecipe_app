import { useState } from 'react'
import { Topbar } from '../components/Topbar'
import { importReceiptItemsDetail } from '../lib/receiptApi'
import type { AppDestination, ReceiptIngredientCandidate } from '../types/ui'

type ReceiptDetailRegisterPageProps = {
  items: ReceiptIngredientCandidate[]
  onBack: () => void
  onNavigate: (page: AppDestination) => void
  onLogout?: () => void
}

type EditableCandidate = ReceiptIngredientCandidate & {
  bestBeforeDate: string
  expirationDate: string
  memo: string
}

function getDaysForCategory(category: string) {
  switch (category) {
    case '肉・卵・魚':
    case '肉':
    case '魚':
      return 2
    case '野菜':
      return 5
    case '乳製品':
      return 7
    case '加工品':
      return 14
    default:
      return 7
  }
}

function addDays(dateStr: string, days: number) {
  const date = new Date(dateStr)
  date.setDate(date.getDate() + days)
  return date.toISOString().slice(0, 10)
}

function normalizeCategory(category: string) {
  if (category === '肉' || category === '魚' || category === '卵') {
    return '肉・卵・魚'
  }

  return category
}

function createInitialFormData(items: ReceiptIngredientCandidate[]) {
  return items.map((item) => {
    const category = normalizeCategory(item.category)
    const bestBefore = item.bestBeforeDate || ''
    const expiration = item.expirationDate || ''

    return {
      ...item,
      category,
      quantity: item.quantity ?? 1,
      gram: item.gram ?? null,
      bestBeforeDate: bestBefore,
      expirationDate: expiration,
      memo: item.memo || '',
    } satisfies EditableCandidate
  })
}

export function ReceiptDetailRegisterPage({
  items,
  onBack,
  onNavigate,
  onLogout,
}: ReceiptDetailRegisterPageProps) {
  const [formData, setFormData] = useState<EditableCandidate[]>(() =>
    createInitialFormData(items),
  )
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [statusMessage, setStatusMessage] = useState('')
  const [errorMessage, setErrorMessage] = useState('')

  const categories = [
    '肉・卵・魚',
    '野菜',
    '乳製品',
    '加工品',
    'その他',
  ]

  const handleChange = <K extends keyof EditableCandidate>(
    index: number,
    field: K,
    value: EditableCandidate[K],
  ) => {
    setFormData((current) =>
      current.map((item, idx) =>
        idx === index ? { ...item, [field]: value } : item,
      ),
    )
  }

  const handleSubmit = async () => {
    // Validation
    for (const item of formData) {
      if (!item.name.trim()) {
        setErrorMessage('食材名を入力してください。')
        return
      }
      if (!item.category) {
        setErrorMessage('カテゴリーを選択してください。')
        return
      }
      if (item.quantity === null || item.quantity === undefined || item.quantity <= 0) {
        setErrorMessage('個数は1以上を入力してください。')
        return
      }
    }

    setIsSubmitting(true)
    setErrorMessage('')
    setStatusMessage('')

    try {
      const result = await importReceiptItemsDetail(formData)
      setStatusMessage(`${result.importedCount}件の食材を冷蔵庫に登録しました！`)
    } catch (error) {
      console.error('[vite] Import detail failed:', error)
      setErrorMessage('一括登録に失敗しました。時間をおいて再度お試しください。')
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <div className="app-shell">
      <Topbar onNavigate={onNavigate} onLogout={onLogout} />

      <main className="receipt-detail-page">
        {/* Back Link */}
        <div className="back-link-wrapper">
          <button type="button" className="back-text-button" onClick={onBack}>
            <span className="arrow-left">←</span> 食材登録に戻る
          </button>
        </div>

        {/* Header */}
        <div className="detail-header">
          <h1>詳細登録</h1>
          <p className="subtitle">
            複数の食材をまとめて編集して、冷蔵庫に一括登録できます。
          </p>
        </div>



        {/* Status Messages */}
        {statusMessage && (
          <div className="status-message success-message" role="status">
            <span>{statusMessage}</span>
            <button
              type="button"
              className="primary-button inline-fridge-button"
              onClick={() => onNavigate('fridge')}
            >
              冷蔵庫を見る
            </button>
          </div>
        )}

        {errorMessage && (
          <div className="status-message error-message" role="alert">
            <span>{errorMessage}</span>
          </div>
        )}

        {/* Main Editable Items List */}
        {!statusMessage && (
          <div className="panel detail-form-panel">
            <div className="panel-header">
              <h2>登録内容（複数）</h2>
              <p className="panel-lead">
                食材ごとに個数・グラム・期限・メモを入力してください。
              </p>
            </div>

            {formData.length > 0 && (
              <div className="summary-banner">
                {formData.length}件の食材が読み取られました。必要な項目を確認して登録してください。
              </div>
            )}

            {formData.length === 0 ? (
              <p className="empty-text">登録対象の食材がありません。食材登録に戻ってください。</p>
            ) : (
              <div className="detail-cards-list">
                {formData.map((item, index) => (
                  <div key={item.id || index} className="detail-card">
                    <div className="card-index-title">{index + 1}件目</div>

                    <div className="card-fields-grid">
                      {/* Name */}
                      <div className="field-group">
                        <label>
                          食材名<span className="required">*</span>
                        </label>
                        <input
                          type="text"
                          value={item.name}
                          onChange={(e) => handleChange(index, 'name', e.target.value)}
                          placeholder="例：鮭切り身"
                          required
                        />
                      </div>

                      {/* Category */}
                      <div className="field-group">
                        <label>
                          カテゴリー<span className="required">*</span>
                        </label>
                        <div className="select-wrapper">
                          <select
                            value={item.category}
                            onChange={(e) => handleChange(index, 'category', e.target.value)}
                            required
                          >
                            <option value="" disabled>カテゴリーを選択</option>
                            {categories.map((cat) => (
                              <option key={cat} value={cat}>
                                {cat}
                              </option>
                            ))}
                          </select>
                        </div>
                      </div>

                      {/* Quantity */}
                      <div className="field-group">
                        <label>
                          個数<span className="required">*</span>
                        </label>
                        <input
                          type="number"
                          min="1"
                          value={item.quantity ?? 1}
                          onChange={(e) => handleChange(index, 'quantity', e.target.value ? Number(e.target.value) : 1)}
                          required
                        />
                      </div>

                      {/* Gram / ml */}
                      <div className="field-group">
                        <label>グラム又はml (任意)</label>
                        <input
                          type="number"
                          min="0"
                          value={item.gram ?? ''}
                          onChange={(e) => handleChange(index, 'gram', e.target.value ? Number(e.target.value) : null)}
                          placeholder="例：320"
                        />
                      </div>

                      {/* Best Before Date */}
                      <div className="field-group">
                        <label style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                          <span>賞味期限</span>
                          <span style={{ fontSize: '0.85rem', fontWeight: 'normal', display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                            <input
                              type="checkbox"
                              checked={!item.bestBeforeDate}
                              onChange={(e) => {
                                if (e.target.checked) {
                                  handleChange(index, 'bestBeforeDate', '')
                                } else {
                                  const today = new Date().toISOString().slice(0, 10)
                                  const cat = normalizeCategory(item.category)
                                  const defaultDays = getDaysForCategory(cat)
                                  handleChange(index, 'bestBeforeDate', addDays(today, defaultDays))
                                }
                              }}
                            />
                            なし
                          </span>
                        </label>
                        <input
                          type="date"
                          value={item.bestBeforeDate}
                          onChange={(e) => handleChange(index, 'bestBeforeDate', e.target.value)}
                          disabled={!item.bestBeforeDate}
                        />
                      </div>

                       {/* Expiration Date */}
                      <div className="field-group">
                        <label style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                          <span>消費期限 (任意)</span>
                          <span style={{ fontSize: '0.85rem', fontWeight: 'normal', display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                            <input
                              type="checkbox"
                              checked={!item.expirationDate}
                              onChange={(e) => {
                                if (e.target.checked) {
                                  handleChange(index, 'expirationDate', '')
                                } else {
                                  const today = new Date().toISOString().slice(0, 10)
                                  const cat = normalizeCategory(item.category)
                                  const defaultDays = getDaysForCategory(cat)
                                  handleChange(index, 'expirationDate', addDays(today, defaultDays + 1))
                                }
                              }}
                            />
                            なし
                          </span>
                        </label>
                        <input
                          type="date"
                          value={item.expirationDate}
                          onChange={(e) => handleChange(index, 'expirationDate', e.target.value)}
                          disabled={!item.expirationDate}
                        />
                      </div>

                      {/* Memo */}
                      <div className="field-group full-width">
                        <label>メモ (任意)</label>
                        <textarea
                          rows={2}
                          value={item.memo}
                          onChange={(e) => handleChange(index, 'memo', e.target.value)}
                          placeholder="例：夕食に使用予定"
                        />
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Bottom Actions */}
            {formData.length > 0 && (
              <div className="detail-actions">
                <button
                  type="button"
                  className="secondary-button"
                  onClick={onBack}
                  disabled={isSubmitting}
                >
                  戻る
                </button>
                <button
                  type="button"
                  className="primary-button submit-detail-button"
                  onClick={handleSubmit}
                  disabled={isSubmitting}
                >
                  {isSubmitting ? '登録中...' : '一括で冷蔵庫に登録する'}
                </button>
              </div>
            )}
          </div>
        )}
      </main>
    </div>
  )
}
