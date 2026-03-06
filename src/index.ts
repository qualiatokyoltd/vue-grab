/**
 * vue-grab — Vue 3 Plugin
 *
 * Usage:
 *   import { VueGrab } from 'vue-grab'
 *   app.use(VueGrab)                       // default options
 *   app.use(VueGrab, { shortcut: 'Alt+G' }) // custom shortcut
 */

import type { App, Plugin } from 'vue'
import { activate, deactivate, toggle, isGrabActive, setupShortcut, formatPrompt, walkComponentTree } from './core'
import type { GrabOptions, GrabResult, ComponentInfo } from './core'

export type { GrabOptions, GrabResult, ComponentInfo }
export { activate, deactivate, toggle, isGrabActive, formatPrompt, walkComponentTree }

export const VueGrab: Plugin = {
  install(_app: App, options: GrabOptions = {}) {
    // Only install in development mode
    if (typeof process !== 'undefined' && process.env?.NODE_ENV === 'production') {
      return
    }

    const shortcut = options.shortcut ?? 'Alt+Shift+G'

    // Register keyboard shortcut
    const cleanup = setupShortcut(shortcut, options)

    // Provide grab functions via app.config.globalProperties
    _app.config.globalProperties.$vueGrab = {
      activate: () => activate(options),
      deactivate,
      toggle: () => toggle(options),
      isActive: isGrabActive,
    }

    // Also provide via provide/inject
    _app.provide('vue-grab', {
      activate: () => activate(options),
      deactivate,
      toggle: () => toggle(options),
      isActive: isGrabActive,
    })

    // Log install message
    console.log(
      `%c vue-grab %c Press ${shortcut} to grab components `,
      'background: #42b883; color: white; border-radius: 4px 0 0 4px; padding: 2px 6px;',
      'background: #35495e; color: #42b883; border-radius: 0 4px 4px 0; padding: 2px 6px;',
    )

    // Cleanup on app unmount
    _app.config.globalProperties.__vueGrabCleanup = cleanup
  },
}

export default VueGrab
