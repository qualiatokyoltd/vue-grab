# vue-grab 導入ガイド

既存の Vue 3 プロジェクトに vue-grab を導入するための手順をフレームワーク・ビルドツール別に解説します。

## 目次

- [Vite + Vue 3（推奨）](#vite--vue-3推奨)
- [Nuxt 3](#nuxt-3)
- [webpack + Vue CLI](#webpack--vue-cli)
- [Quasar Framework](#quasar-framework)
- [CDN / Script タグ](#cdn--script-タグ)
- [条件付きインポート（共通パターン）](#条件付きインポート共通パターン)
- [トラブルシューティング](#トラブルシューティング)

---

## Vite + Vue 3（推奨）

Vite は `__file` プロパティを自動的に SFC に注入するため、vue-grab との相性が最も良い組み合わせです。

### 1. インストール

```bash
npm install vue-grab -D
```

> `-D`（devDependencies）でインストールすることで、プロダクションビルドのバンドルサイズに影響しません。

### 2. プラグイン登録

```ts
// src/main.ts
import { createApp } from 'vue'
import App from './App.vue'

const app = createApp(App)

if (import.meta.env.DEV) {
  import('vue-grab').then(({ VueGrab }) => {
    app.use(VueGrab)
  })
}

app.mount('#app')
```

動的インポートを使うことで、プロダクションビルドでは完全に tree-shake されます。

### 3. 同期インポート（代替）

tree-shaking を Vite に任せる場合:

```ts
// src/main.ts
import { createApp } from 'vue'
import { VueGrab } from 'vue-grab'
import App from './App.vue'

const app = createApp(App)
app.use(VueGrab)  // プロダクション環境では install() 内部で早期リターン
app.mount('#app')
```

---

## Nuxt 3

Nuxt 3 では、プラグインファイルとして登録します。

### 1. インストール

```bash
npm install vue-grab -D
```

### 2. プラグイン作成

```ts
// plugins/vue-grab.client.ts
export default defineNuxtPlugin((nuxtApp) => {
  if (import.meta.dev) {
    import('vue-grab').then(({ VueGrab }) => {
      nuxtApp.vueApp.use(VueGrab, {
        shortcut: 'Alt+Shift+G',
        autoCopy: true,
      })
    })
  }
})
```

ファイル名の `.client` サフィックスにより、サーバーサイドでは実行されません。

### 3. nuxt.config で明示的に登録（オプション）

通常は `plugins/` ディレクトリに置くだけで自動登録されますが、明示的に設定することもできます:

```ts
// nuxt.config.ts
export default defineNuxtConfig({
  plugins: [
    { src: '~/plugins/vue-grab.client.ts', mode: 'client' },
  ],
})
```

---

## webpack + Vue CLI

### 1. インストール

```bash
npm install vue-grab -D
```

### 2. vue-loader の設定確認

`__file` プロパティが注入されるようにするには、`vue-loader` の `exposeFilename` オプションを有効にします:

```js
// vue.config.js
module.exports = {
  chainWebpack: (config) => {
    config.module
      .rule('vue')
      .use('vue-loader')
      .tap((options) => ({
        ...options,
        exposeFilename: true,
      }))
  },
}
```

### 3. プラグイン登録

```ts
// src/main.ts
import { createApp } from 'vue'
import App from './App.vue'

const app = createApp(App)

if (process.env.NODE_ENV === 'development') {
  import('vue-grab').then(({ VueGrab }) => {
    app.use(VueGrab)
  })
}

app.mount('#app')
```

---

## Quasar Framework

### 1. インストール

```bash
npm install vue-grab -D
```

### 2. Boot ファイル作成

```ts
// src/boot/vue-grab.ts
import { boot } from 'quasar/wrappers'

export default boot(({ app }) => {
  if (process.env.DEV) {
    import('vue-grab').then(({ VueGrab }) => {
      app.use(VueGrab)
    })
  }
})
```

### 3. quasar.config に登録

```ts
// quasar.config.ts
export default {
  boot: [
    { path: 'vue-grab', server: false },  // クライアントのみ
  ],
}
```

---

## CDN / Script タグ

ビルドツールを使わないプロジェクト向けです。

```html
<script src="https://unpkg.com/vue@3/dist/vue.global.js"></script>
<script src="https://unpkg.com/vue-grab/dist/vue-grab.umd.cjs"></script>

<script>
  const app = Vue.createApp({ /* ... */ })
  app.use(VueGrab.default)
  app.mount('#app')
</script>
```

> **Note:** CDN 経由の場合、`__file` プロパティは利用できないため、ファイルパスは表示されません。コンポーネント名と Props は取得できます。

---

## 条件付きインポート（共通パターン）

プロダクションビルドに vue-grab のコードを一切含めたくない場合の推奨パターンです。

### パターン A: 動的インポート

```ts
if (import.meta.env.DEV) {
  import('vue-grab').then(({ VueGrab }) => {
    app.use(VueGrab)
  })
}
```

- Vite が `import.meta.env.DEV` を静的にフォールス評価し、デッドコードとして除去
- プロダクションバンドルにはコードが残らない

### パターン B: 環境変数による制御

```ts
// .env.development
VITE_ENABLE_VUE_GRAB=true

// main.ts
if (import.meta.env.VITE_ENABLE_VUE_GRAB === 'true') {
  import('vue-grab').then(({ VueGrab }) => {
    app.use(VueGrab)
  })
}
```

- 開発環境でも無効化したい場合に便利

### パターン C: Composable を特定のコンポーネントだけで使う

```vue
<!-- src/components/DevTools.vue -->
<script setup>
import { useVueGrab } from 'vue-grab/composable'

const { toggle, isActive, lastResult } = useVueGrab({
  onGrab(result) {
    // カスタムの処理
    fetch('/api/dev/grab', {
      method: 'POST',
      body: JSON.stringify(result.components),
    })
  },
})
</script>

<template>
  <div v-if="import.meta.env.DEV" class="dev-toolbar">
    <button @click="toggle">
      {{ isActive ? '✕ Cancel' : '⊕ Grab' }}
    </button>
  </div>
</template>
```

---

## トラブルシューティング

### コンポーネント名が "Anonymous" と表示される

**原因:** コンポーネントに名前が設定されていない。

**解決策:**

```ts
// `<script setup>` を使っている場合 → ファイル名から自動解決されるはず
// 解決しない場合は defineOptions を使う:
defineOptions({ name: 'MyComponent' })

// Options API の場合:
export default defineComponent({
  name: 'MyComponent',
  // ...
})
```

### ファイルパスが null になる

**原因:** ビルドツールが `__file` プロパティを注入していない。

**解決策:**
- **Vite**: デフォルトで注入されます。`vite.config.ts` の設定を確認
- **webpack**: `vue-loader` の `exposeFilename: true` を設定（上記参照）
- **プロダクションモード**: `__file` はプロダクションでは利用できません（設計通り）

### 行番号が null になる

**原因:** `vnode.loc` はテンプレートコンパイラが付与するもので、すべてのケースで利用可能とは限りません。

**影響を受けるケース:**
- JSX で書かれたコンポーネント
- `h()` 関数で直接レンダリングしているコンポーネント
- 一部の動的コンポーネント

### ショートカットが反応しない

**確認事項:**
1. ブラウザのデベロッパーツールにフォーカスがないか
2. 他のアプリケーション/拡張機能がショートカットを横取りしていないか
3. カスタムショートカットの書式が正しいか（例: `'Alt+Shift+G'`）

**デバッグ方法:**

```ts
// コンソールからプログラマティックに起動して動作確認
import { activate } from 'vue-grab'
activate()
```

### クリップボードへのコピーが失敗する

**原因:** Clipboard API は安全なコンテキスト（HTTPS / localhost）でのみ利用可能です。

**解決策:**
- `localhost` または `127.0.0.1` でアクセスしていることを確認
- HTTP の場合は `onGrab` コールバックで独自のコピー処理を実装

```ts
app.use(VueGrab, {
  autoCopy: false,
  onGrab(result) {
    // フォールバック: textarea を使った従来のコピー
    const textarea = document.createElement('textarea')
    textarea.value = result.prompt
    document.body.appendChild(textarea)
    textarea.select()
    document.execCommand('copy')
    document.body.removeChild(textarea)
  },
})
```

### SSR / SSG 環境でエラーになる

**原因:** vue-grab は `document` や `window` にアクセスするため、サーバーサイドでは実行できません。

**解決策:**
- Nuxt 3: `.client.ts` サフィックスを使う（上記参照）
- その他の SSR: `typeof window !== 'undefined'` でガード

```ts
if (typeof window !== 'undefined' && import.meta.env.DEV) {
  import('vue-grab').then(({ VueGrab }) => {
    app.use(VueGrab)
  })
}
```
