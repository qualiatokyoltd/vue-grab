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

export type GrabLocale = 'en' | 'ja'
export type GrabLocaleOption = GrabLocale | 'auto'

export interface GrabOptions {
  /** Keyboard shortcut to toggle grab mode */
  shortcut?: string
  /** UI and prompt locale (default: 'auto') */
  locale?: GrabLocaleOption
  /** How shortcut activation behaves (default: 'toggle') */
  activationMode?: 'toggle' | 'hold'
  /** Delay before hold activation starts in ms (default: 180) */
  keyHoldDuration?: number
  /** Allow activation shortcut while typing in inputs (default: false) */
  allowActivationInsideInput?: boolean
  /** Called when an element is grabbed */
  onGrab?: (result: GrabResult) => void
  /** Called before prompt text is copied */
  onBeforeCopy?: (result: GrabResult) => void | Promise<void>
  /** Transform copied prompt text */
  transformCopyContent?: (content: string, result: GrabResult) => string | Promise<string>
  /** Called after copy attempt */
  onAfterCopy?: (result: GrabResult, success: boolean) => void
  /** Called when copy succeeds */
  onCopySuccess?: (result: GrabResult, content: string) => void
  /** Called when copy fails */
  onCopyError?: (error: Error, result: GrabResult) => void
  /** Copy the prompt to clipboard automatically (default: true) */
  autoCopy?: boolean
  /** Show the overlay UI (default: true) */
  showOverlay?: boolean
  /** Let user edit prompt before callback/copy (default: true) */
  editPrompt?: boolean
}

export interface GrabActionContext {
  element: HTMLElement | null
  components: ComponentInfo[]
  prompt: string
  grab: () => Promise<void>
  deactivate: () => void
}

export interface GrabAction {
  id: string
  label: string
  placement: 'toolbar' | 'context-menu'
  isVisible?: (context: GrabActionContext) => boolean
  run: (context: GrabActionContext) => void | Promise<void>
}

