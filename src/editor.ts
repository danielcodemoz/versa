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
import { invoke, isTauri } from '@tauri-apps/api/core'
import { listen } from '@tauri-apps/api/event'
import { mountTitlebar } from './native-window'
import { arrowHead, bounds, fieldKey, offset, type Bitmap, type Family, type FormValue, type Meta, type Note, type Original, type Picture, type Point, type Replacement, type Shape, type ShapeKind, type Sheet, type Source, type Stroke, type TextNote } from './editor-model'
import { originalBlocks } from './editor-original'

type Tool = 'select' | 'text' | 'pen' | 'hl' | ShapeKind | 'stamp' | 'comment'
type StampKind = 'approved' | 'draft' | 'date'
const shapeKinds = ['rect', 'circle', 'line', 'arrow'] as const
const isShape = (tool: Tool): tool is ShapeKind => tool === 'cover' || shapeKinds.some(shape => shape === tool)
const desktop = isTauri()
const backUrl = desktop ? '/desktop.html?desktop=main' : '/'

const P = {
  back: ['Voltar ao Versa', 'Back to Versa'],
  title: ['Editar PDF', 'Edit PDF'],
  intro: ['Abre um PDF, escreve, desenha, acrescenta imagens e assinatura, e guarda uma cópia nova. O ficheiro nunca sai do teu dispositivo.', 'Open a PDF, type, draw, add images and a signature, then save a new copy. The file never leaves your device.'],
  drop: ['Larga um PDF aqui', 'Drop a PDF here'],
  pick: ['Escolher PDF', 'Choose a PDF'],
  openAnother: ['Abrir outro PDF', 'Open another PDF'],
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
  undo: ['Desfazer', 'Undo'], redo: ['Refazer', 'Redo'], zoomin: ['Aumentar', 'Zoom in'], zoomout: ['Diminuir', 'Zoom out'],
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
  hint: ['Arrasta as miniaturas para reordenar. Usa Del para apagar a selecção.', 'Drag thumbnails to reorder. Press Del to delete the selection.'],
  pageBefore: ['Página antes', 'Page before'], pageAfter: ['Página depois', 'Page after'],
  duplicate: ['Duplicar', 'Duplicate'], importPages: ['Inserir de outro PDF', 'Insert from PDF'],
  importHint: ['Indica páginas como 1, 3–5. Deixa vazio para inserir todas.', 'Enter pages such as 1, 3–5. Leave blank to insert all.'],
  range: ['Páginas a inserir', 'Pages to insert'], position: ['Posição', 'Position'],
  invalidRange: ['Escolhe páginas válidas, por exemplo 1, 3–5.', 'Choose valid pages, for example 1, 3–5.'],
  extract: ['Extrair seleccionadas', 'Extract selected'], extractMark: ['Seleccionar para extrair', 'Select to extract'],
  extracted: ['Páginas extraídas para um novo PDF.', 'Pages extracted to a new PDF.'],
  shapes: ['Formas', 'Shapes'], rect: ['Rectângulo', 'Rectangle'], circle: ['Círculo', 'Circle'],
  line: ['Linha', 'Line'], arrow: ['Seta', 'Arrow'], cover: ['Caixa branca', 'White box'],
  stamps: ['Carimbos', 'Stamps'], approved: ['Aprovado', 'Approved'], draft: ['Rascunho', 'Draft'], date: ['Data', 'Date'],
  comment: ['Comentário', 'Comment'], commentText: ['Texto do comentário', 'Comment text'],
  apply: ['Aplicar', 'Apply'], formFields: ['Campos de formulário', 'Form fields'],
  selectOption: ['Seleccionar opção', 'Select an option'],
  editOriginal: ['Editar texto original', 'Edit original text'],
  visual: ['Substituição visual. Clica no texto original para editar. A substituição e a caixa branca deixam o conteúdo original no PDF.', 'Visual replacement. Click original text to edit it. Replacement and white boxes leave the original content in the PDF.'],
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
    <a class="brand-link" href="${backUrl}" aria-label="Versa"><img class="brand brand-light" src="${logoLight}" width="118" height="42" alt="Versa"><img class="brand brand-dark" src="${logoDark}" width="118" height="42" alt="Versa"></a>
    <a class="text-link ed-back" href="${backUrl}">${icon('arrow', 16)} ${span('back')}</a>
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
          <button class="tool" type="button" data-pick>${icon('file', 20)}${span('openAnother')}</button>
          ${(['select', 'text', 'pen', 'hl'] as const).map(tool => `<button class="tool" type="button" data-tool="${tool}" aria-pressed="false">${icon(tool === 'hl' ? 'highlight' : tool, 20)}${span(tool)}</button>`).join('')}
          <button class="tool" type="button" data-image>${icon('image', 20)}${span('image')}</button>
          <button class="tool" type="button" data-sign>${icon('sign', 20)}${span('sign')}</button>
          <button class="tool" type="button" data-tool="cover" aria-pressed="false">${icon('cover', 20)}${span('cover')}</button>
          <button class="tool" type="button" data-tool="comment" aria-pressed="false">${icon('comment', 20)}${span('comment')}</button>
          <label class="ed-menu">${span('shapes')}<select data-shape><option value="" data-k="shapes">${tx('shapes')}</option>${shapeKinds.map(shape => `<option value="${shape}" data-k="${shape}">${tx(shape)}</option>`).join('')}</select></label>
          <label class="ed-menu">${span('stamps')}<select data-stamp><option value="" data-k="stamps">${tx('stamps')}</option>${(['approved', 'draft', 'date'] as const).map(key => `<option value="${key}" data-k="${key}">${tx(key)}</option>`).join('')}</select></label>
        </div>
        <div class="ed-group ed-props">
          <span class="ed-swatches" role="group" data-ka="colour" aria-label="${tx('colour')}">${swatches.map(color => `<button type="button" class="swatch" data-color="${color}" style="--c:${color}" aria-label="${color}" aria-pressed="false"></button>`).join('')}</span>
          <label>${span('size')} <input type="range" data-size min="8" max="72" value="18"></label>
          <label data-font-label>${span('font')} <select data-font>${(['sans', 'serif', 'mono'] as const).map(family => `<option value="${family}" data-k="${family}">${tx(family)}</option>`).join('')}</select></label>
        </div>
        <div class="ed-group ed-pages">
          <button class="tool icon-only" type="button" data-act="undo" ${aria('undo')}>${icon('undo', 20)}</button>
          <button class="tool icon-only" type="button" data-act="delNote" ${aria('delNote')}>${icon('close', 20)}</button>
          <button class="tool icon-only" type="button" data-act="redo" ${aria('redo')}>${icon('redo', 20)}</button>
          <button class="tool icon-only" type="button" data-act="zoomout" ${aria('zoomout')}>${icon('zoomout', 20)}</button>
          <button class="tool icon-only" type="button" data-act="zoomin" ${aria('zoomin')}>${icon('zoomin', 20)}</button>
        </div>
        <button class="button ed-save" type="button" data-act="save">${icon('save', 19)} ${span('save')}</button>
      </div>
      <p class="ed-visual" data-k="visual">${tx('visual')}</p>
      <div class="ed-body">
        <nav class="ed-thumbs" aria-label="${tx('pages')}" data-ka="pages">
          <div class="ed-page-tools">
            ${([['pageBefore', 'plus'], ['pageAfter', 'plus'], ['duplicate', 'duplicate'], ['del', 'trash'],
              ['rotl', 'rotl'], ['rotr', 'rotr'], ['earlier', 'left'], ['later', 'right'],
              ['importPages', 'upload'], ['extract', 'down']] as const).map(([action, glyph]) =>
                `<button class="tool" type="button" data-act="${action}" ${aria(action)}>${icon(glyph, 16)}${span(action)}</button>`).join('')}
          </div>
          <ol data-thumbs></ol>
        </nav>
        <div class="ed-stage" data-stage tabindex="-1">
          <div class="ed-wrap" data-wrap><div class="ed-sheet" data-sheet><canvas data-canvas></canvas><div class="ed-originals" data-originals></div><div class="ed-notes" data-notes></div><svg class="ed-ink" data-ink aria-hidden="true"></svg><div class="ed-inline" data-inline></div></div></div>
        </div>
      </div>
      <details class="ed-form" data-form hidden><summary>${span('formFields')}</summary><div data-fields></div></details>
      <p class="ed-page-label"><span data-k="page">${tx('page')}</span> <b data-current>1</b> <span data-k="of">${tx('of')}</span> <b data-total>1</b> · <span data-k="hint">${tx('hint')}</span></p>
    </section>
    <div class="ed-status" role="status" data-status></div>
    <input type="file" hidden accept=".pdf,application/pdf" data-open>
    <input type="file" hidden accept=".pdf,application/pdf" data-import>
    <input type="file" hidden accept="image/png,image/jpeg,image/webp,.png,.jpg,.jpeg,.webp" data-pic>
  </main>
  <dialog class="ed-dialog" data-dialog aria-labelledby="sign-title">
    <h2 id="sign-title" data-k="signTitle">${tx('signTitle')}</h2>
    <canvas class="ed-pad" data-pad width="600" height="220" role="img" ${aria('signPad')}></canvas>
    <label class="ed-type"><span data-k="signType">${tx('signType')}</span> <input type="text" maxlength="40" data-typed autocomplete="off"></label>
    <div class="ed-dialog-actions"><button class="button button-small" type="button" data-sign-use>${span('signUse')}</button><button class="quiet" type="button" data-sign-clear>${span('signClear')}</button><button class="quiet" type="button" data-sign-cancel>${span('cancel')}</button></div>
  </dialog>
  <dialog class="ed-dialog" data-import-dialog aria-labelledby="import-title">
    <h2 id="import-title" data-k="importPages">${tx('importPages')}</h2>
    <p data-import-count></p><p data-k="importHint">${tx('importHint')}</p>
    <form data-import-form>
      <label class="ed-type">${span('range')} <input type="text" data-range aria-describedby="import-error"></label>
      <p class="ed-error" id="import-error" role="alert"></p>
      <label class="ed-type">${span('position')} <select data-position><option value="after" data-k="pageAfter">${tx('pageAfter')}</option><option value="before" data-k="pageBefore">${tx('pageBefore')}</option></select></label>
      <div class="ed-dialog-actions"><button class="button button-small" type="submit">${span('apply')}</button><button class="quiet" type="button" data-cancel-dialog>${span('cancel')}</button></div>
    </form>
  </dialog>
  <dialog class="ed-dialog" data-comment-dialog aria-labelledby="comment-title">
    <h2 id="comment-title" data-k="comment">${tx('comment')}</h2>
    <form data-comment-form>
      <label class="ed-type">${span('commentText')} <textarea data-comment-text required maxlength="4000" rows="4"></textarea></label>
      <div class="ed-dialog-actions"><button class="button button-small" type="submit">${span('apply')}</button><button class="quiet" type="button" data-cancel-dialog>${span('cancel')}</button></div>
    </form>
  </dialog>`

const q = <T extends HTMLElement>(selector: string) => app.querySelector<T>(selector)!
const startPanel = q('[data-start]'), work = q('[data-work]'), stage = q('[data-stage]'), wrap = q('[data-wrap]')
const sheetEl = q('[data-sheet]'), canvas = q<HTMLCanvasElement>('[data-canvas]'), inkLayer = q<HTMLElement>('[data-ink]') as unknown as SVGSVGElement
const notesEl = q('[data-notes]'), thumbsEl = q('[data-thumbs]'), status = q('[data-status]')
const openInput = q<HTMLInputElement>('[data-open]'), picInput = q<HTMLInputElement>('[data-pic]')
const sizeInput = q<HTMLInputElement>('[data-size]'), fontSelect = q<HTMLSelectElement>('[data-font]')
const dialog = q<HTMLDialogElement>('[data-dialog]'), pad = q<HTMLCanvasElement>('[data-pad]'), typed = q<HTMLInputElement>('[data-typed]')

let file: File | undefined
let sources: Source[] = []
let formValues: Record<string, FormValue> = {}
const extracting = new Set<number>()
let stamp: StampKind = 'approved'
let pendingImport: { source: Source; metas: Meta[] } | undefined
let pendingComment: { sheet: Sheet; at: Point; id?: number } | undefined
let displayedBlocks: Awaited<ReturnType<typeof originalBlocks>> | undefined
let applyOriginal: (() => void) | undefined
let renderNumber = 0
let saving = false
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
const redoStack: string[] = []
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
  thumbsEl.querySelectorAll<HTMLElement>('[data-extract]').forEach((item, index) => item.setAttribute('aria-label', `${tx('extractMark')} · ${tx('page')} ${index + 1}`))
  if (file) renderFields()
  renderOriginals()
}
function applyTheme() {
  document.documentElement.dataset.theme = theme
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', theme === 'dark' ? '#172825' : '#f4efe3')
  const button = q('[data-theme]')
  button.innerHTML = icon(theme === 'dark' ? 'sun' : 'moon', 19)
  button.setAttribute('aria-pressed', String(theme === 'dark'))
}

// ---------- history ----------
const snapshot = () => JSON.stringify({ sheets, current, formValues })
function snap() {
  undoStack.push(snapshot())
  if (undoStack.length > 80) undoStack.shift()
  redoStack.length = 0
  dirty = true
}
function recall(from: string[], to: string[]) {
  const previous = from.pop()
  if (!previous) return
  stopOriginalEdit()
  to.push(snapshot())
  const state = JSON.parse(previous) as { sheets: Sheet[]; current: number; formValues: Record<string, FormValue> }
  sheets = state.sheets
  formValues = state.formValues
  current = Math.min(state.current, sheets.length - 1)
  selected = undefined
  dirty = true
  renderAll()
}
const undo = () => recall(undoStack, redoStack)
const redo = () => recall(redoStack, undoStack)

async function readSource(next: File, index: number) {
  const verdict = await inspectFiles([next])
  if (verdict.problem || verdict.kinds[0] !== 'pdf') {
    say(t(language, copy[verdict.problem ?? 'type']))
    return undefined
  }
  const { openPdf } = await import('../packages/engine/render-pdf')
  const { describeForms } = await import('./editor-pdf')
  const opened = await openPdf(next)
  try {
    const bytes = new Uint8Array(await next.arrayBuffer())
    const fields = await describeForms(bytes).catch(() => [])
    const pages: Meta[] = []
    for (let page = 0; page < opened.pdf.numPages; page++) {
      const proxy = await opened.pdf.getPage(page + 1)
      const view = proxy.getViewport({ scale: 1 })
      pages.push({ w: view.width, h: view.height, base: normalise(proxy.rotate), unit: proxy.userUnit, source: index, page })
    }
    return { source: { ...opened, bytes, fields }, metas: pages }
  } catch (error) {
    await opened.close()
    throw error
  }
}

const makeSheet = (src: number): Sheet => ({ id: nextId++, src, turn: 0, notes: [] })
async function open(next: File) {
  if ((dirty || applyOriginal) && !confirm(tx('replace'))) return
  const id = ++generation
  say(tx('opening'))
  try {
    const result = await readSource(next, 0)
    if (!result) return
    if (id !== generation) { await result.source.close(); return }
    stopOriginalEdit()
    drawTask?.cancel()
    for (const old of sources) void Promise.resolve(old.close()).catch(() => {})
    sources = [result.source]
    metas = result.metas
    file = next
    sheets = metas.map((_, src) => makeSheet(src))
    thumbs.forEach(url => URL.revokeObjectURL(url))
    thumbs.clear()
    rendering.clear()
    bitmaps.forEach(bitmap => URL.revokeObjectURL(bitmap.url))
    bitmaps.length = 0
    undoStack.length = redoStack.length = 0
    extracting.clear()
    formValues = {}
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
    if (id === generation) say(t(language, copy.damaged))
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
  renderFields()
  syncControls()
}

async function showPage() {
  const sheet = sheets[current]
  if (!sheet) return
  const mine = ++renderNumber
  applyOriginal?.()
  displayedBlocks = undefined
  renderOriginals()
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
  drawTask?.cancel()
  canvas.width = canvas.height = 1
  const meta = metas[sheet.src]
  if (meta.source === undefined || meta.page === undefined) return
  try {
    const page = await sources[meta.source].pdf.getPage(meta.page + 1)
    if (mine !== renderNumber) return
    const factor = scale * Math.min(devicePixelRatio || 1, 2, 3000 / (Math.max(fw, fh) * scale))
    const viewport = page.getViewport({ scale: factor })
    canvas.width = Math.ceil(viewport.width)
    canvas.height = Math.ceil(viewport.height)
    const task = page.render({ canvas, canvasContext: canvas.getContext('2d')!, viewport })
    drawTask = task
    await task.promise
    const blocks = await originalBlocks(page, canvas, factor)
    if (mine !== renderNumber) return
    displayedBlocks = blocks
    renderOriginals()
  } catch { /* A newer render may replace this one. */ }
}

function placeBlock(element: HTMLElement, block: Original, padding = 0) {
  const [x, y] = offset(block.origin, block.angle, -padding, -block.ascent - padding)
  element.style.left = `${x * scale}px`
  element.style.top = `${y * scale}px`
  element.style.width = `${(block.w + 2 * padding) * scale}px`
  element.style.height = `${(block.h + 2 * padding) * scale}px`
  element.style.transform = `rotate(${block.angle}rad)`
}
function stopOriginalEdit() {
  applyOriginal = undefined
  q('[data-inline]').replaceChildren()
}
function renderOriginals() {
  const layer = q('[data-originals]')
  layer.replaceChildren()
  if (tool !== 'select' || !displayedBlocks) return
  for (const block of displayedBlocks.blocks) {
    const hit = document.createElement('button')
    hit.type = 'button'
    hit.className = 'ed-original-hit'
    hit.dataset.original = String(block.index)
    hit.setAttribute('aria-label', `${tx('editOriginal')} · ${block.text}`)
    hit.title = tx('editOriginal')
    placeBlock(hit, block, .7)
    hit.addEventListener('click', () => editOriginal(block))
    layer.append(hit)
  }
}
function editOriginal(block: Original) {
  applyOriginal?.()
  const sheet = sheets[current]
  const replacement = sheet.notes.find((note): note is Replacement => note.kind === 'replace' && note.block.index === block.index)
  if (!replacement) displayedBlocks?.color(block)
  const appearance = replacement?.block ?? block
  const form = document.createElement('form')
  form.className = 'ed-original-edit'
  placeBlock(form, appearance)
  const area = document.createElement('input')
  area.type = 'text'
  area.maxLength = 1500
  area.value = replacement?.text ?? block.text
  area.setAttribute('aria-label', tx('editOriginal'))
  area.style.fontFamily = fonts[appearance.font]
  area.style.fontSize = `${appearance.size * scale}px`
  area.style.color = appearance.color
  area.style.background = appearance.background
  const actions = document.createElement('div')
  actions.className = 'ed-inline-actions'
  const commit = document.createElement('button')
  commit.type = 'submit'
  commit.className = 'tool'
  commit.textContent = tx('apply')
  const cancel = document.createElement('button')
  cancel.type = 'button'
  cancel.className = 'tool'
  cancel.textContent = tx('cancel')
  cancel.onclick = stopOriginalEdit
  actions.append(commit, cancel)
  form.append(area, actions)
  applyOriginal = () => {
    const text = area.value
    if (text !== (replacement?.text ?? block.text)) {
      snap()
      if (replacement) replacement.text = text
      else sheet.notes.push({ kind: 'replace', id: nextId++, block: { ...appearance }, text })
    }
    stopOriginalEdit()
    renderNotes()
    syncControls()
  }
  form.addEventListener('submit', event => { event.preventDefault(); applyOriginal?.() })
  area.addEventListener('keydown', event => {
    if (event.key === 'Escape') {
      event.stopPropagation()
      stopOriginalEdit()
      q<HTMLButtonElement>(`[data-original="${block.index}"]`)?.focus()
    }
  })
  q('[data-inline]').append(form)
  area.focus({ preventScroll: true })
  area.select()
}

const svgNs = 'http://www.w3.org/2000/svg'
function vectorLayer() {
  const [w, h] = frameOf(sheets[current])
  const svg = document.createElementNS(svgNs, 'svg')
  svg.setAttribute('class', 'ed-vector')
  svg.setAttribute('viewBox', `0 0 ${w} ${h}`)
  return svg
}
function drawShape(shape: Shape) {
  const g = document.createElementNS(svgNs, 'g')
  const { from, to, mode, color, width } = shape
  const { x, y, w, h } = bounds(from, to)
  let element: SVGElement
  if (mode === 'rect' || mode === 'cover') {
    element = document.createElementNS(svgNs, 'rect')
    for (const [key, value] of Object.entries({ x, y, width: w, height: h })) element.setAttribute(key, String(value))
  } else if (mode === 'circle') {
    element = document.createElementNS(svgNs, 'ellipse')
    for (const [key, value] of Object.entries({ cx: x + w / 2, cy: y + h / 2, rx: w / 2, ry: h / 2 })) element.setAttribute(key, String(value))
  } else {
    element = document.createElementNS(svgNs, 'path')
    const heads = mode === 'arrow' ? arrowHead(from, to, width) : []
    element.setAttribute('d', pathOf([from, to]) + heads.map(end => pathOf([to, end])).join(''))
  }
  element.setAttribute('fill', mode === 'cover' ? '#ffffff' : 'none')
  element.setAttribute('stroke', mode === 'cover' ? 'transparent' : color)
  element.setAttribute('stroke-width', String(width))
  element.setAttribute('stroke-linecap', 'round')
  g.append(element)
  return g
}
function startShape(event: PointerEvent, mode: ShapeKind) {
  const sheet = sheets[current]
  const from = framePoint(event)
  const shape: Shape = { kind: 'shape', id: nextId++, mode, from, to: from, color: prefs.color.pen, width: prefs.size.pen }
  const [w, h] = frameOf(sheet)
  const endpoint = (next: PointerEvent): Point => {
    const [x, y] = framePoint(next)
    if (mode !== 'circle') return [x, y]
    const [ox, oy] = from
    const dx = x < ox ? -1 : 1, dy = y < oy ? -1 : 1
    const side = Math.min(Math.max(Math.abs(x - ox), Math.abs(y - oy)), dx < 0 ? ox : w - ox, dy < 0 ? oy : h - oy)
    return [ox + side * dx, oy + side * dy]
  }
  sheetEl.setPointerCapture(event.pointerId)
  const move = (next: PointerEvent) => {
    shape.to = endpoint(next)
    inkLayer.replaceChildren(drawShape(shape))
  }
  const end = (next: PointerEvent) => {
    sheetEl.removeEventListener('pointermove', move)
    sheetEl.removeEventListener('pointerup', end)
    sheetEl.removeEventListener('pointercancel', end)
    inkLayer.replaceChildren()
    if (next.type !== 'pointerup' || sheet !== sheets[current]) return
    shape.to = endpoint(next)
    const { w, h } = bounds(shape.from, shape.to)
    if (Math.max(w, h) < 2 || (!(mode === 'line' || mode === 'arrow') && Math.min(w, h) < 1)) return
    snap()
    sheet.notes.push(shape)
    selected = shape.id
    setTool('select')
    renderNotes()
  }
  sheetEl.addEventListener('pointermove', move)
  sheetEl.addEventListener('pointerup', end)
  sheetEl.addEventListener('pointercancel', end)
}
function placeStamp(at: Point) {
  const text = stamp === 'date' ? new Intl.DateTimeFormat(language === 'pt' ? 'pt-MZ' : 'en').format(new Date()) : tx(stamp)
  const color = stamp === 'approved' ? '#146238' : stamp === 'draft' ? '#ac2d20' : '#172825'
  snap()
  sheets[current].notes.push({ kind: 'stamp', id: nextId++, at, text, color })
  renderNotes()
}
function openComment(at: Point, id?: number, text = '') {
  pendingComment = { sheet: sheets[current], at, id }
  const input = q<HTMLTextAreaElement>('[data-comment-text]')
  input.value = text
  q<HTMLDialogElement>('[data-comment-dialog]').showModal()
  input.focus()
}

function renderFields() {
  const form = q<HTMLDetailsElement>('[data-form]')
  const holder = q('[data-fields]')
  const sheet = sheets[current]
  const source = sheet && metas[sheet.src].source
  const fields = source === undefined ? [] : sources[source].fields
  form.hidden = !fields.length
  holder.replaceChildren()
  if (source === undefined) return
  for (const field of fields) {
    const key = fieldKey(source, field.name)
    const value = formValues[key] ?? field.value
    const label = document.createElement('label')
    const title = document.createElement('span')
    title.textContent = field.name
    let control: HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement
    if (field.kind === 'choice') {
      const dropdown = document.createElement('select')
      dropdown.multiple = field.multiple ?? false
      const selected = Array.isArray(value) ? value : [value]
      if (!dropdown.multiple) dropdown.append(new Option(tx('selectOption'), '', false, !selected.length || selected[0] === ''))
      for (const option of field.options ?? []) dropdown.append(new Option(option, option, false, selected.includes(option)))
      control = dropdown
    } else if (field.kind === 'check') {
      const input = document.createElement('input')
      input.type = 'checkbox'
      input.checked = Boolean(value)
      label.className = 'ed-field-check'
      control = input
    } else {
      control = document.createElement(field.multiline ? 'textarea' : 'input')
      control.value = String(value)
      if (field.maxLength !== undefined) control.maxLength = field.maxLength
    }
    control.addEventListener('change', () => {
      const next = control instanceof HTMLSelectElement && control.multiple
        ? [...control.selectedOptions].map(option => option.value)
        : control instanceof HTMLInputElement && control.type === 'checkbox' ? control.checked : control.value
      snap()
      formValues[key] = next
      syncControls()
    })
    label.append(title, control)
    holder.append(label)
  }
}

function renderNotes() {
  const sheet = sheets[current]
  if (!sheet) return
  notesEl.replaceChildren()
  inkLayer.replaceChildren()
  for (const note of sheet.notes) {
    if (note.kind === 'ink') {
      const d = pathOf(note.points)
      const visible = document.createElementNS(svgNs, 'path')
      visible.setAttribute('d', d)
      visible.setAttribute('stroke', note.color)
      visible.setAttribute('stroke-width', String(note.width))
      visible.setAttribute('stroke-opacity', String(note.alpha))
      visible.setAttribute('class', `ink-path${note.alpha < 1 ? ' is-highlight' : ''}`)
      const hit = document.createElementNS(svgNs, 'path')
      hit.setAttribute('d', d)
      hit.setAttribute('stroke-width', String(Math.max(note.width, 14)))
      hit.setAttribute('class', `ink-hit${selected === note.id ? ' is-selected' : ''}`)
      hit.dataset.ann = String(note.id)
      hit.setAttribute('aria-hidden', 'true')
      const vector = vectorLayer()
      vector.append(visible, hit)
      notesEl.append(vector)
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
      let typed = false
      area.addEventListener('focus', () => { typed = false; select(note.id) })
      area.addEventListener('input', () => {
        if (!typed && note.text) snap()
        typed = true
        note.text = area.value
        dirty = true
        fit(area)
      })
      area.addEventListener('keydown', event => { if (event.key === 'Escape') area.blur() })
      area.addEventListener('blur', () => {
        if (note.text.trim()) return
        const own = sheet.notes.indexOf(note)
        if (own >= 0) { sheet.notes.splice(own, 1); if (selected === note.id) selected = undefined; box.remove() }
      })
      box.append(handle, area)
      notesEl.append(box)
      fit(area)
    } else if (note.kind === 'pic') {
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
    } else if (note.kind === 'shape') {
      const vector = vectorLayer()
      const shape = drawShape(note)
      shape.dataset.ann = String(note.id)
      shape.setAttribute('class', `ed-shape${selected === note.id ? ' is-selected' : ''}`)
      shape.setAttribute('tabindex', '0')
      shape.setAttribute('role', 'button')
      shape.setAttribute('aria-label', tx(note.mode))
      vector.append(shape)
      notesEl.append(vector)
    } else if (note.kind === 'replace') {
      const box = document.createElement('button')
      box.type = 'button'
      box.className = `ed-note ed-replacement${selected === note.id ? ' is-selected' : ''}`
      box.dataset.ann = String(note.id)
      box.setAttribute('aria-label', `${tx('editOriginal')} · ${note.text}`)
      placeBlock(box, note.block, .7)
      box.style.background = note.block.background
      box.style.color = note.block.color
      box.style.font = `${note.block.size * scale}px/${note.block.h * scale}px ${fonts[note.block.font]}`
      box.textContent = note.text
      box.onclick = () => editOriginal(note.block)
      notesEl.append(box)
    } else {
      const box = document.createElement('button')
      box.type = 'button'
      box.className = `ed-note ed-${note.kind}${selected === note.id ? ' is-selected' : ''}`
      box.dataset.ann = String(note.id)
      box.style.left = `${note.at[0] * scale}px`
      box.style.top = `${note.at[1] * scale}px`
      if (note.kind === 'comment') {
        box.innerHTML = icon('comment', 20)
        box.title = note.text
        box.setAttribute('aria-label', `${tx('comment')} · ${note.text}`)
        box.onclick = () => { if (tool === 'select') openComment(note.at, note.id, note.text) }
      } else {
        box.textContent = note.text
        box.style.color = note.color
      }
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
    const mark = document.createElement('input')
    mark.type = 'checkbox'
    mark.dataset.extract = String(sheet.id)
    mark.checked = extracting.has(sheet.id)
    mark.setAttribute('aria-label', `${tx('extractMark')} · ${tx('page')} ${index + 1}`)
    item.append(button, mark)
    return { item, key, sheet }
  })
  thumbsEl.replaceChildren(...list.map(entry => entry.item))
  for (const { key, sheet } of list) {
    if (thumbs.has(key) || rendering.has(key)) continue
    if (mine !== generation) return
    const meta = metas[sheet.src]
    if (meta.source === undefined || meta.page === undefined) continue
    rendering.add(key)
    try {
      const page = await sources[meta.source].pdf.getPage(meta.page + 1)
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
  if (note) return note.kind === 'text' ? 'text' : note.kind === 'ink' ? (note.alpha < 1 ? 'hl' : 'pen') : note.kind === 'shape' && note.mode !== 'cover' ? 'pen' : undefined
  if (isShape(tool) && tool !== 'cover') return 'pen'
  return tool === 'text' || tool === 'pen' || tool === 'hl' ? tool : undefined
}
function syncControls() {
  app.querySelectorAll<HTMLElement>('[data-tool]').forEach(button => button.setAttribute('aria-pressed', String(button.dataset.tool === tool)))
  const kind = activeKind()
  const note = propertyNote()
  const props = q('.ed-props')
  props.classList.toggle('is-idle', !kind)
  if (kind) {
    const [min, max] = limits[kind]
    sizeInput.min = String(min)
    sizeInput.max = String(max)
    sizeInput.value = String(note?.kind === 'text' ? note.size : note?.width ?? prefs.size[kind])
    const color = note?.color ?? prefs.color[kind]
    app.querySelectorAll<HTMLElement>('[data-color]').forEach(button => button.setAttribute('aria-pressed', String(button.dataset.color === color)))
    fontSelect.value = note?.kind === 'text' ? note.font : prefs.font
  }
  sizeInput.disabled = !kind
  app.querySelectorAll<HTMLButtonElement>('[data-color]').forEach(button => { button.disabled = !kind })
  q('[data-font-label]').hidden = kind !== 'text'
  fontSelect.disabled = kind !== 'text'
  q<HTMLButtonElement>('[data-act=undo]').disabled = !undoStack.length
  q<HTMLButtonElement>('[data-act=redo]').disabled = !redoStack.length
  q<HTMLButtonElement>('[data-act=extract]').disabled = saving || !sheets.some(sheet => extracting.has(sheet.id))
  q<HTMLButtonElement>('[data-act=save]').disabled = saving
  q<HTMLSelectElement>('[data-shape]').value = isShape(tool) && tool !== 'cover' ? tool : ''
  q<HTMLSelectElement>('[data-stamp]').value = tool === 'stamp' ? stamp : ''
  q<HTMLButtonElement>('[data-act=delNote]').disabled = selected === undefined
  q<HTMLButtonElement>('[data-act=earlier]').disabled = current === 0
  q<HTMLButtonElement>('[data-act=later]').disabled = current >= sheets.length - 1
  sheetEl.dataset.mode = tool
  stage.dataset.mode = tool
}
function setTool(next: Tool) {
  if (next !== 'select') applyOriginal?.()
  tool = next
  renderOriginals()
  if (next !== 'select' && selected !== undefined) { selected = undefined; renderNotes() }
  syncControls()
}
const selectedNote = () => sheets[current]?.notes.find(note => note.id === selected)
function propertyNote() {
  const note = selectedNote()
  return note?.kind === 'text' || note?.kind === 'ink' || note?.kind === 'shape' ? note : undefined
}
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
  const target = [...notesEl.querySelectorAll<SVGPathElement>('.ink-path')].at(-1)
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
  if (isShape(tool)) { event.preventDefault(); startShape(event, tool); return }
  if (tool === 'stamp') { event.preventDefault(); placeStamp(framePoint(event)); return }
  if (tool === 'comment') { event.preventDefault(); openComment(framePoint(event)); return }
  if (tool === 'pen' || tool === 'hl') { event.preventDefault(); startStroke(event); return }
  if (tool === 'text' && !holder) { event.preventDefault(); addText(framePoint(event)); return }
  if (!holder) { select(undefined); return }
  const id = Number(holder.dataset.ann)
  const note = sheets[current].notes.find(entry => entry.id === id)
  select(id)
  if (!note || (note.kind !== 'text' && note.kind !== 'pic')) return
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
sheetEl.addEventListener('focusin', event => {
  const holder = (event.target as Element).closest<HTMLElement>('[data-ann]')
  if (holder) select(Number(holder.dataset.ann))
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

function changeProperty(apply: (note: TextNote | Stroke | Shape | undefined, kind: 'text' | 'pen' | 'hl') => void) {
  const kind = activeKind()
  if (!kind) return
  const note = propertyNote()
  if (note) snap()
  apply(note, kind)
  if (note) renderNotes()
  syncControls()
}

// ---------- pages ----------
function addSheets(next: Sheet[], after: boolean) {
  applyOriginal?.()
  snap()
  const at = current + Number(after)
  sheets.splice(at, 0, ...next)
  current = at
  selected = undefined
  renderAll()
}
function blankPage(after: boolean) {
  const sheet = sheets[current]
  const [w, h] = frameOf(sheet)
  metas.push({ w: sheet.turn % 180 ? h : w, h: sheet.turn % 180 ? w : h, base: 0, unit: 1 })
  addSheets([makeSheet(metas.length - 1)], after)
}
function duplicatePage() {
  applyOriginal?.()
  const clone = structuredClone(sheets[current])
  clone.id = nextId++
  addSheets([clone], true)
}
async function importPdf(next: File) {
  const mine = generation
  if (sources.reduce((total, source) => total + source.bytes.length, next.size) > 192 * 1024 ** 2) {
    say(t(language, copy.large))
    return
  }
  say(tx('opening'))
  try {
    const candidate = await readSource(next, 0)
    if (!candidate) return
    const dialog = q<HTMLDialogElement>('[data-import-dialog]')
    if (mine !== generation || dialog.open) { await candidate.source.close(); return }
    pendingImport = candidate
    const field = q<HTMLInputElement>('[data-range]')
    field.value = ''
    field.removeAttribute('aria-invalid')
    q('#import-error').textContent = ''
    q('[data-import-count]').textContent = `${next.name} · ${candidate.metas.length} ${tx('pages').toLowerCase()}`
    say('')
    dialog.showModal()
    field.focus()
  } catch {
    if (mine === generation) say(t(language, copy.damaged))
  }
}
function pageRange(text: string, count: number) {
  if (!text.trim()) return Array.from({ length: count }, (_, index) => index)
  const pages = new Set<number>()
  for (const part of text.split(',')) {
    const match = part.trim().match(/^(\d+)(?:\s*[-–]\s*(\d+))?$/)
    if (!match) return undefined
    const from = Number(match[1]), to = Number(match[2] ?? match[1])
    if (from < 1 || to < from || to > count) return undefined
    for (let page = from; page <= to; page++) pages.add(page - 1)
  }
  return [...pages]
}
q<HTMLFormElement>('[data-import-form]').addEventListener('submit', event => {
  event.preventDefault()
  const candidate = pendingImport
  if (!candidate) return
  const field = q<HTMLInputElement>('[data-range]')
  const pages = pageRange(field.value, candidate.metas.length)
  if (!pages?.length) {
    field.setAttribute('aria-invalid', 'true')
    q('#import-error').textContent = tx('invalidRange')
    field.focus()
    return
  }
  const source = sources.push(candidate.source) - 1
  const next = pages.map(page => {
    const src = metas.push({ ...candidate.metas[page], source }) - 1
    return makeSheet(src)
  })
  pendingImport = undefined
  q<HTMLDialogElement>('[data-import-dialog]').close()
  addSheets(next, q<HTMLSelectElement>('[data-position]').value === 'after')
})
q<HTMLDialogElement>('[data-import-dialog]').addEventListener('close', () => {
  if (pendingImport) void Promise.resolve(pendingImport.source.close()).catch(() => {})
  pendingImport = undefined
})
q<HTMLFormElement>('[data-comment-form]').addEventListener('submit', event => {
  event.preventDefault()
  if (!pendingComment) return
  const text = q<HTMLTextAreaElement>('[data-comment-text]').value.trim()
  if (!text) return
  const { sheet, at, id } = pendingComment
  if (sheet === sheets[current]) {
    const existing = sheet.notes.find(note => note.id === id && note.kind === 'comment')
    snap()
    if (existing?.kind === 'comment') existing.text = text
    else sheet.notes.push({ kind: 'comment', id: nextId++, at, text })
  }
  pendingComment = undefined
  q<HTMLDialogElement>('[data-comment-dialog]').close()
  renderNotes()
  syncControls()
})
thumbsEl.addEventListener('change', event => {
  const mark = event.target as HTMLInputElement
  if (mark.dataset.extract === undefined) return
  if (mark.checked) extracting.add(Number(mark.dataset.extract))
  else extracting.delete(Number(mark.dataset.extract))
  syncControls()
})

function movePage(from: number, to: number) {
  if (to < 0 || to >= sheets.length || from === to) return
  applyOriginal?.()
  snap()
  const [sheet] = sheets.splice(from, 1)
  sheets.splice(to, 0, sheet)
  current = to
  renderAll()
}
function turnPage(delta: number) {
  applyOriginal?.()
  snap()
  const sheet = sheets[current]
  sheet.turn = normalise(sheet.turn + delta)
  renderAll()
}
function deletePage() {
  if (sheets.length < 2) { say(tx('lastPage')); return }
  applyOriginal?.()
  snap()
  sheets.splice(current, 1)
  current = Math.min(current, sheets.length - 1)
  selected = undefined
  renderAll()
}
function goto(index: number) {
  if (index < 0 || index >= sheets.length) return
  applyOriginal?.()
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
async function save(extract = false) {
  if (!file || saving) return
  applyOriginal?.()
  if (document.activeElement instanceof HTMLElement) document.activeElement.blur()
  const pages = extract ? sheets.filter(sheet => extracting.has(sheet.id)) : sheets
  if (!pages.length) return
  const stamp = snapshot()
  const mine = generation
  const name = localName(file, 'pdf', extract ? (language === 'pt' ? ' - páginas (Versa)' : ' - pages (Versa)') : undefined)
  saving = true
  syncControls()
  say(tx('saving'))
  try {
    const { writeEditedPdf } = await import('./editor-pdf')
    const bytes = await writeEditedPdf(structuredClone(pages), [...metas], [...sources], [...bitmaps], structuredClone(formValues))
    if (mine !== generation) return
    if (desktop) {
      const header = new TextEncoder().encode(JSON.stringify(name) + '\n')
      const payload = new Uint8Array(header.length + bytes.length)
      payload.set(header)
      payload.set(bytes, header.length)
      if (!await invoke<boolean>('save_editor_pdf', payload)) { say(''); return }
    } else {
      const url = URL.createObjectURL(new Blob([Uint8Array.from(bytes).buffer], { type: 'application/pdf' }))
      const link = document.createElement('a')
      link.href = url
      link.download = name
      document.body.append(link)
      link.click()
      link.remove()
      setTimeout(() => URL.revokeObjectURL(url), 60_000)
    }
    if (mine !== generation) return
    if (!extract && stamp === snapshot()) dirty = false
    say(tx(extract ? 'extracted' : 'saved'))
  } catch {
    if (mine === generation) say(tx('fail'))
  } finally {
    saving = false
    syncControls()
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
  else if ('cancelDialog' in data) button.closest('dialog')?.close()
  else if ('sign' in data) { clearPad(); dialog.showModal(); typed.focus() }
  else if (data.color) changeProperty((note, kind) => { prefs.color[kind] = data.color!; if (note) note.color = data.color! })
  else if ('signUse' in data) void useSignature()
  else if ('signClear' in data) clearPad()
  else if ('signCancel' in data) dialog.close()
  else if (data.act) ({
    undo, redo, delNote: removeSelected, save: () => void save(), del: deletePage,
    pageBefore: () => blankPage(false), pageAfter: () => blankPage(true), duplicate: duplicatePage,
    importPages: () => q<HTMLInputElement>('[data-import]').click(), extract: () => void save(true),
    rotl: () => turnPage(-90), rotr: () => turnPage(90),
    earlier: () => movePage(current, current - 1), later: () => movePage(current, current + 1),
    zoomin: () => { zoom = Math.min(3, zoom * 1.25); renderAll() }, zoomout: () => { zoom = Math.max(.4, zoom / 1.25); renderAll() },
  } as Record<string, () => void>)[data.act]?.()
})
sizeInput.addEventListener('input', () => changeProperty((note, kind) => {
  const value = Number(sizeInput.value)
  prefs.size[kind] = value
  if (note?.kind === 'text') note.size = value
  else if (note) note.width = value
}))
fontSelect.addEventListener('change', () => changeProperty(note => {
  prefs.font = fontSelect.value as Family
  if (note?.kind === 'text') note.font = prefs.font
}))
q<HTMLSelectElement>('[data-shape]').addEventListener('change', event => {
  const value = (event.target as HTMLSelectElement).value as Tool
  setTool(isShape(value) ? value : 'select')
})
q<HTMLSelectElement>('[data-stamp]').addEventListener('change', event => {
  const value = (event.target as HTMLSelectElement).value as StampKind
  if (!value) { setTool('select'); return }
  stamp = value
  setTool('stamp')
})
q<HTMLInputElement>('[data-import]').addEventListener('change', event => {
  const input = event.target as HTMLInputElement
  const next = input.files?.[0]
  input.value = ''
  if (next) void importPdf(next)
})
openInput.addEventListener('change', () => { const next = openInput.files?.[0]; openInput.value = ''; if (next) void open(next) })
picInput.addEventListener('change', () => { const next = picInput.files?.[0]; picInput.value = ''; if (next) void addImage(next) })
window.addEventListener('keydown', event => {
  const target = event.target as Element
  const typing = target.closest('textarea, input, select, [contenteditable]')
  if (work.hidden || app.querySelector('dialog[open]')) return
  const key = event.key.toLowerCase()
  if ((event.ctrlKey || event.metaKey) && !typing && (key === 'z' || key === 'y')) {
    event.preventDefault()
    if (key === 'y' || event.shiftKey) redo()
    else undo()
  } else if ((event.ctrlKey || event.metaKey) && key === 's') {
    event.preventDefault()
    void save()
  } else if ((event.key === 'Delete' || event.key === 'Backspace') && !typing) {
    if (selected !== undefined) { event.preventDefault(); removeSelected() }
    else if (event.key === 'Delete' && target.closest('[data-thumb]')) { event.preventDefault(); deletePage() }
  } else if (event.key === 'Escape') {
    if (selected !== undefined) select(undefined)
    else setTool('select')
  }
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
window.addEventListener('beforeunload', event => { if (dirty || applyOriginal) { event.preventDefault(); event.returnValue = tx('leave') } })
new ResizeObserver(() => { if (file && !work.hidden) { const next = fitScale(sheets[current]); if (Math.abs(next - scale) > .01) void showPage() } }).observe(stage)

if (desktop) {
  mountTitlebar(() => language)
  const back = document.createElement('a')
  back.className = 'text-link ed-back ed-native-back'
  back.href = backUrl
  back.innerHTML = `${icon('arrow', 16)} ${span('back')}`
  q('main').prepend(back)
  void listen<{ id: number | null; entries: { name: string }[] }>('versa-drag-drop', async event => {
    const { id, entries } = event.payload
    const first = entries[0]
    if (id === null || !first) return
    try {
      const bytes = await invoke<ArrayBuffer>('read_file', { id, index: 0 })
      const next = new File([bytes], first.name)
      if (/\.(png|jpe?g|webp)$/i.test(first.name) && !work.hidden) await addImage(next)
      else await open(next)
    } catch { say(t(language, copy.damaged)) }
  }, { target: { kind: 'Window', label: 'main' } }).catch(() => {})
}
applyTheme()
applyLanguage()
syncControls()
if (location.hash === '#abrir') {
  history.replaceState(null, '', location.pathname)
  void takeHandOff().then(next => { if (next) void open(next) })
}
