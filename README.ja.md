# vue-grab

Vueアプリ上で要素を指して、AIに渡すコンポーネント文脈をその場で取得できます。

クリックした要素から Vue のコンポーネントツリー・ファイルパス・Props・テキスト情報を抽出し、ChatGPT / Claude / Copilot に貼れる形式でコピーします。

Inspired by [react-grab](https://github.com/aidenybai/react-grab). Thank you ♡

- 日本語: このファイル
- English: [README.md](./README.md)

## インストール

このリポジトリは、現時点で npm にこのパッケージ名では公開していません。
GitHub から直接インストールしてください。

```bash
npm install -D github:qualiatokyoltd/vue-grab
```

GitHub からのインストール時は `prepare` が自動実行されるため、`dist/` はインストール時にビルドされます。

## 30秒導入（推奨）

エントリーファイル（`main.ts` / `main.js`）に追加するだけです。

```ts
import { createApp } from 'vue'
import App from './App.vue'
import { VueGrab } from 'vue-grab'

const app = createApp(App)

if (import.meta.env.DEV) {
  app.use(VueGrab, {
    locale: 'auto',
    editPrompt: true,
  })
}

app.mount('#app')
```

## 使い方

導入後、要素にホバーした状態で:

- `⌘⇧G`（macOS）または `Alt+Shift+G`（Windows/Linux）で grab モード切替
- `⌘C` / `Ctrl+C`（またはクリック）で確定

確定すると、AI向けプロンプトがクリップボードにコピーされます（デフォルトで編集モーダルも表示）。

## 手動導入

### Vite

開発時だけ動的に読み込みたい場合:

```html
<script type="module">
  if (import.meta.env.DEV) {
    import('vue-grab')
  }
</script>
```

### Nuxt 3

クライアントプラグイン（`plugins/vue-grab.client.ts`）で登録:

```ts
import { defineNuxtPlugin } from '#app'
import { VueGrab } from 'vue-grab'

export default defineNuxtPlugin((nuxtApp) => {
  if (import.meta.dev) {
    nuxtApp.vueApp.use(VueGrab)
  }
})
```

## プラグイン拡張

`registerPlugin` でツールバー / コンテキストメニューを拡張できます。

```ts
import { registerPlugin } from 'vue-grab'

registerPlugin({
  name: 'custom-actions',
  actions: [
    {
      id: 'copy-json',
      label: 'JSONでコピー',
      placement: 'context-menu',
      async run({ element, components }) {
        if (!element) return
        await navigator.clipboard.writeText(
          JSON.stringify({ tag: element.tagName.toLowerCase(), components }, null, 2),
        )
      },
    },
  ],
})
```

## オプション

| オプション | 型 | デフォルト |
|---|---|---|
| `locale` | `'en' \| 'ja' \| 'auto'` | `'auto'` |
| `shortcut` | `string` | macOS: `⌘⇧G`（`Cmd+Shift+G`）, その他: `Alt+Shift+G` |
| `activationMode` | `'toggle' \| 'hold'` | `'toggle'` |
| `keyHoldDuration` | `number` | `180` |
| `allowActivationInsideInput` | `boolean` | `false` |
| `editPrompt` | `boolean` | `true` |
| `autoCopy` | `boolean` | `true` |
| `showOverlay` | `boolean` | `true` |
| `onGrab` | `(result) => void` | - |
| `onBeforeCopy` | `(result) => void \| Promise<void>` | - |
| `transformCopyContent` | `(content, result) => string \| Promise<string>` | - |
| `onAfterCopy` | `(result, success) => void` | - |
| `onCopySuccess` | `(result, content) => void` | - |
| `onCopyError` | `(error, result) => void` | - |

## 注意点

- 開発モード専用（`__vueParentComponent` などの Vue 内部情報に依存）
- Vue 3.x 必須
- ファイルパス精度のため Vite 推奨

## 開発

```bash
npm install
npm run dev
npm run build
```

## ライセンス

MIT