export interface GrabPlugin {
  name: string
  actions?: GrabAction[]
  onActivate?: () => void
  onDeactivate?: () => void
  onGrab?: (result: GrabResult) => void
  onBeforeCopy?: (result: GrabResult) => void | Promise<void>
  transformCopyContent?: (content: string, result: GrabResult) => string | Promise<string>
  onAfterCopy?: (result: GrabResult, success: boolean) => void
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
const PROMPT_MODAL_ID = '__vue-grab-prompt-modal'
const TOOLBAR_ID = '__vue-grab-toolbar'
const CONTEXT_MENU_ID = '__vue-grab-context-menu'

let overlayEl: HTMLDivElement | null = null
let tooltipEl: HTMLDivElement | null = null
let bannerEl: HTMLDivElement | null = null
let toolbarEl: HTMLDivElement | null = null
let contextMenuEl: HTMLDivElement | null = null
let contextMenuCloseHandler: ((e: MouseEvent) => void) | null = null

const registeredPlugins: GrabPlugin[] = []
let currentLocale: GrabLocale = 'en'

const messages: Record<GrabLocale, Record<string, string>> = {
  en: {
    banner_active: '🔍 vue-grab active — click or ⌘/Ctrl+C to grab • Esc to exit',
    modal_title: 'Edit prompt before sending to AI',
    modal_help: 'Tip: ⌘/Ctrl + Enter to confirm',
    modal_cancel: 'Cancel',
    modal_confirm: 'Use This Prompt',
    prompt_title: '## Vue Component Info (grabbed with vue-grab)',
    prompt_element: 'Element',
    prompt_classes: 'Classes',
    prompt_text: 'Text',
    prompt_no_component: '_No Vue component found for this element._',
    prompt_tree: '### Component Tree (nearest -> root)',
    prompt_file: 'File',
    prompt_props: 'Props',
    prompt_tail: 'Please modify the component above. Describe what you want to change:',
    context_no_hovered: '_No hovered element selected yet._',
    toolbar_grab: 'Grab',
    toolbar_exit: 'Exit',
    menu_grab_here: 'Grab Here',
    menu_cancel: 'Cancel',
    tooltip_no_component: '(no Vue component)',
    install_log: 'Press {shortcut} to grab components',
  },
  ja: {
    banner_active: '🔍 vue-grab 有効 — クリック または ⌘/Ctrl+C で取得 • Esc で終了',
    modal_title: 'AIに渡す前にプロンプトを編集',
    modal_help: 'ヒント: ⌘/Ctrl + Enter で確定',
    modal_cancel: 'キャンセル',
    modal_confirm: 'この内容を使う',
    prompt_title: '## Vue コンポーネント情報 (vue-grab)',
    prompt_element: '要素',
    prompt_classes: 'クラス',
    prompt_text: 'テキスト',
    prompt_no_component: '_この要素に対応する Vue コンポーネントが見つかりませんでした。_',
    prompt_tree: '### コンポーネントツリー (最も近い -> ルート)',
    prompt_file: 'ファイル',
    prompt_props: 'Props',
    prompt_tail: '上記コンポーネントを修正してください。変更したい内容を記述します:',
    context_no_hovered: '_現在ホバー中の要素がありません。_',
    toolbar_grab: '取得',
    toolbar_exit: '終了',
    menu_grab_here: 'ここを取得',
    menu_cancel: 'キャンセル',
    tooltip_no_component: '(Vue コンポーネントなし)',
    install_log: '{shortcut} でコンポーネント情報を取得できます',
  },
}

export function resolveGrabLocale(locale: GrabLocaleOption = 'auto'): GrabLocale {
  if (locale === 'en' || locale === 'ja') return locale
  if (typeof navigator === 'undefined') return 'en'
  return navigator.language.toLowerCase().startsWith('ja') ? 'ja' : 'en'
}

function t(key: string): string {
  return messages[currentLocale][key] ?? messages.en[key] ?? key
}

export function registerPlugin(plugin: GrabPlugin): () => void {
  const existingIndex = registeredPlugins.findIndex((p) => p.name === plugin.name)
  if (existingIndex >= 0) {
    registeredPlugins[existingIndex] = plugin
  } else {
    registeredPlugins.push(plugin)
  }
  return () => unregisterPlugin(plugin.name)
}

export function unregisterPlugin(name: string) {
  const index = registeredPlugins.findIndex((p) => p.name === name)
  if (index >= 0) registeredPlugins.splice(index, 1)
}

export function clearPlugins() {
  registeredPlugins.length = 0
}

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
      content: attr(data-message);
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
    #${PROMPT_MODAL_ID} {
      position: fixed;
      inset: 0;
      background: rgba(9, 10, 18, 0.72);
      z-index: 1000000;
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 20px;
    }
    #${PROMPT_MODAL_ID} .vg-prompt-panel {
      width: min(900px, 100%);
      max-height: 85vh;
      background: #101626;
      border: 1px solid rgba(66, 184, 131, 0.4);
      border-radius: 14px;
      box-shadow: 0 12px 48px rgba(0,0,0,0.5);
      display: flex;
      flex-direction: column;
      gap: 12px;
      padding: 16px;
    }
    #${PROMPT_MODAL_ID} .vg-prompt-title {
      color: #42b883;
      font-size: 14px;
      font-weight: 600;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
    }
    #${PROMPT_MODAL_ID} .vg-prompt-help {
      color: #9aa2c2;
      font-size: 12px;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
    }
    #${PROMPT_MODAL_ID} .vg-prompt-textarea {
      width: 100%;
      min-height: 320px;
      resize: vertical;
      font-family: 'SF Mono', 'Fira Code', 'Cascadia Code', monospace;
      font-size: 12px;
      line-height: 1.5;
      background: #0a0f1d;
      color: #d7def7;
      border: 1px solid #2a3656;
      border-radius: 10px;
      padding: 12px;
      outline: none;
    }
    #${PROMPT_MODAL_ID} .vg-prompt-textarea:focus {
      border-color: #42b883;
      box-shadow: 0 0 0 1px rgba(66, 184, 131, 0.4);
    }
    #${PROMPT_MODAL_ID} .vg-prompt-actions {
      display: flex;
      justify-content: flex-end;
      gap: 8px;
    }
    #${PROMPT_MODAL_ID} button {
      border-radius: 8px;
      border: 1px solid #2d3a5d;
      background: #131b30;
      color: #d7def7;
      padding: 8px 14px;
      cursor: pointer;
      font-size: 12px;
      font-weight: 600;
    }
    #${PROMPT_MODAL_ID} .vg-prompt-confirm {
      background: #42b883;
      border-color: #42b883;
      color: #081814;
    }
    #${TOOLBAR_ID} {
      position: fixed;
      top: 14px;
      right: 16px;
      z-index: 1000000;
      background: rgba(16, 22, 38, 0.96);
      border: 1px solid rgba(66, 184, 131, 0.4);
      border-radius: 10px;
      box-shadow: 0 10px 32px rgba(0, 0, 0, 0.45);
      display: flex;
      gap: 8px;
      padding: 8px;
    }
    #${TOOLBAR_ID} button,
    #${CONTEXT_MENU_ID} button {
      border-radius: 8px;
      border: 1px solid #2d3a5d;
      background: #131b30;
      color: #d7def7;
      padding: 7px 10px;
      cursor: pointer;
      font-size: 12px;
      line-height: 1;
      white-space: nowrap;
    }
    #${TOOLBAR_ID} button:hover,
    #${CONTEXT_MENU_ID} button:hover {
      border-color: #42b883;
      color: #42b883;
    }
    #${TOOLBAR_ID} .vg-primary {
      background: #42b883;
      border-color: #42b883;
      color: #081814;
      font-weight: 700;
    }
    #${CONTEXT_MENU_ID} {
      position: fixed;
      z-index: 1000000;
      background: rgba(16, 22, 38, 0.98);
      border: 1px solid rgba(66, 184, 131, 0.5);
      border-radius: 10px;
      box-shadow: 0 10px 32px rgba(0, 0, 0, 0.5);
      padding: 8px;
      min-width: 190px;
      display: flex;
      flex-direction: column;
      gap: 6px;
    }
  `
  document.head.appendChild(style)
}

function showBanner() {
  ensureStyles()
  if (bannerEl) return
  bannerEl = document.createElement('div')
  bannerEl.id = BANNER_ID
  bannerEl.setAttribute('data-message', t('banner_active'))
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
      tooltipHTML = `<span class="vg-file-path">&lt;${target.tagName.toLowerCase()}&gt; ${t('tooltip_no_component')}</span>`
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
  closeContextMenu()
  removeToolbar()
  document.getElementById('__vue-grab-styles')?.remove()
  overlayEl?.remove()
  tooltipEl?.remove()
  overlayEl = null
  tooltipEl = null
}

function openPromptEditor(initialPrompt: string): Promise<string | null> {
  ensureStyles()

  return new Promise((resolve) => {
    const modal = document.createElement('div')
    modal.id = PROMPT_MODAL_ID
    modal.innerHTML = `
      <div class="vg-prompt-panel" role="dialog" aria-modal="true" aria-label="Edit AI prompt">
        <div class="vg-prompt-title">${t('modal_title')}</div>
        <div class="vg-prompt-help">${t('modal_help')}</div>
        <textarea class="vg-prompt-textarea"></textarea>
        <div class="vg-prompt-actions">
          <button type="button" class="vg-prompt-cancel">${t('modal_cancel')}</button>
          <button type="button" class="vg-prompt-confirm">${t('modal_confirm')}</button>
        </div>
      </div>
    `

    const textarea = modal.querySelector('.vg-prompt-textarea') as HTMLTextAreaElement
    const confirmBtn = modal.querySelector('.vg-prompt-confirm') as HTMLButtonElement
    const cancelBtn = modal.querySelector('.vg-prompt-cancel') as HTMLButtonElement

    textarea.value = initialPrompt
    const cleanup = () => modal.remove()
    const confirm = () => {
      const value = textarea.value.trim()
      cleanup()
      resolve(value || initialPrompt)
    }
    const cancel = () => {
      cleanup()
      resolve(null)
    }

    confirmBtn.addEventListener('click', confirm)
    cancelBtn.addEventListener('click', cancel)
    modal.addEventListener('click', (e) => {
      if (e.target === modal) cancel()
    })
    textarea.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        e.preventDefault()
        cancel()
      }
      if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
        e.preventDefault()
        confirm()
      }
    })

    document.body.appendChild(modal)
    textarea.focus()
    textarea.setSelectionRange(textarea.value.length, textarea.value.length)
  })
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

  lines.push(t('prompt_title'))
  lines.push('')
  lines.push(`**${t('prompt_element')}:** \`<${element.tagName.toLowerCase()}>\``)

  if (element.className) {
    lines.push(`**${t('prompt_classes')}:** \`${element.className}\``)
  }

  if (element.textContent?.trim()) {
    const text = element.textContent.trim().slice(0, 100)
    lines.push(`**${t('prompt_text')}:** "${text}"`)
  }

  lines.push('')

  if (components.length === 0) {
    lines.push(t('prompt_no_component'))
    return lines.join('\n')
  }

  lines.push(t('prompt_tree'))
  lines.push('')

  for (const [i, comp] of components.entries()) {
    const indent = '  '.repeat(i)
    lines.push(`${indent}${i + 1}. **\`<${comp.name}>\`**`)
    if (comp.filePath) {
      const loc = comp.line ? `:${comp.line}` : ''
      lines.push(`${indent}   ${t('prompt_file')}: \`${comp.filePath}${loc}\``)
    }
    const propKeys = Object.keys(comp.props).filter(k => !k.startsWith('__'))
    if (propKeys.length > 0) {
      lines.push(`${indent}   ${t('prompt_props')}: ${propKeys.join(', ')}`)
    }
  }

  lines.push('')
  lines.push('---')
  lines.push(t('prompt_tail'))

  return lines.join('\n')
}

