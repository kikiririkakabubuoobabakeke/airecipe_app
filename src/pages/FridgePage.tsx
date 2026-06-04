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

type IngredientFormState = {
  inventoryId?: number
  name: string
  category: string
  quantity: string
  gram: string
  expirationDate: string
  memo: string
}

const emptyForm: IngredientFormState = {
  name: '',
  category: 'その他',
  quantity: '',
  gram: '',
  expirationDate: '',
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

function buildSummary(ingredients: Ingredient[]): Summary {
  return {
    totalCount: ingredients.length,
    uniqueNamesCount: new Set(ingredients.map((item) => item.name)).size,
    openedCount: 0,
    nearExpirationCount: ingredients.filter((item) =>
      isNearExpiration(item.expirationDate),
    ).length,
  }
}

function buildFormFromIngredient(ingredient: Ingredient): IngredientFormState {
  return {
    inventoryId: ingredient.inventoryId,
    name: ingredient.name,
    category: ingredient.category ?? 'その他',
    quantity: ingredient.quantity ? String(ingredient.quantity) : '',
    gram: ingredient.gram ? String(ingredient.gram) : '',
    expirationDate: ingredient.expirationDate ?? '',
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

  function openAddForm() {
    setFormState(emptyForm)
    setFormError('')
    setIsFormOpen(true)
  }

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
        <div className="fridge-header">
          <h1>{t('fridge.title')}</h1>
          <div className="fridge-header-actions">
            <button
              type="button"
              className="primary-button back-home-button"
              onClick={openAddForm}
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

        {statusMessage ? (
          <p className="status-message" role="status">
            {statusMessage}
          </p>
        ) : null}

        <section className="fridge-summary" aria-label={t('fridge.summaryLabel')}>
          <div className="summary-card">
            <span className="card-label">{t('fridge.summary.total')}</span>
            <strong className="card-value">{summary.totalCount}</strong>
            <span className="card-note">{t('fridge.summary.totalNote')}</span>
          </div>
          <div className="summary-card">
            <span className="card-label">{t('fridge.summary.unique')}</span>
            <strong className="card-value">{summary.uniqueNamesCount}</strong>
            <span className="card-note">{t('fridge.summary.uniqueNote')}</span>
          </div>
          <div className="summary-card">
            <span className="card-label">{t('fridge.summary.opened')}</span>
            <strong className="card-value">{summary.openedCount}</strong>
            <span className="card-note">{t('fridge.summary.openedNote')}</span>
          </div>
          <div className="summary-card near-expiration">
            <span className="card-label">{t('fridge.summary.nearExpiration')}</span>
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
              className={`filter-pill ${
                displayActiveCategory === category ? 'active' : ''
              }`}
              onClick={() => setActiveCategory(category)}
            >
              {category === allCategoryKey ? t('fridge.filter.all') : category}
            </button>
          ))}
        </div>

        <div className="fridge-tables">
          {ingredients.length === 0 ? (
            <div className="empty-state">
              {t('fridge.empty')}
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
                  <h2 className="category-title">{category}</h2>
                  <div className="table-container">
                    <table className="fridge-table">
                      <thead>
                        <tr>
                          <th>{t('fridge.table.ingredient')}</th>
                          <th>{t('fridge.table.stock')}</th>
                          <th>{t('fridge.table.memo')}</th>
                          <th>{t('fridge.table.expiration')}</th>
                          <th>{t('fridge.table.actions')}</th>
                        </tr>
                      </thead>
                      <tbody>
                        {items.map((item, index) => {
                          const rowKey =
                            item.inventoryId ??
                            item.ingredientId ??
                            `${item.name}-${index}`
                          const isWarning = isNearExpiration(
                            item.expirationDate,
                          )

                          return (
                            <tr key={rowKey}>
                              <td className="ingredient-name-cell">
                                <span className="ingredient-name">
                                  {item.name}
                                </span>
                              </td>
                              <td>
                                <span className="amount-text">
                                  {item.amount}
                                </span>
                              </td>
                              <td>{item.memo ?? '-'}</td>
                              <td className="expiration-cell">
                                <span
                                  className={
                                    isWarning ? 'expiration-warning' : ''
                                  }
                                >
                                  {formatDate(item.expirationDate, language)}
                                </span>
                              </td>
                              <td>
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
                <input
                  value={formState.category}
                  onChange={(event) =>
                    updateFormField('category', event.target.value)
                  }
                  placeholder={t('fridge.form.categoryPlaceholder')}
                />
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
