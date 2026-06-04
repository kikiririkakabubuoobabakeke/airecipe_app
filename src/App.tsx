import { useEffect, useState } from 'react'
import './lib/supabase'
import './lib/groq'
import './App.css'
import { HomePage } from './pages/HomePage'
import { FridgePage } from './pages/FridgePage'
import { RecipeDetailPage } from './pages/RecipeDetailPage'
import { CookingHistoryPage } from './pages/CookingHistoryPage'
import { ReceiptScanPage } from './pages/ReceiptScanPage'
import { GeminiTestPage } from './pages/GeminiTestPage'
import { ReceiptDetailRegisterPage } from './pages/ReceiptDetailRegisterPage'
import { SettingsPage } from './pages/SettingsPage'
import LoginScreen from './pages/LoginScreen'
import {
  createSessionFromOAuthTokens,
  getCurrentUser,
  logout,
  type AuthTokenPair,
  type AuthUser,
} from './lib/authApi'
import type { AppDestination, Recipe, ReceiptIngredientCandidate } from './types/ui'

type Page = AppDestination | 'recipe' | 'receipt-detail'

let oauthSessionRequest: {
  key: string
  promise: ReturnType<typeof createSessionFromOAuthTokens>
} | null = null

function getPageFromPath(): AppDestination {
  if (window.location.pathname === '/fridge') {
    return 'fridge'
  }

  if (window.location.pathname === '/history') {
    return 'history'
  }

  if (window.location.pathname === '/receipt') {
    return 'receipt'
  }

  if (window.location.pathname === '/test') {
    return 'test'
  }

  if (window.location.pathname === '/login') {
    return 'login'
  }

  if (window.location.pathname === '/settings') {
    return 'settings'
  }

  return 'home'
}

