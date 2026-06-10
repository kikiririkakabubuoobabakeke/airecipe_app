import { useEffect, useMemo, useState, type FormEvent } from 'react'
import { Topbar } from '../components/Topbar'
import { Icon } from '../components/Icon'
import { useI18n } from '../lib/useI18n'
import {
  createInventoryItem,
  deleteInventoryItem,
  fetchInventory,
  updateInventoryItem,
  type InventoryMutationInput,
} from '../lib/recipeApi'
import type { AppDestination, Ingredient } from '../types/ui'

type Summary = {
  totalCount: number
  uniqueNamesCount: number
  openedCount: number
  nearExpirationCount: number
}

const allCategoryKey = '__all__'

const categoryToneMap: Record<string, string> = {
  '肉・卵・魚': 'meat',
  野菜: 'veg',
  乳製品: 'dairy',
  加工品: 'processed',
  その他: 'other',
}

function getCategoryTone(category: string) {
  return categoryToneMap[category] ?? 'other'
}

type IngredientFormState = {
  inventoryId?: number
  name: string
  category: string
  quantity: string
  gram: string
  expirationDate: string
  bestBeforeDate: string
  isOpened: boolean
  memo: string
}

const formCategories = [
  '肉・卵・魚',
  '野菜',
  '乳製品',
  '加工品',
  'その他',
]

const emptyForm: IngredientFormState = {
  name: '',
  category: '',
  quantity: '',
  gram: '',
  expirationDate: '',
  bestBeforeDate: '',
  isOpened: false,
  memo: '',
}

function isNearExpiration(expirationDate: string | null | undefined) {
  if (!expirationDate) {
    return false
  }

  const today = new Date()
  today.setHours(0, 0, 0, 0)

  const expiry = new Date(`${expirationDate}T00:00:00`)

  if (Number.isNaN(expiry.getTime())) {
    return false
  }

  const diffDays = Math.ceil(
    (expiry.getTime() - today.getTime()) / (1000 * 60 * 60 * 24),
  )

  return diffDays >= 0 && diffDays <= 3
}

function formatDate(value: string | null | undefined, language: string) {
  if (!value) {
    return '-'
  }

  const date = new Date(`${value}T00:00:00`)

  if (Number.isNaN(date.getTime())) {
    return value
  }

  return new Intl.DateTimeFormat(language, {
    month: 'short',
    day: 'numeric',
  }).format(date)
}

function formatStock(
  quantity: number | null | undefined,
  gram: number | null | undefined,
  language: string,
) {
  const parts: string[] = []

  if (quantity !== null && quantity !== undefined && quantity > 0) {
    const unit = language === 'ja' ? '個' : 'pc(s)'
    parts.push(`${quantity}${unit}`)
  }

  if (gram !== null && gram !== undefined && gram > 0) {
    parts.push(`${gram}g`)
  }

  if (parts.length === 0) {
    return '-'
  }

  return parts.join(' / ')
}

function buildSummary(ingredients: Ingredient[]): Summary {
  return {
    totalCount: ingredients.length,
    uniqueNamesCount: new Set(ingredients.map((item) => item.name)).size,
    openedCount: ingredients.filter((item) => item.isOpened).length,
    nearExpirationCount: ingredients.filter((item) =>
      isNearExpiration(item.expirationDate) || isNearExpiration(item.bestBeforeDate),
    ).length,
  }
}

function buildFormFromIngredient(ingredient: Ingredient): IngredientFormState {
  return {
    inventoryId: ingredient.inventoryId,
    name: ingredient.name,
    category: ingredient.category ?? '',
    quantity: ingredient.quantity ? String(ingredient.quantity) : '',
    gram: ingredient.gram ? String(ingredient.gram) : '',
    expirationDate: ingredient.expirationDate ?? '',
    bestBeforeDate: ingredient.bestBeforeDate ?? '',
    isOpened: ingredient.isOpened ?? false,
    memo: ingredient.memo ?? '',
  }
}

function toMutationInput(form: IngredientFormState): InventoryMutationInput {
  return {
    inventoryId: form.inventoryId,
    name: form.name.trim(),
    category: form.category.trim() || 'その他',
    quantity: form.quantity ? Number(form.quantity) : null,
    gram: form.gram ? Number(form.gram) : null,
    expirationDate: form.expirationDate || null,
    bestBeforeDate: form.bestBeforeDate || null,
    isOpened: form.isOpened,
    memo: form.memo.trim() || null,
  }
}

