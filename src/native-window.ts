import { getCurrentWindow } from '@tauri-apps/api/window'
import { t, type Language } from '../packages/engine/catalog'
import logoDark from '../brand/logo-dark.svg'
import './native-window.css'

const glyph = (path: string) => `<svg viewBox="0 0 16 16" width="16" height="16" fill="none" stroke="currentColor" aria-hidden="true"><path d="${path}"/></svg>`

export function mountTitlebar(language: () => Language) {
  const currentWindow = getCurrentWindow()
  const masthead = document.querySelector<HTMLElement>('.masthead')!
  const switches = masthead.querySelector<HTMLElement>('.switches')!
  const bar = document.createElement('header')
  bar.className = 'versa-titlebar'
  bar.innerHTML = `
    <div class="versa-titlebar-drag" data-tauri-drag-region>
      <img src="${logoDark}" width="83" height="30" alt="Versa" draggable="false" data-tauri-drag-region>
    </div>
    <div class="versa-window-controls">
      <button type="button" data-window-minimize>${glyph('M3 8h10')}</button>
      <button type="button" data-window-maximize></button>
      <button type="button" data-window-close>${glyph('m3.5 3.5 9 9m0-9-9 9')}</button>
    </div>`
  const controls = bar.querySelector<HTMLElement>('.versa-window-controls')!
  bar.insertBefore(switches, controls)
  masthead.replaceWith(bar)

  const minimize = bar.querySelector<HTMLButtonElement>('[data-window-minimize]')!
  const maximize = bar.querySelector<HTMLButtonElement>('[data-window-maximize]')!
  const close = bar.querySelector<HTMLButtonElement>('[data-window-close]')!
  let maximized = false
  function paint() {
    const label = (button: HTMLButtonElement, pt: string, en: string) => {
      button.title = t(language(), [pt, en])
      button.setAttribute('aria-label', button.title)
    }
    label(minimize, 'Minimizar', 'Minimize')
    label(maximize, maximized ? 'Restaurar janela' : 'Maximizar', maximized ? 'Restore window' : 'Maximize')
    label(close, 'Fechar janela', 'Close window')
    maximize.innerHTML = glyph(maximized ? 'M5 5V2.5h8.5V11H11M2.5 5.5H11V14H2.5z' : 'M3 3h10v10H3z')
  }
  async function refresh() {
    maximized = await currentWindow.isMaximized()
    paint()
  }
  minimize.onclick = () => void currentWindow.minimize().catch(() => {})
  maximize.onclick = () => void currentWindow.toggleMaximize().then(refresh).catch(() => {})
  close.onclick = () => void currentWindow.close().catch(() => {})
  paint()
  void refresh().catch(() => {})
  void currentWindow.onResized(() => void refresh().catch(() => {})).catch(() => {})
  new MutationObserver(paint).observe(document.documentElement, { attributes: true, attributeFilter: ['lang'] })
}
