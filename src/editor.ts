import './style.css'
import './editor.css'
import { t, type Language, type Phrase } from '../packages/engine/catalog'
import { inspectFiles } from '../packages/engine/preflight'
import { localName } from '../packages/engine/types'
import { copy } from './copy'
import { icon } from './icons'
import { samplePdf } from './sample'
import { takeHandOff } from './handoff'
import { baseline, framePointToPdf, lineHeight, normalise, sheetTransform, viewToFrame, type Turn } from './editor-geometry'
import logoLight from '../brand/logo-light.svg'
import logoDark from '../brand/logo-dark.svg'
import type { PDFDocumentProxy } from 'pdfjs-dist'

type Family = 'sans' | 'serif' | 'mono'
interface TextNote { kind: 'text'; id: number; x: number; y: number; text: string; size: number; color: string; font: Family }
interface Stroke { kind: 'ink'; id: number; points: [number, number][]; color: string; width: number; alpha: number }
interface Picture { kind: 'pic'; id: number; x: number; y: number; w: number; h: number; image: number }
type Note = TextNote | Stroke | Picture
interface Sheet { src: number; turn: Turn; notes: Note[] }
interface Meta { w: number; h: number; base: Turn }
interface Bitmap { bytes: Uint8Array; type: 'png' | 'jpg'; url: string; w: number; h: number }
type Tool = 'select' | 'text' | 'pen' | 'hl'

const P = {
  back: ['Voltar ao Versa', 'Back to Versa'],
  title: ['Editar PDF', 'Edit PDF'],
  intro: ['Abre um PDF, escreve, desenha, acrescenta imagens e assinatura, e guarda uma cópia nova. O ficheiro nunca sai do teu dispositivo.', 'Open a PDF, type, draw, add images and a signature, then save a new copy. The file never leaves your device.'],
  drop: ['Larga um PDF aqui', 'Drop a PDF here'],
  pick: ['Escolher PDF', 'Choose a PDF'],
  sample: ['Experimentar com exemplo', 'Try with a sample'],
  privacy: ['0 bytes enviados', '0 bytes uploaded'],
  tools: ['Ferramentas', 'Tools'],
  select: ['Seleccionar', 'Select'], text: ['Texto', 'Text'], pen: ['Desenhar', 'Draw'], hl: ['Realçar', 'Highlight'],
  image: ['Imagem', 'Image'], sign: ['Assinatura', 'Signature'],
  colour: ['Cor', 'Colour'], size: ['Tamanho', 'Size'], font: ['Letra', 'Font'],
  sans: ['Sem serifa', 'Sans'], serif: ['Com serifa', 'Serif'], mono: ['Monoespaçada', 'Mono'],
  pages: ['Páginas', 'Pages'], page: ['Página', 'Page'], of: ['de', 'of'],
  rotl: ['Rodar à esquerda', 'Rotate left'], rotr: ['Rodar à direita', 'Rotate right'],
  earlier: ['Mover para trás', 'Move earlier'], later: ['Mover para a frente', 'Move later'],
  del: ['Apagar página', 'Delete page'], delNote: ['Apagar selecção', 'Delete selection'],
  undo: ['Desfazer', 'Undo'], zoomin: ['Aumentar', 'Zoom in'], zoomout: ['Diminuir', 'Zoom out'],
  save: ['Guardar PDF', 'Save PDF'], saving: ['A guardar…', 'Saving…'], saved: ['PDF guardado. O original não foi alterado.', 'PDF saved. The original was not changed.'],
  opening: ['A abrir…', 'Opening…'], opened: ['PDF aberto.', 'PDF opened.'],
  fail: ['Não foi possível guardar o PDF.', 'Could not save the PDF.'],
  lastPage: ['Um PDF precisa de pelo menos uma página.', 'A PDF needs at least one page.'],
  typeHere: ['Escreve aqui', 'Type here'],
  textBox: ['Caixa de texto', 'Text box'], picture: ['Imagem inserida', 'Inserted image'],
  signTitle: ['Desenha a tua assinatura', 'Draw your signature'],
  signType: ['Ou escreve o teu nome', 'Or type your name'],
  signClear: ['Limpar', 'Clear'], signUse: ['Usar assinatura', 'Use signature'], cancel: ['Cancelar', 'Cancel'],
  signPad: ['Área da assinatura', 'Signature area'],
  badImage: ['Escolhe uma imagem PNG, JPG ou WebP.', 'Choose a PNG, JPG or WebP image.'],
  leave: ['Tens alterações por guardar.', 'You have unsaved changes.'],
  replace: ['Abrir outro PDF e perder as alterações?', 'Open another PDF and lose your changes?'],
  hint: ['Dica: arrasta as miniaturas para reordenar as páginas.', 'Tip: drag the thumbnails to reorder pages.'],
} as const satisfies Record<string, Phrase>
type Key = keyof typeof P