function createGrabResult(target: HTMLElement): GrabResult {
  const components = walkComponentTree(target)
  const result: GrabResult = {
    element: target,
    components,
    prompt: '',
  }
  result.prompt = formatPrompt(result)
  return result
}

// ── Grab mode controller ──────────────────────────────────────────

let isActive = false
let currentOptions: GrabOptions = {}
let hoveredTarget: HTMLElement | null = null

function isGrabUiElement(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false
  return !!target.closest(
    `#${OVERLAY_ID}, #${TOOLTIP_ID}, #${BANNER_ID}, #${PROMPT_MODAL_ID}, #${TOOLBAR_ID}, #${CONTEXT_MENU_ID}`,
  )
}

function closeContextMenu() {
  if (!contextMenuEl) return
  contextMenuEl.remove()
  contextMenuEl = null
  if (contextMenuCloseHandler) {
    document.removeEventListener('click', contextMenuCloseHandler, true)
    contextMenuCloseHandler = null
  }
}

function removeToolbar() {
  toolbarEl?.remove()
  toolbarEl = null
}

function buildActionContext(target: HTMLElement | null): GrabActionContext {
  const components = target ? walkComponentTree(target) : []
  const prompt = target
    ? formatPrompt({ element: target, components })
    : t('context_no_hovered')

  return {
    element: target,
    components,
    prompt,
    grab: async () => {
      if (!target) return
      await finalizeGrab(target)
    },
    deactivate,
  }
}

