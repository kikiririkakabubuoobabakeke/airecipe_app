import { FeatureCard } from '../components/FeatureCard'
import { HeroPanel } from '../components/HeroPanel'
import { IngredientsPanel } from '../components/IngredientsPanel'
import { RecipesPanel } from '../components/RecipesPanel'
import { SummaryGrid } from '../components/SummaryGrid'
import { Topbar } from '../components/Topbar'
import {
  expiringIngredients,
  getPrimaryFeatures,
  getSecondaryFeatures,
  suggestedRecipes,
  summaryItems,
} from '../data/home'
import { useI18n } from '../lib/useI18n'

export function FoodPage() {
  const { t } = useI18n()
  const primaryFeatures = getPrimaryFeatures(t)
  const secondaryFeatures = getSecondaryFeatures(t)

  return (
    <div className="app-shell">
      <Topbar />

      <main className="home">
        <HeroPanel isGenerating={false} onGenerateRecipe={() => undefined} />

        <SummaryGrid items={summaryItems} />

        <section className="feature-section" aria-label={t('home.quickAccessLabel')}>
          <div className="feature-grid">
            {primaryFeatures.map((feature) => (
              <FeatureCard key={feature.title} feature={feature} />
            ))}
          </div>
        </section>

        <div className="dashboard-grid">
          <IngredientsPanel ingredients={expiringIngredients} />
          <RecipesPanel recipes={suggestedRecipes} />
        </div>

        <section
          className="secondary-section"
          id="shopping"
          aria-label={t('home.secondaryLabel')}
        >
          <div className="secondary-grid">
            {secondaryFeatures.map((feature) => (
              <FeatureCard key={feature.title} feature={feature} />
            ))}
          </div>
        </section>
      </main>
    </div>
  )
}