const stored = (key: string) => { try { return localStorage.getItem(key) } catch { return null } }
const persist = (key: string, value: string) => { try { localStorage.setItem(key, value) } catch { /* Private browsing. */ } }
let language: Language = stored('versa-language') === 'en' ? 'en' : 'pt'
let theme = stored('versa-theme') ?? (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light')
const tx = (key: Key) => t(language, P[key])
const span = (key: Key) => `<span data-k="${key}">${tx(key)}</span>`
const aria = (key: Key) => `data-ka="${key}" aria-label="${tx(key)}" title="${tx(key)}"`

const swatches = ['#1a1a2e', '#e8432e', '#2b50e8', '#1fa35c', '#ff8a00', '#ffe14d']
const fonts: Record<Family, string> = {
  sans: "Helvetica, Arial, 'Liberation Sans', sans-serif",
  serif: "'Times New Roman', Times, 'Liberation Serif', serif",
  mono: "'Courier New', Courier, 'Liberation Mono', monospace",
}
const limits = { text: [8, 72], pen: [1, 12], hl: [8, 40] } as const
const prefs = { size: { text: 18, pen: 2, hl: 16 }, color: { text: '#1a1a2e', pen: '#e8432e', hl: '#ffe14d' }, font: 'sans' as Family }

const app = document.querySelector<HTMLDivElement>('#editor-app')!
app.innerHTML = `
  <header class="masthead"><div class="shell masthead-inner">
    <a class="brand-link" href="/" aria-label="Versa"><img class="brand brand-light" src="${logoLight}" width="118" height="42" alt="Versa"><img class="brand brand-dark" src="${logoDark}" width="118" height="42" alt="Versa"></a>
    <a class="text-link ed-back" href="/">${icon('arrow', 16)} ${span('back')}</a>
    <div class="switches"><button class="switch language-switch" type="button" data-language></button><button class="switch theme-switch" type="button" data-theme></button></div>
  </div></header>
  <main class="editor shell">
    <section class="ed-start" data-start>
      <h1 data-k="title">${tx('title')}</h1>
      <p data-k="intro">${tx('intro')}</p>
      <div class="ed-drop" data-dropzone>
        <span class="ed-drop-icon">${icon('pdf', 44)}</span><strong data-k="drop">${tx('drop')}</strong>
        <div><button class="button" type="button" data-pick>${icon('upload', 18)} ${span('pick')}</button>
        <button class="quiet" type="button" data-sample>${span('sample')}</button></div>
        <small>${icon('lock', 14)} ${span('privacy')}</small>
      </div>
    </section>
    <section class="ed-work" data-work hidden>
      <div class="ed-toolbar" role="toolbar" aria-label="${tx('tools')}" data-ka="tools">
        <div class="ed-group" data-tools>
          ${(['select', 'text', 'pen', 'hl'] as const).map(tool => `<button class="tool" type="button" data-tool="${tool}" aria-pressed="false">${icon(tool === 'hl' ? 'highlight' : tool, 20)}${span(tool)}</button>`).join('')}
          <button class="tool" type="button" data-image>${icon('image', 20)}${span('image')}</button>
          <button class="tool" type="button" data-sign>${icon('sign', 20)}${span('sign')}</button>
        </div>
        <div class="ed-group ed-props">
          <span class="ed-swatches" role="group" data-ka="colour" aria-label="${tx('colour')}">${swatches.map(color => `<button type="button" class="swatch" data-color="${color}" style="--c:${color}" aria-label="${color}" aria-pressed="false"></button>`).join('')}</span>
          <label>${span('size')} <input type="range" data-size min="8" max="72" value="18"></label>
          <label data-font-label>${span('font')} <select data-font>${(['sans', 'serif', 'mono'] as const).map(family => `<option value="${family}" data-k="${family}">${tx(family)}</option>`).join('')}</select></label>
        </div>
        <div class="ed-group ed-pages">
          <button class="tool icon-only" type="button" data-act="undo" ${aria('undo')}>${icon('undo', 20)}</button>
          <button class="tool icon-only" type="button" data-act="delNote" ${aria('delNote')}>${icon('close', 20)}</button>
          <button class="tool icon-only" type="button" data-act="rotl" ${aria('rotl')}>${icon('rotl', 20)}</button>
          <button class="tool icon-only" type="button" data-act="rotr" ${aria('rotr')}>${icon('rotr', 20)}</button>
          <button class="tool icon-only" type="button" data-act="earlier" ${aria('earlier')}>${icon('left', 20)}</button>
          <button class="tool icon-only" type="button" data-act="later" ${aria('later')}>${icon('right', 20)}</button>
          <button class="tool icon-only" type="button" data-act="del" ${aria('del')}>${icon('trash', 20)}</button>
          <button class="tool icon-only" type="button" data-act="zoomout" ${aria('zoomout')}>${icon('zoomout', 20)}</button>
          <button class="tool icon-only" type="button" data-act="zoomin" ${aria('zoomin')}>${icon('zoomin', 20)}</button>
        </div>
        <button class="button ed-save" type="button" data-act="save">${icon('save', 19)} ${span('save')}</button>
      </div>
      <div class="ed-body">
        <nav class="ed-thumbs" aria-label="${tx('pages')}" data-ka="pages"><ol data-thumbs></ol></nav>
        <div class="ed-stage" data-stage tabindex="-1">
          <div class="ed-wrap" data-wrap><div class="ed-sheet" data-sheet><canvas data-canvas></canvas><svg class="ed-ink" data-ink aria-hidden="true"></svg><div class="ed-notes" data-notes></div></div></div>
        </div>
      </div>
      <p class="ed-page-label"><span data-k="page">${tx('page')}</span> <b data-current>1</b> <span data-k="of">${tx('of')}</span> <b data-total>1</b> · <span data-k="hint">${tx('hint')}</span></p>
    </section>
    <div class="ed-status" role="status" data-status></div>
    <input type="file" hidden accept=".pdf,application/pdf" data-open>
    <input type="file" hidden accept="image/png,image/jpeg,image/webp,.png,.jpg,.jpeg,.webp" data-pic>
  </main>
  <dialog class="ed-dialog" data-dialog aria-labelledby="sign-title">
    <h2 id="sign-title" data-k="signTitle">${tx('signTitle')}</h2>
    <canvas class="ed-pad" data-pad width="600" height="220" role="img" ${aria('signPad')}></canvas>
    <label class="ed-type"><span data-k="signType">${tx('signType')}</span> <input type="text" maxlength="40" data-typed autocomplete="off"></label>
    <div class="ed-dialog-actions"><button class="button button-small" type="button" data-sign-use>${span('signUse')}</button><button class="quiet" type="button" data-sign-clear>${span('signClear')}</button><button class="quiet" type="button" data-sign-cancel>${span('cancel')}</button></div>
  </dialog>`

const q = <T extends HTMLElement>(selector: string) => app.querySelector<T>(selector)!
const startPanel = q('[data-start]'), work = q('[data-work]'), stage = q('[data-stage]'), wrap = q('[data-wrap]')
const sheetEl = q('[data-sheet]'), canvas = q<HTMLCanvasElement>('[data-canvas]'), inkLayer = q<HTMLElement>('[data-ink]') as unknown as SVGSVGElement
const notesEl = q('[data-notes]'), thumbsEl = q('[data-thumbs]'), status = q('[data-status]')
const openInput = q<HTMLInputElement>('[data-open]'), picInput = q<HTMLInputElement>('[data-pic]')
const sizeInput = q<HTMLInputElement>('[data-size]'), fontSelect = q<HTMLSelectElement>('[data-font]')
const dialog = q<HTMLDialogElement>('[data-dialog]'), pad = q<HTMLCanvasElement>('[data-pad]'), typed = q<HTMLInputElement>('[data-typed]')

let file: File | undefined
let source: Uint8Array | undefined
let pdf: PDFDocumentProxy | undefined
let closePdf: (() => Promise<void> | void) | undefined
let metas: Meta[] = []
let sheets: Sheet[] = []
let current = 0
let tool: Tool = 'select'
let selected: number | undefined
let zoom = 1
let scale = 1
let nextId = 1
let dirty = false
let generation = 0
let drawTask: { cancel(): void } | undefined
const undoStack: string[] = []
const bitmaps: Bitmap[] = []
const thumbs = new Map<string, string>()
const rendering = new Set<string>()
const say = (message: string) => { status.textContent = message }

function applyLanguage() {
  document.documentElement.lang = language === 'pt' ? 'pt-MZ' : 'en'
  document.title = 'Versa — ' + tx('title')
  app.querySelectorAll<HTMLElement>('[data-k]').forEach(element => { element.textContent = tx(element.dataset.k as Key) })
  app.querySelectorAll<HTMLElement>('[data-ka]').forEach(element => {
    element.setAttribute('aria-label', tx(element.dataset.ka as Key))
    if (element.tagName === 'BUTTON') element.title = tx(element.dataset.ka as Key)
  })
  q('[data-language]').textContent = language === 'pt' ? 'EN' : 'PT'
  q('[data-language]').setAttribute('aria-label', t(language, copy.language))
  q('[data-theme]').setAttribute('aria-label', t(language, copy.theme))
  thumbsEl.querySelectorAll<HTMLElement>('[data-thumb]').forEach((item, index) => item.setAttribute('aria-label', `${tx('page')} ${index + 1}`))
}
function applyTheme() {
  document.documentElement.dataset.theme = theme
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', theme === 'dark' ? '#172825' : '#f4efe3')
  const button = q('[data-theme]')
  button.innerHTML = icon(theme === 'dark' ? 'sun' : 'moon', 19)
  button.setAttribute('aria-pressed', String(theme === 'dark'))
}

// ---------- history ----------
const snapshot = () => JSON.stringify({ sheets, current })
function snap() {
  undoStack.push(snapshot())
  if (undoStack.length > 80) undoStack.shift()
  dirty = true
}
function undo() {
  const previous = undoStack.pop()
  if (!previous) return
  const state = JSON.parse(previous) as { sheets: Sheet[]; current: number }
  sheets = state.sheets
  current = Math.min(state.current, sheets.length - 1)
  selected = undefined
  renderAll()
}

// ---------- opening ----------
async function open(next: File) {
  if (dirty && !confirm(tx('replace'))) return
  const id = ++generation
  say(tx('opening'))
  const verdict = await inspectFiles([next])
  if (id !== generation) return
  if (verdict.problem || verdict.kinds[0] !== 'pdf') {
    say(t(language, copy[verdict.problem ?? 'type']))
    return
  }
  try {
    const { openPdf } = await import('../packages/engine/render-pdf')
    const opened = await openPdf(next)
    if (id !== generation) { await opened.close(); return }
    await closePdf?.()
    pdf = opened.pdf
    closePdf = opened.close
    source = new Uint8Array(await next.arrayBuffer())
    metas = []
    for (let index = 1; index <= pdf.numPages; index++) {
      const page = await pdf.getPage(index)
      const view = page.getViewport({ scale: 1 })
      metas.push({ w: view.width, h: view.height, base: normalise(page.rotate) })
    }
    if (id !== generation) return
    file = next
    sheets = metas.map((_, src) => ({ src, turn: 0, notes: [] }))
    thumbs.forEach(url => URL.revokeObjectURL(url))
    thumbs.clear()
    undoStack.length = 0
    current = 0
    selected = undefined
    dirty = false
    zoom = 1
    startPanel.hidden = true
    work.hidden = false
    setTool('select')
    renderAll()
    say(tx('opened'))
  } catch {
    say(t(language, copy.damaged))
  }
}

// ---------- rendering ----------
const turnOf = (sheet: Sheet) => sheet.turn
const frameOf = (sheet: Sheet): [number, number] => [metas[sheet.src].w, metas[sheet.src].h]
function fitScale(sheet: Sheet) {
  const [fw, fh] = frameOf(sheet)
  const width = turnOf(sheet) % 180 ? fh : fw
  const available = Math.max(180, stage.clientWidth - 24)
  return Math.min(available / width, 3) * zoom
}

function renderAll() {
  renderThumbs()
  void showPage()
  syncControls()
}

async function showPage() {
  const sheet = sheets[current]
  if (!sheet || !pdf) return
  const frame = frameOf(sheet)
  scale = fitScale(sheet)
  const [fw, fh] = frame
  const rotated = sheet.turn % 180
  wrap.style.width = `${(rotated ? fh : fw) * scale}px`
  wrap.style.height = `${(rotated ? fw : fh) * scale}px`
  sheetEl.style.width = `${fw * scale}px`
  sheetEl.style.height = `${fh * scale}px`
  sheetEl.style.transform = sheetTransform(sheet.turn, frame, scale)
  sheetEl.style.setProperty('--s', String(scale))
  inkLayer.setAttribute('viewBox', `0 0 ${fw} ${fh}`)
  q('[data-current]').textContent = String(current + 1)
  q('[data-total]').textContent = String(sheets.length)
  renderNotes()
  const mine = generation
  drawTask?.cancel()
  const page = await pdf.getPage(sheet.src + 1)
  if (mine !== generation) return
  const ratio = Math.min(devicePixelRatio || 1, 2, 3000 / (Math.max(fw, fh) * scale))
  const viewport = page.getViewport({ scale: scale * ratio })
  canvas.width = Math.ceil(viewport.width)
  canvas.height = Math.ceil(viewport.height)
  const task = page.render({ canvas, canvasContext: canvas.getContext('2d')!, viewport })
  drawTask = task
  try { await task.promise } catch { /* A newer render replaced this one. */ }
}

function renderNotes() {
  const sheet = sheets[current]
  if (!sheet) return
  notesEl.replaceChildren()
  inkLayer.replaceChildren()
  const ns = 'http://www.w3.org/2000/svg'
  for (const note of sheet.notes) {
    if (note.kind === 'ink') {
      const d = pathOf(note.points)
      const visible = document.createElementNS(ns, 'path')
      visible.setAttribute('d', d)
      visible.setAttribute('stroke', note.color)
      visible.setAttribute('stroke-width', String(note.width))
      visible.setAttribute('stroke-opacity', String(note.alpha))
      visible.setAttribute('class', `ink-path${note.alpha < 1 ? ' is-highlight' : ''}`)
      const hit = document.createElementNS(ns, 'path')
      hit.setAttribute('d', d)
      hit.setAttribute('stroke-width', String(Math.max(note.width, 14)))
      hit.setAttribute('class', `ink-hit${selected === note.id ? ' is-selected' : ''}`)
      hit.dataset.ann = String(note.id)
      hit.setAttribute('aria-hidden', 'true')
      inkLayer.append(visible, hit)
    } else if (note.kind === 'text') {
      const box = document.createElement('div')
      box.className = `ed-note ed-text${selected === note.id ? ' is-selected' : ''}`
      box.dataset.ann = String(note.id)
      box.style.left = `${note.x * scale}px`
      box.style.top = `${note.y * scale}px`
      const handle = document.createElement('span')
      handle.className = 'handle'
      handle.dataset.handle = ''
      handle.setAttribute('aria-hidden', 'true')
      const area = document.createElement('textarea')
      area.value = note.text
      area.rows = 1
      area.wrap = 'off'
      area.spellcheck = false
      area.setAttribute('aria-label', tx('textBox'))
      area.placeholder = tx('typeHere')
      styleText(area, note)
      area.addEventListener('focus', () => { select(note.id) })
      area.addEventListener('input', () => { note.text = area.value; dirty = true; fit(area) })
      area.addEventListener('keydown', event => { if (event.key === 'Escape') area.blur() })
      area.addEventListener('blur', () => {
        if (note.text.trim()) return
        const own = sheet.notes.indexOf(note)
        if (own >= 0) { sheet.notes.splice(own, 1); if (selected === note.id) selected = undefined; box.remove() }
      })
      box.append(handle, area)
      notesEl.append(box)
      fit(area)
    } else {
      const bitmap = bitmaps[note.image]
      const box = document.createElement('div')
      box.className = `ed-note ed-pic${selected === note.id ? ' is-selected' : ''}`
      box.dataset.ann = String(note.id)
      box.tabIndex = 0
      box.setAttribute('role', 'img')
      box.setAttribute('aria-label', tx('picture'))
      box.style.cssText = `left:${note.x * scale}px;top:${note.y * scale}px;width:${note.w * scale}px;height:${note.h * scale}px`
      const img = document.createElement('img')
      img.src = bitmap.url
      img.alt = ''
      img.draggable = false
      const grip = document.createElement('span')
      grip.className = 'grip'
      grip.dataset.grip = ''
      box.append(img, grip)
      notesEl.append(box)
    }
  }
}

function styleText(area: HTMLTextAreaElement, note: TextNote) {
  area.style.fontSize = `${note.size * scale}px`
  area.style.fontFamily = fonts[note.font]
  area.style.color = note.color
  area.style.lineHeight = String(lineHeight)
}
function fit(area: HTMLTextAreaElement) {
  area.style.width = '1px'
  area.style.height = '1px'
  area.style.width = `${Math.max(area.scrollWidth + 6, parseFloat(area.style.fontSize) * 3)}px`
  area.style.height = `${area.scrollHeight}px`
}
function pathOf(points: [number, number][]) {
  const [first, ...rest] = points
  if (!first) return ''
  if (!rest.length) return `M${first[0]} ${first[1]}l.01 .01`
  return `M${first[0]} ${first[1]}` + rest.map(([x, y]) => `L${x} ${y}`).join('')
}

async function renderThumbs() {
  const mine = generation
  const list = sheets.map((sheet, index) => {
    const key = `${sheet.src}:${sheet.turn}`
    const url = thumbs.get(key)
    const item = document.createElement('li')
    item.draggable = true
    item.dataset.index = String(index)
    item.className = index === current ? 'is-current' : ''
    const button = document.createElement('button')
    button.type = 'button'
    button.dataset.thumb = String(index)
    button.setAttribute('aria-label', `${tx('page')} ${index + 1}`)
    if (index === current) button.setAttribute('aria-current', 'page')
    const [fw, fh] = frameOf(sheet)
    button.style.aspectRatio = sheet.turn % 180 ? `${fh} / ${fw}` : `${fw} / ${fh}`
    if (url) {
      const img = document.createElement('img')
      img.src = url
      img.alt = ''
      img.draggable = false
      button.append(img)
    }
    const number = document.createElement('span')
    number.textContent = String(index + 1)
    button.append(number)
    item.append(button)
    return { item, key, sheet }
  })
  thumbsEl.replaceChildren(...list.map(entry => entry.item))
  for (const { key, sheet } of list) {
    if (thumbs.has(key) || rendering.has(key)) continue
    if (mine !== generation || !pdf) return
    rendering.add(key)
    try {
      const page = await pdf.getPage(sheet.src + 1)
      const viewport = page.getViewport({ scale: 1, rotation: (metas[sheet.src].base + sheet.turn) % 360 })
      const factor = 120 / viewport.width
      const small = page.getViewport({ scale: factor, rotation: (metas[sheet.src].base + sheet.turn) % 360 })
      const surface = document.createElement('canvas')
      surface.width = Math.ceil(small.width)
      surface.height = Math.ceil(small.height)
      await page.render({ canvas: surface, canvasContext: surface.getContext('2d')!, viewport: small }).promise
      const blob = await new Promise<Blob | null>(resolve => surface.toBlob(resolve, 'image/png'))
      if (!blob || mine !== generation) continue
      thumbs.set(key, URL.createObjectURL(blob))
      for (const entry of thumbsEl.querySelectorAll<HTMLElement>('button')) {
        const owner = sheets[Number(entry.dataset.thumb)]
        if (owner && `${owner.src}:${owner.turn}` === key && !entry.querySelector('img')) {
          const img = document.createElement('img')
          img.src = thumbs.get(key)!
          img.alt = ''
          img.draggable = false
          entry.prepend(img)
        }
      }
    } catch { /* The thumbnail is optional. */ } finally { rendering.delete(key) }
  }
}

// ---------- controls ----------
function activeKind(): 'text' | 'pen' | 'hl' | undefined {
  const note = selectedNote()
  if (note) return note.kind === 'text' ? 'text' : note.kind === 'ink' ? (note.alpha < 1 ? 'hl' : 'pen') : undefined
  return tool === 'text' || tool === 'pen' || tool === 'hl' ? tool : undefined
}
function syncControls() {
  app.querySelectorAll<HTMLElement>('[data-tool]').forEach(button => button.setAttribute('aria-pressed', String(button.dataset.tool === tool)))
  const kind = activeKind()
  const note = selectedNote()
  const props = q('.ed-props')
  props.classList.toggle('is-idle', !kind)
  if (kind) {
    const [min, max] = limits[kind]
    sizeInput.min = String(min)
    sizeInput.max = String(max)
    sizeInput.value = String(note?.kind === 'text' ? note.size : note?.kind === 'ink' ? note.width : prefs.size[kind])
    const color = note && note.kind !== 'pic' ? note.color : prefs.color[kind]
    app.querySelectorAll<HTMLElement>('[data-color]').forEach(button => button.setAttribute('aria-pressed', String(button.dataset.color === color)))
    fontSelect.value = note?.kind === 'text' ? note.font : prefs.font
  }
  sizeInput.disabled = !kind
  app.querySelectorAll<HTMLButtonElement>('[data-color]').forEach(button => { button.disabled = !kind })
  q('[data-font-label]').hidden = kind !== 'text'
  fontSelect.disabled = kind !== 'text'
  q<HTMLButtonElement>('[data-act=undo]').disabled = !undoStack.length
  q<HTMLButtonElement>('[data-act=delNote]').disabled = selected === undefined
  q<HTMLButtonElement>('[data-act=earlier]').disabled = current === 0
  q<HTMLButtonElement>('[data-act=later]').disabled = current >= sheets.length - 1
  sheetEl.dataset.mode = tool
  stage.dataset.mode = tool
}
function setTool(next: Tool) {
  tool = next
  if (next !== 'select' && selected !== undefined) { selected = undefined; renderNotes() }
  syncControls()
}
const selectedNote = () => sheets[current]?.notes.find(note => note.id === selected)
function select(id: number | undefined) {
  if (selected === id) return
  selected = id
  // Toggle classes in place: re-rendering here would destroy a text box that is about to take focus.
  app.querySelectorAll<HTMLElement | SVGElement>('[data-ann]').forEach(element => element.classList.toggle('is-selected', Number(element.dataset.ann) === id))
  syncControls()
}

function framePoint(event: { clientX: number; clientY: number }): [number, number] {
  const sheet = sheets[current]
  const box = wrap.getBoundingClientRect()
  const [x, y] = viewToFrame(sheet.turn, frameOf(sheet), scale, event.clientX - box.left, event.clientY - box.top)
  const [fw, fh] = frameOf(sheet)
  return [Math.min(fw, Math.max(0, x)), Math.min(fh, Math.max(0, y))]
}

function addText(point: [number, number]) {
  const sheet = sheets[current]
  snap()
  const size = prefs.size.text
  const note: TextNote = { kind: 'text', id: nextId++, x: point[0], y: Math.max(0, point[1] - size * .6), text: '', size, color: prefs.color.text, font: prefs.font }
  sheet.notes.push(note)
  selected = note.id
  setTool('select')
  renderNotes()
  notesEl.querySelector<HTMLTextAreaElement>(`[data-ann="${note.id}"] textarea`)?.focus()
}

function startStroke(event: PointerEvent) {
  const kind = tool === 'hl' ? 'hl' : 'pen'
  const sheet = sheets[current]
  snap()
  const note: Stroke = { kind: 'ink', id: nextId++, points: [framePoint(event)], color: prefs.color[kind], width: prefs.size[kind], alpha: kind === 'hl' ? .35 : 1 }
  sheet.notes.push(note)
  renderNotes()
  const target = [...inkLayer.querySelectorAll<SVGPathElement>('.ink-path')].at(-1)
  sheetEl.setPointerCapture(event.pointerId)
  const move = (next: PointerEvent) => {
    const [x, y] = framePoint(next)
    const last = note.points.at(-1)!
    if (Math.hypot(x - last[0], y - last[1]) < .8) return
    note.points.push([x, y])
    target?.setAttribute('d', pathOf(note.points))
  }
  const end = () => {
    sheetEl.removeEventListener('pointermove', move)
    sheetEl.removeEventListener('pointerup', end)
    sheetEl.removeEventListener('pointercancel', end)
    renderNotes()
    syncControls()
  }
  sheetEl.addEventListener('pointermove', move)
  sheetEl.addEventListener('pointerup', end)
  sheetEl.addEventListener('pointercancel', end)
}

function startDrag(event: PointerEvent, note: TextNote | Picture, resize: boolean) {
  const start = framePoint(event)
  const origin = { x: note.x, y: note.y, w: note.kind === 'pic' ? note.w : 0, h: note.kind === 'pic' ? note.h : 0 }
  const sheet = sheets[current]
  const [fw, fh] = frameOf(sheet)
  const element = notesEl.querySelector<HTMLElement>(`[data-ann="${note.id}"]`)
  let moved = false
  const move = (next: PointerEvent) => {
    const [x, y] = framePoint(next)
    if (!moved) { snap(); moved = true }
    if (resize && note.kind === 'pic') {
      const ratio = origin.w / origin.h
      note.w = Math.max(16, Math.min(fw - note.x, origin.w + x - start[0]))
      note.h = note.w / ratio
      if (element) { element.style.width = `${note.w * scale}px`; element.style.height = `${note.h * scale}px` }
    } else {
      note.x = Math.max(0, Math.min(fw - 8, origin.x + x - start[0]))
      note.y = Math.max(0, Math.min(fh - 8, origin.y + y - start[1]))
      if (element) { element.style.left = `${note.x * scale}px`; element.style.top = `${note.y * scale}px` }
    }
  }
  const end = () => {
    window.removeEventListener('pointermove', move)
    window.removeEventListener('pointerup', end)
    window.removeEventListener('pointercancel', end)
  }
  window.addEventListener('pointermove', move)
  window.addEventListener('pointerup', end)
  window.addEventListener('pointercancel', end)
}

sheetEl.addEventListener('pointerdown', event => {
  if (event.button !== 0 && event.pointerType === 'mouse') return
  const target = event.target as Element
  const holder = target.closest<HTMLElement | SVGElement>('[data-ann]')
  if (tool === 'pen' || tool === 'hl') { event.preventDefault(); startStroke(event); return }
  if (tool === 'text' && !holder) { event.preventDefault(); addText(framePoint(event)); return }
  if (!holder) { select(undefined); return }
  const id = Number(holder.dataset.ann)
  const note = sheets[current].notes.find(entry => entry.id === id)
  select(id)
  if (!note || note.kind === 'ink') return
  const element = notesEl.querySelector<HTMLElement>(`[data-ann="${id}"]`)
  if (note.kind === 'pic') {
    event.preventDefault()
    element?.focus({ preventScroll: true })
    startDrag(event, note, Boolean(target.closest('[data-grip]')))
  } else if (target.closest('[data-handle]')) {
    event.preventDefault()
    startDrag(event, note, false)
  }
})
sheetEl.addEventListener('keydown', event => {
  const holder = (event.target as Element).closest<HTMLElement>('.ed-pic')
  const note = holder && sheets[current].notes.find(entry => entry.id === Number(holder.dataset.ann))
  if (!note || note.kind !== 'pic' || !event.key.startsWith('Arrow')) return
  event.preventDefault()
  snap()
  const step = event.shiftKey ? 10 : 1
  note.x += event.key === 'ArrowRight' ? step : event.key === 'ArrowLeft' ? -step : 0
  note.y += event.key === 'ArrowDown' ? step : event.key === 'ArrowUp' ? -step : 0
  renderNotes()
  notesEl.querySelector<HTMLElement>(`[data-ann="${note.id}"]`)?.focus({ preventScroll: true })
})

function removeSelected() {
  if (selected === undefined) return
  const sheet = sheets[current]
  const index = sheet.notes.findIndex(note => note.id === selected)
  if (index < 0) return
  snap()
  sheet.notes.splice(index, 1)
  selected = undefined
  renderNotes()
  syncControls()
}

function changeProperty(apply: (note: TextNote | Stroke | undefined, kind: 'text' | 'pen' | 'hl') => void) {
  const kind = activeKind()
  if (!kind) return
  const note = selectedNote()
  if (note && note.kind !== 'pic') snap()
  apply(note?.kind === 'pic' ? undefined : note, kind)
  if (note) renderNotes()
  syncControls()
}

// ---------- pages ----------
function movePage(from: number, to: number) {
  if (to < 0 || to >= sheets.length || from === to) return
  snap()
  const [sheet] = sheets.splice(from, 1)
  sheets.splice(to, 0, sheet)
  current = to
  renderAll()
}
function turnPage(delta: number) {
  snap()
  const sheet = sheets[current]
  sheet.turn = normalise(sheet.turn + delta)
  renderAll()
}
function deletePage() {
  if (sheets.length < 2) { say(tx('lastPage')); return }
  snap()
  sheets.splice(current, 1)
  current = Math.min(current, sheets.length - 1)
  selected = undefined
  renderAll()
}
function goto(index: number) {
  if (index < 0 || index >= sheets.length) return
  current = index
  selected = undefined
  renderAll()
}

thumbsEl.addEventListener('click', event => {
  const button = (event.target as Element).closest<HTMLElement>('[data-thumb]')
  if (button) goto(Number(button.dataset.thumb))
})
let dragFrom: number | undefined
thumbsEl.addEventListener('dragstart', event => {
  const item = (event.target as Element).closest<HTMLElement>('li')
  if (!item || !event.dataTransfer) return
  dragFrom = Number(item.dataset.index)
  event.dataTransfer.effectAllowed = 'move'
  event.dataTransfer.setData('application/x-versa-page', String(dragFrom))
  item.classList.add('is-dragged')
})
thumbsEl.addEventListener('dragover', event => {
  if (dragFrom === undefined) return
  event.preventDefault()
  thumbsEl.querySelectorAll('.drop-target').forEach(element => element.classList.remove('drop-target'))
  ;(event.target as Element).closest('li')?.classList.add('drop-target')
})
thumbsEl.addEventListener('drop', event => {
  if (dragFrom === undefined) return
  event.preventDefault()
  event.stopPropagation()
  const item = (event.target as Element).closest<HTMLElement>('li')
  const from = dragFrom
  dragFrom = undefined
  if (item) movePage(from, Number(item.dataset.index))
})
thumbsEl.addEventListener('dragend', () => {
  dragFrom = undefined
  thumbsEl.querySelectorAll('.is-dragged,.drop-target').forEach(element => element.classList.remove('is-dragged', 'drop-target'))
})

// ---------- images and signature ----------
async function toBitmap(source: Blob): Promise<Bitmap | undefined> {
  try {
    const bytes = new Uint8Array(await source.arrayBuffer())
    const png = bytes[0] === 0x89 && bytes[1] === 0x50
    const jpg = bytes[0] === 0xff && bytes[1] === 0xd8
    const decoded = await createImageBitmap(source)
    let data = bytes
    let type: 'png' | 'jpg' = jpg ? 'jpg' : 'png'
    if ((!png && !jpg) || Math.max(decoded.width, decoded.height) > 2400) {
      const factor = Math.min(1, 2400 / Math.max(decoded.width, decoded.height))
      const surface = document.createElement('canvas')
      surface.width = Math.round(decoded.width * factor)
      surface.height = Math.round(decoded.height * factor)
      surface.getContext('2d')!.drawImage(decoded, 0, 0, surface.width, surface.height)
      type = jpg ? 'jpg' : 'png'
      const blob = await new Promise<Blob | null>(resolve => surface.toBlob(resolve, type === 'jpg' ? 'image/jpeg' : 'image/png', .9))
      if (!blob) return undefined
      data = new Uint8Array(await blob.arrayBuffer())
    }
    const bitmap = { bytes: data, type, url: URL.createObjectURL(new Blob([Uint8Array.from(data).buffer], { type: type === 'jpg' ? 'image/jpeg' : 'image/png' })), w: decoded.width, h: decoded.height }
    decoded.close()
    return bitmap
  } catch {
    return undefined
  }
}
async function addImage(blob: Blob) {
  const bitmap = await toBitmap(blob)
  if (!bitmap) { say(tx('badImage')); return }
  const sheet = sheets[current]
  const [fw, fh] = frameOf(sheet)
  snap()
  bitmaps.push(bitmap)
  const w = Math.min(fw * .4, bitmap.w)
  const h = w * bitmap.h / bitmap.w
  const note: Picture = { kind: 'pic', id: nextId++, x: (fw - w) / 2, y: Math.min((fh - h) / 2, fh - h), w, h, image: bitmaps.length - 1 }
  sheet.notes.push(note)
  selected = note.id
  setTool('select')
  renderNotes()
  notesEl.querySelector<HTMLElement>(`[data-ann="${note.id}"]`)?.focus({ preventScroll: true })
}

const padContext = () => pad.getContext('2d')!
let ink: { x: number; y: number }[][] = []
function clearPad() {
  padContext().clearRect(0, 0, pad.width, pad.height)
  ink = []
  typed.value = ''
}
function padPoint(event: PointerEvent) {
  const box = pad.getBoundingClientRect()
  return { x: (event.clientX - box.left) * pad.width / box.width, y: (event.clientY - box.top) * pad.height / box.height }
}
pad.addEventListener('pointerdown', event => {
  event.preventDefault()
  pad.setPointerCapture(event.pointerId)
  typed.value = ''
  const stroke = [padPoint(event)]
  ink.push(stroke)
  const draw = (from: { x: number; y: number }, to: { x: number; y: number }) => {
    const context = padContext()
    context.lineWidth = 5
    context.lineCap = 'round'
    context.lineJoin = 'round'
    context.strokeStyle = '#14213d'
    context.beginPath()
    context.moveTo(from.x, from.y)
    context.lineTo(to.x + .01, to.y + .01)
    context.stroke()
  }
  draw(stroke[0], stroke[0])
  const move = (next: PointerEvent) => { const point = padPoint(next); draw(stroke.at(-1)!, point); stroke.push(point) }
  const end = () => { pad.removeEventListener('pointermove', move); pad.removeEventListener('pointerup', end); pad.removeEventListener('pointercancel', end) }
  pad.addEventListener('pointermove', move)
  pad.addEventListener('pointerup', end)
  pad.addEventListener('pointercancel', end)
})
typed.addEventListener('input', async () => {
  ink = []
  const context = padContext()
  context.clearRect(0, 0, pad.width, pad.height)
  if (!typed.value.trim()) return
  await document.fonts.load('80px "Caveat Brush"').catch(() => [])
  context.fillStyle = '#14213d'
  context.font = '80px "Caveat Brush", cursive'
  context.textBaseline = 'middle'
  context.fillText(typed.value, 24, pad.height / 2, pad.width - 48)
})
async function useSignature() {
  const context = padContext()
  const { data } = context.getImageData(0, 0, pad.width, pad.height)
  let x0 = pad.width, y0 = pad.height, x1 = 0, y1 = 0
  for (let y = 0; y < pad.height; y++) for (let x = 0; x < pad.width; x++) {
    if (data[(y * pad.width + x) * 4 + 3] > 8) { x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y) }
  }
  if (x1 <= x0 && y1 <= y0) return
  const crop = document.createElement('canvas')
  crop.width = x1 - x0 + 12
  crop.height = y1 - y0 + 12
  crop.getContext('2d')!.drawImage(pad, x0 - 6, y0 - 6, crop.width, crop.height, 0, 0, crop.width, crop.height)
  const blob = await new Promise<Blob | null>(resolve => crop.toBlob(resolve, 'image/png'))
  dialog.close()
  if (blob) {
    await addImage(blob)
    const note = selectedNote()
    if (note?.kind === 'pic') { note.w = Math.min(note.w, frameOf(sheets[current])[0] * .3); note.h = note.w * crop.height / crop.width; renderNotes() }
  }
}

