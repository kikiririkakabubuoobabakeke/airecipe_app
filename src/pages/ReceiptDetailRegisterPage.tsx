import { useState } from 'react'
import { importReceiptItemsDetail } from '../lib/receiptApi'
import { useI18n } from '../lib/useI18n'
import type { AppDestination, ReceiptIngredientCandidate } from '../types/ui'

type ReceiptDetailRegisterPageProps = {
  items: ReceiptIngredientCandidate[]
  onBack: () => void
  onNavigate: (page: AppDestination) => void
  onLogout?: () => void
  embedded?: boolean
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
    case '果物':
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
  if (category === 'フルーツ') {
    return '果物'
  }

  return category
}

function createInitialFormData(items: ReceiptIngredientCandidate[]) {
  const today = new Date().toISOString().slice(0, 10)

  return items.map((item) => {
    const category = normalizeCategory(item.category)
    const defaultDays = getDaysForCategory(category)
    const bestBefore =
      item.bestBeforeDate || item.expirationDate || addDays(today, defaultDays)
    const expiration = item.expirationDate || addDays(today, defaultDays + 1)

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
  embedded = false,
}: ReceiptDetailRegisterPageProps) {
  const { t } = useI18n()
  const [formData, setFormData] = useState<EditableCandidate[]>(() =>
    createInitialFormData(items),
  )
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [statusMessage, setStatusMessage] = useState('')
  const [errorMessage, setErrorMessage] = useState('')

  const categories = [
    { value: '肉・卵・魚', label: t('category.meatEggFish') },
    { value: '野菜', label: t('category.vegetable') },
    { value: '果物', label: t('category.fruit') },
    { value: '乳製品', label: t('category.dairy') },
    { value: '加工品', label: t('category.processed') },
    { value: 'その他', label: t('category.other') },
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
        setErrorMessage(t('receiptDetail.nameRequired'))
        return
      }
      if (!item.category) {
        setErrorMessage(t('receiptDetail.categoryRequired'))
        return
      }
      if (item.quantity === null || item.quantity === undefined || item.quantity <= 0) {
        setErrorMessage(t('receiptDetail.quantityRequired'))
        return
      }
    }

    setIsSubmitting(true)
    setErrorMessage('')
    setStatusMessage('')

    try {
      const result = await importReceiptItemsDetail(formData)
      setStatusMessage(
        t('receiptDetail.importSuccess', { count: result.importedCount }),
      )
      setIsSubmitting(false)
    } catch (error) {
      console.error('[vite] Import detail failed:', error)
      setErrorMessage(t('receiptDetail.importFailed'))
      setIsSubmitting(false)
    }
  }

  const content = (
    <main className={`receipt-detail-page ${embedded ? 'receipt-detail-page--embedded' : ''}`}>
      {/* Back Link */}
      <div className="back-link-wrapper">
        <button type="button" className="back-text-button" onClick={onBack}>
          <span className="arrow-left">←</span> {t('receiptDetail.back')}
        </button>
      </div>

      {/* Header */}
      <div className="detail-header">
        <h1>{t('receiptDetail.title')}</h1>
        <p className="subtitle">
          {t('receiptDetail.subtitle')}
        </p>
      </div>

      {/* Step Navigation Bar */}
      <div className="step-bar">
        <div className="step-item completed">
          <span className="step-number">✓</span>
          <span className="step-label">{t('receiptDetail.stepRegister')}</span>
        </div>
        <div className="step-connector"></div>
        <div className="step-item active">
          <span className="step-number">2</span>
          <span className="step-label">{t('receiptDetail.stepDetail')}</span>
        </div>
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
            {t('receiptDetail.viewInventory')}
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
            <h2>{t('receiptDetail.formTitle')}</h2>
            <p className="panel-lead">
              {t('receiptDetail.formLead')}
            </p>
          </div>

          {formData.length > 0 && (
            <div className="summary-banner">
              {t('receiptDetail.summary', { count: formData.length })}
            </div>
          )}

          {formData.length === 0 ? (
            <p className="empty-text">{t('receiptDetail.empty')}</p>
          ) : (
            <div className="detail-cards-list">
              {formData.map((item, index) => (
                <div key={item.id || index} className="detail-card">
                  <div className="card-index-title">
                    {t('receiptDetail.itemLabel', { number: index + 1 })}
                  </div>

                  <div className="card-fields-grid">
                    {/* Name */}
                    <div className="field-group">
                      <label>
                        {t('receiptDetail.name')}<span className="required">*</span>
                      </label>
                      <input
                        type="text"
                        value={item.name}
                        onChange={(e) => handleChange(index, 'name', e.target.value)}
                        placeholder={t('receiptDetail.namePlaceholder')}
                        required
                      />
                    </div>

                    {/* Category */}
                    <div className="field-group">
                      <label>
                        {t('receiptDetail.category')}<span className="required">*</span>
                      </label>
                      <div className="select-wrapper">
                        <select
                          value={item.category}
                          onChange={(e) => handleChange(index, 'category', e.target.value)}
                          required
                        >
                          <option value="" disabled>{t('receiptDetail.categorySelect')}</option>
                          {categories.map((cat) => (
                            <option key={cat.value} value={cat.value}>
                              {cat.label}
                            </option>
                          ))}
                        </select>
                      </div>
                    </div>

                    {/* Quantity */}
                    <div className="field-group">
                      <label>
                        {t('receiptDetail.quantity')}<span className="required">*</span>
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
                      <label>{t('receiptDetail.gram')}</label>
                      <input
                        type="number"
                        min="0"
                        value={item.gram ?? ''}
                        onChange={(e) => handleChange(index, 'gram', e.target.value ? Number(e.target.value) : null)}
                        placeholder={t('receiptDetail.gramPlaceholder')}
                      />
                    </div>

                    {/* Best Before Date */}
                    <div className="field-group">
                      <label>{t('receiptDetail.bestBefore')}</label>
                      <input
                        type="date"
                        value={item.bestBeforeDate}
                        onChange={(e) => handleChange(index, 'bestBeforeDate', e.target.value)}
                      />
                    </div>

                    {/* Expiration Date */}
                    <div className="field-group">
                      <label>{t('receiptDetail.expiration')}</label>
                      <input
                        type="date"
                        value={item.expirationDate}
                        onChange={(e) => handleChange(index, 'expirationDate', e.target.value)}
                      />
                    </div>

                    {/* Memo */}
                    <div className="field-group full-width">
                      <label>{t('receiptDetail.memo')}</label>
                      <textarea
                        rows={2}
                        value={item.memo}
                        onChange={(e) => handleChange(index, 'memo', e.target.value)}
                        placeholder={t('receiptDetail.memoPlaceholder')}
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
                {t('common.back')}
              </button>
              <button
                type="button"
                className="primary-button submit-detail-button"
                onClick={handleSubmit}
                disabled={isSubmitting}
              >
                {isSubmitting
                  ? t('receiptDetail.submitting')
                  : t('receiptDetail.submit')}
              </button>
            </div>
          )}
        </div>
      )}
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
