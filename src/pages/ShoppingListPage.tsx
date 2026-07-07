import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type FormEvent,
} from 'react'
import { Icon } from '../components/Icon'
import { getCache, setCache } from '../lib/dataCache'
import {
  fetchCookingHistory,
  fetchInventory,
  fetchSavedRecipes,
} from '../lib/recipeApi'
import {
  createShoppingList,
  deleteShoppingList,
  fetchShoppingList,
  fetchShoppingLists,
  importShoppingListToInventory,
  updateShoppingList,
} from '../lib/shoppingApi'
import { useI18n } from '../lib/useI18n'
import type {
  AppDestination,
  Ingredient,
  Recipe,
  ShoppingList,
  ShoppingListItem,
  ShoppingListSummary,
} from '../types/ui'

type ShoppingListPageProps = {
  onNavigate: (page: AppDestination) => void
  onLogout?: () => void | Promise<void>
}

type ManualShoppingForm = {
  name: string
  category: string
  quantity: string
  gram: string
  unit: string
  memo: string
}

type RecipeCandidateItem = ShoppingListItem & {
  itemId: string
}

type ShoppingListDetailsCache = Record<string, ShoppingList>

const emptyManualShoppingForm: ManualShoppingForm = {
  name: '',
  category: '',
  quantity: '',
  gram: '',
  unit: '',
  memo: '',
}

const CATEGORY_OTHER = 'その他'
const CATEGORY_MEAT_EGG_FISH = '肉・卵・魚'
const CATEGORY_VEGETABLE = '野菜'
const CATEGORY_DAIRY = '乳製品'
const CATEGORY_STAPLE = '主食'
const CATEGORY_SEASONING = '調味料'
const CATEGORY_PROCESSED = '加工品'
const CATEGORY_DRINK = '飲料'

const recipePageSize = 10

const categoryWords = {
  [CATEGORY_MEAT_EGG_FISH]: [
    '肉',
    '鶏',
    '豚',
    '牛',
    '魚',
    '鮭',
    'サーモン',
    '卵',
    'たまご',
    'ハム',
    'ソーセージ',
    'chicken',
    'pork',
    'beef',
    'fish',
    'egg',
  ],
  [CATEGORY_VEGETABLE]: [
    '野菜',
    '玉ねぎ',
    '玉葱',
    '小松菜',
    'にんじん',
    '人参',
    'キャベツ',
    'レタス',
    'トマト',
    'きのこ',
    'しめじ',
    'えのき',
    'しいたけ',
    'ねぎ',
    'じゃがいも',
    'ピーマン',
    'vegetable',
  ],
  [CATEGORY_DAIRY]: [
    '牛乳',
    'チーズ',
    'バター',
    'ヨーグルト',
    'milk',
    'cheese',
    'butter',
    'yogurt',
  ],
  [CATEGORY_STAPLE]: [
    '米',
    '白米',
    'ご飯',
    'パン',
    'パスタ',
    '麺',
    'うどん',
    'そば',
    'rice',
    'bread',
    'pasta',
    'noodle',
  ],
  [CATEGORY_PROCESSED]: [
    '加工',
    '豆腐',
    '缶',
    '冷凍',
    '惣菜',
  ],
  [CATEGORY_SEASONING]: [
    '醤油',
    'しょうゆ',
    '味噌',
    'みそ',
    '塩',
    '砂糖',
    '油',
    'ソース',
    'だし',
    'seasoning',
  ],
  [CATEGORY_DRINK]: [
    '茶',
    '水',
    'ジュース',
    '飲料',
    'コーヒー',
    'drink',
    'beverage',
  ],
}

function createItemId(prefix = 'shopping-item') {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return `${prefix}-${crypto.randomUUID()}`
  }

  return `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2)}`
}

function normalizeName(name: string) {
  return name.trim().toLowerCase()
}

function inferCategory(name: string) {
  const normalized = normalizeName(name)

  for (const [category, words] of Object.entries(categoryWords)) {
    if (words.some((word) => normalized.includes(word.toLowerCase()))) {
      return category
    }
  }

  return CATEGORY_OTHER
}

function getNumber(value: string) {
  const number = Number(value)
  return Number.isFinite(number) && number > 0 ? number : null
}

function isWeightUnit(unit: string | null | undefined) {
  return unit === 'g' || unit === 'ml'
}

function formatItemAmount(
  item: Pick<ShoppingListItem, 'quantity' | 'gram' | 'unit'>,
  fallbackUnit: string,
) {
  if (item.gram) {
    return `${item.gram}${item.unit === 'ml' ? 'ml' : 'g'}`
  }

  if (item.quantity) {
    return `${item.quantity}${item.unit || fallbackUnit}`
  }

  return '-'
}

function mergeMemoText(currentMemo: string | null, addedMemo: string | null) {
  if (!currentMemo) return addedMemo
  if (!addedMemo || currentMemo.includes(addedMemo)) return currentMemo
  return `${currentMemo} / ${addedMemo}`
}

