import {
  useEffect,
  useState,
  useMemo,
  useDeferredValue,
  useRef,
  type FormEvent,
} from 'react'
import { Icon } from '../components/Icon'
import { useI18n } from '../lib/useI18n'
import { getCache, setCache } from '../lib/dataCache'
import {
  fetchInventory,
  fetchSavedRecipes,
  fetchCookingHistory,
} from '../lib/recipeApi'
import {
  createShoppingList,
  deleteShoppingList,
  fetchShoppingLists,
  fetchShoppingList,
} from '../lib/shoppingApi'
import type {
  AppDestination,
  Ingredient,
  Recipe,
  ShoppingListSummary,
} from '../types/ui'

type ShoppingItem = {
  id: string
  name: string
  category: string
  quantity: number | null
  gram: number | null
  isManual: boolean
  memo?: string
  checked: boolean
}

type ManualShoppingForm = {
  name: string
  category: string
  quantity: string
  gram: string
  memo: string
}

const emptyManualShoppingForm: ManualShoppingForm = {
  name: '',
  category: '',
  quantity: '',
  gram: '',
  memo: '',
}

function inferCategory(name: string): string {
  const n = name.toLowerCase()
  if (
    n.includes('肉') || n.includes('豚') || n.includes('牛') || n.includes('鶏') ||
    n.includes('卵') || n.includes('魚') || n.includes('鮭') || n.includes('サケ') ||
    n.includes('ソーセージ') || n.includes('ベーコン') || n.includes('ハム') ||
    n.includes('貝') || n.includes('エビ') || n.includes('カニ')
  ) {
    return '肉・卵・魚'
  }
  if (
    n.includes('キャベツ') || n.includes('レタス') || n.includes('トマト') ||
    n.includes('人参') || n.includes('にんじん') || n.includes('じゃがいも') ||
    n.includes('玉ねぎ') || n.includes('たまねぎ') || n.includes('ナス') ||
    n.includes('ピーマン') || n.includes('大根') || n.includes('だいこん') ||
    n.includes('白菜') || n.includes('はくさい') || n.includes('小松菜') ||
    n.includes('ねぎ') || n.includes('ネギ') || n.includes('きのこ') ||
    n.includes('しいたけ') || n.includes('しめじ') || n.includes('えのき') ||
    n.includes('野菜') || n.includes('ほうれん草')
  ) {
    return '野菜'
  }
  if (
    n.includes('りんご') || n.includes('リンゴ') || n.includes('バナナ') ||
    n.includes('みかん') || n.includes('ぶどう') || n.includes('グレープ') ||
    n.includes('レモン') || n.includes('もも') || n.includes('モモ') ||
    n.includes('いちご') || n.includes('イチゴ') || n.includes('メロン') ||
    n.includes('すいか') || n.includes('スイカ') || n.includes('キウイ') ||
    n.includes('梨') || n.includes('なし') || n.includes('ナシ') ||
    n.includes('オレンジ') || n.includes('フルーツ') || n.includes('果物')
  ) {
    return '果物'
  }
  if (
    n.includes('乳') || n.includes('ミルク') || n.includes('チーズ') ||
    n.includes('バター') || n.includes('ヨーグルト') || n.includes('クリーム')
  ) {
    return '乳製品'
  }
  if (
    n.includes('加工') || n.includes('缶') || n.includes('豆腐') ||
    n.includes('納豆') || n.includes('ちくわ') || n.includes('キムチ') ||
    n.includes('パスタ') || n.includes('米') || n.includes('パン') ||
    n.includes('麺') || n.includes('うどん') || n.includes('そば')
  ) {
    return '加工品'
  }
  return 'その他'
}

function compareCategoryNames(left: string, right: string, language: string) {
  if (left === 'その他' && right !== ' savory') return 1
  if (right === 'その他' && left !== 'その他') return -1
  return left.localeCompare(right, language)
}

function getShoppingItemKey(name: string) {
  return name.trim().toLowerCase()
}

const RECIPE_PAGE_SIZE = 12

