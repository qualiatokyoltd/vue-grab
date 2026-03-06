# vue-grab

Select context for coding agents directly from your Vue app.

Point at any element and grab its Vue component context (component tree, file path, props, HTML text) for ChatGPT / Claude / Copilot.

Inspired by [react-grab](https://github.com/aidenybai/react-grab). Thank you ♡

- English: this file
- Japanese: [README.ja.md](./README.ja.md)

## Install

This repository is not published as this package on npm yet.
Install from GitHub:

```bash
npm install -D github:qualiatokyoltd/vue-grab
```

## 30-Second Setup (Recommended)

Add this to your app entry (`main.ts` / `main.js`):

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

## Usage

Once installed, hover any element and press:

- `⌘⇧G` (macOS) or `Alt+Shift+G` (Windows/Linux) to toggle grab mode
- `⌘C` / `Ctrl+C` (or click) to finalize selection

`vue-grab` copies an AI-ready prompt to your clipboard (and opens a prompt editor by default).

## Manual Installation

### Vite

If you prefer dynamic loading in development:

```html
<script type="module">
  if (import.meta.env.DEV) {
    import('vue-grab')
  }
</script>
```

### Nuxt 3

Use a client plugin (`plugins/vue-grab.client.ts`):

```ts
import { defineNuxtPlugin } from '#app'
import { VueGrab } from 'vue-grab'

export default defineNuxtPlugin((nuxtApp) => {
  if (import.meta.dev) {
    nuxtApp.vueApp.use(VueGrab)
  }
})
```

## Plugin Extensions

`vue-grab` supports plugin-style extensions for toolbar and context-menu actions.

```ts
import { registerPlugin } from 'vue-grab'

registerPlugin({
  name: 'custom-actions',
  actions: [
    {
      id: 'copy-json',
      label: 'Copy as JSON',
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

## Options

| Option | Type | Default |
|---|---|---|
| `locale` | `'en' \| 'ja' \| 'auto'` | `'auto'` |
| `shortcut` | `string` | macOS: `⌘⇧G` (`Cmd+Shift+G`), others: `Alt+Shift+G` |
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

## Notes

- Development mode only (uses Vue internals such as `__vueParentComponent`)
- Vue 3.x required
- Vite is recommended for better source path metadata

## Development

```bash
npm install
npm run dev
npm run build
```

## License

MIT
