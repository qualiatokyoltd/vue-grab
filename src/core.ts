/**
 * vue-grab core logic
 *
 * Walks the Vue 3 internal component tree via __vueParentComponent
 * to extract component names, file paths, and source locations.
 */

// ── Types ──────────────────────────────────────────────────────────

export interface ComponentInfo {
  name: string
  filePath: string | null
  line: number | null
  props: Record<string, unknown>
}

export interface GrabResult {
  element: HTMLElement
  components: ComponentInfo[]
  /** Formatted text ready to paste into an AI prompt */
  prompt: string
}

export interface GrabOptions {
  /** Keyboard shortcut to toggle grab mode (default: 'Alt+Shift+G') */
  shortcut?: string
  /** Called when an element is grabbed */
  onGrab?: (result: GrabResult) => void
  /** Copy the prompt to clipboard automatically (default: true) */
  autoCopy?: boolean
  /** Show the overlay UI (default: true) */
  showOverlay?: boolean
}

// ── Vue internal types (development mode only) ─────────────────────

interface VueInternalInstance {
  type: {
    name?: string
    __name?: string
    __file?: string
    props?: Record<string, unknown>
  }
  parent: VueInternalInstance | null
  props: Record<string, unknown>
  vnode: {
    loc?: {
      start: { line: number; column: number }
    }
  }
}

// ── Overlay renderer ───────────────────────────────────────────────

const OVERLAY_ID = '__vue-grab-overlay'
const TOOLTIP_ID = '__vue-grab-tooltip'
const BANNER_ID = '__vue-grab-banner'

let overlayEl: HTMLDivElement | null = null
let tooltipEl: HTMLDivElement | null = null
let bannerEl: HTMLDivElement | null = null

function ensureStyles() {
  if (document.getElementById('__vue-grab-styles')) return
  const style = document.createElement('style')
  style.id = '__vue-grab-styles'
  style.textContent = `
    #${OVERLAY_ID} {
      position: fixed;
      border: 2px solid #42b883;
      background: rgba(66, 184, 131, 0.08);
      pointer-events: none;
      z-index: 999998;
      transition: all 0.1s ease;
      border-radius: 4px;
      box-shadow: 0 0 0 1px rgba(66, 184, 131, 0.3);
    }
    #${TOOLTIP_ID} {
      position: fixed;
      background: #1a1a2e;
      color: #e0e0e0;
      padding: 8px 14px;
      border-radius: 8px;
      font-family: 'SF Mono', 'Fira Code', 'Cascadia Code', monospace;
      font-size: 12px;
      line-height: 1.5;
      z-index: 999999;
      pointer-events: none;
      white-space: pre;
      border: 1px solid #42b883;
      box-shadow: 0 4px 20px rgba(0,0,0,0.4);
      max-width: 500px;
    }
    #${TOOLTIP_ID} .vg-component-name {
      color: #42b883;
      font-weight: 600;
    }
    #${TOOLTIP_ID} .vg-file-path {
      color: #8892b0;
      font-size: 11px;
    }
    #${BANNER_ID} {
      position: fixed;
      top: 0;
      left: 0;
      right: 0;
      height: 3px;
      background: linear-gradient(90deg, #42b883, #35495e, #42b883);
      background-size: 200% 100%;
      animation: vg-slide 2s linear infinite;
      z-index: 999999;
    }
    #${BANNER_ID}::after {
      content: '🔍 vue-grab active — click to grab • Esc to exit';
      position: fixed;
      top: 8px;
      left: 50%;
      transform: translateX(-50%);
      background: #1a1a2e;
      color: #42b883;
      padding: 6px 16px;
      border-radius: 20px;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
      font-size: 12px;
      font-weight: 500;
      border: 1px solid rgba(66, 184, 131, 0.4);
      box-shadow: 0 4px 12px rgba(0,0,0,0.3);
      z-index: 999999;
    }
    @keyframes vg-slide {
      0% { background-position: 200% 0; }
      100% { background-position: -200% 0; }
    }
    .vue-grab-active * {
      cursor: crosshair !important;
    }
  `
  document.head.appendChild(style)
}

function showBanner() {
  ensureStyles()
  if (bannerEl) return
  bannerEl = document.createElement('div')
  bannerEl.id = BANNER_ID
  document.body.appendChild(bannerEl)
  document.body.classList.add('vue-grab-active')
}

function hideBanner() {
  bannerEl?.remove()
  bannerEl = null
  document.body.classList.remove('vue-grab-active')
}

