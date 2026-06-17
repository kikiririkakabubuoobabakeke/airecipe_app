import {
  Suspense,
  lazy,
  useCallback,
  useEffect,
  useRef,
  useState,
  type MutableRefObject,
} from 'react'
import './App.css'

if (import.meta.env.DEV) {
  void import('./lib/supabase')
  void import('./lib/groq')
  void import('./lib/gemini')
}
import { PageShell } from './components/PageShell'
import { preloadAllPageData } from './lib/preload'
import {
  createSessionFromOAuthTokens,
  getCurrentUser,
  logout,
  type AuthTokenPair,
  type AuthUser,
} from './lib/authApi'
import type {
  AppDestination,
  Recipe,
  ReceiptIngredientCandidate,
} from './types/ui'
import type { RecipeFilter } from './pages/CookingHistoryPage'

type Page = AppDestination | 'recipe' | 'receipt-detail'

type OAuthSessionRequest = {
  key: string
  promise: ReturnType<typeof createSessionFromOAuthTokens>
}

const loadHomePage = () => import('./pages/HomePage')
const loadFridgePage = () => import('./pages/FridgePage')
const loadRecipeDetailPage = () => import('./pages/RecipeDetailPage')
const loadCookingHistoryPage = () => import('./pages/CookingHistoryPage')
const loadReceiptScanPage = () => import('./pages/ReceiptScanPage')
const loadGeminiTestPage = () => import('./pages/GeminiTestPage')
const loadIngredientRegisterPage = () =>
  import('./pages/IngredientRegisterPage')
const loadReceiptDetailRegisterPage = () =>
  import('./pages/ReceiptDetailRegisterPage')
const loadSettingsPage = () => import('./pages/SettingsPage')
const loadContactPage = () => import('./pages/ContactPage')
const loadAdminConsolePage = () => import('./pages/AdminConsolePage')
const loadRecipeGeneratePage = () => import('./pages/RecipeGeneratePage')
const loadLoginScreen = () => import('./pages/LoginScreen')
const loadRegisterPage = () => import('./pages/RegisterPage')

const HomePage = lazy(() =>
  loadHomePage().then((m) => ({ default: m.HomePage })),
)
const FridgePage = lazy(() =>
  loadFridgePage().then((m) => ({ default: m.FridgePage })),
)
const RecipeDetailPage = lazy(() =>
  loadRecipeDetailPage().then((m) => ({
    default: m.RecipeDetailPage,
  })),
)
const CookingHistoryPage = lazy(() =>
  loadCookingHistoryPage().then((m) => ({
    default: m.CookingHistoryPage,
  })),
)
const ReceiptScanPage = lazy(() =>
  loadReceiptScanPage().then((m) => ({
    default: m.ReceiptScanPage,
  })),
)
const GeminiTestPage = lazy(() =>
  loadGeminiTestPage().then((m) => ({ default: m.GeminiTestPage })),
)
const IngredientRegisterPage = lazy(() =>
  loadIngredientRegisterPage().then((m) => ({
    default: m.IngredientRegisterPage,
  })),
)
const ReceiptDetailRegisterPage = lazy(() =>
  loadReceiptDetailRegisterPage().then((m) => ({
    default: m.ReceiptDetailRegisterPage,
  })),
)
const SettingsPage = lazy(() =>
  loadSettingsPage().then((m) => ({ default: m.SettingsPage })),
)
const ContactPage = lazy(() =>
  loadContactPage().then((m) => ({ default: m.ContactPage })),
)
const AdminConsolePage = lazy(() =>
  loadAdminConsolePage().then((m) => ({
    default: m.AdminConsolePage,
  })),
)
const RecipeGeneratePage = lazy(() =>
  loadRecipeGeneratePage().then((m) => ({
    default: m.RecipeGeneratePage,
  })),
)
const LoginScreen = lazy(loadLoginScreen)
const RegisterPage = lazy(loadRegisterPage)

const PAGE_FALLBACK = (
  <div className="page-loading" aria-label="Loading page..." />
)

type WindowWithIdleCallback = Window &
  typeof globalThis & {
    requestIdleCallback?: (
      callback: () => void,
      options?: { timeout?: number },
    ) => number
    cancelIdleCallback?: (handle: number) => void
  }