function getPathForPage(page: AppDestination) {
  if (page === 'home') {
    return '/'
  }

  return `/${page}`
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

function readOAuthTokensFromHash() {
  const hash = window.location.hash.startsWith('#')
    ? window.location.hash.slice(1)
    : ''

  if (!hash) {
    return null
  }

  const params = new URLSearchParams(hash)
  const accessToken = params.get('access_token')
  const refreshToken = params.get('refresh_token')
  const type = params.get('type')

  if (!accessToken || !refreshToken) {
    return null
  }

  return {
    accessToken,
    refreshToken,
    type,
  }
}

function createOAuthSessionOnce(tokens: {
  accessToken: string
  refreshToken: string
}) {
  const key = `${tokens.accessToken}:${tokens.refreshToken}`

  if (!oauthSessionRequest || oauthSessionRequest.key !== key) {
    oauthSessionRequest = {
      key,
      promise: createSessionFromOAuthTokens(tokens),
    }
  }

  return oauthSessionRequest.promise
}

function App() {
  const [currentPage, setCurrentPage] = useState<Page>(getPageFromPath)
  const [currentUser, setCurrentUser] = useState<AuthUser | null>(null)
  const [isAuthLoading, setIsAuthLoading] = useState(true)
  const [selectedRecipe, setSelectedRecipe] = useState<Recipe | null>(null)
  const [recipeBackPage, setRecipeBackPage] = useState<AppDestination>('home')
  const [selectedReceiptItems, setSelectedReceiptItems] = useState<ReceiptIngredientCandidate[]>([])
  const [passwordResetTokens, setPasswordResetTokens] =
    useState<AuthTokenPair | null>(null)

  useEffect(() => {
    let isMounted = true

    async function initializeAuth() {
      const oauthTokens = readOAuthTokensFromHash()

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
            return
          }

          const result = await createOAuthSessionOnce(oauthTokens)

          if (!isMounted) {
            return
          }

          setCurrentUser(result.user)
          setPasswordResetTokens(null)
          replacePath('/')
          setCurrentPage('home')
          return
        }

        const result = await getCurrentUser()

        if (!isMounted) {
          return
        }

        setCurrentUser(result.user)
        setPasswordResetTokens(null)

        if (window.location.pathname === '/login') {
          replacePath('/')
          setCurrentPage('home')
        }
      } catch {
        if (!isMounted) {
          return
        }

        setCurrentUser(null)
        replacePath('/login')
        setCurrentPage('login')
      } finally {
        if (isMounted) {
          setIsAuthLoading(false)
        }
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

      if (!currentUser && nextPage !== 'login') {
        replacePath('/login')
        setCurrentPage('login')
        return
      }

      setCurrentPage(nextPage)
    }

    window.addEventListener('popstate', handlePopState)

    return () => window.removeEventListener('popstate', handlePopState)
  }, [currentUser])

  function handleNavigate(page: AppDestination) {
    if (!currentUser && page !== 'login') {
      pushPath('/login')
      setCurrentPage('login')
      return
    }

    pushPath(getPathForPage(page))

    setCurrentPage(page)
  }

  function handleAuthenticated(user: AuthUser) {
    setCurrentUser(user)
    setPasswordResetTokens(null)
    replacePath('/')
    setCurrentPage('home')
  }

  async function handleLogout() {
    await logout().catch((error) => {
      console.warn('[vite] Logout failed:', error)
    })
    setCurrentUser(null)
    setSelectedRecipe(null)
    setPasswordResetTokens(null)
    replacePath('/login')
    setCurrentPage('login')
  }

  function handleSelectRecipe(recipe: Recipe) {
    if (!currentUser) {
      handleNavigate('login')
      return
    }

    setRecipeBackPage(currentPage === 'history' ? 'history' : 'home')
    setSelectedRecipe(recipe)
    setCurrentPage('recipe')
  }

  if (isAuthLoading) {
    return null
  }

  if (!currentUser) {
    return (
      <LoginScreen
        passwordResetTokens={passwordResetTokens}
        onAuthenticated={handleAuthenticated}
      />
    )
  }

  if (currentPage === 'fridge') {
    return <FridgePage onNavigate={handleNavigate} onLogout={handleLogout} />
  }

  if (currentPage === 'history') {
    return (
      <CookingHistoryPage
        onNavigate={handleNavigate}
        onSelectRecipe={handleSelectRecipe}
        onLogout={handleLogout}
      />
    )
  }

  if (currentPage === 'receipt') {
    return (
      <ReceiptScanPage
        onNavigate={handleNavigate}
        onLogout={handleLogout}
        onProceedToDetail={(items: ReceiptIngredientCandidate[]) => {
          setSelectedReceiptItems(items)
          handleNavigate('receipt-detail')
        }}
      />
    )
  }

  if (currentPage === 'receipt-detail') {
    return (
      <ReceiptDetailRegisterPage
        items={selectedReceiptItems}
        onBack={() => handleNavigate('receipt')}
        onNavigate={handleNavigate}
        onLogout={handleLogout}
      />
    )
  }

  if (currentPage === 'test') {
    return <GeminiTestPage onNavigate={handleNavigate} onLogout={handleLogout} />
  }

  if (currentPage === 'settings') {
    return (
      <SettingsPage
        user={currentUser}
        onNavigate={handleNavigate}
        onLogout={handleLogout}
      />
    )
  }

  if (currentPage === 'login') {
    return (
      <HomePage
        onNavigate={handleNavigate}
        onSelectRecipe={handleSelectRecipe}
        onLogout={handleLogout}
      />
    )
  }

  if (currentPage === 'recipe' && selectedRecipe) {
    return (
      <RecipeDetailPage
        recipe={selectedRecipe}
        onBack={() => setCurrentPage(recipeBackPage)}
        onNavigate={handleNavigate}
        onLogout={handleLogout}
      />
    )
  }

  return (
    <HomePage
      onNavigate={handleNavigate}
      onSelectRecipe={handleSelectRecipe}
      onLogout={handleLogout}
    />
  )
}

export default App
