# バックエンド & フロントエンド パフォーマンス最適化 実施報告

## 1. バックエンド — DBクエリ効率化

### 1.1 レシートインポートのN+1クエリ解消 (`server/receipts.js`)

**問題**: `importReceiptItems` と `importReceiptItemsDetail` が食材1件ごとに SELECT + INSERT を実行（10食材で20回のDB往復）

**対策**: バッチ処理に変更
- 全食材名を1回の `SELECT ... WHERE ingredient_name IN (...)` で一括取得
- 未登録食材を1回の `INSERT` で一括作成
- 在庫レコードを1回の `INSERT` で一括登録

**効果**: 10食材で 20クエリ → 3クエリ（約85%削減）。`importReceiptItemsDetail` も同様に 20クエリ → 2クエリ

### 1.2 在庫クエリの過剰取得抑制 (`server/recipes.js`)

**問題**: `getInventoryForUser` が未使用の `barcode` カラムを SELECT していた

**対策**: barcode を SELECT 対象から除去

### 1.3 Supabaseクライアント重複の解消 (`server/auth.js`)

**問題**: `authVerifierClient` と `authAdminClient` が service-role key 設定時に同一のHTTPコネクションプールを重複作成

**対策**: `supabase.js` の共通クライアントを `auth.js` からも再利用。`authVerifierClient` / `authAdminClient` を削除し、2つの余分なクライアントインスタンスを除去

### 1.4 HTTPサーバー保護 (`server/index.js`)

- **リクエストボディサイズ制限**: `readJsonBody` に1MB上限を追加（悪意ある巨大ペイロードを早期拒否）
- **サーバータイムアウト**: `server.timeout = 120_000`（2分）を設定

### 1.5 `/api/fridge` 集計最適化 (`server/index.js`)

**問題**: 在庫データから合計数/種類数/期限間近数を計算する際、配列を4回走査していた

**対策**: 1回のパスで全カウントを同時計算。`is_opened` と `best_before_date` の値も在庫データから正しく反映

---

## 2. フロントエンド — 画面遷移の滑らかさ

### 2.1 共有PageShellコンポーネント (`src/components/PageShell.tsx`)

**問題**: 全14ページが個別に `<Topbar>` と `<div className="app-shell">` をレンダリングしていたため、ページ遷移のたびにTopbarがDOMから破棄・再生成されフラッシュが発生

**対策**: `PageShell` コンポーネント作成
- Topbar + app-shell ラッパーをApp.tsxレベルで共有化
- 全ページコンポーネントからTopbar importとapp-shell wrapperを除去
- ページ遷移時もTopbarはDOM上に常駐し再レンダリングされない

### 2.2 ページ遷移アニメーション (`src/App.css`)

**対策**: CSSアニメーション追加
```css
@keyframes pageFadeIn {
  from { opacity: 0; transform: translateY(8px); }
  to   { opacity: 1; transform: translateY(0); }
}
```
- `.page-transition` クラスで全ページコンテンツに 0.22s のフェードイン＋スライドアップを適用
- `key={currentPage}` でページ切り替え時に再マウント → アニメーション発火

### 2.3 ローディングフォールバック修正 (`src/App.tsx`)

**問題**: `PAGE_FALLBACK` が `.page-loading` CSS未定義の空divで、遅延ローディング中に空白画面が表示されていた

**対策**: CSSスピナー付きのローディング表示に変更

### 2.4 カード余白の統一 (`src/App.css`)

**問題**: 7種類のカードで padding (16/18/20/22px)、border-radius (8/12px)、見出し-サブタイトル間 (4/6/8/10px) がバラバラで横並び時に違和感

**対策**: 全カードの spacing を統一

| プロパティ | 修正前（範囲） | 統一値 |
|-----------|-------------|-------|
| padding | 16〜22px | **18px** |
| border-radius | 8px / 12px | **8px** |
| 見出し→サブタイトル | 4〜10px | **6px** |
| value→note 間 | 2〜4px | **2px** |

---

## 3. フロントエンド — データ表示の滑らかさ

### 3.1 DBデータのフェードインアニメーション (`src/App.css`)

**問題**: DBから取得したデータがローディング終了と同時に「パッ」と急に表示されていた

**対策**: 再利用可能なCSSアニメーションクラスを追加
- `.content-appear` — データ到着時に 0.32s でフェードイン＋6pxスライドアップ
- `.card-stagger` — 子要素に50ms間隔のスタガードアニメーション（カードが1枚ずつ順番に出現）
- `.content-loading-pulse` / `.content-loading-block` — スケルトン用パルスアニメーション

**適用ページ**:
- **FridgePage**: 早期returnのスピナー→テーブル切り替えをオーバーレイ方式に変更し、データ到着時にフェードイン
- **HomePage**: ローディング中はスピナー表示、データ到着時にサマリー＋パネルを一括フェードイン
- **CookingHistoryPage**: カード一覧に `.card-stagger` 適用（各カード50msずつ順次表示）
- **RecipeGeneratePage**: ローディング中表示を追加し、データ到着時にフェードイン

### 3.2 インメモリキャッシュ (`src/lib/dataCache.ts`)

**問題**: ページを2回目に訪問しても毎回スピナー＋API再取得が発生

