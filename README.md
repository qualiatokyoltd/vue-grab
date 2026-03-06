# vue-grab

**Click any element in your Vue app → get component info → ask AI to change it.**

The Vue 3 equivalent of [react-grab](https://github.com/nicholasgriffintn/react-grab). Hover over any element, click it, and get a formatted prompt with the component name, file path, props, and full component tree — ready to paste into Claude, ChatGPT, or any AI assistant.

## How It Works

1. Press **Alt+Shift+G** (or call `activate()`) to enter grab mode
2. Hover over any element — a green overlay shows the component info
3. Click to grab — component details are copied to your clipboard
4. Paste into your AI assistant: _"Change this button's color to red"_
5. The AI knows exactly which file and component to edit

Under the hood, vue-grab uses Vue 3's internal `__vueParentComponent` property (available in development mode) to walk up the component tree and extract:

- **Component name** (`instance.type.name` / `__name`)
- **File path** (`instance.type.__file` — injected by Vite)
- **Line number** (`vnode.loc.start.line`)
- **Props** (`instance.props`)

## Install

```bash
npm install vue-grab
```

## Quick Start

### Plugin (recommended)

```ts
import { createApp } from 'vue'
import { VueGrab } from 'vue-grab'
import App from './App.vue'

const app = createApp(App)

// Development only — automatically tree-shaken in production
app.use(VueGrab)

app.mount('#app')
```

Then press **Alt+Shift+G** to toggle grab mode.

### Composable

```vue
<script setup>
import { useVueGrab } from 'vue-grab/composable'

const { toggle, isActive, lastResult } = useVueGrab({
  onGrab(result) {
    console.log(result.prompt)    // formatted markdown
    console.log(result.components) // component tree array
  },
})
</script>

<template>
  <button @click="toggle">
    {{ isActive ? 'Cancel' : 'Grab' }}
  </button>
  <pre v-if="lastResult">{{ lastResult.prompt }}</pre>
</template>
```

### Programmatic

```ts
import { activate, deactivate, toggle } from 'vue-grab'

// Activate with options
activate({
  autoCopy: true,
  onGrab(result) {
    sendToAI(result.prompt)
  },
})
```

## Options

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `shortcut` | `string` | `'Alt+Shift+G'` | Keyboard shortcut to toggle grab mode |
| `onGrab` | `(result: GrabResult) => void` | — | Callback when an element is grabbed |
| `autoCopy` | `boolean` | `true` | Auto-copy prompt to clipboard |
| `showOverlay` | `boolean` | `true` | Show the highlight overlay UI |

## GrabResult

```ts
interface GrabResult {
  element: HTMLElement          // The clicked DOM element
  components: ComponentInfo[]   // Component tree (nearest → root)
  prompt: string               // Formatted markdown prompt
}

interface ComponentInfo {
  name: string                  // Component name
  filePath: string | null       // Source file path
  line: number | null           // Source line number
  props: Record<string, unknown> // Component props
}
```

## File Structure

| File | Role |
|------|------|
| `src/core.ts` | Framework-agnostic core: tree walking, overlay, prompt formatting |
| `src/index.ts` | Vue 3 plugin (`app.use(VueGrab)`) |
| `src/composable.ts` | `useVueGrab()` composable for component-level use |

## Development

```bash
# Install dependencies
npm install

# Run the demo
npx vite

# Build the library
npm run build
```

## Requirements

- **Vue 3.x** (uses internal development-mode APIs)
- **Development mode only** — `__vueParentComponent` is not available in production builds
- Works best with **Vite** (for `__file` path injection)

## License

MIT