function scheduleAfterInitialPaint(callback: () => void) {
  if (typeof window === 'undefined') {
    callback()
    return () => undefined
  }

  const idleWindow = window as WindowWithIdleCallback
  let idleHandle: number | null = null
  let fallbackHandle: number | null = null

  const startHandle = window.setTimeout(() => {
    if (idleWindow.requestIdleCallback) {
      idleHandle = idleWindow.requestIdleCallback(callback, { timeout: 4000 })
      return
    }

    fallbackHandle = window.setTimeout(callback, 900)
  }, 700)

  return () => {
    window.clearTimeout(startHandle)

    if (idleHandle !== null && idleWindow.cancelIdleCallback) {
      idleWindow.cancelIdleCallback(idleHandle)
    }

    if (fallbackHandle !== null) {
      window.clearTimeout(fallbackHandle)
    }
  }
}

function preloadAuthenticatedRouteModules() {
  const primaryLoaders = [
    loadHomePage,
    loadFridgePage,
    loadRecipeGeneratePage,
    loadIngredientRegisterPage,
    loadCookingHistoryPage,
  ]
  const secondaryLoaders = [
    loadSettingsPage,
    loadContactPage,
    loadReceiptScanPage,
    loadRecipeDetailPage,
  ]

  primaryLoaders.forEach((loader) => {
    void loader()
  })

  window.setTimeout(() => {
    secondaryLoaders.forEach((loader) => {
      void loader()
    })
  }, 1800)
}

function getPageFromPath(): AppDestination {
  switch (window.location.pathname) {
    case '/fridge':
      return 'fridge'
    case '/history':
      return 'history'
    case '/receipt':
      return 'receipt'
    case '/recipe-generate':
      return 'recipe-generate'
    case '/ingredient-register':
      return 'ingredient-register'
    case '/receipt-detail':
      return 'receipt-detail'
    case '/test':
      return 'test'
    case '/login':
      return 'login'
    case '/register':
      return 'register'
    case '/settings':
      return 'settings'
    case '/contact':
      return 'contact'
    case '/admin':
      return 'admin'
    default:
      return 'home'
  }
}

function getPathForPage(page: AppDestination) {
  return page === 'home' ? '/' : `/${page}`
}

function replacePath(path: string) {
  if (window.location.pathname !== path || window.location.hash) {
    window.history.replaceState({}, '', path)
  }
}

function pushPath(path: string) {
  if (window.location.pathname !== path || window.location.hash) {
    window.history.pushState({}, '', path)
  }
}

function readOAuthTokensFromUrl() {
  const hash = window.location.hash.startsWith('#')
    ? window.location.hash.slice(1)
    : ''
  const query = window.location.search.startsWith('?')
    ? window.location.search.slice(1)
    : ''

  for (const source of [hash, query]) {
    if (!source) {
      continue
    }

    const params = new URLSearchParams(source)
    const accessToken = params.get('access_token')
    const refreshToken = params.get('refresh_token')
    const type = params.get('type')

    if (!accessToken || !refreshToken) {
      continue
    }

    return {
      accessToken,
      refreshToken,
      type,
    }
  }

  return null
}

function createOAuthSessionOnce(
  ref: MutableRefObject<OAuthSessionRequest | null>,
  tokens: { accessToken: string; refreshToken: string },
) {
  const key = `${tokens.accessToken}:${tokens.refreshToken}`

  if (!ref.current || ref.current.key !== key) {
    ref.current = {
      key,
      promise: createSessionFromOAuthTokens(tokens),
    }
  }

  return ref.current.promise
}

function namesToReceiptCandidates(names: string[]): ReceiptIngredientCandidate[] {
  return names.map((name, index) => ({
    id: `manual-${index}`,
    name,
    category: 'その他',
    quantity: 1,
    gram: null,
    selected: true,
  }))
}

