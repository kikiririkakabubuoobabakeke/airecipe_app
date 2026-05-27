// import { FeatureCard } from '../components/FeatureCard'
// import { HeroPanel } from '../components/HeroPanel'
//import { IngredientsPanel } from '../components/IngredientsPanel'
import { RecipesPanel } from '../components/RecipesPanel'
//import { SummaryGrid } from '../components/SummaryGrid'
import { Topbar } from '../components/Topbar'
import {
  //expiringIngredients,
  //primaryFeatures,
  //secondaryFeatures,
  suggestedRecipes,
  //summaryItems,
} from '../data/home'
export function RecipePage() {
  return (
    <div className="app-shell">
      <Topbar />
      <main className="home">
        <button type="button" className="secondary-button">
          <span>冷蔵庫</span>
        </button>
          <RecipesPanel recipes={suggestedRecipes} />
      </main>
    </div>
  )
}