/**
 * vue-grab — Vue 3 Plugin
 *
 * Usage:
 *   import { VueGrab } from 'vue-grab'
 *   app.use(VueGrab)                       // default options
 *   app.use(VueGrab, { shortcut: 'Alt+G' }) // custom shortcut
 */

import type { App, Plugin } from 'vue'
import {
  activate,
  deactivate,
  toggle,
  isGrabActive,
  setupShortcut,
  formatPrompt,
  walkComponentTree,
  getDefaultShortcut,
  getLocaleMessages,
  formatShortcutLabel,
  registerPlugin,
  unregisterPlugin,
  clearPlugins,
} from './core'
import type {
  GrabOptions,
  GrabResult,
  ComponentInfo,
  GrabPlugin,
  GrabAction,
  GrabActionContext,
  GrabLocale,
  GrabLocaleOption,
} from './core'

export type {
  GrabOptions,
  GrabResult,
  ComponentInfo,
  GrabPlugin,
  GrabAction,
  GrabActionContext,
  GrabLocale,
  GrabLocaleOption,
}
export {
  activate,
  deactivate,
  toggle,
  isGrabActive,
  formatPrompt,
  walkComponentTree,
  getDefaultShortcut,
  getLocaleMessages,
  formatShortcutLabel,
  registerPlugin,
  unregisterPlugin,
  clearPlugins,
}

export const VueGrab: Plugin = {
  install(_app: App, options: GrabOptions = {}) {
    const shortcut = options.shortcut ?? getDefaultShortcut()
    const i18n = getLocaleMessages(options.locale ?? 'auto')
    const shortcutLabel = formatShortcutLabel(shortcut)

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
      `%c vue-grab %c ${i18n.install_log.replace('{shortcut}', shortcutLabel)} `,
      'background: #42b883; color: white; border-radius: 4px 0 0 4px; padding: 2px 6px;',
      'background: #35495e; color: #42b883; border-radius: 0 4px 4px 0; padding: 2px 6px;',
    )

    // Cleanup on app unmount
    _app.config.globalProperties.__vueGrabCleanup = cleanup
  },
}

export default VueGrab
