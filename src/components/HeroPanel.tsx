import { memo } from 'react'
import { Icon } from './Icon'
import { useI18n } from '../lib/useI18n'

type HeroPanelProps = {
  isGenerating: boolean
  onGenerateRecipe: () => void
  onAddIngredient?: () => void
  onScanReceipt?: () => void
  onShowRecipes?: () => void
}

export const HeroPanel = memo(function HeroPanel({
  isGenerating,
  onGenerateRecipe,
  onAddIngredient,
  onScanReceipt,
  onShowRecipes,
}: HeroPanelProps) {
  const { t } = useI18n()

  return (
    <section className="hero-panel" aria-labelledby="home-title">
      <div className="hero-panel__content">
        <p className="eyebrow">{t('home.hero.eyebrow')}</p>
        <h1 id="home-title">
          {t('home.hero.titleLine1')}
          <br />
          {t('home.hero.titleLine2')}
        </h1>
        <p className="hero-panel__lead">
          <span className="hero-panel__lead-desktop">
            {t('home.hero.lead')}
          </span>
          <span className="hero-panel__lead-mobile">
            <span>{t('home.hero.leadMobileLine1')}</span>
            <span>{t('home.hero.leadMobileLine2')}</span>
          </span>
        </p>
        <div className="hero-actions">
          <button
            type="button"
            className="primary-button"
            onClick={onGenerateRecipe}
            disabled={isGenerating}
          >
            <Icon name="spark" />
            <span>
              {isGenerating ? t('home.hero.generating') : t('home.hero.generate')}
            </span>
          </button>
          <button
            type="button"
            className="secondary-button"
            onClick={onAddIngredient}
          >
            <Icon name="plus" />
            <span>{t('home.hero.addIngredient')}</span>
          </button>
          <button
            type="button"
            className="secondary-button"
            onClick={onScanReceipt}
          >
            <Icon name="camera" />
            <span>{t('home.hero.scanReceipt')}</span>
          </button>
          <button
            type="button"
            className="secondary-button"
            onClick={onShowRecipes}
          >
            <Icon name="list" />
            <span>{t('home.hero.showRecipes')}</span>
          </button>
        </div>
      </div>

      {/* <div className="meal-preview" aria-label={t('home.hero.previewAria')}>
        <div className="meal-preview__image">
          <div className="plate">
            <span className="plate__rice" />
            <span className="plate__greens" />
            <span className="plate__main" />
            <span className="plate__sauce" />
          </div>
        </div>
        <div className="meal-preview__body">
          <span className="status-pill">{t('home.hero.aiSuggestion')}</span>
          <h2>{t('home.hero.previewTitle')}</h2>
          <p>{t('home.hero.previewDescription')}</p>
        </div>
      </div> */}
    </section>
  )
})
