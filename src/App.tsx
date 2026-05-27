import { useState } from 'react'
import './lib/supabase'
import './lib/groq'
import './App.css'
import { HomePage } from './pages/HomePage'
import { FridgePage } from './pages/FridgePage'
import { RecipeDetailPage } from './pages/RecipeDetailPage'
import { CookingHistoryPage } from './pages/CookingHistoryPage'
import type { AppDestination, Recipe } from './types/ui'

type Page = AppDestination | 'recipe'

function App() {
  const [currentPage, setCurrentPage] = useState<Page>('home')
  const [selectedRecipe, setSelectedRecipe] = useState<Recipe | null>(null)
  const [recipeBackPage, setRecipeBackPage] = useState<AppDestination>('home')

  function handleNavigate(page: AppDestination) {
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
