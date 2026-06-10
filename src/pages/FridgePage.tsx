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
  bestBeforeDate: string
  memo: string
}

const emptyForm: IngredientFormState = {
  name: '',
  category: '',
  quantity: '',
  gram: '',
  expirationDate: '',
  bestBeforeDate: '',
  memo: '',
}

type AggregatedIngredient = {
  key: string
  name: string
  category: string
  quantity: number
  gram: number
  nearestExpirationDate: string | null
  nearestBestBeforeDate: string | null
  isGrouped: boolean
  memo: string
  items: Ingredient[]
}

type DeleteConfirmState = {
  message: string
  inventoryIds: number[]
} | null

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

function isExpired(expirationDate: string | null | undefined) {
  if (!expirationDate) {
    return false
  }

  const today = new Date()
  today.setHours(0, 0, 0, 0)

  const expiry = new Date(`${expirationDate}T00:00:00`)

  if (Number.isNaN(expiry.getTime())) {
    return false
  }

  return expiry.getTime() < today.getTime()
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

function formatQuantity(
  quantity: number | null | undefined,
  language: string,
) {
  if (quantity !== null && quantity !== undefined && quantity > 0) {
    const unit = language === 'ja' ? '個' : 'pc(s)'
    return `${quantity}${unit}`
  }

  return '-'
}

function formatGram(gram: number | null | undefined) {
  if (gram !== null && gram !== undefined && gram > 0) {
    return `${gram}g`
  }

  return '-'
}

function getDateTime(value: string | null | undefined) {
  if (!value) {
    return Number.POSITIVE_INFINITY
  }

  const timestamp = new Date(`${value}T00:00:00`).getTime()

  return Number.isNaN(timestamp) ? Number.POSITIVE_INFINITY : timestamp
}

function getNearestDate(values: Array<string | null | undefined>) {
  const validDates = values
    .filter((value): value is string => Boolean(value))
    .toSorted((left, right) => getDateTime(left) - getDateTime(right))

  return validDates[0] ?? null
}

function compareCategoryNames(left: string, right: string) {
    if (left === 'その他' && right !== 'その他') {
      return 1
    }

    if (right === 'その他' && left !== 'その他') {
      return -1
    }

    return left.localeCompare(right, 'ja')
}

function sortCategoryNames(categories: string[]) {
  return categories.toSorted(compareCategoryNames)
}

function aggregateIngredients(ingredients: Ingredient[]): AggregatedIngredient[] {
  const groups = new Map<string, Ingredient[]>()

  for (const ingredient of ingredients) {
    const key = ingredient.name.trim().toLocaleLowerCase()
    const existing = groups.get(key) ?? []
    existing.push(ingredient)
    groups.set(key, existing)
  }

  return Array.from(groups.entries())
    .map(([key, items]) => {
      const category =
        items.find((item) => item.category)?.category ?? 'その他'

      return {
        key,
        name: items[0]?.name ?? '名称未設定',
        category,
        quantity: items.reduce((total, item) => total + (item.quantity ?? 0), 0),
        gram: items.reduce((total, item) => total + (item.gram ?? 0), 0),
        nearestExpirationDate: getNearestDate(
          items.map((item) => item.expirationDate),
        ),
        nearestBestBeforeDate: getNearestDate(
          items.map((item) => item.bestBeforeDate),
        ),
        isGrouped: items.length > 1,
        memo: items[0]?.memo || '-',
        items,
      } satisfies AggregatedIngredient
    })
    .toSorted((left, right) => left.name.localeCompare(right.name, 'ja'))
}

function buildSummary(ingredients: Ingredient[]): Summary {
  return {
    totalCount: ingredients.length,
    uniqueNamesCount: new Set(
      ingredients.map((item) => item.name.trim().toLocaleLowerCase()),
    ).size,
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
  const [detailIngredient, setDetailIngredient] =
    useState<AggregatedIngredient | null>(null)
  const [isSelectionMode, setIsSelectionMode] = useState(false)
  const [selectedInventoryIds, setSelectedInventoryIds] = useState<Set<number>>(
    () => new Set(),
  )
  const [deleteConfirm, setDeleteConfirm] = useState<DeleteConfirmState>(null)
  const [isSaving, setIsSaving] = useState(false)
  const [formError, setFormError] = useState('')
  const summary = useMemo(() => buildSummary(ingredients), [ingredients])
  const aggregatedIngredients = useMemo(
    () => aggregateIngredients(ingredients),
    [ingredients],
  )
  const groupedIngredients = useMemo(
    () =>
      aggregatedIngredients.reduce(
        (groups, item) => {
          const category = item.category || 'その他'
          groups[category] ??= []
          groups[category].push(item)
          return groups
        },
        {} as Record<string, AggregatedIngredient[]>,
      ),
    [aggregatedIngredients],
  )
  const sortedCategoryEntries = useMemo(
    () =>
      sortCategoryNames(Object.keys(groupedIngredients)).map(
        (category) => [category, groupedIngredients[category]] as const,
      ),
    [groupedIngredients],
  )
  const formCategories = useMemo(
    () =>
      Array.from(
        new Set([
          '肉・卵・魚',
          '野菜',
          '乳製品',
          '加工品',
          'その他',
          ...ingredients
            .map((item) => item.category?.trim())
            .filter((category): category is string => Boolean(category)),
        ]),
      ).toSorted(compareCategoryNames),
    [ingredients],
  )
  const categories = useMemo(
    () => [allCategoryKey, ...sortCategoryNames(Object.keys(groupedIngredients))],
    [groupedIngredients],
  )
  const allInventoryIds = useMemo(
    () => getInventoryIds(ingredients),
    [ingredients],
  )
  const expiredInventoryIds = useMemo(
    () =>
      ingredients
        .filter((item) => isExpired(item.expirationDate))
        .map((item) => item.inventoryId)
        .filter((id): id is number => typeof id === 'number'),
    [ingredients],
  )
  const displayActiveCategory = categories.includes(activeCategory)
    ? activeCategory
    : allCategoryKey

  function getCategoryLabel(category: string) {
    switch (category) {
      case '肉・卵・魚':
        return t('category.meatEggFish')
      case '野菜':
        return t('category.vegetable')
      case '乳製品':
        return t('category.dairy')
      case '加工品':
        return t('category.processed')
      case 'その他':
        return t('category.other')
      default:
        return category
    }
  }

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
      setDetailIngredient((current) =>
        current
          ? aggregateIngredients(result.inventory).find(
              (item) => item.key === current.key,
            ) ?? null
          : null,
      )
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

    setDeleteConfirm({
      message: t('fridge.confirmDelete', { name: ingredient.name }),
      inventoryIds: [ingredient.inventoryId],
    })
  }

  function getInventoryIds(items: Ingredient[]) {
    return items
      .map((item) => item.inventoryId)
      .filter((id): id is number => typeof id === 'number')
  }

  function setGroupSelected(items: Ingredient[], selected: boolean) {
    const ids = getInventoryIds(items)

    setSelectedInventoryIds((current) => {
      const next = new Set(current)
      ids.forEach((id) => {
        if (selected) {
          next.add(id)
        } else {
          next.delete(id)
        }
      })
      if (!selected && next.size === 0) {
        setIsSelectionMode(false)
      }
      return next
    })
  }

  async function executeDeleteInventoryIds(ids: number[]) {
    const uniqueIds = Array.from(new Set(ids))

    if (!uniqueIds.length) {
      setStatusMessage(t('fridge.selection.deleteNone'))
      return
    }

    setIsSaving(true)
    setStatusMessage('')
    setError(null)

    try {
      let latestInventory = ingredients

      for (const inventoryId of uniqueIds) {
        const result = await deleteInventoryItem(inventoryId)
        latestInventory = result.inventory
      }

      setIngredients(latestInventory)
      setDetailIngredient((current) =>
        current
          ? aggregateIngredients(latestInventory).find(
              (item) => item.key === current.key,
            ) ?? null
          : null,
      )
      setSelectedInventoryIds(new Set())
      setIsSelectionMode(false)
      setStatusMessage(
        t('fridge.selection.deletedCount', { count: uniqueIds.length }),
      )
    } catch (deleteError) {
      setError(
        deleteError instanceof Error
          ? deleteError.message
          : t('fridge.status.deleteFailed'),
      )
    } finally {
      setIsSaving(false)
      setDeleteConfirm(null)
    }
  }

  function handleDeleteSelected() {
    setDeleteConfirm({
      inventoryIds: Array.from(selectedInventoryIds),
      message: t('fridge.selection.confirmDeleteSelected', {
        count: selectedInventoryIds.size,
      }),
    })
  }

  function handleDeleteExpired() {
    if (!expiredInventoryIds.length) {
      setStatusMessage(t('fridge.selection.deleteNone'))
      return
    }

    setDeleteConfirm({
      inventoryIds: expiredInventoryIds,
      message: t('fridge.selection.confirmDeleteExpired', {
        count: expiredInventoryIds.length,
      }),
    })
  }

  function handleSelectAll() {
    setSelectedInventoryIds(new Set(allInventoryIds))
    setIsSelectionMode(true)
  }

  function handleExitSelection() {
    setSelectedInventoryIds(new Set())
    setIsSelectionMode(false)
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
              className={`filter-pill ${displayActiveCategory === category ? 'active' : ''
                }`}
              onClick={() => setActiveCategory(category)}
            >
              {category === allCategoryKey
                ? t('fridge.filter.all')
                : getCategoryLabel(category)}
            </button>
          ))}
        </div>

        <div className="fridge-bulk-actions">
          <button
            type="button"
            className="secondary-button danger-button"
            onClick={handleDeleteExpired}
            disabled={isSaving || expiredInventoryIds.length === 0}
          >
            {t('fridge.selection.deleteExpired')}
          </button>

          {isSelectionMode ? (
            <>
              <span>
                {t('fridge.selection.count', {
                  count: selectedInventoryIds.size,
                })}
              </span>
              <button
                type="button"
                className="secondary-button danger-button"
                onClick={handleDeleteSelected}
                disabled={isSaving || selectedInventoryIds.size === 0}
              >
                {t('fridge.selection.deleteSelected')}
              </button>
              <button
                type="button"
                className="secondary-button"
                onClick={handleSelectAll}
                disabled={isSaving || allInventoryIds.length === 0}
              >
                {t('fridge.selection.selectAll')}
              </button>
              <button
                type="button"
                className="secondary-button fridge-selection-cancel"
                onClick={handleExitSelection}
                disabled={isSaving}
              >
                {t('fridge.selection.exit')}
              </button>
            </>
          ) : (
            <button
              type="button"
              className="secondary-button"
              onClick={() => setIsSelectionMode(true)}
              disabled={isSaving || ingredients.length === 0}
            >
              {t('fridge.selection.select')}
            </button>
          )}
        </div>

        <div className="fridge-tables">
          {ingredients.length === 0 ? (
            <div className="empty-state">
              {t('fridge.empty')}
            </div>
          ) : (
            sortedCategoryEntries
              .filter(
                ([category]) =>
                  displayActiveCategory === allCategoryKey ||
                  displayActiveCategory === category,
              )
              .map(([category, items]) => (
                <div key={category} className="category-table-wrapper">
                  <h2 className="category-title">{getCategoryLabel(category)}</h2>
                  <div className="table-container">
                    <table className={`fridge-table ${isSelectionMode ? 'is-selecting' : ''}`}>
                      <thead>
                        <tr>
                          {isSelectionMode ? (
                            <th aria-label={t('fridge.selection.select')}></th>
                          ) : null}
                          <th>{t('fridge.table.ingredient')}</th>
                          <th>{t('fridge.form.quantity')}</th>
                          <th>{t('fridge.form.gram')}</th>
                          <th>{t('fridge.table.bestBefore')}</th>
                          <th>{t('fridge.table.expiration')}</th>
                          <th>{t('fridge.table.memo')}</th>
                          <th>{t('fridge.table.actions')}</th>
                        </tr>
                      </thead>
                      <tbody>
                        {items.map((item) => {
                          const isWarning =
                            isNearExpiration(item.nearestExpirationDate) ||
                            isNearExpiration(item.nearestBestBeforeDate)
                          const itemIds = getInventoryIds(item.items)
                          const isSelected =
                            itemIds.length > 0 &&
                            itemIds.every((id) => selectedInventoryIds.has(id))
                          return (
                            <tr key={item.key} className={isWarning ? 'near-expiration-row' : ''}>
                              {isSelectionMode ? (
                                <td>
                                  <input
                                    type="checkbox"
                                    aria-label={t(
                                      'fridge.selection.selectAria',
                                      { name: item.name },
                                    )}
                                    checked={isSelected}
                                    onChange={(event) =>
                                      setGroupSelected(
                                        item.items,
                                        event.currentTarget.checked,
                                      )
                                    }
                                  />
                                </td>
                              ) : null}
                              <td className="ingredient-name-cell">
                                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                                  <button
                                    type="button"
                                    className="ingredient-name-link"
                                    onClick={() => setDetailIngredient(item)}
                                  >
                                    {item.name}
                                  </button>
                                  {isWarning && (
                                    <span className="expiry-alert">
                                      <Icon name="bell" />
                                      {t('fridge.summary.nearExpiration')}
                                    </span>
                                  )}
                                </div>
                              </td>
                              <td>
                                <span className="amount-text">
                                  {formatQuantity(item.quantity, language)}
                                </span>
                              </td>
                              <td>
                                <span className="amount-text">
                                  {formatGram(item.gram)}
                                </span>
                              </td>
                              <td>
                                <span className={isNearExpiration(item.nearestBestBeforeDate) ? 'expiration-warning' : ''}>
                                  {formatDate(item.nearestBestBeforeDate, language)}
                                </span>
                              </td>
                              <td>
                                <span className={isNearExpiration(item.nearestExpirationDate) ? 'expiration-warning' : ''}>
                                  {formatDate(item.nearestExpirationDate, language)}
                                </span>
                              </td>
                              <td>
                                {item.isGrouped
                                  ? t('fridge.detail.aggregateMemo')
                                  : item.memo}
                              </td>
                              <td>
                                <div className="fridge-row-actions">
                                  <button
                                    type="button"
                                    className="small-button"
                                    onClick={() => setDetailIngredient(item)}
                                  >
                                    {t('fridge.action.detail')}
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

      {detailIngredient ? (
        <div
          className="modal-backdrop"
          role="presentation"
          onClick={(event) => {
            if (event.target === event.currentTarget) {
              setDetailIngredient(null)
            }
          }}
        >
          <section
            className="cook-modal ingredient-detail-modal"
            aria-labelledby="ingredient-detail-title"
            aria-modal="true"
            role="dialog"
            onClick={(event) => event.stopPropagation()}
          >
            <p className="eyebrow">{t('fridge.detail.eyebrow')}</p>
            <h2 id="ingredient-detail-title">{detailIngredient.name}</h2>
            <p className="ingredient-detail-summary">
              {t('fridge.detail.aggregateMemo')}
            </p>

            <div className="ingredient-detail-total">
              <span>
                <strong>{t('fridge.form.quantity')}</strong>
                {formatQuantity(detailIngredient.quantity, language)}
              </span>
              <span>
                <strong>{t('fridge.form.gram')}</strong>
                {formatGram(detailIngredient.gram)}
              </span>
              <span>
                <strong>{t('fridge.table.expiration')}</strong>
                {formatDate(detailIngredient.nearestExpirationDate, language)}
              </span>
            </div>

            <div className="ingredient-detail-list">
              {detailIngredient.items.map((item, index) => (
                <article
                  key={item.inventoryId ?? `${item.name}-${index}`}
                  className="ingredient-detail-item"
                >
                  <div>
                    <strong>
                      {t('fridge.detail.itemLabel', { number: index + 1 })}
                    </strong>
                    <span>{getCategoryLabel(item.category || 'その他')}</span>
                  </div>
                  <dl>
                    <div>
                      <dt>{t('fridge.form.quantity')}</dt>
                      <dd>{formatQuantity(item.quantity, language)}</dd>
                    </div>
                    <div>
                      <dt>{t('fridge.form.gram')}</dt>
                      <dd>{formatGram(item.gram)}</dd>
                    </div>
                    <div>
                      <dt>{t('fridge.table.bestBefore')}</dt>
                      <dd>{formatDate(item.bestBeforeDate, language)}</dd>
                    </div>
                    <div>
                      <dt>{t('fridge.table.expiration')}</dt>
                      <dd>{formatDate(item.expirationDate, language)}</dd>
                    </div>
                    <div>
                      <dt>{t('fridge.table.memo')}</dt>
                      <dd>{item.memo ?? '-'}</dd>
                    </div>
                  </dl>
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
                </article>
              ))}
            </div>

            <div className="modal-actions">
              <button
                type="button"
                className="secondary-button"
                onClick={() => setDetailIngredient(null)}
              >
                {t('common.close')}
              </button>
            </div>
          </section>
        </div>
      ) : null}

      {deleteConfirm ? (
        <div
          className="modal-backdrop"
          role="presentation"
          onClick={(event) => {
            if (event.target === event.currentTarget && !isSaving) {
              setDeleteConfirm(null)
            }
          }}
        >
          <section
            className="cook-modal ingredient-delete-modal"
            aria-labelledby="ingredient-delete-title"
            aria-modal="true"
            role="dialog"
            onClick={(event) => event.stopPropagation()}
          >
            <p className="eyebrow">{t('fridge.action.delete')}</p>
            <h2 id="ingredient-delete-title">{t('fridge.action.delete')}</h2>
            <p className="ingredient-detail-summary">
              {deleteConfirm.message}
            </p>
            <div className="modal-actions">
              <button
                type="button"
                className="secondary-button"
                onClick={() => setDeleteConfirm(null)}
                disabled={isSaving}
              >
                {t('common.cancel')}
              </button>
              <button
                type="button"
                className="secondary-button danger-button"
                onClick={() =>
                  void executeDeleteInventoryIds(deleteConfirm.inventoryIds)
                }
                disabled={isSaving}
              >
                {isSaving ? t('common.updating') : t('fridge.action.delete')}
              </button>
            </div>
          </section>
        </div>
      ) : null}

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
                  list="fridge-category-options"
                  value={formState.category}
                  onChange={(event) =>
                    updateFormField('category', event.target.value)
                  }
                  placeholder={t('fridge.form.categorySelect')}
                />
                <datalist id="fridge-category-options">
                  {formCategories.map((cat) => (
                    <option key={cat} value={cat} label={getCategoryLabel(cat)} />
                  ))}
                </datalist>
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
