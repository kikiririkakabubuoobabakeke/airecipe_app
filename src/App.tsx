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
import LoginScreen from './pages/LoginScreen'
import {
  createSessionFromOAuthTokens,
  getCurrentUser,
  logout,
  type AuthUser,
} from './lib/authApi'
import type { AppDestination, Recipe } from './types/ui'

type Page = AppDestination | 'recipe'

let oauthSessionRequest: {
  key: string
  promise: ReturnType<typeof createSessionFromOAuthTokens>
} | null = null

function getPageFromPath(): AppDestination {
  if (window.location.pathname === '/test') {
    return 'test'
  }

  if (window.location.pathname === '/login') {
    return 'login'
  }

  return 'home'
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

  if (!accessToken || !refreshToken) {
    return null
  }

  return {
    accessToken,
    refreshToken,
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

  useEffect(() => {
    let isMounted = true

    async function initializeAuth() {
      const oauthTokens = readOAuthTokensFromHash()

      try {
        if (oauthTokens) {
          const result = await createOAuthSessionOnce(oauthTokens)

          if (!isMounted) {
            return
          }

          setCurrentUser(result.user)
          replacePath('/')
          setCurrentPage('home')
          return
        }

        const result = await getCurrentUser()

        if (!isMounted) {
          return
        }

        setCurrentUser(result.user)

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

    if (page === 'test') {
      pushPath('/test')
    } else if (page === 'login') {
      pushPath('/login')
    } else if (window.location.pathname === '/test') {
      pushPath('/')
    } else if (window.location.pathname === '/login') {
      pushPath('/')
    }

    setCurrentPage(page)
  }

  function handleAuthenticated(user: AuthUser) {
    setCurrentUser(user)
    replacePath('/')
    setCurrentPage('home')
  }

  async function handleLogout() {
    await logout().catch((error) => {
      console.warn('[vite] Logout failed:', error)
    })
    setCurrentUser(null)
    setSelectedRecipe(null)
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
    return <LoginScreen onAuthenticated={handleAuthenticated} />
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
    return <ReceiptScanPage onNavigate={handleNavigate} onLogout={handleLogout} />
  }

  if (currentPage === 'test') {
    return <GeminiTestPage onNavigate={handleNavigate} onLogout={handleLogout} />
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
