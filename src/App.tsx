import './lib/supabase'
import './App.css'

type Feature = {
  title: string
  description: string
  action: string
  icon: IconName
  tone: 'green' | 'red' | 'yellow' | 'blue' | 'violet' | 'slate'
}

type Ingredient = {
  name: string
  amount: string
  status: string
}

type Recipe = {
  name: string
  meta: string
  tags: string[]
}

type IconName =
  | 'spark'
  | 'basket'
  | 'camera'
  | 'list'
  | 'clock'
  | 'heart'
  | 'settings'
  | 'bell'
  | 'user'
  | 'message'
  | 'plus'
  | 'arrow'

const features: Feature[] = [
  {
    title: 'レシピ生成',
    description: '在庫・好み・調理時間からAIが献立候補を作成',
    action: '作りたい料理を探す',
    icon: 'spark',
    tone: 'green',
  },
  {
    title: '食材登録',
    description: '手入力、レシート撮影、画像認識で冷蔵庫に追加',
    action: '食材を追加する',
    icon: 'basket',
    tone: 'yellow',
  },
  {
    title: '買い物リスト',
    description: '足りない材料を自動でリスト化して予算で絞り込み',
    action: 'リストを見る',
    icon: 'list',
    tone: 'blue',
  },
  {
    title: '調理履歴',
    description: '作ったレシピ、お気に入り、使用量をまとめて確認',
    action: '履歴を開く',
    icon: 'clock',
    tone: 'red',
  },
]

const secondaryFeatures: Feature[] = [
  {
    title: 'お気に入り',
    description: 'また作りたいレシピを保存',
    action: '保存済み',
    icon: 'heart',
    tone: 'red',
  },
  {
    title: 'アカウント設定',
    description: '言語、ログアウト、ユーザー管理',
    action: '設定',
    icon: 'settings',
    tone: 'slate',
  },
  {
    title: 'お問い合わせ',
    description: '気になる点やエラーを送信',
    action: '送信',
    icon: 'message',
    tone: 'violet',
  },
]

const expiringIngredients: Ingredient[] = [
  { name: '鶏もも肉', amount: '320g', status: '今日まで' },
  { name: '小松菜', amount: '1束', status: '明日まで' },
  { name: '牛乳', amount: '500ml', status: '残り2日' },
]

const suggestedRecipes: Recipe[] = [
  {
    name: '鶏肉と小松菜の和風クリーム煮',
    meta: '25分 / 約520kcal',
    tags: ['期限優先', '和洋中', '牛乳消費'],
  },
  {
    name: '冷蔵庫整理の具だくさん炒め',
    meta: '15分 / 難易度かんたん',
    tags: ['時短', '在庫活用'],
  },
]

const iconPaths: Record<IconName, string[]> = {
  spark: [
    'M12 2.75l1.6 5.15 5.15 1.6-5.15 1.6L12 16.25l-1.6-5.15-5.15-1.6 5.15-1.6L12 2.75z',
    'M19 15l.85 2.15L22 18l-2.15.85L19 21l-.85-2.15L16 18l2.15-.85L19 15z',
  ],
  basket: [
    'M6.5 9.5h11l-1.15 8.25a2 2 0 0 1-1.98 1.75H9.63a2 2 0 0 1-1.98-1.75L6.5 9.5z',
    'M8.5 9.5 11 4.5M15.5 9.5 13 4.5M5 9.5h14',
  ],
  camera: [
    'M4.5 8.5h3l1.2-2h6.6l1.2 2h3v9.5h-15V8.5z',
    'M12 11a2.75 2.75 0 1 1 0 5.5 2.75 2.75 0 0 1 0-5.5z',
  ],
  list: ['M8 7h11M8 12h11M8 17h11M4.75 7h.01M4.75 12h.01M4.75 17h.01'],
  clock: ['M12 4a8 8 0 1 1 0 16 8 8 0 0 1 0-16z', 'M12 8v4.5l3 1.7'],
  heart: ['M12 20s-7-4.35-7-10a4 4 0 0 1 7-2.65A4 4 0 0 1 19 10c0 5.65-7 10-7 10z'],
  settings: [
    'M12 8.75a3.25 3.25 0 1 1 0 6.5 3.25 3.25 0 0 1 0-6.5z',
    'M19.25 13.5v-3l-2.05-.5a6.2 6.2 0 0 0-.7-1.68l1.1-1.8-2.12-2.12-1.8 1.1a6.2 6.2 0 0 0-1.68-.7l-.5-2.05h-3l-.5 2.05a6.2 6.2 0 0 0-1.68.7l-1.8-1.1L2.4 6.52l1.1 1.8A6.2 6.2 0 0 0 2.8 10l-2.05.5v3l2.05.5c.17.6.4 1.17.7 1.68l-1.1 1.8 2.12 2.12 1.8-1.1c.51.3 1.08.53 1.68.7l.5 2.05h3l.5-2.05c.6-.17 1.17-.4 1.68-.7l1.8 1.1 2.12-2.12-1.1-1.8c.3-.51.53-1.08.7-1.68l2.05-.5z',
  ],
  bell: ['M17.5 15.25H6.5l1.2-1.8V10a4.3 4.3 0 0 1 8.6 0v3.45l1.2 1.8z', 'M10 18a2 2 0 0 0 4 0'],
  user: ['M12 12a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7z', 'M5.5 20a6.5 6.5 0 0 1 13 0'],
  message: ['M5 6.5h14v9H9l-4 3v-12z', 'M8 10h8M8 13h5'],
  plus: ['M12 5v14M5 12h14'],
  arrow: ['M5 12h14M13 6l6 6-6 6'],
}