export function FridgePage({
  onNavigate,
  onLogout,
}: {
  onNavigate: (page: AppDestination) => void
  onLogout?: () => void | Promise<void>
}) {
  const { language, t } = useI18n()
  const [ingredients, setIngredients] = useState<Ingredient[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [statusMessage, setStatusMessage] = useState('')
  const [activeCategory, setActiveCategory] = useState(allCategoryKey)
  const [formState, setFormState] = useState<IngredientFormState>(emptyForm)
  const [isFormOpen, setIsFormOpen] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const [formError, setFormError] = useState('')
  const summary = useMemo(() => buildSummary(ingredients), [ingredients])
  const groupedIngredients = useMemo(
    () =>
      ingredients.reduce(
        (groups, item) => {
          const category = item.category ?? 'その他'
          groups[category] ??= []
          groups[category].push(item)
          return groups
        },
        {} as Record<string, Ingredient[]>,
      ),
    [ingredients],
  )
  const categories = useMemo(
    () => [allCategoryKey, ...Object.keys(groupedIngredients)],
    [groupedIngredients],
  )
  const displayActiveCategory = categories.includes(activeCategory)
    ? activeCategory
    : allCategoryKey
  const categoryCounts = useMemo(() => {
    const counts: Record<string, number> = {
      [allCategoryKey]: ingredients.length,
    }

    for (const [category, items] of Object.entries(groupedIngredients)) {
      counts[category] = items.length
    }

    return counts
  }, [groupedIngredients, ingredients.length])

  useEffect(() => {
    let isMounted = true

    fetchInventory(language)
      .then((result) => {
        if (isMounted) {
          setIngredients(result.inventory)
          setError(null)
        }
      })
      .catch((fetchError) => {
        if (isMounted) {
          setError(
            fetchError instanceof Error
              ? fetchError.message
              : t('fridge.fetchFailed'),
          )
        }
      })
      .finally(() => {
        if (isMounted) {
          setLoading(false)
        }
      })

    return () => {
      isMounted = false
    }
  }, [language, t])

  function openEditForm(ingredient: Ingredient) {
    setFormState(buildFormFromIngredient(ingredient))
    setFormError('')
    setIsFormOpen(true)
  }

  function closeForm() {
    if (isSaving) {
      return
    }

    setIsFormOpen(false)
    setFormError('')
  }

  function updateFormField(
    field: keyof IngredientFormState,
    value: string,
  ) {
    setFormState((current) => ({ ...current, [field]: value }))
  }

  async function handleSubmitIngredient(event: FormEvent) {
    event.preventDefault()
    const input = toMutationInput(formState)

    if (!input.name) {
      setFormError(t('fridge.form.nameRequired'))
      return
    }

    if (!formState.category || formState.category === '') {
      setFormError(t('fridge.form.categoryRequired'))
      return
    }

    setIsSaving(true)
    setFormError('')
    setStatusMessage('')

    try {
      const result = input.inventoryId
        ? await updateInventoryItem(input)
        : await createInventoryItem(input)
      setIngredients(result.inventory)
      setStatusMessage(
        input.inventoryId ? t('fridge.status.updated') : t('fridge.status.added'),
      )
      setIsFormOpen(false)
    } catch (submitError) {
      setFormError(
        submitError instanceof Error
          ? submitError.message
          : t('fridge.status.saveFailed'),
      )
    } finally {
      setIsSaving(false)
    }
  }

  async function handleDeleteIngredient(ingredient: Ingredient) {
    if (!ingredient.inventoryId) {
      return
    }

    const confirmed = window.confirm(
      t('fridge.confirmDelete', { name: ingredient.name }),
    )

    if (!confirmed) {
      return
    }

    setStatusMessage('')
    setError(null)

    try {
      const result = await deleteInventoryItem(ingredient.inventoryId)
      setIngredients(result.inventory)
      setStatusMessage(t('fridge.status.deleted'))
    } catch (deleteError) {
      setError(
        deleteError instanceof Error
          ? deleteError.message
          : t('fridge.status.deleteFailed'),
      )
    }
  }

  async function handleToggleOpened(inventory: Ingredient) {
    if (!inventory.inventoryId) {
      return
    }

    setIsSaving(true)
    setStatusMessage('')
    setError(null)

    try {
      const input: InventoryMutationInput = {
        inventoryId: inventory.inventoryId,
        name: inventory.name,
        category: inventory.category,
        quantity: inventory.quantity ?? null,
        gram: inventory.gram ?? null,
        expirationDate: inventory.expirationDate ?? null,
        bestBeforeDate: inventory.bestBeforeDate ?? null,
        isOpened: !inventory.isOpened,
        memo: inventory.memo,
      }

      const result = await updateInventoryItem(input)
      setIngredients(result.inventory)
      setStatusMessage(t('fridge.status.updated'))
    } catch (toggleError) {
      setError(
        toggleError instanceof Error
          ? toggleError.message
          : t('fridge.status.saveFailed'),
      )
    } finally {
      setIsSaving(false)
    }
  }

  if (loading) {
    return (
      <div className="app-shell">
        <Topbar onNavigate={onNavigate} onLogout={onLogout} />
        <div className="fridge-loading">
          <div className="loading-spinner" />
          <p>{t('fridge.loading')}</p>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="app-shell">
        <Topbar onNavigate={onNavigate} onLogout={onLogout} />
        <div className="fridge-error">
          <p>{t('fridge.fetchFailed')}: {error}</p>
          <button
            type="button"
            className="primary-button"
            onClick={() => window.location.reload()}
          >
            {t('common.reload')}
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="app-shell">
      <Topbar onNavigate={onNavigate} onLogout={onLogout} />

      <main className="fridge-container">
        <div className="fridge-hero">
          <div className="fridge-header">
            <div className="fridge-header__text">
              <p className="eyebrow fridge-eyebrow">{t('home.ingredients.eyebrow')}</p>
              <h1>{t('fridge.title')}</h1>
              <p className="fridge-header__lead">{t('fridge.lead')}</p>
            </div>
            <div className="fridge-header-actions">
            <button
              type="button"
              className="primary-button back-home-button"
              onClick={() => onNavigate('ingredient-register')}
            >
              <Icon name="plus" />
              <span>{t('fridge.addIngredient')}</span>
            </button>
            <button
              type="button"
              className="secondary-button back-home-button"
              onClick={() => onNavigate('home')}
            >
              <div style={{ transform: 'scaleX(-1)', display: 'inline-flex' }}>
                <Icon name="arrow" />
              </div>
              <span>{t('common.backHome')}</span>
            </button>
          </div>
          </div>
        </div>

        {statusMessage ? (
          <p className="status-message success-message" role="status">
            {statusMessage}
          </p>
        ) : null}

        <section className="fridge-summary" aria-label={t('fridge.summaryLabel')}>
          <div className="summary-card">
            <div className="summary-card__top">
              <span className="summary-card__icon tone-slate">
                <Icon name="basket" />
              </span>
              <span className="card-label">{t('fridge.summary.total')}</span>
            </div>
            <strong className="card-value">{summary.totalCount}</strong>
            <span className="card-note">{t('fridge.summary.totalNote')}</span>
          </div>
          <div className="summary-card">
            <div className="summary-card__top">
              <span className="summary-card__icon tone-blue">
                <Icon name="list" />
              </span>
              <span className="card-label">{t('fridge.summary.unique')}</span>
            </div>
            <strong className="card-value">{summary.uniqueNamesCount}</strong>
            <span className="card-note">{t('fridge.summary.uniqueNote')}</span>
          </div>
          <div className="summary-card">
            <div className="summary-card__top">
              <span className="summary-card__icon tone-green">
                <Icon name="spark" />
              </span>
              <span className="card-label">{t('fridge.summary.opened')}</span>
            </div>
            <strong className="card-value">{summary.openedCount}</strong>
            <span className="card-note">{t('fridge.summary.openedNote')}</span>
          </div>
          <div className="summary-card near-expiration">
            <div className="summary-card__top">
              <span className="summary-card__icon tone-red">
                <Icon name="bell" />
              </span>
              <span className="card-label">{t('fridge.summary.nearExpiration')}</span>
            </div>
            <strong className="card-value">{summary.nearExpirationCount}</strong>
            <span className="card-note">
              {t('fridge.summary.nearExpirationNote')}
            </span>
          </div>
        </section>

        <div className="category-filters">
          {categories.map((category) => (
            <button
              key={category}
              type="button"
              className={`filter-pill ${displayActiveCategory === category ? 'active' : ''}`}
              onClick={() => setActiveCategory(category)}
            >
              {category === allCategoryKey ? t('fridge.filter.all') : category}
              <span className="filter-pill__count">{categoryCounts[category] ?? 0}</span>
            </button>
          ))}
        </div>

        <div className="fridge-tables">
          {ingredients.length === 0 ? (
            <div className="fridge-empty-state">
              <div className="fridge-empty-state__icon">
                <Icon name="basket" />
              </div>
              <p>{t('fridge.empty')}</p>
              <button
                type="button"
                className="primary-button"
                onClick={() => onNavigate('ingredient-register')}
              >
                <Icon name="plus" />
                <span>{t('fridge.emptyAction')}</span>
              </button>
            </div>
          ) : (
            Object.entries(groupedIngredients)
              .filter(
                ([category]) =>
                  displayActiveCategory === allCategoryKey ||
                  displayActiveCategory === category,
              )
              .map(([category, items]) => (
                <div key={category} className="category-table-wrapper">
                  <h2
                    className={`category-title category-title--${getCategoryTone(category)}`}
                  >
                    <span className="category-title__label">{category}</span>
                    <span className="category-title__count">{items.length}</span>
                  </h2>
                  <div className="table-container">
                    <table className="fridge-table">
                      <thead>
                        <tr>
                          <th>{t('fridge.table.ingredient')}</th>
                          <th>{t('fridge.table.stock')}</th>
                          <th>{t('fridge.table.bestBefore')}</th>
                          <th>{t('fridge.table.expiration')}</th>
                          <th>{t('fridge.table.memo')}</th>
                          <th>{t('fridge.table.actions')}</th>
                        </tr>
                      </thead>
                      <tbody>
                        {items.map((item, index) => {
                          const rowKey =
                            item.inventoryId ??
                            item.ingredientId ??
                            `${item.name}-${index}`
                          const isWarning =
                            isNearExpiration(item.expirationDate) ||
                            isNearExpiration(item.bestBeforeDate)
                          return (
                            <tr key={rowKey} className={isWarning ? 'near-expiration-row' : ''}>
                              <td
                                className="ingredient-name-cell"
                                data-label={t('fridge.table.ingredient')}
                              >
                                <div className="ingredient-name-row">
                                  <span className="ingredient-name">
                                    {item.name}
                                  </span>
                                  {isWarning ? (
                                    <span className="expiry-alert">
                                      <Icon name="bell" />
                                      {t('fridge.summary.nearExpiration')}
                                    </span>
                                  ) : null}
                                  <button
                                    type="button"
                                    className={`opened-badge-button ${item.isOpened ? 'opened' : 'unopened'}`}
                                    onClick={() => void handleToggleOpened(item)}
                                    title={
                                      item.isOpened
                                        ? t('fridge.toggleMarkUnopened')
                                        : t('fridge.toggleMarkOpened')
                                    }
                                    disabled={isSaving}
                                  >
                                    {item.isOpened
                                      ? t('fridge.form.isOpened')
                                      : t('fridge.form.unopened')}
                                  </button>
                                </div>
                              </td>
                              <td data-label={t('fridge.table.stock')}>
                                <span className="amount-text">
                                  {formatStock(item.quantity, item.gram, language)}
                                </span>
                              </td>
                              <td data-label={t('fridge.table.bestBefore')}>
                                <span
                                  className={
                                    isNearExpiration(item.bestBeforeDate)
                                      ? 'expiration-warning'
                                      : 'date-text'
                                  }
                                >
                                  {formatDate(item.bestBeforeDate, language)}
                                </span>
                              </td>
                              <td data-label={t('fridge.table.expiration')}>
                                <span
                                  className={
                                    isNearExpiration(item.expirationDate)
                                      ? 'expiration-warning'
                                      : 'date-text'
                                  }
                                >
                                  {formatDate(item.expirationDate, language)}
                                </span>
                              </td>
                              <td
                                className="memo-cell"
                                data-label={t('fridge.table.memo')}
                              >
                                {item.memo ?? '-'}
                              </td>
                              <td data-label={t('fridge.table.actions')}>
                                <div className="fridge-row-actions">
                                  <button
                                    type="button"
                                    className="small-button"
                                    onClick={() => openEditForm(item)}
                                  >
                                    {t('fridge.action.edit')}
                                  </button>
                                  <button
                                    type="button"
                                    className="small-button danger-button"
                                    onClick={() => void handleDeleteIngredient(item)}
                                  >
                                    {t('fridge.action.delete')}
                                  </button>
                                </div>
                              </td>
                            </tr>
                          )
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              ))
          )}
        </div>
      </main>

      {isFormOpen ? (
        <div className="modal-backdrop" role="presentation">
          <form
            className="cook-modal ingredient-modal"
            aria-labelledby="ingredient-modal-title"
            aria-modal="true"
            role="dialog"
            onSubmit={handleSubmitIngredient}
          >
            <p className="eyebrow">
              {formState.inventoryId
                ? t('fridge.form.editEyebrow')
                : t('fridge.form.addEyebrow')}
            </p>
            <h2 id="ingredient-modal-title">
              {formState.inventoryId
                ? t('fridge.form.editTitle')
                : t('fridge.form.addTitle')}
            </h2>

            <div className="ingredient-form-grid">
              <label>
                <span>{t('fridge.form.name')}</span>
                <input
                  value={formState.name}
                  onChange={(event) => updateFormField('name', event.target.value)}
                  placeholder={t('fridge.form.namePlaceholder')}
                />
              </label>
              <label>
                <span>{t('fridge.form.category')}</span>
                <div className="select-wrapper">
                  <select
                    value={formState.category}
                    onChange={(event) =>
                      updateFormField('category', event.target.value)
                    }
                  >
                    <option value="" disabled>
                      {t('fridge.form.categorySelect')}
                    </option>
                    {formCategories.map((cat) => (
                      <option key={cat} value={cat}>
                        {cat}
                      </option>
                    ))}
                  </select>
                </div>
              </label>
              <label>
                <span>{t('fridge.form.quantity')}</span>
                <input
                  type="number"
                  min="0"
                  value={formState.quantity}
                  onChange={(event) =>
                    updateFormField('quantity', event.target.value)
                  }
                />
              </label>
              <label>
                <span>{t('fridge.form.gram')}</span>
                <input
                  type="number"
                  min="0"
                  value={formState.gram}
                  onChange={(event) => updateFormField('gram', event.target.value)}
                />
              </label>
              <label>
                <span>{t('fridge.form.bestBefore')}</span>
                <input
                  type="date"
                  value={formState.bestBeforeDate}
                  onChange={(event) =>
                    updateFormField('bestBeforeDate', event.target.value)
                  }
                />
              </label>
              <label>
                <span>{t('fridge.form.expiration')}</span>
                <input
                  type="date"
                  value={formState.expirationDate}
                  onChange={(event) =>
                    updateFormField('expirationDate', event.target.value)
                  }
                />
              </label>
              <label>
                <span>{t('fridge.form.memo')}</span>
                <input
                  value={formState.memo}
                  onChange={(event) => updateFormField('memo', event.target.value)}
                  placeholder={t('fridge.form.memoPlaceholder')}
                />
              </label>
              <label className="form-checkbox-field">
                <input
                  type="checkbox"
                  checked={formState.isOpened}
                  onChange={(event) =>
                    setFormState((curr) => ({ ...curr, isOpened: event.target.checked }))
                  }
                />
                <span>{t('fridge.form.isOpened')}</span>
              </label>
            </div>

            {formError ? (
              <p className="status-message" role="alert">
                {formError}
              </p>
            ) : null}

            <div className="modal-actions">
              <button
                type="button"
                className="secondary-button"
                onClick={closeForm}
                disabled={isSaving}
              >
                {t('common.cancel')}
              </button>
              <button type="submit" className="primary-button" disabled={isSaving}>
                {isSaving ? t('common.saving') : t('common.save')}
              </button>
            </div>
          </form>
        </div>
      ) : null}
    </div>
  )
}