function listVisibleActions(placement: GrabAction['placement'], target: HTMLElement | null): GrabAction[] {
  const context = buildActionContext(target)
  return registeredPlugins.flatMap((plugin) =>
    (plugin.actions ?? []).filter((action) => {
      if (action.placement !== placement) return false
      if (!action.isVisible) return true
      try {
        return action.isVisible(context)
      } catch {
        return false
      }
    }),
  )
}

async function runAction(action: GrabAction, target: HTMLElement | null) {
  const context = buildActionContext(target)
  await action.run(context)
}

function renderToolbar() {
  if (!isActive) return
  ensureStyles()
  removeToolbar()

  toolbarEl = document.createElement('div')
  toolbarEl.id = TOOLBAR_ID

  const grabButton = document.createElement('button')
  grabButton.type = 'button'
  grabButton.className = 'vg-primary'
  grabButton.textContent = t('toolbar_grab')
  grabButton.addEventListener('click', () => {
    if (!hoveredTarget) return
    void finalizeGrab(hoveredTarget)
  })
  toolbarEl.appendChild(grabButton)

  for (const action of listVisibleActions('toolbar', hoveredTarget)) {
    const btn = document.createElement('button')
    btn.type = 'button'
    btn.textContent = action.label
    btn.addEventListener('click', () => {
      void runAction(action, hoveredTarget)
    })
    toolbarEl.appendChild(btn)
  }

  const exitButton = document.createElement('button')
  exitButton.type = 'button'
  exitButton.textContent = t('toolbar_exit')
  exitButton.addEventListener('click', () => deactivate())
  toolbarEl.appendChild(exitButton)

  document.body.appendChild(toolbarEl)
}