function createShoppingItemFromCandidate(item: RecipeCandidateItem): ShoppingListItem {
  return {
    itemId: createItemId('recipe'),
    name: item.name,
    category: item.category,
    quantity: item.quantity,
    gram: item.gram,
    unit: item.unit,
    memo: item.memo,
    checked: false,
  }
}

function addRecipeCandidatesToShoppingItems(
  currentItems: ShoppingListItem[],
  candidateItems: RecipeCandidateItem[],
) {
  const nextItems = currentItems.map((item) => ({ ...item }))
  const newItems: ShoppingListItem[] = []

  candidateItems.forEach((candidate) => {
    const candidateKey = normalizeName(candidate.name)
    const existingIndex = nextItems.findIndex((item) => {
      return normalizeName(item.name) === candidateKey
    })

    if (existingIndex === -1) {
      newItems.push(createShoppingItemFromCandidate(candidate))
      return
    }

    const existing = nextItems[existingIndex]
    const nextGram = (existing.gram ?? 0) + (candidate.gram ?? 0)
    const nextQuantity = (existing.quantity ?? 0) + (candidate.quantity ?? 0)

    nextItems[existingIndex] = {
      ...existing,
      category: existing.category || candidate.category,
      quantity: nextQuantity > 0 ? nextQuantity : null,
      gram: nextGram > 0 ? nextGram : null,
      unit: candidate.unit || existing.unit || null,
      memo: mergeMemoText(existing.memo, candidate.memo),
      checked: false,
    }
  })

  return [...newItems, ...nextItems]
}

function getRecipeKey(recipe: Recipe) {
  return recipe.recipeId || recipe.name
}

