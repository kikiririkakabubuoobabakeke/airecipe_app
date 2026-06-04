# AI Recipe App 環境構築手順書

学校のチーム開発課題で `airecipe_app` を動かすための手順です。  
基本的には、リポジトリをクローンして `.env` を作成し、必要なパッケージを入れれば起動できます。

## 対象環境

- Windows
- PowerShell
- GitHub アカウント
- Git
- GitHub CLI
- Node.js / npm

Git が入っていない場合は、先にインストールしてください。

```powershell
winget install --id Git.Git
```

インストール後、PowerShell を開き直して、次のコマンドで確認します。

```powershell
git --version
```

Node.js が入っていない場合も、先にインストールしてください。

```powershell
winget install --id OpenJS.NodeJS.LTS
```

インストール後、PowerShell を開き直して、次のコマンドで確認します。

```powershell
node -v
npm -v
```

## 1. GitHub CLI をインストールする

```powershell
winget install --id GitHub.cli
```

インストール後、PowerShell を開き直して、次のコマンドで確認します。

```powershell
gh --version
```

## 2. GitHub にログインする

```powershell
gh auth login
```

質問が出たら、次のように選択します。

```text
GitHub.com
HTTPS
Yes
Login with a web browser
```

ブラウザが開いたら、画面の案内に従って GitHub にログインしてください。

## 3. プロジェクトをクローンする

作業用のフォルダに移動してから、次のコマンドを実行します。

```powershell
gh repo clone kikiririkakabubuoobabakeke/airecipe_app
```

または、次のコマンドでもクローンできます。

```powershell
git clone https://github.com/kikiririkakabubuoobabakeke/airecipe_app.git
```

クローンできたら、プロジェクトフォルダに移動します。

```powershell
cd airecipe_app
```

## 4. `.env` ファイルを作成する

プロジェクトフォルダの直下に `.env` ファイルを作成します。

`.env` には次の内容を保存してください。

```env
SUPABASE_URL=https://url.supabase.co
SUPABASE_PUBLISHABLE_KEY=pass
SUPABASE_SERVICE_ROLE_KEY=service_Drole_key
GROQ_API_KEY=apiキー
GROQ_MODEL=openai/gpt-oss-120b
GEMINI_API_KEY=apiキー

```

`.env` は各自のPCで作成するファイルです。GitHub にはアップロードしません。

## 5. Groq API キーを取得する

Groq API については、各自で Groq にアクセスし、自分の Google アカウントで登録して API キーを取得してください。
取得した API キーは `.env` の `GROQ_API_KEY` に保存してください。この値はサーバー側だけで読み込まれ、ブラウザ側には公開しません。

Supabase の在庫・レシピ操作では `SUPABASE_SERVICE_ROLE_KEY` も必要です。Supabase ダッシュボードの Project Settings から取得し、絶対にブラウザへ直接渡さないでください。

Gemini の画像テスト画面を使う場合は `GEMINI_API_KEY` も設定してください。使わない場合は空でもアプリ本体の食材・レシピ機能は動かせます。

## 6. 必要なパッケージをインストールする

```powershell
npm install
```

## 7. 開発サーバーを起動する

```powershell
npm run dev
```

起動後、PowerShell に表示されたURLをブラウザで開きます。通常は次のようなURLです。

```text
http://localhost:3000/
```

## 8. 開発を始める前に最新版を取得する

作業を始める前に、他のメンバーの変更を取り込みます。

```powershell
git pull
```

変更したファイルを確認したいときは、次のコマンドを使います。

```powershell
git status
```

## よくあるエラー

### `gh` が認識されない

PowerShell を開き直してください。直らない場合は、GitHub CLI が正しくインストールされているか確認します。

```powershell
gh --version
```

### `npm` が認識されない

Node.js が入っていない可能性があります。Node.js をインストールしてから PowerShell を開き直してください。

```powershell
winget install --id OpenJS.NodeJS.LTS
```

### Supabase に接続できない

`.env` のファイル名と内容を確認してください。

- ファイル名が `.env` になっている
- プロジェクトフォルダの直下に置いている
- `SUPABASE_URL`、`SUPABASE_PUBLISHABLE_KEY`、`SUPABASE_SERVICE_ROLE_KEY` の値に余分な空白がない
- `.env` を作成した後に `npm run dev` を起動し直している

## 初回作成者向けメモ

このプロジェクトを最初に作成するときは、次のコマンドで Vite プロジェクトを作成しました。

```powershell
npm create vite@latest airecipe_app
```

選択肢は次のとおりです。

```text
Select a framework:
React

Select a variant:
TypeScript + React Compiler

Install with npm and start now?
Yes
```

すでに GitHub からクローンする場合、この手順は実行しなくて大丈夫です。
