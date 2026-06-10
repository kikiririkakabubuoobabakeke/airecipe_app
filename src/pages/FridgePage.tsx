import { useEffect, useMemo, useState, Fragment, type FormEvent } from 'react'
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

type GroupedIngredient = {
  name: string
  category: string
  totalQuantity: number | null
  totalGram: number | null
  earliestBestBeforeDate: string | null
  earliestExpirationDate: string | null
  items: Ingredient[]
}

function getEarliestDate(bestBefore: string | null | undefined, expiration: string | null | undefined): string | null {
  const dates = [bestBefore, expiration].filter((d): d is string => !!d)
  if (dates.length === 0) return null
  dates.sort()
  return dates[0]
}

function compareDates(a: string | null, b: string | null): number {
  if (a && b) {
    return a.localeCompare(b)
  }
  if (a) return -1
  if (b) return 1
  return 0
}

function compareIngredientsByDate(itemA: Ingredient, itemB: Ingredient): number {
  const dateA = getEarliestDate(itemA.bestBeforeDate, itemA.expirationDate)
  const dateB = getEarliestDate(itemB.bestBeforeDate, itemB.expirationDate)
  return compareDates(dateA, dateB)
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
  const [expandedNames, setExpandedNames] = useState<Record<string, boolean>>({})

  const toggleExpand = (name: string) => {
    setExpandedNames((prev) => ({
      ...prev,
      [name]: !prev[name],
    }))
  }

  const groupedAndSortedIngredients = useMemo(() => {
    const catGroups: Record<string, Record<string, Ingredient[]>> = {}

    for (const item of ingredients) {
      const category = item.category ?? 'その他'
      catGroups[category] ??= {}
      const name = item.name
      catGroups[category][name] ??= []
      catGroups[category][name].push(item)
    }

    const result: Record<string, GroupedIngredient[]> = {}

    for (const [category, nameGroups] of Object.entries(catGroups)) {
      const groupedList: GroupedIngredient[] = []

      for (const [name, groupItems] of Object.entries(nameGroups)) {
        groupItems.sort(compareIngredientsByDate)

        let totalQuantity: number | null = null
        let totalGram: number | null = null
        let earliestBestBeforeDate: string | null = null
        let earliestExpirationDate: string | null = null

        for (const item of groupItems) {
          if (item.quantity !== undefined && item.quantity !== null) {
            totalQuantity = (totalQuantity ?? 0) + item.quantity
          }
          if (item.gram !== undefined && item.gram !== null) {
            totalGram = (totalGram ?? 0) + item.gram
          }
          if (item.bestBeforeDate) {
            if (!earliestBestBeforeDate || item.bestBeforeDate < earliestBestBeforeDate) {
              earliestBestBeforeDate = item.bestBeforeDate
            }
          }
          if (item.expirationDate) {
            if (!earliestExpirationDate || item.expirationDate < earliestExpirationDate) {
              earliestExpirationDate = item.expirationDate
            }
          }
        }

        groupedList.push({
          name,
          category,
          totalQuantity,
          totalGram,
          earliestBestBeforeDate,
          earliestExpirationDate,
          items: groupItems,
        })
      }

      groupedList.sort((groupA, groupB) => {
        const dateA = getEarliestDate(groupA.items[0].bestBeforeDate, groupA.items[0].expirationDate)
        const dateB = getEarliestDate(groupB.items[0].bestBeforeDate, groupB.items[0].expirationDate)
        return compareDates(dateA, dateB)
      })

      result[category] = groupedList
    }

    return result
  }, [ingredients])

  const categories = useMemo(
    () => [allCategoryKey, ...Object.keys(groupedAndSortedIngredients)],
    [groupedAndSortedIngredients],
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
              className={`filter-pill ${displayActiveCategory === category ? 'active' : ''
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
            Object.entries(groupedAndSortedIngredients)
              .filter(
                ([category]) =>
                  displayActiveCategory === allCategoryKey ||
                  displayActiveCategory === category,
              )
              .map(([category, groups]) => (
                <div key={category} className="category-table-wrapper">
                  <h2 className="category-title">{category}</h2>
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
                        {groups.map((group) => {
                          const isWarning =
                            isNearExpiration(group.earliestExpirationDate) ||
                            isNearExpiration(group.earliestBestBeforeDate)
                          const unopenedText = language === 'ja' ? '未開封' : language === 'fr' ? 'Non ouvert' : 'Unopened'
                          const representativeMemo = group.items[0].memo || group.items.find(item => item.memo)?.memo || null
                          const isExpanded = !!expandedNames[group.name]
                          const hasMultiple = group.items.length > 1

                          return (
                            <Fragment key={group.name}>
                              <tr
                                className={`representative-row ${isWarning ? 'near-expiration-row' : ''} ${hasMultiple ? 'clickable-row' : ''}`}
                                onClick={hasMultiple ? () => toggleExpand(group.name) : undefined}
                                style={hasMultiple ? { cursor: 'pointer' } : undefined}
                              >
                                <td className="ingredient-name-cell">
                                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                                    {hasMultiple && (
                                      <span className={`accordion-chevron ${isExpanded ? 'expanded' : ''}`}>
                                        <Icon name="arrow" />
                                      </span>
                                    )}
                                    <span className="ingredient-name">
                                      {group.name}
                                    </span>
                                    {hasMultiple && (
                                      <span className="items-count-badge">
                                        {group.items.length}{language === 'ja' ? '件' : ' items'}
                                      </span>
                                    )}
                                    {isWarning && (
                                      <span className="expiry-alert">
                                        <Icon name="bell" />
                                        {t('fridge.summary.nearExpiration')}
                                      </span>
                                    )}
                                    {!hasMultiple && (
                                      <button
                                        type="button"
                                        className={`opened-badge-button ${group.items[0].isOpened ? 'opened' : 'unopened'}`}
                                        onClick={(e) => {
                                          e.stopPropagation()
                                          void handleToggleOpened(group.items[0])
                                        }}
                                        title={group.items[0].isOpened ? 'Click to mark unopened' : 'Click to mark opened'}
                                        style={{
                                          padding: '2px 8px',
                                          borderRadius: '12px',
                                          fontSize: '0.72rem',
                                          border: 'none',
                                          cursor: 'pointer',
                                          transition: 'all 0.2s',
                                          backgroundColor: group.items[0].isOpened ? 'rgba(74, 222, 128, 0.2)' : 'rgba(156, 163, 175, 0.1)',
                                          color: group.items[0].isOpened ? '#15803d' : '#4b5563',
                                          fontWeight: 'bold',
                                        }}
                                        disabled={isSaving}
                                      >
                                        {group.items[0].isOpened ? t('fridge.form.isOpened') : unopenedText}
                                      </button>
                                    )}
                                  </div>
                                </td>
                                <td>
                                  <span className="amount-text">
                                    {formatStock(group.totalQuantity, group.totalGram, language)}
                                  </span>
                                </td>
                                <td>
                                  <span className={isNearExpiration(group.earliestBestBeforeDate) ? 'expiration-warning' : ''}>
                                    {formatDate(group.earliestBestBeforeDate, language)}
                                  </span>
                                </td>
                                <td>
                                  <span className={isNearExpiration(group.earliestExpirationDate) ? 'expiration-warning' : ''}>
                                    {formatDate(group.earliestExpirationDate, language)}
                                  </span>
                                </td>
                                <td>{representativeMemo ?? '-'}</td>
                                <td>
                                  {!hasMultiple ? (
                                    <div className="fridge-row-actions">
                                      <button
                                        type="button"
                                        className="small-button"
                                        onClick={(e) => {
                                          e.stopPropagation()
                                          openEditForm(group.items[0])
                                        }}
                                      >
                                        {t('fridge.action.edit')}
                                      </button>
                                      <button
                                        type="button"
                                        className="small-button danger-button"
                                        onClick={(e) => {
                                          e.stopPropagation()
                                          void handleDeleteIngredient(group.items[0])
                                        }}
                                      >
                                        {t('fridge.action.delete')}
                                      </button>
                                    </div>
                                  ) : (
                                    <span className="toggle-details-text">
                                      {isExpanded ? t('fridge.action.hideDetails') : t('fridge.action.showDetails')}
                                    </span>
                                  )}
                                </td>
                              </tr>
                              {hasMultiple && isExpanded && (
                                <tr className="detail-row">
                                  <td colSpan={6} style={{ padding: '0 0 0 20px', backgroundColor: '#fcfcfc', borderBottom: '1px solid var(--line)' }}>
                                    <div className="subtable-container" style={{ borderLeft: '3px solid var(--accent)', paddingLeft: '12px' }}>
                                      <table className="subtable" style={{ width: '100%', borderCollapse: 'collapse', margin: '8px 0' }}>
                                        <thead>
                                          <tr style={{ borderBottom: '1px solid #eee' }}>
                                            <th style={{ padding: '8px 12px', fontSize: '0.75rem', color: 'var(--muted)', textAlign: 'left', fontWeight: 'bold', width: '25%' }}>
                                              {language === 'ja' ? '状態' : 'Status'}
                                            </th>
                                            <th style={{ padding: '8px 12px', fontSize: '0.75rem', color: 'var(--muted)', textAlign: 'left', fontWeight: 'bold', width: '20%' }}>
                                              {t('fridge.table.stock')}
                                            </th>
                                            <th style={{ padding: '8px 12px', fontSize: '0.75rem', color: 'var(--muted)', textAlign: 'left', fontWeight: 'bold', width: '15%' }}>
                                              {t('fridge.table.bestBefore')}
                                            </th>
                                            <th style={{ padding: '8px 12px', fontSize: '0.75rem', color: 'var(--muted)', textAlign: 'left', fontWeight: 'bold', width: '15%' }}>
                                              {t('fridge.table.expiration')}
                                            </th>
                                            <th style={{ padding: '8px 12px', fontSize: '0.75rem', color: 'var(--muted)', textAlign: 'left', fontWeight: 'bold', width: '15%' }}>
                                              {t('fridge.table.memo')}
                                            </th>
                                            <th style={{ padding: '8px 12px', fontSize: '0.75rem', color: 'var(--muted)', textAlign: 'left', fontWeight: 'bold', width: '10%' }}>
                                              {t('fridge.table.actions')}
                                            </th>
                                          </tr>
                                        </thead>
                                        <tbody>
                                          {group.items.map((subItem, subIndex) => {
                                            const subRowKey = subItem.inventoryId ?? `${group.name}-sub-${subIndex}`
                                            const subWarning = isNearExpiration(subItem.expirationDate) || isNearExpiration(subItem.bestBeforeDate)

                                            return (
                                              <tr key={subRowKey} style={{ borderBottom: subIndex === group.items.length - 1 ? 'none' : '1px solid #f0f0f0', backgroundColor: subWarning ? 'rgba(138, 74, 63, 0.02)' : 'transparent' }}>
                                                <td style={{ padding: '10px 12px' }}>
                                                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                                    <button
                                                      type="button"
                                                      className={`opened-badge-button ${subItem.isOpened ? 'opened' : 'unopened'}`}
                                                      onClick={() => void handleToggleOpened(subItem)}
                                                      title={subItem.isOpened ? 'Click to mark unopened' : 'Click to mark opened'}
                                                      style={{
                                                        padding: '2px 8px',
                                                        borderRadius: '12px',
                                                        fontSize: '0.72rem',
                                                        border: 'none',
                                                        cursor: 'pointer',
                                                        transition: 'all 0.2s',
                                                        backgroundColor: subItem.isOpened ? 'rgba(74, 222, 128, 0.2)' : 'rgba(156, 163, 175, 0.1)',
                                                        color: subItem.isOpened ? '#15803d' : '#4b5563',
                                                        fontWeight: 'bold',
                                                      }}
                                                      disabled={isSaving}
                                                    >
                                                      {subItem.isOpened ? t('fridge.form.isOpened') : unopenedText}
                                                    </button>
                                                    {subWarning && (
                                                      <span className="expiry-alert" style={{ fontSize: '0.65rem', padding: '1px 6px' }}>
                                                        <Icon name="bell" />
                                                      </span>
                                                    )}
                                                  </div>
                                                </td>
                                                <td style={{ padding: '10px 12px' }}>
                                                  <span className="amount-text" style={{ fontSize: '0.85rem' }}>
                                                    {formatStock(subItem.quantity, subItem.gram, language)}
                                                  </span>
                                                </td>
                                                <td style={{ padding: '10px 12px' }}>
                                                  <span className={isNearExpiration(subItem.bestBeforeDate) ? 'expiration-warning' : ''} style={{ fontSize: '0.85rem' }}>
                                                    {formatDate(subItem.bestBeforeDate, language)}
                                                  </span>
                                                </td>
                                                <td style={{ padding: '10px 12px' }}>
                                                  <span className={isNearExpiration(subItem.expirationDate) ? 'expiration-warning' : ''} style={{ fontSize: '0.85rem' }}>
                                                    {formatDate(subItem.expirationDate, language)}
                                                  </span>
                                                </td>
                                                <td style={{ padding: '10px 12px', fontSize: '0.85rem', color: '#555' }}>
                                                  {subItem.memo ?? '-'}
                                                </td>
                                                <td style={{ padding: '10px 12px' }}>
                                                  <div className="fridge-row-actions">
                                                    <button
                                                      type="button"
                                                      className="small-button"
                                                      style={{ padding: '2px 8px', minHeight: '28px', fontSize: '0.75rem' }}
                                                      onClick={() => openEditForm(subItem)}
                                                    >
                                                      {t('fridge.action.edit')}
                                                    </button>
                                                    <button
                                                      type="button"
                                                      className="small-button danger-button"
                                                      style={{ padding: '2px 8px', minHeight: '28px', fontSize: '0.75rem' }}
                                                      onClick={() => void handleDeleteIngredient(subItem)}
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
                                  </td>
                                </tr>
                              )}
                            </Fragment>
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
              <label style={{ display: 'flex', flexDirection: 'row', alignItems: 'center', gap: '8px', cursor: 'pointer', gridColumn: 'span 2', padding: '8px 0' }}>
                <input
                  type="checkbox"
                  checked={formState.isOpened}
                  onChange={(event) =>
                    setFormState((curr) => ({ ...curr, isOpened: event.target.checked }))
                  }
                  style={{ width: '18px', height: '18px', cursor: 'pointer' }}
                />
                <span style={{ fontSize: '0.9rem', userSelect: 'none', color: '#374151', fontWeight: '500' }}>
                  {t('fridge.form.isOpened')}
                </span>
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
