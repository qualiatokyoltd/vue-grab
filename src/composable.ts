/**
 * vue-grab — Composable API
 *
 * Usage:
 *   import { useVueGrab } from 'vue-grab'
 *
 *   const { activate, deactivate, toggle, isActive } = useVueGrab({
 *     onGrab(result) {
 *       console.log(result.prompt)
 *     },
 *   })
 */

import { ref, onUnmounted } from 'vue'
import { activate, deactivate, toggle, isGrabActive, setupShortcut, getDefaultShortcut } from './core'
import type { GrabOptions, GrabResult } from './core'

export interface UseVueGrabReturn {
  /** Activate grab mode */
  activate: () => void
  /** Deactivate grab mode */
  deactivate: () => void
  /** Toggle grab mode */
  toggle: () => void
  /** Reactive ref: whether grab mode is active */
  isActive: ReturnType<typeof ref<boolean>>
  /** Last grabbed result */
  lastResult: ReturnType<typeof ref<GrabResult | null>>
}

export function useVueGrab(options: GrabOptions = {}): UseVueGrabReturn {
  const isActiveRef = ref(isGrabActive())
  const lastResult = ref<GrabResult | null>(null)

  const wrappedOptions: GrabOptions = {
    ...options,
    onGrab(result) {
      lastResult.value = result
      isActiveRef.value = false
      options.onGrab?.(result)
    },
  }

  const shortcut = options.shortcut ?? getDefaultShortcut()
  const cleanupShortcut = setupShortcut(shortcut, wrappedOptions)

  onUnmounted(() => {
    cleanupShortcut()
    if (isGrabActive()) deactivate()
  })

  return {
    activate: () => {
      activate(wrappedOptions)
      isActiveRef.value = true
    },
    deactivate: () => {
      deactivate()
      isActiveRef.value = false
    },
    toggle: () => {
      toggle(wrappedOptions)
      isActiveRef.value = isGrabActive()
    },
    isActive: isActiveRef,
    lastResult,
  }
}
