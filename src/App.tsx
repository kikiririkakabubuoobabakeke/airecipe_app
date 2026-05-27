import { useState } from 'react'
import './lib/supabase'
import './lib/groq'
import './App.css'
import { BrowserRouter, Routes, Route } from 'react-router-dom' // 👈 追加
import { HomePage } from './pages/HomePage'
<<<<<<< HEAD
import { FoodPage } from './pages/FoodPage' // 👈 移動先のページをインポート（実際のファイル名に合わせてください）
import { RecipePage } from './pages/RecipePage'

function App() {
  return (
    <BrowserRouter>
      <Routes>
        {/* URLが「/」のときは HomePage を表示 */}
        <Route path="/" element={<HomePage />} />
        
        {/* URLが「/foodpage」のときは FoodPage を表示 */}
        <Route path="/FoodPage" element={<FoodPage />} />

        <Route path="/RecipePage" element={<RecipePage />} />
      </Routes>
    </BrowserRouter>
=======
import { FridgePage } from './pages/FridgePage'

function App() {
  const [currentPage, setCurrentPage] = useState<'home' | 'fridge'>('home')

  return (
    <>
      {currentPage === 'home' ? (
        <HomePage onNavigate={setCurrentPage} />
      ) : (
        <FridgePage onNavigate={setCurrentPage} />
      )}
    </>
>>>>>>> 47909a5af5edcc512f8eb59aa17f402b94d18fa9
  )
}

export default App