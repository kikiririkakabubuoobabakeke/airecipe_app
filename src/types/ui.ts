export type IconName =
  | 'spark'
  | 'basket'
  | 'camera'
  | 'list'
  | 'clock'
  | 'heart'
  | 'settings'
  | 'bell'
  | 'user'
  | 'message'
  | 'plus'
  | 'arrow'
  | 'volume'
  | 'play'
  | 'pause'
  | 'stop'
  | 'mic'
  | 'skipBack'
  | 'skipForward'
  | 'repeat'

export type FeatureTone =
  | 'green'
  | 'red'
  | 'yellow'
  | 'blue'
  | 'violet'
  | 'slate'

export type Feature = {
  title: string
  description: string
  action: string
  icon: IconName
  tone: FeatureTone
}

export type AppDestination =
  | 'home'
  | 'fridge'
  | 'history'
  | 'receipt'
  | 'recipe-generate'
  | 'ingredient-register'
  | 'test'
  | 'settings'
  | 'contact'
  | 'admin'
  | 'register'
  | 'login'
  | 'receipt-detail'
  | 'shopping-list'

export type Ingredient = {
  inventoryId?: number
  ingredientId?: number
  name: string
  amount: string
  status: string
  category?: string | null
  quantity?: number
  gram?: number
  expirationDate?: string | null
  bestBeforeDate?: string | null
  isOpened?: boolean
  memo?: string | null
}

export type Recipe = {
  historyId?: number
  recipeId?: string
  name: string
  meta: string
  tags: string[]
  cookTime?: number
  servings?: number
  difficulty?: string
  reason?: string
  cookProcess?: string
  cookedAt?: string
  createdAt?: string
  cookedCount?: number
  isCooked?: boolean
  isFavorite?: boolean
  steps?: string[]
  ingredients?: RecipeIngredientAmount[]
}

export type RecipeIngredientAmount = {
  ingredientId: number
  name: string
  amount: number
  unit: string
}

export type ReceiptIngredientCandidate = {
  id?: string
  name: string
  category: string
  quantity?: number | null
  gram?: number | null
  bestBeforeDate?: string | null
  expirationDate?: string | null
  memo?: string | null
  selected: boolean
  sourceLine?: string | null
}

export type RecipeModelChoice = 'gemini' | 'groq'

export type SeasoningMode = 'unlimited' | 'strict'

export type ShoppingListItem = {
  itemId?: string
  name: string
  category: string
  quantity: number | null
  gram: number | null
  unit: string | null
  memo: string | null
  checked: boolean
  sortOrder?: number
}

export type ShoppingListSummary = {
  shoppingListId: string
  name: string
  itemCount: number
  checkedCount?: number
  createdAt: string
  updatedAt: string
}

export type ShoppingList = ShoppingListSummary & {
  items: ShoppingListItem[]
}

export type UserPreferences = {
  defaultServings: number
  avoidedIngredients: string
  recipeModel: RecipeModelChoice
  displayLanguage: 'ja' | 'en' | 'fr'
  seasoningMode: SeasoningMode
  notifications: {
    expiration: boolean
    expirationLeadDays: number
  }
  voice: {
    enabled: boolean
  }
}