export function ShoppingListPage({
  onNavigate,
}: {
  onNavigate: (page: AppDestination) => void
  onLogout?: () => void | Promise<void>
}) {
  const { language, t } = useI18n()

  const [fridgeIngredients, setFridgeIngredients] = useState<Ingredient[]>(() => {
    const cached = getCache<Ingredient[]>(`inventory:${language}`)
    return cached || []
  })
  const [recipes, setRecipes] = useState<Recipe[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [toastMessage, setToastMessage] = useState('')
  const toastTimerRef = useRef<number | null>(null)

  const [selectedRecipeIds, setSelectedRecipeIds] = useState<Set<string>>(() => new Set())
  const [isRecipeListOpen, setIsRecipeListOpen] = useState(true)
  const [visibleRecipeCount, setVisibleRecipeCount] = useState(RECIPE_PAGE_SIZE)

  const [manualItems, setManualItems] = useState<Omit<ShoppingItem, 'checked'>[]>([])
  const [savedLists, setSavedLists] = useState<ShoppingListSummary[]>([])
  const [isSaveModalOpen, setIsSaveModalOpen] = useState(false)
  const [isLoadModalOpen, setIsLoadModalOpen] = useState(false)
  const [saveListName, setSaveListName] = useState('')
  const [isShoppingListLoading, setIsShoppingListLoading] = useState(false)

  const [searchQuery, setSearchQuery] = useState('')
  const deferredSearchQuery = useDeferredValue(searchQuery)
  const [selectedCategories, setSelectedCategories] = useState<Set<string>>(() => new Set())
  const [isFilterOpen, setIsFilterOpen] = useState(false)

  const [isCategoryDropdownOpen, setIsCategoryDropdownOpen] = useState(false)

  const [checkedItemIds, setCheckedItemIds] = useState<Set<string>>(() => new Set())
  const [isSaving, setIsSaving] = useState(false)
  const [manualForm, setManualForm] = useState<ManualShoppingForm>(
    emptyManualShoppingForm,
  )

  useEffect(() => {
    return () => {
      if (toastTimerRef.current !== null) {
        window.clearTimeout(toastTimerRef.current)
        toastTimerRef.current = null
      }
    }
  }, [])

  function showToast(message: string) {
    if (toastTimerRef.current !== null) {
      window.clearTimeout(toastTimerRef.current)
    }

    setToastMessage(message)
    toastTimerRef.current = window.setTimeout(() => {
      setToastMessage('')
      toastTimerRef.current = null
    }, 2400)
  }

  useEffect(() => {
    let isMounted = true

    Promise.all([
      fetchInventory(language),
      fetchSavedRecipes(language),
      fetchCookingHistory(language),
    ])
      .then(([inventoryRes, savedRes, historyRes]) => {
        if (!isMounted) return

        const uniqueRecipesMap = new Map<string, Recipe>()
        const addRecipe = (r: Recipe) => {
          const key = r.recipeId || r.name
          if (key && !uniqueRecipesMap.has(key)) {
            uniqueRecipesMap.set(key, r)
          }
        }
        savedRes.recipes.forEach(addRecipe)
        historyRes.recipes.forEach(addRecipe)

        setFridgeIngredients(inventoryRes.inventory)
        setCache(`inventory:${language}`, inventoryRes.inventory)
        setRecipes(Array.from(uniqueRecipesMap.values()))
        setError(null)
        setLoading(false)
      })
      .catch((err) => {
        if (!isMounted) return
        setError(err instanceof Error ? err.message : t('fridge.fetchFailed'))
        setLoading(false)
      })

    return () => {
      isMounted = false
    }
  }, [language, t])

  useEffect(() => {
    // Clear legacy localStorage shopping data so stale lists don't reappear
    // when navigating back to this page.
    if (typeof window !== 'undefined') {
      window.localStorage.removeItem('ai-recipe-manual-shopping')
    }
  }, [])

  useEffect(() => {
    let isMounted = true

    fetchShoppingLists()
      .then((result) => {
        if (!isMounted) return
        setSavedLists(result.shoppingLists)
      })
      .catch((error) => {
        if (!isMounted) return
        console.warn('[vite] Failed to fetch shopping lists:', error)
      })

    return () => {
      isMounted = false
    }
  }, [])

  const shoppingItems = useMemo(() => {
    const requiredMap = new Map<string, { name: string; g: number; pcs: number; recipes: Set<string> }>()
    const manualItemKeys = new Set(
      manualItems.map((item) => getShoppingItemKey(item.name)),
    )

    recipes.forEach((recipe) => {
      const recipeKey = recipe.recipeId || recipe.name
      if (!recipeKey || !selectedRecipeIds.has(recipeKey)) return

      recipe.ingredients?.forEach((ing) => {
        const nameKey = ing.name.trim().toLowerCase()
        const existing = requiredMap.get(nameKey) || {
          name: ing.name,
          g: 0,
          pcs: 0,
          recipes: new Set<string>(),
        }
        existing.recipes.add(recipe.name)
        if (ing.unit === 'g') {
          existing.g += ing.amount
        } else {
          existing.pcs += ing.amount
        }
        requiredMap.set(nameKey, existing)
      })
    })

    const inventoryMap = new Map<string, { g: number; pcs: number; category: string }>()
    fridgeIngredients.forEach((ing) => {
      const nameKey = ing.name.trim().toLowerCase()
      const existing = inventoryMap.get(nameKey) || { g: 0, pcs: 0, category: ing.category || 'その他' }
      existing.g += ing.gram || 0
      existing.pcs += ing.quantity || 0
      if (ing.category && ing.category !== 'その他') {
        existing.category = ing.category
      }
      inventoryMap.set(nameKey, existing)
    })

    const autoGenerated: ShoppingItem[] = []
    requiredMap.forEach((req, nameKey) => {
      if (manualItemKeys.has(nameKey)) {
        return
      }

      const inv = inventoryMap.get(nameKey)
      const invG = inv ? inv.g : 0
      const invPcs = inv ? inv.pcs : 0

      const lackG = Math.max(0, req.g - invG)
      const lackPcs = Math.max(0, req.pcs - invPcs)

      if (lackG > 0 || lackPcs > 0) {
        const category = inv ? inv.category : inferCategory(req.name)
        const memo = Array.from(req.recipes).join(', ')

        autoGenerated.push({
          id: `auto-${nameKey}`,
          name: req.name,
          category,
          quantity: lackPcs > 0 ? Math.ceil(lackPcs) : null,
          gram: lackG > 0 ? Math.ceil(lackG) : null,
          isManual: false,
          memo: `${t('recipe.ingredientsEyebrow')}: ${memo}`,
          checked: checkedItemIds.has(`auto-${nameKey}`),
        })
      }
    })

    return [
      ...autoGenerated,
      ...manualItems.map((item) => ({
        ...item,
        checked: checkedItemIds.has(item.id),
      })),
    ]
  }, [recipes, selectedRecipeIds, fridgeIngredients, manualItems, checkedItemIds, t])

  const availableCategories = useMemo(() => {
    const existing = shoppingItems.map((item) => item.category?.trim() || 'その他')
    return Array.from(new Set(existing))
      .toSorted((left, right) => compareCategoryNames(left, right, language))
  }, [shoppingItems, language])

  const filteredShoppingItems = useMemo(() => {
    const search = deferredSearchQuery.trim().toLowerCase()
    const isCategoryAll = selectedCategories.size === 0

    return shoppingItems.filter((item) => {
      if (!isCategoryAll && !selectedCategories.has(item.category)) {
        return false
      }
      if (
        search &&
        !item.name.toLowerCase().includes(search) &&
        !item.category.toLowerCase().includes(search) &&
        !(item.memo ?? '').toLowerCase().includes(search)
      ) {
        return false
      }
      return true
    })
  }, [shoppingItems, deferredSearchQuery, selectedCategories])

  const groupedItems = useMemo(() => {
    return filteredShoppingItems.reduce(
      (groups, item) => {
        const cat = item.category || 'その他'
        groups[cat] ??= []
        groups[cat].push(item)
        return groups
      },
      {} as Record<string, ShoppingItem[]>,
    )
  }, [filteredShoppingItems])

  const isFilterActive = selectedCategories.size > 0 || searchQuery.trim() !== ''
  const selectedCandidateCount = shoppingItems.filter(
    (item) => item.checked && !item.isManual,
  ).length

  function toggleRecipeSelection(recipeId: string) {
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

  function toggleShoppingItem(itemId: string) {
    setCheckedItemIds((current) => {
      const next = new Set(current)
      if (next.has(itemId)) {
        next.delete(itemId)
      } else {
        next.add(itemId)
      }
      return next
    })
  }

  function updateManualForm<K extends keyof ManualShoppingForm>(
    key: K,
    value: ManualShoppingForm[K],
  ) {
    setManualForm((current) => ({
      ...current,
      [key]: value,
    }))
  }

  function handleAddManualItem(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()

    const name = manualForm.name.trim()

    if (!name) {
      showToast(t('shopping.nameRequired'))
      return
    }

    const quantity = manualForm.quantity
      ? Math.max(1, Math.round(Number(manualForm.quantity) || 1))
      : null
    const gram = manualForm.gram
      ? Math.max(1, Math.round(Number(manualForm.gram) || 1))
      : null
    const category = manualForm.category.trim() || inferCategory(name)
    const memo = manualForm.memo.trim() || undefined

    setManualItems((current) => [
      {
        id: `manual-${Date.now()}`,
        name,
        category,
        quantity,
        gram,
        isManual: true,
        memo,
      },
      ...current,
    ])
    setManualForm(emptyManualShoppingForm)
    showToast(t('shopping.addSuccess'))
  }

  function handleRemoveManualItem(itemId: string) {
    setManualItems((current) => current.filter((item) => item.id !== itemId))
    setCheckedItemIds((current) => {
      const next = new Set(current)
      next.delete(itemId)
      return next
    })
  }

  function handleAddCheckedToShoppingList() {
    const itemsToAdd = shoppingItems.filter((item) => item.checked && !item.isManual)
    if (itemsToAdd.length === 0) {
      showToast(t('shopping.addSelectedNone'))
      return
    }

    setIsSaving(true)

    setManualItems((current) => {
      const existingKeys = new Set(
        current.map((item) => getShoppingItemKey(item.name)),
      )
      const nextItems = itemsToAdd
        .filter((item) => !existingKeys.has(getShoppingItemKey(item.name)))
        .map((item, index) => ({
          id: `manual-${Date.now()}-${index}`,
          name: item.name,
          category: item.category,
          quantity: item.quantity,
          gram: item.gram,
          isManual: true,
          memo: item.memo,
        }))

      return [...nextItems, ...current]
    })

    setCheckedItemIds((current) => {
      const next = new Set(current)
      itemsToAdd.forEach((item) => next.delete(item.id))
      return next
    })

    showToast(t('shopping.moveSuccessAlert', { count: itemsToAdd.length }))
    setIsSaving(false)
  }

  function toggleCategoryFilter(category: string) {
    setSelectedCategories((current) => {
      const next = new Set(current)
      if (next.has(category)) {
        next.delete(category)
      } else {
        next.add(category)
      }
      return next
    })
  }

  function clearFilters() {
    setSelectedCategories(new Set())
    setSearchQuery('')
    setIsCategoryDropdownOpen(false)
  }

  async function handleSaveShoppingList(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()

    const name = saveListName.trim()
    if (!name) {
      showToast(t('shopping.nameRequired'))
      return
    }

    if (shoppingItems.length === 0) {
      showToast(t('shopping.addSelectedNone'))
      return
    }

    setIsShoppingListLoading(true)

    try {
      const result = await createShoppingList({
        name,
        items: shoppingItems.map((item) => ({
          name: item.name,
          category: item.category,
          quantity: item.quantity,
          gram: item.gram,
          memo: item.memo ?? null,
          checked: item.checked,
        })),
      })
      setSavedLists((current) =>
        [result.shoppingList, ...current].sort(
          (left, right) =>
            new Date(right.updatedAt).getTime() -
            new Date(left.updatedAt).getTime(),
        ),
      )
      setSaveListName('')
      setIsSaveModalOpen(false)
      showToast(t('shopping.saveSuccess'))
    } catch (error) {
      showToast(error instanceof Error ? error.message : t('shopping.saveFailed'))
    } finally {
      setIsShoppingListLoading(false)
    }
  }

  async function handleLoadShoppingList(shoppingListId: string) {
    setIsShoppingListLoading(true)

    try {
      const result = await fetchShoppingList(shoppingListId)
      const loadedItems = result.shoppingList.items.map((item, index) => ({
        id: item.itemId ?? `manual-${Date.now()}-${index}`,
        name: item.name,
        category: item.category,
        quantity: item.quantity,
        gram: item.gram,
        isManual: true,
        memo: item.memo ?? undefined,
      }))
      setManualItems(loadedItems)
      setCheckedItemIds(
        new Set(
          result.shoppingList.items
            .filter((item) => item.checked && item.itemId)
            .map((item) => item.itemId as string),
        ),
      )
      setIsLoadModalOpen(false)
      showToast(t('shopping.loadSuccess'))
    } catch (error) {
      showToast(error instanceof Error ? error.message : t('shopping.loadFailed'))
    } finally {
      setIsShoppingListLoading(false)
    }
  }

  async function handleDeleteSavedList(shoppingListId: string) {
    setIsShoppingListLoading(true)

    try {
      const result = await deleteShoppingList(shoppingListId)
      setSavedLists(result.shoppingLists)
      showToast(t('shopping.deleteSuccess'))
    } catch (error) {
      showToast(error instanceof Error ? error.message : t('shopping.deleteFailed'))
    } finally {
      setIsShoppingListLoading(false)
    }
  }

  function getCategoryLabel(category: string) {
    switch (category) {
      case '肉・卵・魚':
        return t('category.meatEggFish')
      case '野菜':
        return t('category.vegetable')
      case '果物':
        return t('category.fruit')
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

  if (loading) {
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

  if (error) {
    return (
      <main className="fridge-container shopping-page">
        <div className="fridge-header">
          <h1>{t('shopping.title')}</h1>
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
        <div className="fridge-error">
          <p>{error}</p>
          <button type="button" className="primary-button" onClick={() => window.location.reload()}>
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
          <p className="ingredient-detail-summary">
            {t('shopping.subtitle')}
          </p>
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
        <p className="settings-section__description">
          {t('shopping.memoDescription')}
        </p>
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
              <span>{t('fridge.form.memo')}</span>
              <input
                type="text"
                value={manualForm.memo}
                placeholder={t('shopping.memoPlaceholder')}
                onChange={(event) => updateManualForm('memo', event.target.value)}
              />
            </label>
            <button type="submit" className="primary-button">
              <Icon name="plus" />
              <span>{t('shopping.addBtn')}</span>
            </button>
          </div>
        </form>
      </section>

      <section className="shopping-panel shopping-recipe-panel">
        <button
          type="button"
          className="shopping-section-toggle"
          onClick={() => setIsRecipeListOpen(!isRecipeListOpen)}
        >
          <span>{t('recipeGenerate.title')} {selectedRecipeIds.size} {t('shopping.selectedRecipeText')}</span>
          <span className={`shopping-section-toggle__icon ${isRecipeListOpen ? 'is-open' : ''}`}>
            ▶
          </span>
        </button>
        {isRecipeListOpen && (
          <div className="shopping-recipe-panel__body">
            {recipes.length === 0 ? (
              <p className="empty-state">
                {t('history.empty')}
              </p>
            ) : (
              <>
                <div className="shopping-recipe-grid card-stagger">
                  {recipes.slice(0, visibleRecipeCount).map((recipe) => {
                    const key = recipe.recipeId || recipe.name
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
                          onChange={() => toggleRecipeSelection(key)}
                        />
                        <span className="ingredient-name">
                          {recipe.name}
                        </span>
                      </label>
                    )
                  })}
                </div>
                {visibleRecipeCount < recipes.length && (
                  <div className="shopping-recipe-more">
                    <button
                      type="button"
                      className="primary-button"
                      onClick={() =>
                        setVisibleRecipeCount((current) =>
                          Math.min(current + RECIPE_PAGE_SIZE, recipes.length),
                        )
                      }
                    >
                      <span>{t('shopping.showMore', {
                        remaining: recipes.length - visibleRecipeCount,
                      })}</span>
                      <span style={{ display: 'inline-flex', transform: 'rotate(90deg)' }}>
                        <Icon name="arrow" />
                      </span>
                    </button>
                  </div>
                )}
              </>
            )}
          </div>
        )}
      </section>

      <section className="fridge-filter-panel shopping-filter-panel" aria-label={t('fridge.filter.title')}>
        <div className="fridge-filter-bar">
          <label className="fridge-search-field">
            <span>{t('fridge.filter.search')}</span>
            <input
              type="search"
              placeholder={t('shopping.searchPlaceholder')}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </label>
          <button
            type="button"
            className={`secondary-button fridge-filter-toggle ${isFilterActive ? 'is-active' : ''}`}
            aria-expanded={isFilterOpen}
            onClick={() => setIsFilterOpen((current) => !current)}
          >
            {t('fridge.filter.open')}
          </button>
        </div>

        {isFilterOpen ? (
          <div className="fridge-filter-options">
            <fieldset className="fridge-filter-group">
              <legend>{t('fridge.filter.category')}</legend>
              <div className="fridge-category-dropdown">
                <button
                  type="button"
                  className="secondary-button fridge-category-dropdown__trigger"
                  aria-expanded={isCategoryDropdownOpen}
                  onClick={() =>
                    setIsCategoryDropdownOpen((current) => !current)
                  }
                >
                  <span>
                    {selectedCategories.size === 0
                      ? t('fridge.filter.categoryAll')
                      : t('fridge.filter.categorySelected', {
                        count: selectedCategories.size,
                      })}
                  </span>
                </button>
                {isCategoryDropdownOpen ? (
                  <div className="fridge-category-dropdown__menu">
                    <p>{t('fridge.filter.categoryHint')}</p>
                    {availableCategories.map((category) => (
                      <label key={category} className="fridge-category-option">
                        <input
                          type="checkbox"
                          checked={selectedCategories.has(category)}
                          onChange={() => toggleCategoryFilter(category)}
                        />
                        <span>{getCategoryLabel(category)}</span>
                      </label>
                    ))}
                  </div>
                ) : null}
              </div>
            </fieldset>

            <button
              type="button"
              className="secondary-button"
              onClick={clearFilters}
              disabled={!isFilterActive}
            >
              {t('fridge.filter.clear')}
            </button>
          </div>
        ) : null}
      </section>

      {selectedCandidateCount > 0 && (
        <div
          className="fridge-bulk-actions shopping-bulk-actions"
        >
          <span>
            {t('shopping.selectedItemsText', { count: selectedCandidateCount })}
          </span>
          <button
            type="button"
            className="primary-button"
            disabled={isSaving}
            onClick={handleAddCheckedToShoppingList}
          >
            {isSaving ? t('common.saving') : t('shopping.moveToFridgeBtn')}
          </button>
        </div>
      )}

      <div className="section-heading shopping-list-heading">
        <div>
          <p className="eyebrow">{t('shopping.memoEyebrow')}</p>
          <h2>{t('shopping.listTitle')}</h2>
          <p className="settings-section__description shopping-list-heading__description">
            {t('shopping.markBoughtHint')}
          </p>
        </div>
        <div className="shopping-list-actions">
          <button
            type="button"
            className="secondary-button"
            onClick={() => setIsLoadModalOpen(true)}
          >
            {t('shopping.loadListBtn')}
          </button>
          <button
            type="button"
            className="primary-button"
            onClick={() => setIsSaveModalOpen(true)}
          >
            {t('shopping.saveListBtn')}
          </button>
        </div>
      </div>

      {shoppingItems.length === 0 ? (
        <div className="fridge-error">
          <p>{t('shopping.empty')}</p>
        </div>
      ) : filteredShoppingItems.length === 0 ? (
        <div className="fridge-error">
          <p>{t('fridge.filter.noResults')}</p>
        </div>
      ) : (
        <div className="fridge-tables">
          {availableCategories.map((category) => {
            const items = groupedItems[category]
            if (!items || items.length === 0) return null

            return (
              <div key={category} className="category-table-wrapper">
                <h3 className="category-title">{getCategoryLabel(category)}</h3>
                <div className="table-container">
                  <table className="fridge-table shopping-table">
                    <thead>
                      <tr>
                        <th aria-label={t('history.selection.item')}></th>
                        <th>{t('fridge.table.ingredient')}</th>
                        <th>{t('fridge.form.quantity')}</th>
                        <th>{t('fridge.form.gram')}</th>
                        <th>{t('fridge.table.memo')}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {items.map((item) => (
                        <tr
                          key={item.id}
                          className={item.checked ? 'near-expiration-row' : ''}
                          onClick={() => toggleShoppingItem(item.id)}
                        >
                          <td className="shopping-table__check">
                            <input
                              type="checkbox"
                              aria-label={t('fridge.selection.selectAria', { name: item.name })}
                              checked={item.checked}
                              onClick={(event) => event.stopPropagation()}
                              onChange={() => toggleShoppingItem(item.id)}
                            />
                          </td>
                          <td className="ingredient-name-cell">
                            <span className="ingredient-name">{item.name}</span>
                            {item.isManual && (
                              <span className="shopping-item-badge">
                                {t('receipt.candidatesEyebrow')}
                              </span>
                            )}
                          </td>
                          <td>
                            {item.quantity ? t('shopping.amountText', { amount: item.quantity }) : '-'}
                          </td>
                          <td>
                            {item.gram ? t('shopping.weightText', { weight: item.gram }) : '-'}
                          </td>
                          <td className="shopping-table__memo">
                            <span>{item.memo || '-'}</span>
                            {item.isManual ? (
                              <button
                                type="button"
                                className="secondary-button shopping-item-delete-button"
                                onClick={(event) => {
                                  event.stopPropagation()
                                  handleRemoveManualItem(item.id)
                                }}
                              >
                                {t('shopping.deleteBtn')}
                              </button>
                            ) : null}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )
          })}
        </div>
      )}
      {isSaveModalOpen && (
        <div
          className="modal-backdrop"
          role="presentation"
          onClick={(event) => {
            if (event.target === event.currentTarget) {
              setIsSaveModalOpen(false)
            }
          }}
        >
          <div className="cook-modal">
            <h2>{t('shopping.saveListTitle')}</h2>
            <p className="settings-section__description">
              {t('shopping.saveListDescription', { count: shoppingItems.length })}
            </p>
            <form onSubmit={handleSaveShoppingList}>
              <label className="serving-field">
                <span>{t('shopping.saveListNameLabel')}</span>
                <input
                  type="text"
                  value={saveListName}
                  placeholder={t('shopping.saveListNamePlaceholder')}
                  onChange={(event) => setSaveListName(event.target.value)}
                  disabled={isShoppingListLoading}
                />
              </label>
              <div className="modal-actions">
                <button
                  type="button"
                  className="secondary-button"
                  onClick={() => setIsSaveModalOpen(false)}
                  disabled={isShoppingListLoading}
                >
                  {t('common.cancel')}
                </button>
                <button
                  type="submit"
                  className="primary-button"
                  disabled={isShoppingListLoading}
                >
                  {isShoppingListLoading ? t('common.saving') : t('shopping.saveListBtn')}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {isLoadModalOpen && (
        <div
          className="modal-backdrop"
          role="presentation"
          onClick={(event) => {
            if (event.target === event.currentTarget) {
              setIsLoadModalOpen(false)
            }
          }}
        >
          <div className="cook-modal">
            <h2>{t('shopping.loadListTitle')}</h2>
            {savedLists.length === 0 ? (
              <p className="settings-section__description">
                {t('shopping.loadListEmpty')}
              </p>
            ) : (
              <ul className="shopping-saved-list">
                {savedLists.map((list) => (
                  <li key={list.shoppingListId} className="shopping-saved-list__item">
                    <button
                      type="button"
                      className="shopping-saved-list__name"
                      onClick={() => handleLoadShoppingList(list.shoppingListId)}
                      disabled={isShoppingListLoading}
                    >
                      <span>{list.name}</span>
                      <small>
                        {t('shopping.itemCount', { count: list.itemCount })}
                      </small>
                    </button>
                    <button
                      type="button"
                      className="danger-text-button"
                      onClick={() => handleDeleteSavedList(list.shoppingListId)}
                      disabled={isShoppingListLoading}
                    >
                      {t('shopping.deleteBtn')}
                    </button>
                  </li>
                ))}
              </ul>
            )}
            <div className="modal-actions">
              <button
                type="button"
                className="secondary-button"
                onClick={() => setIsLoadModalOpen(false)}
                disabled={isShoppingListLoading}
              >
                {t('common.close')}
              </button>
            </div>
          </div>
        </div>
      )}

      {toastMessage ? (
        <div className="toast-message" role="status">
          {toastMessage}
        </div>
      ) : null}
    </main>
  )
}