function Icon({ name }: { name: IconName }) {
  return (
    <svg className="icon" viewBox="0 0 24 24" aria-hidden="true">
      {iconPaths[name].map((path) => (
        <path key={path} d={path} />
      ))}
    </svg>
  )
}

function FeatureCard({ feature }: { feature: Feature }) {
  return (
    <article className={`feature-card tone-${feature.tone}`}>
      <div className="feature-card__icon">
        <Icon name={feature.icon} />
      </div>
      <div>
        <h3>{feature.title}</h3>
        <p>{feature.description}</p>
      </div>
      <button type="button" className="text-button">
        <span>{feature.action}</span>
        <Icon name="arrow" />
      </button>
    </article>
  )
}

function App() {
  return (
    <div className="app-shell">
      <header className="topbar">
        <a className="brand" href="/" aria-label="あいくっく(仮称) ホーム">
          <span className="brand__mark">
            <img src="/app-icon.png" alt="" />
          </span>
          <span>
            <strong>あいくっく(仮称)</strong>
            <small>食材管理と献立作成</small>
          </span>
        </a>

        <nav className="topbar__nav" aria-label="メインメニュー">
          <a href="#ingredients">食材</a>
          <a href="#recipes">レシピ</a>
          <a href="#shopping">買い物</a>
        </nav>

        <div className="topbar__actions">
          <button type="button" className="icon-button" aria-label="通知">
            <Icon name="bell" />
          </button>
          <button type="button" className="account-button">
            <Icon name="user" />
            <span>ああああああああ</span>
          </button>
        </div>
      </header>

      <main className="home">
        <section className="hero-panel" aria-labelledby="home-title">
          <div className="hero-panel__content">
            <p className="eyebrow">今日のホーム</p>
            <h1 id="home-title">
              作れるレシピを
              <br />
              食材からすぐ提案
            </h1>
            <p className="hero-panel__lead">
              食材登録、期限管理、レシピ生成、買い物リストまでをひとつの画面から始められます。
            </p>
            <div className="hero-actions">
              <button type="button" className="primary-button">
                <Icon name="spark" />
                <span>レシピを生成</span>
              </button>
              <button type="button" className="secondary-button">
                <Icon name="plus" />
                <span>食材を登録</span>
              </button>
              <button type="button" className="secondary-button hide-on-small">
                <Icon name="camera" />
                <span>レシート撮影</span>
              </button>
            </div>
          </div>

          <div className="meal-preview" aria-label="おすすめ献立プレビュー">
            <div className="meal-preview__image">
              <div className="plate">
                <span className="plate__rice" />
                <span className="plate__greens" />
                <span className="plate__main" />
                <span className="plate__sauce" />
              </div>
            </div>
            <div className="meal-preview__body">
              <span className="status-pill">AI提案候補</span>
              <h2>鶏肉と小松菜の和風クリーム煮</h2>
              <p>期限が近い食材を優先。25分で作れる候補です。</p>
            </div>
          </div>
        </section>

        <section className="summary-grid" aria-label="今日の状況">
          <article>
            <span>登録食材</span>
            <strong>18</strong>
            <small>3件は期限が近い</small>
          </article>
          <article>
            <span>買い物メモ</span>
            <strong>6</strong>
            <small>予算フィルター対応</small>
          </article>
          <article>
            <span>お気に入り</span>
            <strong>12</strong>
            <small>よく作るレシピ</small>
          </article>
          <article>
            <span>通知</span>
            <strong>2</strong>
            <small>賞味期限の確認</small>
          </article>
        </section>

        <section className="feature-section" aria-label="クイックアクセス">
          <div className="feature-grid">
            {features.map((feature) => (
              <FeatureCard key={feature.title} feature={feature} />
            ))}
          </div>
        </section>

        <div className="dashboard-grid">
          <section className="panel" id="ingredients" aria-labelledby="ingredients-title">
            <div className="section-heading">
              <div>
                <p className="eyebrow">在庫管理</p>
                <h2 id="ingredients-title">期限が近い食材</h2>
              </div>
              <button type="button" className="small-button">登録</button>
            </div>
            <ul className="ingredient-list">
              {expiringIngredients.map((ingredient) => (
                <li key={ingredient.name}>
                  <span>
                    <strong>{ingredient.name}</strong>
                    <small>{ingredient.amount}</small>
                  </span>
                  <em>{ingredient.status}</em>
                </li>
              ))}
            </ul>
          </section>

          <section className="panel" id="recipes" aria-labelledby="recipes-title">
            <div className="section-heading">
              <div>
                <p className="eyebrow">レシピ候補</p>
                <h2 id="recipes-title">在庫から作れる献立</h2>
              </div>
              <button type="button" className="small-button">再生成</button>
            </div>
            <div className="recipe-stack">
              {suggestedRecipes.map((recipe) => (
                <article key={recipe.name} className="recipe-card">
                  <h3>{recipe.name}</h3>
                  <p>{recipe.meta}</p>
                  <div className="tag-row">
                    {recipe.tags.map((tag) => (
                      <span key={tag}>{tag}</span>
                    ))}
                  </div>
                </article>
              ))}
            </div>
          </section>
        </div>

        <section className="secondary-section" id="shopping" aria-label="アカウントとサポート">
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

export default App
