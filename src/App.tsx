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
import type { AppDestination, Recipe } from './types/ui'

type Page = AppDestination | 'recipe'

function getPageFromPath(): AppDestination {
  if (window.location.pathname === '/test') {
    return 'test'
  }

  if (window.location.pathname === '/login') {
    return 'login'
  }

  return 'home'
}

function App() {
  const [currentPage, setCurrentPage] = useState<Page>(getPageFromPath)
  const [selectedRecipe, setSelectedRecipe] = useState<Recipe | null>(null)
  const [recipeBackPage, setRecipeBackPage] = useState<AppDestination>('home')

  useEffect(() => {
    function handlePopState() {
      setCurrentPage(getPageFromPath())
    }

    window.addEventListener('popstate', handlePopState)

    return () => window.removeEventListener('popstate', handlePopState)
  }, [])

  function handleNavigate(page: AppDestination) {
    if (page === 'test') {
      window.history.pushState({}, '', '/test')
    } else if (page === 'login') {
      window.history.pushState({}, '', '/login')
    } else if (window.location.pathname === '/test') {
      window.history.pushState({}, '', '/')
    } else if (window.location.pathname === '/login') {
      window.history.pushState({}, '', '/')
    }

    setCurrentPage(page)
  }

  function handleSelectRecipe(recipe: Recipe) {
    setRecipeBackPage(currentPage === 'history' ? 'history' : 'home')
    setSelectedRecipe(recipe)
    setCurrentPage('recipe')
  }

  if (currentPage === 'fridge') {
    return <FridgePage onNavigate={handleNavigate} />
  }

  if (currentPage === 'history') {
    return (
      <CookingHistoryPage
        onNavigate={handleNavigate}
        onSelectRecipe={handleSelectRecipe}
      />
    )
  }

  if (currentPage === 'receipt') {
    return <ReceiptScanPage onNavigate={handleNavigate} />
  }

  if (currentPage === 'test') {
    return <GeminiTestPage onNavigate={handleNavigate} />
  }

  if (currentPage === 'login') {
    return <LoginScreen onAuthenticated={() => handleNavigate('home')} />
  }

  if (currentPage === 'recipe' && selectedRecipe) {
    return (
      <RecipeDetailPage
        recipe={selectedRecipe}
        onBack={() => setCurrentPage(recipeBackPage)}
        onNavigate={handleNavigate}
      />
    )
  }

  return <HomePage onNavigate={handleNavigate} onSelectRecipe={handleSelectRecipe} />
}

export default App