function showOverlay(target: HTMLElement) {
  ensureStyles()
  if (!overlayEl) {
    overlayEl = document.createElement('div')
    overlayEl.id = OVERLAY_ID
    document.body.appendChild(overlayEl)
  }
  if (!tooltipEl) {
    tooltipEl = document.createElement('div')
    tooltipEl.id = TOOLTIP_ID
    document.body.appendChild(tooltipEl)
  }

  const rect = target.getBoundingClientRect()
  overlayEl.style.top = `${rect.top}px`
  overlayEl.style.left = `${rect.left}px`
  overlayEl.style.width = `${rect.width}px`
  overlayEl.style.height = `${rect.height}px`
  overlayEl.style.display = 'block'

  const components = walkComponentTree(target)
  const topComponent = components[0]

  let tooltipHTML = ''
  if (topComponent) {
    tooltipHTML = `<span class="vg-component-name">&lt;${topComponent.name}&gt;</span>`
    if (topComponent.filePath) {
      const shortPath = topComponent.filePath.replace(/^.*\/src\//, 'src/')
      tooltipHTML += `\n<span class="vg-file-path">${shortPath}${topComponent.line ? `:${topComponent.line}` : ''}</span>`
    }
    if (components.length > 1) {
      tooltipHTML += `\n<span class="vg-file-path">↑ ${components.slice(1).map(c => c.name).join(' → ')}</span>`
    }
  } else {
    tooltipHTML = `<span class="vg-file-path">&lt;${target.tagName.toLowerCase()}&gt; (no Vue component)</span>`
  }
  tooltipEl.innerHTML = tooltipHTML

  // Position tooltip
  const tooltipTop = rect.bottom + 8
  const tooltipLeft = rect.left
  tooltipEl.style.top = `${Math.min(tooltipTop, window.innerHeight - 80)}px`
  tooltipEl.style.left = `${Math.min(tooltipLeft, window.innerWidth - 350)}px`
  tooltipEl.style.display = 'block'
}

function hideOverlay() {
  if (overlayEl) overlayEl.style.display = 'none'
  if (tooltipEl) tooltipEl.style.display = 'none'
}

function removeAllUI() {
  hideBanner()
  hideOverlay()
  document.getElementById('__vue-grab-styles')?.remove()
  overlayEl?.remove()
  tooltipEl?.remove()
  overlayEl = null
  tooltipEl = null
}

// ── Component tree walker ─────────────────────────────────────────

function getVueInstance(el: HTMLElement): VueInternalInstance | null {
  // Vue 3 development mode attaches __vueParentComponent to DOM nodes
  return (el as any).__vueParentComponent ?? null
}

function getComponentName(instance: VueInternalInstance): string {
  return (
    instance.type.__name ||
    instance.type.name ||
    extractNameFromFile(instance.type.__file) ||
    'Anonymous'
  )
}

function extractNameFromFile(filePath: string | undefined | null): string | null {
  if (!filePath) return null
  const match = filePath.match(/([^/\\]+)\.\w+$/)
  return match ? match[1] : null
}

function extractComponentInfo(instance: VueInternalInstance): ComponentInfo {
  return {
    name: getComponentName(instance),
    filePath: instance.type.__file ?? null,
    line: instance.vnode?.loc?.start?.line ?? null,
    props: { ...instance.props },
  }
}

export function walkComponentTree(el: HTMLElement): ComponentInfo[] {
  const components: ComponentInfo[] = []

  // Walk up the DOM to find the nearest Vue component instance
  let current: HTMLElement | null = el
  let instance: VueInternalInstance | null = null

  while (current && !instance) {
    instance = getVueInstance(current)
    if (!instance) current = current.parentElement
  }

  // Walk up the component tree
  while (instance) {
    components.push(extractComponentInfo(instance))
    instance = instance.parent
  }

  return components
}

// ── Prompt formatter ──────────────────────────────────────────────

export function formatPrompt(result: Pick<GrabResult, 'element' | 'components'>): string {
  const { element, components } = result
  const lines: string[] = []

  lines.push('## Vue Component Info (grabbed with vue-grab)')
  lines.push('')
  lines.push(`**Element:** \`<${element.tagName.toLowerCase()}>\``)

  if (element.className) {
    lines.push(`**Classes:** \`${element.className}\``)
  }

  if (element.textContent?.trim()) {
    const text = element.textContent.trim().slice(0, 100)
    lines.push(`**Text:** "${text}"`)
  }

  lines.push('')

  if (components.length === 0) {
    lines.push('_No Vue component found for this element._')
    return lines.join('\n')
  }

  lines.push('### Component Tree (nearest → root)')
  lines.push('')

  for (const [i, comp] of components.entries()) {
    const indent = '  '.repeat(i)
    lines.push(`${indent}${i + 1}. **\`<${comp.name}>\`**`)
    if (comp.filePath) {
      const loc = comp.line ? `:${comp.line}` : ''
      lines.push(`${indent}   File: \`${comp.filePath}${loc}\``)
    }
    const propKeys = Object.keys(comp.props).filter(k => !k.startsWith('__'))
    if (propKeys.length > 0) {
      lines.push(`${indent}   Props: ${propKeys.join(', ')}`)
    }
  }

  lines.push('')
  lines.push('---')
  lines.push('Please modify the component above. Describe what you want to change:')

  return lines.join('\n')
}

// ── Grab mode controller ──────────────────────────────────────────

let isActive = false
let currentOptions: GrabOptions = {}

function handleMouseMove(e: MouseEvent) {
  const target = e.target as HTMLElement
  if (
    target.id === OVERLAY_ID ||
    target.id === TOOLTIP_ID ||
    target.id === BANNER_ID
  ) return
  showOverlay(target)
}

function handleClick(e: MouseEvent) {
  e.preventDefault()
  e.stopPropagation()
  e.stopImmediatePropagation()

  const target = e.target as HTMLElement
  if (
    target.id === OVERLAY_ID ||
    target.id === TOOLTIP_ID ||
    target.id === BANNER_ID
  ) return

  const components = walkComponentTree(target)
  const result: GrabResult = {
    element: target,
    components,
    prompt: '',
  }
  result.prompt = formatPrompt(result)

  // Auto-copy to clipboard
  if (currentOptions.autoCopy !== false) {
    navigator.clipboard?.writeText(result.prompt).catch(() => {
      // Fallback: do nothing if clipboard API is not available
    })
  }

  currentOptions.onGrab?.(result)

  // Log to console with nice formatting
  console.group('%c vue-grab ', 'background: #42b883; color: white; border-radius: 4px; padding: 2px 6px;')
  console.log(result.prompt)
  console.log('Components:', components)
  console.groupEnd()

  deactivate()
}

function handleKeyDown(e: KeyboardEvent) {
  if (e.key === 'Escape') {
    e.preventDefault()
    deactivate()
  }
}

export function activate(options: GrabOptions = {}) {
  if (isActive) return
  isActive = true
  currentOptions = options

  if (options.showOverlay !== false) {
    showBanner()
  }

  document.addEventListener('mousemove', handleMouseMove, true)
  document.addEventListener('click', handleClick, true)
  document.addEventListener('keydown', handleKeyDown, true)
}

export function deactivate() {
  if (!isActive) return
  isActive = false

  document.removeEventListener('mousemove', handleMouseMove, true)
  document.removeEventListener('click', handleClick, true)
  document.removeEventListener('keydown', handleKeyDown, true)

  removeAllUI()
}

export function toggle(options: GrabOptions = {}) {
  if (isActive) {
    deactivate()
  } else {
    activate(options)
  }
}

export function isGrabActive(): boolean {
  return isActive
}

// ── Keyboard shortcut listener ────────────────────────────────────

function parseShortcut(shortcut: string): { alt: boolean; shift: boolean; ctrl: boolean; meta: boolean; key: string } {
  const parts = shortcut.toLowerCase().split('+').map(s => s.trim())
  return {
    alt: parts.includes('alt'),
    shift: parts.includes('shift'),
    ctrl: parts.includes('ctrl') || parts.includes('control'),
    meta: parts.includes('meta') || parts.includes('cmd') || parts.includes('command'),
    key: parts.filter(p => !['alt', 'shift', 'ctrl', 'control', 'meta', 'cmd', 'command'].includes(p))[0] || 'g',
  }
}

export function setupShortcut(shortcut: string, options: GrabOptions = {}): () => void {
  const parsed = parseShortcut(shortcut)

  const handler = (e: KeyboardEvent) => {
    if (
      e.altKey === parsed.alt &&
      e.shiftKey === parsed.shift &&
      e.ctrlKey === parsed.ctrl &&
      e.metaKey === parsed.meta &&
      e.key.toLowerCase() === parsed.key
    ) {
      e.preventDefault()
      toggle(options)
    }
  }

  document.addEventListener('keydown', handler)
  return () => document.removeEventListener('keydown', handler)
}