export function ShoppingListPage({ onNavigate }: ShoppingListPageProps) {
  const { language, t } = useI18n()
  const defaultShoppingListName = t('shopping.defaultListName')
  const defaultUnit = t('shopping.defaultUnit')
  const toastTimerRef = useRef<number | null>(null)
  const inventoryCacheKey = `inventory:${language}`
  const recipeCacheKey = `shopping-recipes:${language}`
  const shoppingListsCacheKey = `shopping-lists:${language}`
  const shoppingListDetailsCacheKey = `shopping-list-details:${language}`

  const [inventory, setInventory] = useState<Ingredient[]>(() => {
    return getCache<Ingredient[]>(inventoryCacheKey) ?? []
  })
  const [recipes, setRecipes] = useState<Recipe[]>(() => {
    return getCache<Recipe[]>(recipeCacheKey) ?? []
  })
  const [savedLists, setSavedLists] = useState<ShoppingListSummary[]>(() => {
    return getCache<ShoppingListSummary[]>(shoppingListsCacheKey) ?? []
  })
  const [shoppingListDetails, setShoppingListDetails] =
    useState<ShoppingListDetailsCache>(() => {
      return getCache<ShoppingListDetailsCache>(shoppingListDetailsCacheKey) ?? {}
    })
  const [recipeTargetListId, setRecipeTargetListId] = useState('new')
  const [recipeNewListName, setRecipeNewListName] = useState(
    defaultShoppingListName,
  )
  const [manualTargetListId, setManualTargetListId] = useState('new')
  const [manualNewListName, setManualNewListName] = useState(
    defaultShoppingListName,
  )
  const [selectedRecipeIds, setSelectedRecipeIds] = useState<Set<string>>(
    () => new Set(),
  )
  const [excludedCandidateIds, setExcludedCandidateIds] =
    useState<Set<string> | null>(null)
  const [visibleRecipeCount, setVisibleRecipeCount] = useState(recipePageSize)
  const [manualForm, setManualForm] =
    useState<ManualShoppingForm>(emptyManualShoppingForm)
  const [isLoading, setIsLoading] = useState(() => {
    return !getCache<ShoppingListSummary[]>(shoppingListsCacheKey)
  })
  const [isSaving, setIsSaving] = useState(false)
  const [isImporting, setIsImporting] = useState(false)
  const [isSavedListDialogOpen, setIsSavedListDialogOpen] = useState(false)
  const [selectedSavedList, setSelectedSavedList] = useState<ShoppingList | null>(
    null,
  )
  const [isSavedListLoading, setIsSavedListLoading] = useState(false)
  const [errorMessage, setErrorMessage] = useState('')
  const [toastMessage, setToastMessage] = useState('')

  useEffect(() => {
    return () => {
      if (toastTimerRef.current !== null) {
        window.clearTimeout(toastTimerRef.current)
      }
    }
  }, [])

  useEffect(() => {
    let isMounted = true

    async function loadShoppingPage() {
      try {
        const [
          inventoryResult,
          savedRecipeResult,
          historyResult,
          listResult,
        ] = await Promise.all([
          fetchInventory(language),
          fetchSavedRecipes(language),
          fetchCookingHistory(language),
          fetchShoppingLists(),
        ])

        if (!isMounted) return

        const recipeMap = new Map<string, Recipe>()
        const addRecipe = (recipe: Recipe) => {
          const key = getRecipeKey(recipe)
          if (key && !recipeMap.has(key)) {
            recipeMap.set(key, recipe)
          }
        }

        savedRecipeResult.recipes.forEach(addRecipe)
        historyResult.recipes.forEach(addRecipe)

        const nextRecipes = Array.from(recipeMap.values())

        setInventory(inventoryResult.inventory)
        setCache(inventoryCacheKey, inventoryResult.inventory)
        setRecipes(nextRecipes)
        setCache(recipeCacheKey, nextRecipes)
        setSavedLists(listResult.shoppingLists)
        setCache(shoppingListsCacheKey, listResult.shoppingLists)
        setErrorMessage('')
      } catch (error) {
        if (!isMounted) return
        setErrorMessage(
          error instanceof Error ? error.message : t('shopping.loadFailed'),
        )
      } finally {
        if (isMounted) {
          setIsLoading(false)
        }
      }
    }

    void loadShoppingPage()

    return () => {
      isMounted = false
    }
  }, [inventoryCacheKey, language, recipeCacheKey, shoppingListsCacheKey, t])

  const recipeCandidateItems = useMemo(() => {
    const requiredMap = new Map<
      string,
      ShoppingListItem & { sourceRecipes: Set<string> }
    >()
    const inventoryMap = new Map<string, { gram: number; quantity: number }>()

    inventory.forEach((ingredient) => {
      const key = normalizeName(ingredient.name)
      const current = inventoryMap.get(key) ?? { gram: 0, quantity: 0 }
      current.gram += ingredient.gram ?? 0
      current.quantity += ingredient.quantity ?? 0
      inventoryMap.set(key, current)
    })

    recipes.forEach((recipe) => {
      const recipeKey = getRecipeKey(recipe)
      if (!recipeKey || !selectedRecipeIds.has(recipeKey)) return

      recipe.ingredients?.forEach((ingredient) => {
        const key = normalizeName(ingredient.name)
        const existing = requiredMap.get(key)
        const unit = ingredient.unit || existing?.unit || defaultUnit
        const current =
          existing ??
          ({
            itemId: `candidate-${key}`,
            name: ingredient.name,
            category: inferCategory(ingredient.name),
            quantity: null,
            gram: null,
            unit,
            memo: null,
            checked: false,
            sourceRecipes: new Set<string>(),
          } as ShoppingListItem & { sourceRecipes: Set<string> })

        current.sourceRecipes.add(recipe.name)
        current.unit = unit

        if (isWeightUnit(unit)) {
          current.gram = (current.gram ?? 0) + ingredient.amount
        } else {
          current.quantity = (current.quantity ?? 0) + ingredient.amount
        }

        requiredMap.set(key, current)
      })
    })

    return Array.from(requiredMap.entries())
      .map(([key, required]): RecipeCandidateItem | null => {
        const stock = inventoryMap.get(key) ?? { gram: 0, quantity: 0 }
        const lackGram = Math.max(0, (required.gram ?? 0) - stock.gram)
        const lackQuantity = Math.max(
          0,
          (required.quantity ?? 0) - stock.quantity,
        )

        if (lackGram <= 0 && lackQuantity <= 0) {
          return null
        }

        const { sourceRecipes, ...candidate } = required

        return {
          ...candidate,
          itemId: `candidate-${key}`,
          gram: lackGram > 0 ? Math.ceil(lackGram) : null,
          quantity: lackQuantity > 0 ? Math.ceil(lackQuantity) : null,
          memo: `${t('shopping.recipeEyebrow')}: ${Array.from(sourceRecipes).join(', ')}`,
          checked: false,
        }
      })
      .filter(
        (item): item is RecipeCandidateItem => item !== null,
      )
  }, [defaultUnit, inventory, recipes, selectedRecipeIds, t])

  const activeExcludedCandidateIds = excludedCandidateIds ?? new Set<string>()
  const addableRecipeCandidateCount = recipeCandidateItems.length
  const selectedRecipeCandidateCount = recipeCandidateItems.filter((item) => {
    return !activeExcludedCandidateIds.has(item.itemId)
  }).length

  const totalShoppingItemCount = savedLists.reduce(
    (total, list) => total + list.itemCount,
    0,
  )
  const totalCheckedShoppingItemCount = savedLists.reduce(
    (total, list) => total + (list.checkedCount ?? 0),
    0,
  )
  const totalPendingShoppingItemCount = Math.max(
    0,
    totalShoppingItemCount - totalCheckedShoppingItemCount,
  )
  const listStateLabel = isSaving
    ? t('shopping.savingShort')
    : t('shopping.listCount', { count: savedLists.length })

  function updateSavedListSummary(shoppingList: ShoppingList) {
    const summary: ShoppingListSummary = {
      shoppingListId: shoppingList.shoppingListId,
      name: shoppingList.name,
      itemCount: shoppingList.items.length,
      checkedCount: shoppingList.items.filter((item) => item.checked).length,
      createdAt: shoppingList.createdAt,
      updatedAt: shoppingList.updatedAt,
    }

    setSavedLists((current) => {
      const next = [
        summary,
        ...current.filter(
          (list) => list.shoppingListId !== shoppingList.shoppingListId,
        ),
      ]
      setCache(shoppingListsCacheKey, next)
      return next
    })
    setShoppingListDetails((current) => {
      const next = {
        ...current,
        [shoppingList.shoppingListId]: shoppingList,
      }
      setCache(shoppingListDetailsCacheKey, next)
      return next
    })
    setSelectedSavedList((current) => {
      if (current?.shoppingListId !== shoppingList.shoppingListId) {
        return current
      }
      return shoppingList
    })
  }

  function showToast(message: string) {
    if (toastTimerRef.current !== null) {
      window.clearTimeout(toastTimerRef.current)
    }

    setToastMessage(message)
    toastTimerRef.current = window.setTimeout(() => {
      setToastMessage('')
      toastTimerRef.current = null
    }, 2600)
  }

  function getCategoryLabel(category: string) {
    switch (category) {
      case CATEGORY_MEAT_EGG_FISH:
        return t('category.meatEggFish')
      case CATEGORY_VEGETABLE:
        return t('category.vegetable')
      case CATEGORY_DAIRY:
        return t('category.dairy')
      case CATEGORY_STAPLE:
        return t('category.staple')
      case CATEGORY_SEASONING:
        return t('category.seasoning')
      case CATEGORY_PROCESSED:
        return t('category.processed')
      case CATEGORY_DRINK:
        return t('category.drink')
      case CATEGORY_OTHER:
        return t('category.other')
      default:
        return category
    }
  }

  function updateManualForm(field: keyof ManualShoppingForm, value: string) {
    setManualForm((current) => ({ ...current, [field]: value }))
  }

  async function getShoppingListDetail(shoppingListId: string) {
    const cached = shoppingListDetails[shoppingListId]
    if (cached) {
      return cached
    }

    const result = await fetchShoppingList(shoppingListId)
    updateSavedListSummary(result.shoppingList)
    return result.shoppingList
  }

  function openSavedListDialog() {
    setSelectedSavedList(null)
    setIsSavedListDialogOpen(true)
  }

  function closeSavedListDialog() {
    setIsSavedListDialogOpen(false)
    setSelectedSavedList(null)
  }

  function normalizeItemsForSave(nextItems: ShoppingListItem[]) {
    return nextItems.map((item, index) => ({
      ...item,
      sortOrder: index,
      unit: item.unit ?? defaultUnit,
      memo: item.memo ?? null,
    }))
  }

  async function saveItemsToTargetList(
    nextItems: ShoppingListItem[],
    options: {
      targetListId: string
      name?: string
      successMessage?: string
    },
  ): Promise<ShoppingList | null> {
    if (nextItems.length === 0) {
      return null
    }

    setIsSaving(true)

    try {
      const result =
        options.targetListId === 'new'
          ? await createShoppingList({
              name:
                (options.name ?? defaultShoppingListName).trim() ||
                defaultShoppingListName,
              items: normalizeItemsForSave(nextItems),
            })
          : await updateShoppingList(options.targetListId, {
              items: normalizeItemsForSave(nextItems),
            })

      updateSavedListSummary(result.shoppingList)

      if (options.successMessage) {
        showToast(options.successMessage)
      }

      return result.shoppingList
    } catch (error) {
      showToast(error instanceof Error ? error.message : t('shopping.saveFailed'))

      return null
    } finally {
      setIsSaving(false)
    }
  }

  async function getTargetItems(targetListId: string) {
    if (targetListId === 'new') {
      return []
    }

    const targetList = await getShoppingListDetail(targetListId)
    return targetList.items
  }

  async function handleAddManualItem(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const name = manualForm.name.trim()

    if (!name) {
      return
    }

    const targetItems = await getTargetItems(manualTargetListId)
    const nextItems = [
      {
        itemId: createItemId('manual'),
        name,
        category: manualForm.category.trim() || inferCategory(name),
        quantity: getNumber(manualForm.quantity),
        gram: getNumber(manualForm.gram),
        unit: manualForm.unit.trim() || defaultUnit,
        memo: manualForm.memo.trim() || null,
        checked: false,
      },
      ...targetItems,
    ]

    setManualForm(emptyManualShoppingForm)
    const result = await saveItemsToTargetList(nextItems, {
      targetListId: manualTargetListId,
      name: manualNewListName,
      successMessage: t('shopping.addSuccess'),
    })
    if (manualTargetListId === 'new' && result) {
      setManualTargetListId(result.shoppingListId)
      setManualNewListName(defaultShoppingListName)
    }
  }

  function handleToggleRecipe(recipeId: string) {
    setExcludedCandidateIds(null)
    setSelectedRecipeIds((current) => {
      const next = new Set(current)
      if (next.has(recipeId)) {
        next.delete(recipeId)
      } else {
        next.add(recipeId)
      }
      return next
    })
  }

  function handleToggleCandidateExclusion(itemId: string) {
    setExcludedCandidateIds((current) => {
      const next = new Set(current ?? [])
      if (next.has(itemId)) {
        next.delete(itemId)
      } else {
        next.add(itemId)
      }
      return next
    })
  }

  async function handleAddRecipeCandidates() {
    const selectedItems = recipeCandidateItems.filter((item) => {
      return !activeExcludedCandidateIds.has(item.itemId)
    })

    if (selectedItems.length === 0) {
      showToast(t('shopping.addSelectedNone'))
      return
    }

    const targetItems = await getTargetItems(recipeTargetListId)
    const nextItems = addRecipeCandidatesToShoppingItems(targetItems, selectedItems)

    setExcludedCandidateIds(null)
    const result = await saveItemsToTargetList(nextItems, {
      targetListId: recipeTargetListId,
      name: recipeNewListName,
      successMessage: t('shopping.moveSuccessAlert', {
        count: selectedItems.length,
      }),
    })
    if (recipeTargetListId === 'new' && result) {
      setRecipeTargetListId(result.shoppingListId)
      setRecipeNewListName(defaultShoppingListName)
    }
  }

  async function handleSelectSavedList(shoppingListId: string) {
    setIsSavedListLoading(true)

    try {
      const result = await fetchShoppingList(shoppingListId)
      setSelectedSavedList(result.shoppingList)
      updateSavedListSummary(result.shoppingList)
    } catch (error) {
      showToast(error instanceof Error ? error.message : t('shopping.loadFailed'))
    } finally {
      setIsSavedListLoading(false)
    }
  }

  async function handleDeleteList(shoppingListId: string) {
    setIsSaving(true)

    try {
      const result = await deleteShoppingList(shoppingListId)
      setSavedLists(result.shoppingLists)
      setCache(shoppingListsCacheKey, result.shoppingLists)
      setShoppingListDetails((current) => {
        const next = { ...current }
        delete next[shoppingListId]
        setCache(shoppingListDetailsCacheKey, next)
        return next
      })
      if (selectedSavedList?.shoppingListId === shoppingListId) {
        setSelectedSavedList(null)
      }
      if (recipeTargetListId === shoppingListId) {
        setRecipeTargetListId('new')
      }
      if (manualTargetListId === shoppingListId) {
        setManualTargetListId('new')
      }
      showToast(t('shopping.deleteSuccess'))
    } catch (error) {
      showToast(error instanceof Error ? error.message : t('shopping.deleteFailed'))
    } finally {
      setIsSaving(false)
    }
  }

  async function updateSelectedSavedListItems(nextItems: ShoppingListItem[]) {
    if (!selectedSavedList) return

    setIsSaving(true)

    try {
      const result = await updateShoppingList(selectedSavedList.shoppingListId, {
        items: normalizeItemsForSave(nextItems),
      })
      updateSavedListSummary(result.shoppingList)
    } catch (error) {
      showToast(error instanceof Error ? error.message : t('shopping.saveFailed'))
    } finally {
      setIsSaving(false)
    }
  }

  function handleToggleSavedListItem(itemId: string | undefined) {
    if (!selectedSavedList || !itemId) return

    const nextItems = selectedSavedList.items.map((item) =>
      item.itemId === itemId ? { ...item, checked: !item.checked } : item,
    )

    setSelectedSavedList({ ...selectedSavedList, items: nextItems })
    void updateSelectedSavedListItems(nextItems)
  }

  function handleRemoveSavedListItem(itemId: string | undefined) {
    if (!selectedSavedList || !itemId) return

    const nextItems = selectedSavedList.items.filter(
      (item) => item.itemId !== itemId,
    )

    setSelectedSavedList({ ...selectedSavedList, items: nextItems })
    void updateSelectedSavedListItems(nextItems)
  }

  async function handleImportSelectedSavedListPurchased() {
    if (!selectedSavedList) return

    const purchasedIds = selectedSavedList.items
      .filter((item) => item.checked && item.itemId)
      .map((item) => item.itemId as string)

    if (purchasedIds.length === 0) {
      showToast(t('shopping.purchaseRequired'))
      return
    }

    setIsImporting(true)

    try {
      const result = await importShoppingListToInventory(
        selectedSavedList.shoppingListId,
        purchasedIds,
      )
      updateSavedListSummary(result.shoppingList)
      window.dispatchEvent(new CustomEvent('inventory-updated'))
      showToast(t('shopping.importSuccess', { count: result.importedCount }))
    } catch (error) {
      showToast(error instanceof Error ? error.message : t('shopping.importFailed'))
    } finally {
      setIsImporting(false)
    }
  }

  if (isLoading) {
    return (
      <main className="fridge-container shopping-page">
        <div className="fridge-header">
          <h1>{t('shopping.title')}</h1>
        </div>
        <div className="fridge-error">
          <p>{t('shopping.loading')}</p>
        </div>
      </main>
    )
  }

  if (errorMessage) {
    return (
      <main className="fridge-container shopping-page">
        <div className="fridge-header">
          <h1>{t('shopping.title')}</h1>
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
        <div className="fridge-error">
          <p>{errorMessage}</p>
          <button
            type="button"
            className="primary-button"
            onClick={() => window.location.reload()}
          >
            {t('common.reload')}
          </button>
        </div>
      </main>
    )
  }

  return (
    <main className="fridge-container shopping-page">
      <div className="fridge-header">
        <div>
          <h1>{t('shopping.title')}</h1>
          <p className="ingredient-detail-summary">{t('shopping.subtitle')}</p>
        </div>
        <div className="fridge-header-actions">
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

      <section className="panel settings-section shopping-panel shopping-current-panel">
        <div className="section-heading shopping-list-heading">
          <div>
            <h2>{t('shopping.overviewTitle')}</h2>
            <div
              className="shopping-current-meta"
              aria-label={t('shopping.statusAria')}
            >
              <span>
                {t('shopping.pendingCount', {
                  count: totalPendingShoppingItemCount,
                })}
              </span>
              <span>
                {t('shopping.checkedCount', {
                  count: totalCheckedShoppingItemCount,
                })}
              </span>
              <span>{listStateLabel}</span>
            </div>
          </div>
          <div className="shopping-list-actions">
            <button
              type="button"
              className="secondary-button"
              onClick={openSavedListDialog}
              disabled={totalShoppingItemCount === 0}
            >
              {t('shopping.openAllLists')}
            </button>
          </div>
        </div>
      </section>

      <section className="shopping-panel shopping-recipe-panel">
        <div className="section-heading shopping-list-heading">
          <div>
            <p className="eyebrow">{t('shopping.recipeEyebrow')}</p>
            <h2>{t('shopping.recipeAddTitle')}</h2>
            <p className="settings-section__description">
              {t('shopping.recipeAddDescription')}
            </p>
          </div>
        </div>

        {recipes.length === 0 ? (
          <p className="empty-state">{t('history.empty')}</p>
        ) : (
          <>
            <div className="shopping-recipe-grid">
              {recipes.slice(0, visibleRecipeCount).map((recipe) => {
                const key = getRecipeKey(recipe)
                if (!key) return null
                const isSelected = selectedRecipeIds.has(key)
                return (
                  <label
                    key={key}
                    className={`shopping-recipe-option ${isSelected ? 'is-selected' : ''}`}
                  >
                    <input
                      type="checkbox"
                      checked={isSelected}
                      onChange={() => handleToggleRecipe(key)}
                    />
                    <span className="ingredient-name">{recipe.name}</span>
                  </label>
                )
              })}
            </div>
            {visibleRecipeCount < recipes.length ? (
              <div className="shopping-recipe-more">
                <button
                  type="button"
                  className="primary-button"
                  onClick={() =>
                    setVisibleRecipeCount((current) =>
                      Math.min(current + recipePageSize, recipes.length),
                    )
                  }
                >
                  <span>
                    {t('shopping.showMore', {
                      remaining: recipes.length - visibleRecipeCount,
                    })}
                  </span>
                  <span className="shopping-recipe-more__icon">
                    <Icon name="arrow" />
                  </span>
                </button>
              </div>
            ) : null}
          </>
        )}
      </section>

      {recipeCandidateItems.length > 0 ? (
        <section className="shopping-panel shopping-candidate-panel">
          <div className="section-heading shopping-list-heading">
            <div>
              <p className="eyebrow">{t('recipe.ingredientsEyebrow')}</p>
              <h2>{t('shopping.recipeCandidateTitle')}</h2>
              <p className="settings-section__description shopping-list-heading__description">
                {t('shopping.candidateDescription')}
                {addableRecipeCandidateCount > 0
                  ? ` ${t('shopping.candidateSelectionCount', {
                      selected: selectedRecipeCandidateCount,
                      total: addableRecipeCandidateCount,
                    })}`
                  : ''}
              </p>
            </div>
            <button
              type="button"
              className="primary-button"
              onClick={() => void handleAddRecipeCandidates()}
              disabled={isSaving}
            >
              {isSaving ? t('shopping.savingDots') : t('shopping.moveToFridgeBtn')}
            </button>
          </div>

          <div className="shopping-target-row">
            <label className="settings-field">
              <span>{t('shopping.targetList')}</span>
              <select
                value={recipeTargetListId}
                onChange={(event) => setRecipeTargetListId(event.target.value)}
              >
                <option value="new">{t('shopping.newListOption')}</option>
                {savedLists.map((list) => (
                  <option key={list.shoppingListId} value={list.shoppingListId}>
                    {list.name}
                  </option>
                ))}
              </select>
            </label>
            {recipeTargetListId === 'new' ? (
              <label className="settings-field">
                <span>{t('shopping.newListName')}</span>
                <input
                  type="text"
                  value={recipeNewListName}
                  onChange={(event) => setRecipeNewListName(event.target.value)}
                />
              </label>
            ) : null}
          </div>

          <div className="table-container">
            <table className="fridge-table shopping-table">
              <thead>
                <tr>
                  <th>{t('shopping.exclude')}</th>
                  <th>{t('fridge.table.ingredient')}</th>
                  <th>{t('shopping.shortage')}</th>
                  <th>{t('fridge.table.memo')}</th>
                </tr>
              </thead>
              <tbody>
                {recipeCandidateItems.map((item) => {
                  const key = item.itemId
                  return (
                    <tr key={key}>
                      <td>
                        <input
                          type="checkbox"
                          checked={activeExcludedCandidateIds.has(key)}
                          onChange={() => handleToggleCandidateExclusion(key)}
                          aria-label={t('shopping.excludeItemAria', {
                            name: item.name,
                          })}
                        />
                      </td>
                      <td className="ingredient-name-cell">
                        <span className="ingredient-name">{item.name}</span>
                      </td>
                      <td>{formatItemAmount(item, defaultUnit)}</td>
                      <td className="shopping-table__memo">{item.memo || '-'}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </section>
      ) : null}

      <section
        className="panel settings-section shopping-panel shopping-manual-panel"
        aria-labelledby="shopping-manual-title"
      >
        <div className="section-heading">
          <div>
            <h2 id="shopping-manual-title">{t('shopping.addNewTitle')}</h2>
          </div>
        </div>
        <form onSubmit={handleAddManualItem}>
          <div className="shopping-target-row">
            <label className="settings-field">
              <span>{t('shopping.targetList')}</span>
              <select
                value={manualTargetListId}
                onChange={(event) => setManualTargetListId(event.target.value)}
              >
                <option value="new">{t('shopping.newListOption')}</option>
                {savedLists.map((list) => (
                  <option key={list.shoppingListId} value={list.shoppingListId}>
                    {list.name}
                  </option>
                ))}
              </select>
            </label>
            {manualTargetListId === 'new' ? (
              <label className="settings-field">
                <span>{t('shopping.newListName')}</span>
                <input
                  type="text"
                  value={manualNewListName}
                  onChange={(event) => setManualNewListName(event.target.value)}
                />
              </label>
            ) : null}
          </div>
          <div className="shopping-form-grid">
            <label className="settings-field">
              <span>{t('fridge.form.name')}</span>
              <input
                type="text"
                value={manualForm.name}
                placeholder={t('shopping.namePlaceholder')}
                onChange={(event) => updateManualForm('name', event.target.value)}
              />
            </label>
            <label className="settings-field">
              <span>{t('fridge.form.category')}</span>
              <input
                type="text"
                value={manualForm.category}
                placeholder={t('shopping.categoryPlaceholder')}
                onChange={(event) =>
                  updateManualForm('category', event.target.value)
                }
              />
            </label>
            <label className="settings-field">
              <span>{t('fridge.form.quantity')}</span>
              <input
                type="number"
                min="1"
                value={manualForm.quantity}
                placeholder={t('shopping.quantityPlaceholder')}
                onChange={(event) =>
                  updateManualForm('quantity', event.target.value)
                }
              />
            </label>
            <label className="settings-field">
              <span>{t('fridge.form.gram')}</span>
              <input
                type="number"
                min="1"
                value={manualForm.gram}
                placeholder={t('shopping.gramPlaceholder')}
                onChange={(event) => updateManualForm('gram', event.target.value)}
              />
            </label>
          </div>
          <div className="shopping-form-grid shopping-form-grid--footer">
            <label className="settings-field">
              <span>{t('shopping.unit')}</span>
              <input
                type="text"
                value={manualForm.unit}
                placeholder={t('shopping.unitPlaceholder')}
                onChange={(event) => updateManualForm('unit', event.target.value)}
              />
            </label>
            <label className="settings-field">
              <span>{t('fridge.form.memo')}</span>
              <input
                type="text"
                value={manualForm.memo}
                placeholder={t('shopping.memoPlaceholder')}
                onChange={(event) => updateManualForm('memo', event.target.value)}
              />
            </label>
            <button
              type="submit"
              className="primary-button"
              disabled={isSaving || !manualForm.name.trim()}
            >
              <Icon name="plus" />
              <span>{isSaving ? t('shopping.savingDots') : t('shopping.addBtn')}</span>
            </button>
          </div>
        </form>
      </section>

      {isSavedListDialogOpen ? (
        <div
          className="modal-backdrop"
          role="presentation"
          onClick={closeSavedListDialog}
        >
          <section
            className="cook-modal shopping-saved-dialog"
            aria-labelledby="shopping-saved-dialog-title"
            aria-modal="true"
            role="dialog"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="section-heading shopping-list-heading">
              <div>
                <p className="eyebrow">{t('shopping.savedEyebrow')}</p>
                <h2 id="shopping-saved-dialog-title">
                  {t('shopping.loadListTitle')}
                </h2>
              </div>
              <button
                type="button"
                className="secondary-button"
                onClick={closeSavedListDialog}
              >
                {t('common.close')}
              </button>
            </div>
            {selectedSavedList ? (
              <div className="shopping-saved-detail">
                <div className="section-heading">
                  <div>
                    <h3>{selectedSavedList.name}</h3>
                    <span>
                      {t('shopping.itemCount', {
                        count: selectedSavedList.items.length,
                      })}
                      {selectedSavedList.items.some((item) => item.checked)
                        ? t('shopping.checkedSuffix', {
                            count: selectedSavedList.items.filter(
                              (item) => item.checked,
                            ).length,
                          })
                        : ''}
                    </span>
                  </div>
                  <div className="shopping-saved-detail__actions">
                    <button
                      type="button"
                      className="secondary-button"
                      onClick={() => setSelectedSavedList(null)}
                    >
                      {t('shopping.backToList')}
                    </button>
                    <button
                      type="button"
                      className="primary-button"
                      disabled={
                        isImporting ||
                        !selectedSavedList.items.some((item) => item.checked)
                      }
                      onClick={() => void handleImportSelectedSavedListPurchased()}
                    >
                      {isImporting
                        ? t('shopping.importing')
                        : t('shopping.importPurchased')}
                    </button>
                  </div>
                </div>

                {selectedSavedList.items.length === 0 ? (
                  <p className="settings-section__description">
                    {t('shopping.emptySavedList')}
                  </p>
                ) : (
                  <div className="table-container">
                    <table className="fridge-table shopping-table shopping-saved-items-table">
                      <thead>
                        <tr>
                          <th>{t('shopping.purchasedColumn')}</th>
                          <th>{t('fridge.table.ingredient')}</th>
                          <th>{t('fridge.form.category')}</th>
                          <th>{t('shopping.amountColumn')}</th>
                          <th>{t('fridge.table.memo')}</th>
                          <th>{t('fridge.table.actions')}</th>
                        </tr>
                      </thead>
                      <tbody>
                        {selectedSavedList.items.map((item) => (
                          <tr key={item.itemId ?? item.name}>
                            <td>
                              <input
                                type="checkbox"
                                checked={item.checked}
                                onChange={() =>
                                  handleToggleSavedListItem(item.itemId)
                                }
                                aria-label={t('shopping.markPurchasedAria', {
                                  name: item.name,
                                })}
                              />
                            </td>
                            <td className="ingredient-name-cell">
                              <span className="ingredient-name">{item.name}</span>
                            </td>
                            <td className="shopping-table__category">
                              {getCategoryLabel(item.category || CATEGORY_OTHER)}
                            </td>
                            <td>{formatItemAmount(item, defaultUnit)}</td>
                            <td className="shopping-table__memo">
                              {item.memo || '-'}
                            </td>
                            <td>
                              <button
                                type="button"
                                className="secondary-button shopping-item-delete-button"
                                onClick={() =>
                                  handleRemoveSavedListItem(item.itemId)
                                }
                                disabled={isSaving}
                              >
                                {t('shopping.deleteBtn')}
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            ) : savedLists.length === 0 ? (
              <p className="settings-section__description">
                {t('shopping.loadListEmpty')}
              </p>
            ) : (
              <ul className="shopping-saved-list">
                {savedLists.map((list) => (
                  <li
                    key={list.shoppingListId}
                    className="shopping-saved-list__item"
                  >
                    <button
                      type="button"
                      className="shopping-saved-list__name"
                      onClick={() => void handleSelectSavedList(list.shoppingListId)}
                      disabled={isSaving || isSavedListLoading}
                    >
                      <span>{list.name}</span>
                      <small>
                        {t('shopping.itemCount', { count: list.itemCount })}
                        {list.checkedCount
                          ? t('shopping.checkedSuffix', {
                              count: list.checkedCount,
                            })
                          : ''}
                      </small>
                    </button>
                    <button
                      type="button"
                      className="danger-text-button"
                      onClick={() => void handleDeleteList(list.shoppingListId)}
                      disabled={isSaving || isSavedListLoading}
                    >
                      {t('shopping.deleteBtn')}
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
      ) : null}

      {toastMessage ? (
        <div className="toast-message" role="status">
          {toastMessage}
        </div>
      ) : null}
    </main>
  )
}