function App() {
  const [currentPage, setCurrentPage] = useState<Page>(getPageFromPath)
  const [currentUser, setCurrentUser] = useState<AuthUser | null>(null)
  const [isAuthLoading, setIsAuthLoading] = useState(true)
  const [selectedRecipe, setSelectedRecipe] = useState<Recipe | null>(null)
  const [recipeBackPage, setRecipeBackPage] = useState<AppDestination>('home')
  const [historyInitialFilter, setHistoryInitialFilter] =
    useState<RecipeFilter>('all')
  const [selectedReceiptItems, setSelectedReceiptItems] = useState<
    ReceiptIngredientCandidate[]
  >([])
  const [receiptDetailBackPage, setReceiptDetailBackPage] =
    useState<AppDestination>('receipt')
  const [passwordResetTokens, setPasswordResetTokens] =
    useState<AuthTokenPair | null>(null)
  const oauthSessionRequestRef = useRef<OAuthSessionRequest | null>(null)
  const hasPreloaded = useRef(false)

  useEffect(() => {
    if (currentUser && !hasPreloaded.current) {
      hasPreloaded.current = true
      return scheduleAfterInitialPaint(() => {
        preloadAuthenticatedRouteModules()
        void preloadAllPageData()
      })
    }

    return undefined
  }, [currentUser])

  useEffect(() => {
    let isMounted = true

    async function initializeAuth() {
      const oauthTokens = readOAuthTokensFromUrl()

      try {
        if (oauthTokens) {
          if (oauthTokens.type === 'recovery') {
            if (!isMounted) {
              return
            }

            setPasswordResetTokens({
              accessToken: oauthTokens.accessToken,
              refreshToken: oauthTokens.refreshToken,
            })
            setCurrentUser(null)
            replacePath('/login')
            setCurrentPage('login')
            setIsAuthLoading(false)
            return
          }

          const result = await createOAuthSessionOnce(
            oauthSessionRequestRef,
            oauthTokens,
          )

          if (!isMounted) {
            return
          }

          setCurrentUser(result.user)
          setPasswordResetTokens(null)
          replacePath('/')
          setCurrentPage('home')
          setIsAuthLoading(false)
          return
        }

        const result = await getCurrentUser()

        if (!isMounted) {
          return
        }

        setCurrentUser(result.user)
        setPasswordResetTokens(null)

        if (
          window.location.pathname === '/login' ||
          window.location.pathname === '/register'
        ) {
          replacePath('/')
          setCurrentPage('home')
        }
        setIsAuthLoading(false)
      } catch {
        if (!isMounted) {
          return
        }

        setCurrentUser(null)
        if (window.location.pathname === '/register') {
          replacePath('/register')
          setCurrentPage('register')
        } else {
          replacePath('/login')
          setCurrentPage('login')
        }
        setIsAuthLoading(false)
      }
    }

    void initializeAuth()

    return () => {
      isMounted = false
    }
  }, [])

  useEffect(() => {
    function handlePopState() {
      const nextPage = getPageFromPath()

      if (!currentUser && nextPage !== 'login' && nextPage !== 'register') {
        replacePath('/login')
        setCurrentPage('login')
        return
      }

      setCurrentPage(nextPage)
    }

    window.addEventListener('popstate', handlePopState)

    return () => window.removeEventListener('popstate', handlePopState)
  }, [currentUser])

  const handleNavigate = useCallback(
    (page: AppDestination) => {
      if (!currentUser && page !== 'login' && page !== 'register') {
        pushPath('/login')
        setCurrentPage('login')
        return
      }

      pushPath(getPathForPage(page))

      if (page === 'history') {
        setHistoryInitialFilter('all')
      }

      setCurrentPage(page)
    },
    [currentUser],
  )

  const handleNavigateToFavoriteHistory = useCallback(() => {
    if (!currentUser) {
      handleNavigate('login')
      return
    }

    setHistoryInitialFilter('favorite')
    pushPath('/history')
    setCurrentPage('history')
  }, [currentUser, handleNavigate])

  const handleAuthenticated = useCallback((user: AuthUser) => {
    setCurrentUser(user)
    setPasswordResetTokens(null)
    replacePath('/')
    setCurrentPage('home')
  }, [])

  const handleLogout = useCallback(async () => {
    await logout().catch((error) => {
      console.warn('[vite] Logout failed:', error)
    })
    setCurrentUser(null)
    setSelectedRecipe(null)
    setPasswordResetTokens(null)
    replacePath('/login')
    setCurrentPage('login')
  }, [])

  const handleSelectRecipe = useCallback(
    (recipe: Recipe) => {
      if (!currentUser) {
        handleNavigate('login')
        return
      }

      setRecipeBackPage(
        currentPage === 'history'
          ? 'history'
          : currentPage === 'recipe-generate'
            ? 'recipe-generate'
            : 'home',
      )
      setSelectedRecipe(recipe)
      setCurrentPage('recipe')
    },
    [currentPage, currentUser, handleNavigate],
  )

  const handleContinueIngredientRegister = useCallback(
    (names: string[]) => {
      setSelectedReceiptItems(namesToReceiptCandidates(names))
      setReceiptDetailBackPage('ingredient-register')
      handleNavigate('receipt-detail')
    },
    [handleNavigate],
  )

  const handleContinueIngredientRegisterCandidates = useCallback(
    (items: ReceiptIngredientCandidate[]) => {
      setSelectedReceiptItems(items)
      setReceiptDetailBackPage('ingredient-register')
      handleNavigate('receipt-detail')
    },
    [handleNavigate],
  )

  const handleNavigateToRegister = useCallback(() => {
    pushPath('/register')
    setCurrentPage('register')
  }, [])

  const handleNavigateToLogin = useCallback(() => {
    pushPath('/login')
    setCurrentPage('login')
  }, [])

  const handleProceedToDetail = useCallback(
    (items: ReceiptIngredientCandidate[]) => {
      setSelectedReceiptItems(items)
      setReceiptDetailBackPage('receipt')
      handleNavigate('receipt-detail')
    },
    [handleNavigate],
  )

  const handleRecipeBack = useCallback(() => {
    setCurrentPage(recipeBackPage)
  }, [recipeBackPage])

  const handleReceiptDetailBack = useCallback(() => {
    handleNavigate(receiptDetailBackPage)
  }, [handleNavigate, receiptDetailBackPage])

  if (isAuthLoading) {
    return PAGE_FALLBACK
  }

  if (!currentUser) {
    if (currentPage === 'register') {
      return (
        <Suspense fallback={PAGE_FALLBACK}>
          <RegisterPage
            onAuthenticated={handleAuthenticated}
            onNavigateToLogin={handleNavigateToLogin}
          />
        </Suspense>
      )
    }

    return (
      <Suspense fallback={PAGE_FALLBACK}>
        <LoginScreen
          passwordResetTokens={passwordResetTokens}
          onAuthenticated={handleAuthenticated}
          onNavigateToRegister={handleNavigateToRegister}
        />
      </Suspense>
    )
  }

  let pageNode: React.ReactNode
  const shell = (children: React.ReactNode) => (
    <PageShell currentPage={currentPage} onNavigate={handleNavigate} onLogout={handleLogout}>
      {children}
    </PageShell>
  )
  switch (currentPage) {
    case 'fridge':
      pageNode = <FridgePage onNavigate={handleNavigate} onLogout={handleLogout} />
      break
    case 'history':
      pageNode = (
        <CookingHistoryPage
          onNavigate={handleNavigate}
          onSelectRecipe={handleSelectRecipe}
          onLogout={handleLogout}
          initialFilter={historyInitialFilter}
        />
      )
      break
    case 'receipt':
      pageNode = (
        <ReceiptScanPage
          onNavigate={handleNavigate}
          onLogout={handleLogout}
          onProceedToDetail={handleProceedToDetail}
        />
      )
      break
    case 'recipe-generate':
      pageNode = (
        <RecipeGeneratePage
          onNavigate={handleNavigate}
          onSelectRecipe={handleSelectRecipe}
          onLogout={handleLogout}
        />
      )
      break
    case 'ingredient-register':
      pageNode = (
        <IngredientRegisterPage
          onNavigate={handleNavigate}
          onLogout={handleLogout}
          onContinue={handleContinueIngredientRegister}
          onContinueCandidates={handleContinueIngredientRegisterCandidates}
        />
      )
      break
    case 'receipt-detail':
      pageNode = (
        <ReceiptDetailRegisterPage
          items={selectedReceiptItems}
          onBack={handleReceiptDetailBack}
          onNavigate={handleNavigate}
          onLogout={handleLogout}
        />
      )
      break
    case 'test':
      pageNode = (
        <GeminiTestPage onNavigate={handleNavigate} onLogout={handleLogout} />
      )
      break
    case 'settings':
      pageNode = (
        <SettingsPage
          user={currentUser}
          onNavigate={handleNavigate}
        />
      )
      break
    case 'contact':
      pageNode = (
        <ContactPage onNavigate={handleNavigate} onLogout={handleLogout} />
      )
      break
    case 'admin':
      pageNode = (
        <AdminConsolePage
          user={currentUser}
          onNavigate={handleNavigate}
          onLogout={handleLogout}
        />
      )
      break
    case 'recipe':
      pageNode = selectedRecipe ? (
        <RecipeDetailPage
          recipe={selectedRecipe}
          onBack={handleRecipeBack}
          onNavigate={handleNavigate}
          onLogout={handleLogout}
        />
      ) : (
        <HomePage
          onNavigate={handleNavigate}
          onSelectRecipe={handleSelectRecipe}
          onLogout={handleLogout}
          onShowFavorites={handleNavigateToFavoriteHistory}
        />
      )
      break
    case 'login':
    case 'home':
    default:
      pageNode = (
        <HomePage
          onNavigate={handleNavigate}
          onSelectRecipe={handleSelectRecipe}
          onLogout={handleLogout}
          onShowFavorites={handleNavigateToFavoriteHistory}
        />
      )
  }

  return <Suspense fallback={PAGE_FALLBACK}>{shell(pageNode)}</Suspense>
}

export default App
