# vue-grab

**Click any element in your Vue app → get component info → ask AI to change it.**

Vue 3 版の [react-grab](https://github.com/aidenybai/react-grab)。ブラウザ上の任意の要素をクリックするだけで、コンポーネント名・ファイルパス・Props・コンポーネントツリーをフォーマット済みプロンプトとして取得し、Claude や ChatGPT などの AI アシスタントにそのまま貼り付けられます。

## 動作イメージ

1. **Alt+Shift+G** を押す（またはプログラムから `activate()` を呼ぶ）
2. 要素にホバー → 緑色のオーバーレイにコンポーネント情報が表示される
3. クリック → コンポーネント詳細がクリップボードにコピーされる
4. AI に貼り付けて指示：_「このボタンの色を赤に変えて」_
5. AI は編集すべきファイルとコンポーネントを正確に把握できる

## インストール

```bash
npm install vue-grab
```

```bash
yarn add vue-grab
```

```bash
pnpm add vue-grab
```

> **Note:** vue-grab は開発専用ツールです。Vue 3 の開発モード内部 API（`__vueParentComponent`）に依存しており、プロダクションビルドでは動作しません。

## クイックスタート

### 方法 1: Vue プラグイン（推奨）

最もシンプルな導入方法です。`app.use()` で登録するだけで、キーボードショートカットやグローバルプロパティが自動設定されます。

```ts
// main.ts
import { createApp } from 'vue'
import { VueGrab } from 'vue-grab'
import App from './App.vue'

const app = createApp(App)

if (import.meta.env.DEV) {
  app.use(VueGrab)
}

app.mount('#app')
```

**Alt+Shift+G** を押すとグラブモードがトグルされます。

### 方法 2: Composable API

コンポーネント単位でグラブ機能を使いたい場合に便利です。リアクティブな状態管理と、コンポーネントのアンマウント時の自動クリーンアップが組み込まれています。

```vue
<script setup>
import { useVueGrab } from 'vue-grab/composable'

const { toggle, isActive, lastResult } = useVueGrab({
  onGrab(result) {
    console.log(result.prompt)     // フォーマット済み Markdown
    console.log(result.components) // コンポーネントツリー配列
  },
})
</script>

<template>
  <button @click="toggle">
    {{ isActive ? 'キャンセル' : 'グラブ' }}
  </button>
  <pre v-if="lastResult">{{ lastResult.prompt }}</pre>
</template>
```

### 方法 3: プログラマティック API

フレームワークの外から直接制御したい場合や、独自の UI から呼び出したい場合に使います。

```ts
import { activate, deactivate, toggle } from 'vue-grab'

activate({
  autoCopy: true,
  onGrab(result) {
    sendToAI(result.prompt)
  },
})
```

## オプション

| オプション | 型 | デフォルト | 説明 |
|-----------|------|---------|------|
| `shortcut` | `string` | `'Alt+Shift+G'` | グラブモードをトグルするキーボードショートカット |
| `onGrab` | `(result: GrabResult) => void` | — | 要素がグラブされた時のコールバック |
| `autoCopy` | `boolean` | `true` | プロンプトを自動でクリップボードにコピー |
| `showOverlay` | `boolean` | `true` | ハイライトオーバーレイ UI を表示 |

### ショートカットの書式

修飾キーは `+` で連結します。大文字小文字は区別しません。

```ts
app.use(VueGrab, { shortcut: 'Ctrl+G' })         // Ctrl + G
app.use(VueGrab, { shortcut: 'Meta+Shift+G' })    // Cmd + Shift + G (macOS)
app.use(VueGrab, { shortcut: 'Alt+G' })            // Alt + G
```

対応する修飾キー: `Alt`, `Shift`, `Ctrl` (`Control`), `Meta` (`Cmd`, `Command`)

## 型定義

### GrabResult

```ts
interface GrabResult {
  /** クリックされた DOM 要素 */
  element: HTMLElement
  /** コンポーネントツリー（最も近い → ルート） */
  components: ComponentInfo[]
  /** AI 向けフォーマット済み Markdown プロンプト */
  prompt: string
}
```

### ComponentInfo

```ts
interface ComponentInfo {
  /** コンポーネント名 */
  name: string
  /** ソースファイルパス（Vite が __file として注入） */
  filePath: string | null
  /** ソース行番号 */
  line: number | null
  /** コンポーネントの Props */
  props: Record<string, unknown>
}
```

### GrabOptions

```ts
interface GrabOptions {
  shortcut?: string
  onGrab?: (result: GrabResult) => void
  autoCopy?: boolean
  showOverlay?: boolean
}
```

### UseVueGrabReturn

```ts
interface UseVueGrabReturn {
  activate: () => void
  deactivate: () => void
  toggle: () => void
  isActive: Ref<boolean>
  lastResult: Ref<GrabResult | null>
}
```

## プラグインが提供するもの

`app.use(VueGrab)` を実行すると、以下が自動的に登録されます:

### globalProperties

テンプレート内から `$vueGrab` でアクセスできます:

```vue
<template>
  <button @click="$vueGrab.toggle()">Grab</button>
</template>
```

### provide / inject

Composition API で `inject('vue-grab')` から取得できます:

```ts
const vueGrab = inject('vue-grab')
vueGrab.activate()
```

## 出力例

グラブ結果の `prompt` フィールドには以下のような Markdown が含まれます:

```markdown
## Vue Component Info (grabbed with vue-grab)

**Element:** `<button>`
**Classes:** `primary`
**Text:** "Submit"

### Component Tree (nearest → root)

1. **`<ActionBar>`**
   File: `src/components/ActionBar.vue:15`
   Props: onSubmit
  2. **`<Dashboard>`**
     File: `src/views/Dashboard.vue:42`
    3. **`<App>`**
       File: `src/App.vue`

---
Please modify the component above. Describe what you want to change:
```

## 既存プロジェクトへの導入ガイド

詳細なフレームワーク別の導入手順は [INTEGRATION.md](./INTEGRATION.md) を参照してください。

## アーキテクチャ

内部設計の詳細は [ARCHITECTURE.md](./ARCHITECTURE.md) を参照してください。

## 動作要件

- **Vue 3.x**（開発モードの内部 API を使用）
- **開発モード限定** — `__vueParentComponent` はプロダクションビルドには含まれません
- **Vite** との組み合わせ推奨（`__file` パスの注入のため）

## 開発

```bash
# 依存関係のインストール
npm install

# デモの起動（index.html を Vite dev server で配信）
npm run dev

# ライブラリのビルド
npm run build
```

## ライセンス

MIT