// ---------- saving ----------
async function save() {
  if (!source || !file) return
  say(tx('saving'))
  try {
    const { PDFDocument, StandardFonts, rgb, degrees, LineCapStyle } = await import('pdf-lib')
    const input = await PDFDocument.load(source, { updateMetadata: false })
    const output = await PDFDocument.create()
    const standard = { sans: StandardFonts.Helvetica, serif: StandardFonts.TimesRoman, mono: StandardFonts.Courier } as const
    const embedded = new Map<Family, Awaited<ReturnType<typeof output.embedFont>>>()
    const pictures = new Map<number, Awaited<ReturnType<typeof output.embedPng>>>()
    const colour = (hex: string) => rgb(parseInt(hex.slice(1, 3), 16) / 255, parseInt(hex.slice(3, 5), 16) / 255, parseInt(hex.slice(5, 7), 16) / 255)
    const pages = await output.copyPages(input, sheets.map(sheet => sheet.src))
    for (const [index, sheet] of sheets.entries()) {
      const page = output.addPage(pages[index])
      const base = normalise(page.getRotation().angle)
      const box = page.getCropBox()
      const map = (fx: number, fy: number) => framePointToPdf(base, box, fx, fy)
      for (const note of sheet.notes) {
        if (note.kind === 'text') {
          if (!embedded.has(note.font)) embedded.set(note.font, await output.embedFont(standard[note.font]))
          const font = embedded.get(note.font)!
          for (const [row, line] of note.text.split('\n').entries()) {
            const safe = [...line].map(character => { try { font.encodeText(character); return character } catch { return '?' } }).join('')
            if (!safe.trim()) continue
            const [x, y] = map(note.x, note.y + note.size * (baseline[note.font] + row * lineHeight))
            page.drawText(safe, { x, y, size: note.size, font, color: colour(note.color), rotate: degrees(base) })
          }
        } else if (note.kind === 'ink') {
          const d = note.points.map(([fx, fy], at) => { const [x, y] = map(fx, fy); return `${at ? 'L' : 'M'}${x.toFixed(2)} ${(-y).toFixed(2)}${note.points.length === 1 ? 'l.01 -.01' : ''}` }).join('')
          page.drawSvgPath(d, { x: 0, y: 0, borderColor: colour(note.color), borderWidth: note.width, borderOpacity: note.alpha, borderLineCap: LineCapStyle.Round })
        } else {
          if (!pictures.has(note.image)) {
            const bitmap = bitmaps[note.image]
            pictures.set(note.image, bitmap.type === 'jpg' ? await output.embedJpg(bitmap.bytes) : await output.embedPng(bitmap.bytes))
          }
          const [x, y] = map(note.x, note.y + note.h)
          page.drawImage(pictures.get(note.image)!, { x, y, width: note.w, height: note.h, rotate: degrees(base) })
        }
      }
      page.setRotation(degrees((base + sheet.turn) % 360))
    }
    const bytes = await output.save()
    const url = URL.createObjectURL(new Blob([Uint8Array.from(bytes).buffer], { type: 'application/pdf' }))
    const link = document.createElement('a')
    link.href = url
    link.download = localName(file, 'pdf')
    document.body.append(link)
    link.click()
    link.remove()
    setTimeout(() => URL.revokeObjectURL(url), 60_000)
    dirty = false
    say(tx('saved'))
  } catch {
    say(tx('fail'))
  }
}

