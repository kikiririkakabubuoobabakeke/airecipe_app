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
  alreadyAdded: boolean
}

const emptyManualShoppingForm: ManualShoppingForm = {
  name: '',
  category: '',
  quantity: '',
  gram: '',
  unit: '個',
  memo: '',
}

const CATEGORY_OTHER = 'その他'
const CATEGORY_MEAT_EGG_FISH = '肉・卵・魚'
const CATEGORY_VEGETABLE = '野菜'
const CATEGORY_DAIRY = '乳製品'
const CATEGORY_PROCESSED = '加工品'
const DEFAULT_SHOPPING_LIST_NAME = '今日の買い物'

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
  [CATEGORY_PROCESSED]: [
    '加工',
    '米',
    '白米',
    'パン',
    'パスタ',
    '麺',
    '豆腐',
    '缶',
    'rice',
    'bread',
    'pasta',
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

function formatItemAmount(item: Pick<ShoppingListItem, 'quantity' | 'gram' | 'unit'>) {
  if (item.gram) {
    return `${item.gram}${item.unit === 'ml' ? 'ml' : 'g'}`
  }

  if (item.quantity) {
    return `${item.quantity}${item.unit || '個'}`
  }

  return '-'
}

function compareCategoryNames(left: string, right: string, language: string) {
  if (left === CATEGORY_OTHER && right !== CATEGORY_OTHER) return 1
  if (right === CATEGORY_OTHER && left !== CATEGORY_OTHER) return -1
  return left.localeCompare(right, language)
}

function getRecipeKey(recipe: Recipe) {
  return recipe.recipeId || recipe.name
}

export function ShoppingListPage({ onNavigate }: ShoppingListPageProps) {
  const { language, t } = useI18n()
  const toastTimerRef = useRef<number | null>(null)

  const [inventory, setInventory] = useState<Ingredient[]>(() => {
    return getCache<Ingredient[]>(`inventory:${language}`) ?? []
  })
  const [recipes, setRecipes] = useState<Recipe[]>([])
  const [savedLists, setSavedLists] = useState<ShoppingListSummary[]>([])
  const [currentListId, setCurrentListId] = useState<string | null>(null)
  const [currentListName, setCurrentListName] = useState(
    DEFAULT_SHOPPING_LIST_NAME,
  )
  const [items, setItems] = useState<ShoppingListItem[]>([])
  const [selectedRecipeIds, setSelectedRecipeIds] = useState<Set<string>>(
    () => new Set(),
  )
  const [selectedCandidateIds, setSelectedCandidateIds] =
    useState<Set<string> | null>(null)
  const [visibleRecipeCount, setVisibleRecipeCount] = useState(recipePageSize)
  const [manualForm, setManualForm] =
    useState<ManualShoppingForm>(emptyManualShoppingForm)
  const [isLoading, setIsLoading] = useState(true)
  const [isSaving, setIsSaving] = useState(false)
  const [isImporting, setIsImporting] = useState(false)
  const [isSavedListDialogOpen, setIsSavedListDialogOpen] = useState(false)
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

        setInventory(inventoryResult.inventory)
        setCache(`inventory:${language}`, inventoryResult.inventory)
        setRecipes(Array.from(recipeMap.values()))
        setSavedLists(listResult.shoppingLists)
        setErrorMessage('')

        const firstList = listResult.shoppingLists[0]
        if (firstList) {
          try {
            const detailResult = await fetchShoppingList(firstList.shoppingListId)

            if (!isMounted) return

            setCurrentListId(detailResult.shoppingList.shoppingListId)
            setCurrentListName(detailResult.shoppingList.name)
            setItems(detailResult.shoppingList.items)
          } catch (error) {
            console.warn('[vite] Initial shopping list fetch failed:', error)
          }
        }
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
  }, [language, t])

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
        const unit = ingredient.unit || existing?.unit || '個'
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

    const currentKeys = new Set(items.map((item) => normalizeName(item.name)))

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
          memo: `レシピ: ${Array.from(sourceRecipes).join(', ')}`,
          checked: false,
          alreadyAdded: currentKeys.has(key),
        }
      })
      .filter(
        (item): item is RecipeCandidateItem => item !== null,
      )
  }, [inventory, items, recipes, selectedRecipeIds])

  const defaultSelectedCandidateIds = useMemo(() => {
    return new Set(
      recipeCandidateItems
        .filter((item) => !item.alreadyAdded)
        .map((item) => item.itemId),
    )
  }, [recipeCandidateItems])

  const activeSelectedCandidateIds =
    selectedCandidateIds ?? defaultSelectedCandidateIds

  const groupedItems = useMemo(() => {
    return items.reduce(
      (groups, item) => {
        const category = item.category || CATEGORY_OTHER
        groups[category] ??= []
        groups[category].push(item)
        return groups
      },
      {} as Record<string, ShoppingListItem[]>,
    )
  }, [items])

  const categories = useMemo(() => {
    return Array.from(
      new Set(items.map((item) => item.category || CATEGORY_OTHER)),
    ).toSorted((left, right) => compareCategoryNames(left, right, language))
  }, [items, language])

  const checkedCount = items.filter((item) => item.checked).length
  const pendingCount = Math.max(0, items.length - checkedCount)
  const currentListDisplayName =
    currentListName.trim() || DEFAULT_SHOPPING_LIST_NAME
  const listStateLabel = isImporting
    ? '食品一覧へ登録中'
    : isSaving
      ? '保存中'
      : currentListId
        ? '保存済み'
        : '未保存'
  const currentListHelpText = items.length
    ? 'チェックした項目は「購入済みを食品一覧に登録」で食品一覧へ追加できます。'
    : '下のフォームかレシピから、買うものを追加できます。'

  function updateSavedListSummary(shoppingList: ShoppingList) {
    const summary: ShoppingListSummary = {
      shoppingListId: shoppingList.shoppingListId,
      name: shoppingList.name,
      itemCount: shoppingList.items.length,
      checkedCount: shoppingList.items.filter((item) => item.checked).length,
      createdAt: shoppingList.createdAt,
      updatedAt: shoppingList.updatedAt,
    }

    setSavedLists((current) => [
      summary,
      ...current.filter(
        (list) => list.shoppingListId !== shoppingList.shoppingListId,
      ),
    ])
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
      case CATEGORY_PROCESSED:
        return t('category.processed')
      case CATEGORY_OTHER:
        return t('category.other')
      default:
        return category
    }
  }

  function updateManualForm(field: keyof ManualShoppingForm, value: string) {
    setManualForm((current) => ({ ...current, [field]: value }))
  }

  function normalizeItemsForSave(nextItems = items) {
    return nextItems.map((item, index) => ({
      ...item,
      sortOrder: index,
      unit: item.unit ?? '個',
      memo: item.memo ?? null,
    }))
  }

  async function saveListSnapshot(
    nextItems: ShoppingListItem[],
    options: {
      name?: string
      successMessage?: string
      silent?: boolean
    } = {},
  ): Promise<ShoppingList | null> {
    if (nextItems.length === 0 && !currentListId) {
      return null
    }

    setIsSaving(true)

    try {
      const input = {
        name:
          (options.name ?? currentListName).trim() ||
          DEFAULT_SHOPPING_LIST_NAME,
        items: normalizeItemsForSave(nextItems),
      }
      const result = currentListId
        ? await updateShoppingList(currentListId, input)
        : await createShoppingList(input)

      setCurrentListId(result.shoppingList.shoppingListId)
      setCurrentListName(result.shoppingList.name)
      setItems(result.shoppingList.items)
      updateSavedListSummary(result.shoppingList)

      if (options.successMessage) {
        showToast(options.successMessage)
      }

      return result.shoppingList
    } catch (error) {
      if (!options.silent) {
        showToast(error instanceof Error ? error.message : t('shopping.saveFailed'))
      }

      return null
    } finally {
      setIsSaving(false)
    }
  }

  function handleAddManualItem(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const name = manualForm.name.trim()

    if (!name) {
      showToast(t('shopping.nameRequired'))
      return
    }

    const nextItems = [
      {
        itemId: createItemId('manual'),
        name,
        category: manualForm.category.trim() || inferCategory(name),
        quantity: getNumber(manualForm.quantity),
        gram: getNumber(manualForm.gram),
        unit: manualForm.unit.trim() || '個',
        memo: manualForm.memo.trim() || null,
        checked: false,
      },
      ...items,
    ]

    setItems(nextItems)
    setManualForm(emptyManualShoppingForm)
    void saveListSnapshot(nextItems, {
      successMessage: t('shopping.addSuccess'),
      silent: true,
    })
  }

  function handleToggleRecipe(recipeId: string) {
    setSelectedCandidateIds(null)
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

  function handleToggleCandidate(itemId: string) {
    setSelectedCandidateIds((current) => {
      const next = new Set(current ?? defaultSelectedCandidateIds)
      if (next.has(itemId)) {
        next.delete(itemId)
      } else {
        next.add(itemId)
      }
      return next
    })
  }

  function handleAddRecipeCandidates() {
    const selectedItems = recipeCandidateItems.filter((item) => {
      return activeSelectedCandidateIds.has(item.itemId) && !item.alreadyAdded
    })

    if (selectedItems.length === 0) {
      showToast(t('shopping.addSelectedNone'))
      return
    }

    const nextItems = [
      ...selectedItems.map((item) => ({
        itemId: createItemId('recipe'),
        name: item.name,
        category: item.category,
        quantity: item.quantity,
        gram: item.gram,
        unit: item.unit,
        memo: item.memo,
        checked: false,
      })),
      ...items,
    ]

    setItems(nextItems)
    setSelectedCandidateIds(null)
    void saveListSnapshot(nextItems, {
      successMessage: t('shopping.moveSuccessAlert', {
        count: selectedItems.length,
      }),
      silent: true,
    })
  }

  function handleToggleItem(itemId: string | undefined) {
    if (!itemId) return
    const nextItems = items.map((item) =>
      item.itemId === itemId ? { ...item, checked: !item.checked } : item,
    )
    setItems(nextItems)
    void saveListSnapshot(nextItems, { silent: true })
  }

  function handleRemoveItem(itemId: string | undefined) {
    if (!itemId) return
    const nextItems = items.filter((item) => item.itemId !== itemId)
    setItems(nextItems)
    void saveListSnapshot(nextItems, { silent: true })
  }

  async function handleLoadList(shoppingListId: string) {
    if (currentListId === shoppingListId) {
      return
    }

    setIsSaving(true)

    try {
      const result = await fetchShoppingList(shoppingListId)
      setCurrentListId(result.shoppingList.shoppingListId)
      setCurrentListName(result.shoppingList.name)
      setItems(result.shoppingList.items)
      updateSavedListSummary(result.shoppingList)
      setIsSavedListDialogOpen(false)
      showToast(t('shopping.loadSuccess'))
    } catch (error) {
      showToast(error instanceof Error ? error.message : t('shopping.loadFailed'))
    } finally {
      setIsSaving(false)
    }
  }

  async function handleDeleteList(shoppingListId: string) {
    setIsSaving(true)

    try {
      const result = await deleteShoppingList(shoppingListId)
      setSavedLists(result.shoppingLists)
      if (currentListId === shoppingListId) {
        setCurrentListId(null)
        setCurrentListName(DEFAULT_SHOPPING_LIST_NAME)
        setItems([])
      }
      showToast(t('shopping.deleteSuccess'))
    } catch (error) {
      showToast(error instanceof Error ? error.message : t('shopping.deleteFailed'))
    } finally {
      setIsSaving(false)
    }
  }

  async function handleImportPurchased() {
    const hasPurchasedItems = items.some((item) => item.checked)

    if (!hasPurchasedItems) {
      showToast('購入済みの項目を選択してください')
      return
    }

    setIsImporting(true)

    try {
      const savedList = await saveListSnapshot(items, { silent: true })
      const purchasedIds = savedList?.items
        .filter((item) => item.checked && item.itemId)
        .map((item) => item.itemId as string)

      if (!savedList || !purchasedIds || purchasedIds.length === 0) {
        return
      }

      const result = await importShoppingListToInventory(
        savedList.shoppingListId,
        purchasedIds,
      )
      setCurrentListId(result.shoppingList.shoppingListId)
      setCurrentListName(result.shoppingList.name)
      setItems(result.shoppingList.items)
      updateSavedListSummary(result.shoppingList)
      window.dispatchEvent(new CustomEvent('inventory-updated'))
      showToast(`購入済み${result.importedCount}件を食品一覧に登録しました`)
    } catch (error) {
      showToast(error instanceof Error ? error.message : '食品一覧への登録に失敗しました')
    } finally {
      setIsImporting(false)
    }
  }

  function handleStartNewList() {
    setCurrentListId(null)
    setCurrentListName(DEFAULT_SHOPPING_LIST_NAME)
    setItems([])
    setSelectedRecipeIds(new Set())
    setSelectedCandidateIds(null)
    showToast('新しい買い物リストを開始しました')
  }

  function handleListNameBlur() {
    if (!currentListId || items.length === 0) {
      return
    }

    void saveListSnapshot(items, {
      name: currentListName,
      silent: true,
    })
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
            <p className="eyebrow">編集中の買い物</p>
            <h2>{currentListDisplayName}</h2>
            <div className="shopping-current-meta" aria-label="買い物状況">
              <span>未購入 {pendingCount}件</span>
              <span>購入済み {checkedCount}件</span>
              <span>{listStateLabel}</span>
            </div>
            <p className="settings-section__description">
              {currentListHelpText}
            </p>
          </div>
          <div className="shopping-list-actions">
            <button
              type="button"
              className="secondary-button"
              onClick={() => setIsSavedListDialogOpen(true)}
            >
              保存済みを見る
            </button>
            <button
              type="button"
              className="secondary-button"
              onClick={handleStartNewList}
            >
              新規リスト
            </button>
            <button
              type="button"
              className="primary-button"
              disabled={isImporting || checkedCount === 0}
              onClick={() => void handleImportPurchased()}
            >
              {isImporting ? '登録中...' : '購入済みを食品一覧に登録'}
            </button>
          </div>
        </div>

        <label className="settings-field">
          <span>{t('shopping.saveListNameLabel')}</span>
          <input
            type="text"
            value={currentListName}
            onChange={(event) => setCurrentListName(event.target.value)}
            onBlur={handleListNameBlur}
          />
        </label>

        {items.length === 0 ? (
          <div className="fridge-error">
            <p>{t('shopping.empty')}</p>
          </div>
        ) : (
          <div className="fridge-tables">
            {categories.map((category) => {
              const groupItems = groupedItems[category] ?? []
              return (
                <div key={category} className="category-table-wrapper">
                  <h3 className="category-title">{getCategoryLabel(category)}</h3>
                  <div className="table-container">
                    <table className="fridge-table shopping-table">
                      <thead>
                        <tr>
                          <th>購入</th>
                          <th>{t('fridge.table.ingredient')}</th>
                          <th>量</th>
                          <th>{t('fridge.table.memo')}</th>
                          <th>{t('fridge.table.actions')}</th>
                        </tr>
                      </thead>
                      <tbody>
                        {groupItems.map((item) => (
                          <tr key={item.itemId ?? item.name}>
                            <td>
                              <input
                                type="checkbox"
                                checked={item.checked}
                                onChange={() => handleToggleItem(item.itemId)}
                                aria-label={`${item.name}を購入済みにする`}
                              />
                            </td>
                            <td className="ingredient-name-cell">
                              <span className="ingredient-name">{item.name}</span>
                            </td>
                            <td>{formatItemAmount(item)}</td>
                            <td className="shopping-table__memo">
                              {item.memo || '-'}
                            </td>
                            <td>
                              <button
                                type="button"
                                className="secondary-button shopping-item-delete-button"
                                onClick={() => handleRemoveItem(item.itemId)}
                              >
                                {t('shopping.deleteBtn')}
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )
            })}
            <div className="shopping-current-footer">
              <button
                type="button"
                className="primary-button"
                disabled={isImporting || checkedCount === 0}
                onClick={() => void handleImportPurchased()}
              >
                {isImporting ? '登録中...' : '購入済みを食品一覧に登録'}
              </button>
            </div>
          </div>
        )}
      </section>

      <section className="shopping-panel shopping-recipe-panel">
        <div className="section-heading shopping-list-heading">
          <div>
            <p className="eyebrow">レシピ</p>
            <h2>レシピから不足分を追加</h2>
            <p className="settings-section__description">
              作りたいレシピを選ぶと、在庫との差分だけを候補にします。
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
                {t('shopping.recipeCandidateDescription')}
              </p>
            </div>
            <button
              type="button"
              className="primary-button"
              onClick={handleAddRecipeCandidates}
              disabled={isSaving}
            >
              {isSaving ? '保存中...' : t('shopping.moveToFridgeBtn')}
            </button>
          </div>

          <div className="table-container">
            <table className="fridge-table shopping-table">
              <thead>
                <tr>
                  <th>追加</th>
                  <th>{t('fridge.table.ingredient')}</th>
                  <th>不足分</th>
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
                          checked={activeSelectedCandidateIds.has(key)}
                          disabled={item.alreadyAdded}
                          onChange={() => handleToggleCandidate(key)}
                        />
                      </td>
                      <td className="ingredient-name-cell">
                        <span className="ingredient-name">{item.name}</span>
                        {item.alreadyAdded ? (
                          <span className="shopping-item-badge">追加済み</span>
                        ) : null}
                      </td>
                      <td>{formatItemAmount(item)}</td>
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
            <p className="eyebrow">{t('shopping.memoEyebrow')}</p>
            <h2 id="shopping-manual-title">{t('shopping.addNewTitle')}</h2>
          </div>
        </div>
        <form onSubmit={handleAddManualItem}>
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
              <span>単位</span>
              <input
                type="text"
                value={manualForm.unit}
                placeholder="個 / 本 / 袋 / g / ml"
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
            <button type="submit" className="primary-button" disabled={isSaving}>
              <Icon name="plus" />
              <span>{isSaving ? '保存中...' : t('shopping.addBtn')}</span>
            </button>
          </div>
        </form>
      </section>

      {isSavedListDialogOpen ? (
        <div
          className="modal-backdrop"
          role="presentation"
          onClick={() => setIsSavedListDialogOpen(false)}
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
                <p className="eyebrow">保存済み</p>
                <h2 id="shopping-saved-dialog-title">
                  {t('shopping.loadListTitle')}
                </h2>
              </div>
              <button
                type="button"
                className="secondary-button"
                onClick={() => setIsSavedListDialogOpen(false)}
              >
                {t('common.close')}
              </button>
            </div>
            {savedLists.length === 0 ? (
              <p className="settings-section__description">
                {t('shopping.loadListEmpty')}
              </p>
            ) : (
              <ul className="shopping-saved-list">
                {savedLists.map((list) => (
                  <li
                    key={list.shoppingListId}
                    className={`shopping-saved-list__item ${
                      currentListId === list.shoppingListId ? 'is-active' : ''
                    }`}
                  >
                    <button
                      type="button"
                      className="shopping-saved-list__name"
                      onClick={() => void handleLoadList(list.shoppingListId)}
                      disabled={isSaving}
                    >
                      <span>{list.name}</span>
                      <small>
                        {t('shopping.itemCount', { count: list.itemCount })}
                        {list.checkedCount ? ` / 購入済み${list.checkedCount}` : ''}
                      </small>
                    </button>
                    <button
                      type="button"
                      className="danger-text-button"
                      onClick={() => void handleDeleteList(list.shoppingListId)}
                      disabled={isSaving}
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