**対策**: stale-while-revalidate パターンのキャッシュ機構
- `getCache<T>(key)` — キャッシュがあれば即返す（5分間有効）
- `setCache<T>(key, data)` — データをキャッシュに保存
- `invalidateCache(pattern)` — プレフィックス一致でキャッシュ破棄

**適用パターン**（全5ページ）:
```
1回目: fetch → spinner → setCache + render
2回目: getCache → 即render → fetch in background → update if changed
```

**DB更新時のキャッシュ自動無効化**:
- `dataCache.ts` が `inventory-updated` カスタムイベントを監視
- 食材作成/更新/削除/調理済み/レシピ生成/お気に入り切替時に全関連キャッシュを自動クリア
- `recipeApi.ts` の全変更系関数が `dispatchInventoryUpdated()` を発火するよう統一

### 3.3 ログイン時プリロード (`src/lib/preload.ts`)

**問題**: ログイン直後はどのページもキャッシュが空で、初回訪問時に必ずスピナーが表示される

**対策**: ログイン成功直後に全ページの初期データをバックグラウンドで先読み
```
Promise.allSettled([
  fetchInventory(language),     → inventory:ja キャッシュ
  fetchSavedRecipes(language),  → cooking-history:ja キャッシュ
  fetchPreferences(),           → preferences:userId キャッシュ
])
```
- `home:ja` と `recipe-generate:ja` キャッシュにも食材＋レシピ＋設定の3点セットを保存
- いずれかのフェッチが失敗しても残りは成功扱い（ベストエフォート）
- **効果**: ログイン後、どのページに遷移してもスピナーなしで即表示

---

## 4. 機能追加

### 4.1 調味料モード切替

**設定画面** → 「調味料の扱い」セクションで以下を切替可能:

| モード | 動作 |
|--------|------|
| **無制限**（デフォルト） | 醤油・みりん・酒・塩・砂糖・味噌・酢・油・ごま油・片栗粉・小麦粉・だし・顆粒だし・コンソメ・ケチャップ・ソース・マヨネーズ・カレー粉・こしょう・にんにく・しょうが・バター・マーガリン・料理酒・みりん風調味料・ポン酢・めんつゆ・オイスターソース・豆板醤・コチュジャン・ナンプラー・はちみつ など基本調味料を在庫に関わらず常に使用可能。レシピには `ingredient_id = -1` で含まれDB保存はスキップ |
| **厳密** | 在庫にある材料のみをレシピに使用（従来通りの動作） |

- フロントエンド: `UserPreferences.seasoningMode` 型追加、SettingsPage UI
- バックエンド: `buildRecipePrompt` に調味料ブロック注入、`generateAndSaveRecipes` で `ingredient_id = -1` の食材をレシピ保存から除外

### 4.2 ホーム画面「登録済みの食材」7件表示制限

**コンポーネント**: `src/components/IngredientsPanel.tsx`

- 消費期限が近い順（7日以内）に並ぶ食材一覧を最大7件に制限
- 8件以上の場合「他N件を表示」ボタンで展開/折りたたみ

---

## 変更ファイル一覧

### バックエンド（7ファイル）
| ファイル | 主な変更 |
|----------|---------|
| `server/receipts.js` | レシートインポートのバッチ処理化、デッドコード除去 |
| `server/recipes.js` | 過剰取得カラム除去、調味料モードプロンプト対応 |
| `server/auth.js` | Supabaseクライアント統合 |
| `server/index.js` | リクエストボディサイズ制限、サーバータイムアウト、調味料モード受け渡し、fridge集計最適化 |
| `server/preferences.js` | `seasoningMode` サニタイズ追加 |

### フロントエンド（18ファイル）
| ファイル | 主な変更 |
|----------|---------|
| `src/App.tsx` | PageShell統合、PAGE_FALLBACK修正、プリロードトリガー追加 |
| `src/App.css` | ページ遷移・コンテンツ表示アニメーション、カード余白統一、展開ボタンスタイル |
| `src/components/PageShell.tsx` | **新規作成** — 共有レイアウト＋Topbar |
| `src/components/IngredientsPanel.tsx` | 7件表示制限＋展開トグル |
| `src/lib/dataCache.ts` | **新規作成** — インメモリキャッシュ＋自動無効化 |
| `src/lib/preload.ts` | **新規作成** — ログイン時全ページデータ先読み |
| `src/lib/recipeApi.ts` | `seasoningMode` 追加、`dispatchInventoryUpdated` 統一 |
| `src/lib/preferencesApi.ts` | `seasoningMode` デフォルト値追加 |
| `src/types/ui.ts` | `SeasoningMode` 型追加、`UserPreferences` 拡張 |
| `src/pages/HomePage.tsx` | キャッシュ対応、seasoningMode 受け渡し、ローディング状態追加 |
| `src/pages/FridgePage.tsx` | キャッシュ対応、オーバーレイローディング方式 |
| `src/pages/CookingHistoryPage.tsx` | キャッシュ対応、スタガードカードアニメーション |
| `src/pages/RecipeGeneratePage.tsx` | キャッシュ対応、seasoningMode 受け渡し |
| `src/pages/SettingsPage.tsx` | キャッシュ対応、調味料モードUI追加 |
| `src/pages/ContactPage.tsx` ほか8ページ | Topbar + app-shell除去、未使用props削除 |
| `src/lib/i18n/{ja,en,fr}.ts` | 全追加キーの翻訳（`common.loading`, `seasoningMode`, `expand.more/less` 等） |