// ---------- wiring ----------
app.addEventListener('click', event => {
  const button = (event.target as Element).closest<HTMLButtonElement>('button')
  if (!button) return
  const data = button.dataset
  if ('theme' in data) { theme = theme === 'dark' ? 'light' : 'dark'; persist('versa-theme', theme); applyTheme() }
  else if ('language' in data) { language = language === 'pt' ? 'en' : 'pt'; persist('versa-language', language); applyLanguage() }
  else if ('pick' in data) openInput.click()
  else if ('sample' in data) void open(samplePdf())
  else if (data.tool) setTool(data.tool as Tool)
  else if ('image' in data) picInput.click()
  else if ('sign' in data) { clearPad(); dialog.showModal(); typed.focus() }
  else if (data.color) changeProperty((note, kind) => { prefs.color[kind] = data.color!; if (note) note.color = data.color! })
  else if ('signUse' in data) void useSignature()
  else if ('signClear' in data) clearPad()
  else if ('signCancel' in data) dialog.close()
  else if (data.act) ({
    undo, delNote: removeSelected, save: () => void save(), del: deletePage,
    rotl: () => turnPage(-90), rotr: () => turnPage(90),
    earlier: () => movePage(current, current - 1), later: () => movePage(current, current + 1),
    zoomin: () => { zoom = Math.min(3, zoom * 1.25); renderAll() }, zoomout: () => { zoom = Math.max(.4, zoom / 1.25); renderAll() },
  } as Record<string, () => void>)[data.act]?.()
})
sizeInput.addEventListener('input', () => changeProperty((note, kind) => {
  const value = Number(sizeInput.value)
  prefs.size[kind] = value
  if (note?.kind === 'text') note.size = value
  else if (note?.kind === 'ink') note.width = value
}))
fontSelect.addEventListener('change', () => changeProperty(note => {
  prefs.font = fontSelect.value as Family
  if (note?.kind === 'text') note.font = prefs.font
}))
openInput.addEventListener('change', () => { const next = openInput.files?.[0]; openInput.value = ''; if (next) void open(next) })
picInput.addEventListener('change', () => { const next = picInput.files?.[0]; picInput.value = ''; if (next) void addImage(next) })
window.addEventListener('keydown', event => {
  const target = event.target as Element
  const typing = target.closest('textarea, input, select, [contenteditable]')
  if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'z' && !typing && !work.hidden) { event.preventDefault(); undo() }
  else if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 's' && !work.hidden) { event.preventDefault(); void save() }
  else if ((event.key === 'Delete' || event.key === 'Backspace') && !typing && selected !== undefined) { event.preventDefault(); removeSelected() }
  else if (event.key === 'Escape' && !dialog.open && !work.hidden) { if (selected !== undefined) select(undefined); else setTool('select') }
})
const isFiles = (event: DragEvent) => event.dataTransfer?.types.includes('Files')
const dropzone = q('[data-dropzone]')
window.addEventListener('dragover', event => { if (isFiles(event)) { event.preventDefault(); dropzone.classList.add('is-over') } })
window.addEventListener('dragleave', event => { if (!event.relatedTarget) dropzone.classList.remove('is-over') })
window.addEventListener('drop', event => {
  if (!isFiles(event)) return
  event.preventDefault()
  dropzone.classList.remove('is-over')
  const dropped = [...event.dataTransfer?.files ?? []][0]
  if (!dropped) return
  if (/^image\/(png|jpeg|webp)$/.test(dropped.type) && !work.hidden) void addImage(dropped)
  else void open(dropped)
})
window.addEventListener('beforeunload', event => { if (dirty) { event.preventDefault(); event.returnValue = tx('leave') } })
new ResizeObserver(() => { if (pdf && !work.hidden) { const next = fitScale(sheets[current]); if (Math.abs(next - scale) > .01) void showPage() } }).observe(stage)

applyTheme()
applyLanguage()
syncControls()
if (location.hash === '#abrir') {
  history.replaceState(null, '', location.pathname)
  void takeHandOff().then(next => { if (next) void open(next) })
}