function showContextMenu(x: number, y: number, target: HTMLElement) {
  ensureStyles()
  closeContextMenu()

  contextMenuEl = document.createElement('div')
  contextMenuEl.id = CONTEXT_MENU_ID
  contextMenuEl.style.left = `${Math.min(x, window.innerWidth - 220)}px`
  contextMenuEl.style.top = `${Math.min(y, window.innerHeight - 220)}px`

  const grabButton = document.createElement('button')
  grabButton.type = 'button'
  grabButton.textContent = t('menu_grab_here')
  grabButton.addEventListener('click', () => {
    closeContextMenu()
    void finalizeGrab(target)
  })
  contextMenuEl.appendChild(grabButton)

  for (const action of listVisibleActions('context-menu', target)) {
    const btn = document.createElement('button')
    btn.type = 'button'
    btn.textContent = action.label
    btn.addEventListener('click', () => {
      closeContextMenu()
      void runAction(action, target)
    })
    contextMenuEl.appendChild(btn)
  }

  const cancelButton = document.createElement('button')
  cancelButton.type = 'button'
  cancelButton.textContent = t('menu_cancel')
  cancelButton.addEventListener('click', () => closeContextMenu())
  contextMenuEl.appendChild(cancelButton)

  contextMenuCloseHandler = (e: MouseEvent) => {
    if (!contextMenuEl) return
    if (e.target instanceof Node && contextMenuEl.contains(e.target)) return
    closeContextMenu()
  }
  document.addEventListener('click', contextMenuCloseHandler, true)
  document.body.appendChild(contextMenuEl)
}

function handleMouseMove(e: MouseEvent) {
  const target = e.target as HTMLElement
  if (isGrabUiElement(target)) return
  hoveredTarget = target
  showOverlay(target)
  renderToolbar()
}

async function finalizeGrab(target: HTMLElement) {
  const result = createGrabResult(target)
  const { components } = result

  deactivate()

  if (currentOptions.editPrompt !== false) {
    const edited = await openPromptEditor(result.prompt)
    if (edited === null) return
    result.prompt = edited
  }

  let copiedContent = result.prompt
  let copied = false

  if (currentOptions.autoCopy !== false) {
    try {
      for (const plugin of registeredPlugins) {
        await plugin.onBeforeCopy?.(result)
      }
      await currentOptions.onBeforeCopy?.(result)
      for (const plugin of registeredPlugins) {
        if (plugin.transformCopyContent) {
          copiedContent = await plugin.transformCopyContent(copiedContent, result)
        }
      }
      if (currentOptions.transformCopyContent) {
        copiedContent = await currentOptions.transformCopyContent(copiedContent, result)
      }
      if (!navigator.clipboard?.writeText) {
        throw new Error('Clipboard API is not available in this browser context')
      }
      await navigator.clipboard.writeText(copiedContent)
      copied = true
      currentOptions.onCopySuccess?.(result, copiedContent)
    } catch (error) {
      const normalized = error instanceof Error ? error : new Error(String(error))
      currentOptions.onCopyError?.(normalized, result)
    } finally {
      currentOptions.onAfterCopy?.(result, copied)
      for (const plugin of registeredPlugins) {
        plugin.onAfterCopy?.(result, copied)
      }
    }
  }

  result.prompt = copiedContent
  currentOptions.onGrab?.(result)
  for (const plugin of registeredPlugins) {
    plugin.onGrab?.(result)
  }

  console.group('%c vue-grab ', 'background: #42b883; color: white; border-radius: 4px; padding: 2px 6px;')
  console.log(result.prompt)
  console.log('Components:', components)
  console.groupEnd()
}

function handleContextMenu(e: MouseEvent) {
  const target = e.target as HTMLElement
  if (isGrabUiElement(target)) return
  e.preventDefault()
  e.stopPropagation()
  e.stopImmediatePropagation()
  hoveredTarget = target
  showOverlay(target)
  showContextMenu(e.clientX, e.clientY, target)
}

async function handleClick(e: MouseEvent) {
  const target = e.target as HTMLElement
  if (isGrabUiElement(target)) return
  e.preventDefault()
  e.stopPropagation()
  e.stopImmediatePropagation()
  await finalizeGrab(target)
}

