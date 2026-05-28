import { Icon } from './Icon'

type HeroPanelProps = {
  isGenerating: boolean
  onGenerateRecipe: () => void
  onScanReceipt?: () => void
  onShowRecipes?: () => void
}

export function HeroPanel({
  isGenerating,
  onGenerateRecipe,
  onScanReceipt,
  onShowRecipes,
}: HeroPanelProps) {
  return (
    <section className="hero-panel" aria-labelledby="home-title">
      <div className="hero-panel__content">
        <p className="eyebrow">今日の献立</p>
        <h1 id="home-title">
          作れるレシピを
          <br />
          食材からすぐ提案
        </h1>
        <p className="hero-panel__lead">
          食材登録、期限管理、レシピ生成、買い物リストまでをひとつの画面から始められます。
        </p>
        <div className="hero-actions">
          <button
            type="button"
            className="primary-button"
            onClick={onGenerateRecipe}
            disabled={isGenerating}
          >
            <Icon name="spark" />
            <span>{isGenerating ? '生成中...' : 'レシピを生成'}</span>
          </button>
          <button type="button" className="secondary-button">
            <Icon name="plus" />
            <span>食材を登録</span>
          </button>
          <button
            type="button"
            className="secondary-button"
            onClick={onScanReceipt}
          >
            <Icon name="camera" />
            <span>レシート撮影</span>
          </button>
          <button
            type="button"
            className="secondary-button"
            onClick={onShowRecipes}
          >
            <Icon name="list" />
            <span>レシピ表示</span>
          </button>
        </div>
      </div>

      <div className="meal-preview" aria-label="おすすめ献立のプレビュー">
        <div className="meal-preview__image">
          <div className="plate">
            <span className="plate__rice" />
            <span className="plate__greens" />
            <span className="plate__main" />
            <span className="plate__sauce" />
          </div>
        </div>
        <div className="meal-preview__body">
          <span className="status-pill">AI提案</span>
          <h2>鮭と小松菜の和風クリーム煮</h2>
          <p>期限が近い食材を優先した、25分で作れる献立です。</p>
        </div>
      </div>
    </section>
  )
}