function handleKeyDown(e: KeyboardEvent) {
  if (e.key === 'Escape') {
    e.preventDefault()
    deactivate()
    return
  }

  if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'c') {
    if (!hoveredTarget) return
    e.preventDefault()
    e.stopPropagation()
    e.stopImmediatePropagation()
    void finalizeGrab(hoveredTarget)
  }
}

export function activate(options: GrabOptions = {}) {
  if (isActive) return
  isActive = true
  currentOptions = options
  currentLocale = resolveGrabLocale(options.locale ?? 'auto')
  hoveredTarget = null

  if (options.showOverlay !== false) {
    showBanner()
  }
  renderToolbar()
  for (const plugin of registeredPlugins) {
    plugin.onActivate?.()
  }

  document.addEventListener('mousemove', handleMouseMove, true)
  document.addEventListener('click', handleClick, true)
  document.addEventListener('keydown', handleKeyDown, true)
  document.addEventListener('contextmenu', handleContextMenu, true)
}

export function deactivate() {
  if (!isActive) return
  isActive = false

  document.removeEventListener('mousemove', handleMouseMove, true)
  document.removeEventListener('click', handleClick, true)
  document.removeEventListener('keydown', handleKeyDown, true)
  document.removeEventListener('contextmenu', handleContextMenu, true)
  for (const plugin of registeredPlugins) {
    plugin.onDeactivate?.()
  }

  removeAllUI()
  hoveredTarget = null
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

export function getDefaultShortcut(): string {
  if (typeof navigator === 'undefined') return 'Alt+Shift+G'
  return /Mac|iPhone|iPad|iPod/i.test(navigator.platform) ? 'Cmd+Shift+G' : 'Alt+Shift+G'
}

export function getLocaleMessages(locale: GrabLocaleOption = 'auto'): Record<string, string> {
  return messages[resolveGrabLocale(locale)]
}

export function formatShortcutLabel(shortcut: string): string {
  const symbols: Record<string, string> = {
    cmd: '⌘',
    command: '⌘',
    meta: '⌘',
    shift: '⇧',
    alt: '⌥',
    option: '⌥',
    ctrl: '⌃',
    control: '⌃',
  }

  const parts = shortcut.split('+').map((p) => p.trim()).filter(Boolean)
  const mapped = parts.map((part) => {
    const key = part.toLowerCase()
    if (symbols[key]) return symbols[key]
    return part.length === 1 ? part.toUpperCase() : part
  })
  return mapped.join('')
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

function isShortcutMatch(e: KeyboardEvent, parsed: ReturnType<typeof parseShortcut>): boolean {
  return (
    e.altKey === parsed.alt &&
    e.shiftKey === parsed.shift &&
    e.ctrlKey === parsed.ctrl &&
    e.metaKey === parsed.meta &&
    e.key.toLowerCase() === parsed.key
  )
}

function isEditableElement(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false
  const tag = target.tagName
  return target.isContentEditable || tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT'
}

export function setupShortcut(shortcut: string, options: GrabOptions = {}): () => void {
  const parsed = parseShortcut(shortcut)
  const activationMode = options.activationMode ?? 'toggle'
  const holdDuration = options.keyHoldDuration ?? 180
  let holdTimer: ReturnType<typeof setTimeout> | null = null
  let holdActivated = false

  const keydownHandler = (e: KeyboardEvent) => {
    if (options.allowActivationInsideInput !== true && isEditableElement(e.target)) return
    if (!isShortcutMatch(e, parsed)) return
    e.preventDefault()

    if (activationMode === 'hold') {
      if (e.repeat || holdTimer || holdActivated) return
      holdTimer = setTimeout(() => {
        holdTimer = null
        holdActivated = true
        activate(options)
      }, holdDuration)
      return
    }

    toggle(options)
  }

  const keyupHandler = (e: KeyboardEvent) => {
    if (activationMode !== 'hold') return
    if (!isShortcutMatch(e, parsed)) return

    if (holdTimer) {
      clearTimeout(holdTimer)
      holdTimer = null
    }
    if (holdActivated) {
      holdActivated = false
      deactivate()
    }
  }

  document.addEventListener('keydown', keydownHandler)
  document.addEventListener('keyup', keyupHandler)
  return () => {
    if (holdTimer) clearTimeout(holdTimer)
    document.removeEventListener('keydown', keydownHandler)
    document.removeEventListener('keyup', keyupHandler)
  }
}
