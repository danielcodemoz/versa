import './style.css'
import './editor.css'
import { t, type Language, type Phrase } from '../packages/engine/catalog'
import { copy } from './copy'
import { icon } from './icons'
import { samplePdf } from './sample'
import { takeHandOff } from './handoff'
import { baseline, framePointToPdf, lineHeight, normalise, sheetTransform, viewToFrame, type Turn } from './editor-geometry'
import logoLight from '../brand/logo-light.svg'
import logoDark from '../brand/logo-dark.svg'
import type { EditorNative } from './editor-native'
import { editInWorker } from './editor-worker'
import type { Crop } from './editor-images'
import { arrowHead, bounds, fieldKey, offset, type Bitmap, type Family, type FormValue, type Meta, type Note, type Original, type Picture, type Point, type Replacement, type Shape, type ShapeKind, type Sheet, type Source, type Stroke, type TextNote } from './editor-model'
type OriginalInspector = typeof import('./editor-original').originalBlocks

type Tool = 'select' | 'text' | 'pen' | 'hl' | ShapeKind | 'stamp' | 'comment'
type StampKind = 'approved' | 'draft' | 'date'
const shapeKinds = ['rect', 'circle', 'line', 'arrow'] as const
const isShape = (tool: Tool): tool is ShapeKind => tool === 'cover' || shapeKinds.some(shape => shape === tool)

const P = {
  back: ['Voltar ao Versa', 'Back to Versa'],
  title: ['Editar PDF', 'Edit PDF'],
  intro: ['Abre um PDF, escreve, desenha, acrescenta imagens e assinatura, e guarda uma cópia nova. O ficheiro nunca sai do teu dispositivo.', 'Open a PDF, type, draw, add images and a signature, then save a new copy. The file never leaves your device.'],
  drop: ['Larga um PDF aqui', 'Drop a PDF here'],
  pick: ['Escolher PDF', 'Choose a PDF'],
  openAnother: ['Abrir outro PDF', 'Open another PDF'],
  sample: ['Experimentar com exemplo', 'Try with a sample'],
  privacy: ['0 bytes enviados', '0 bytes uploaded'],
  tools: ['Ferramentas', 'Tools'], edit: ['Editar', 'Edit'], insert: ['Inserir', 'Insert'], annotate: ['Anotar', 'Annotate'],
  name: ['Nome do documento', 'Document name'], unnamed: ['Documento', 'Document'],
  grid: ['Grelha de páginas', 'Page grid'], first: ['Mover para o início', 'Move to start'], last: ['Mover para o fim', 'Move to end'],
  all: ['Seleccionar todas', 'Select all'], none: ['Limpar selecção de páginas', 'Clear page selection'],
  selectedPages: ['Páginas seleccionadas', 'Selected pages'],
  pictureTools: ['Editar imagem', 'Edit image'], crop: ['Recortar imagem', 'Crop image'],
  replacePicture: ['Substituir imagem', 'Replace image'], pictureLeft: ['Rodar imagem à esquerda', 'Rotate image left'],
  pictureRight: ['Rodar imagem à direita', 'Rotate image right'], opacity: ['Opacidade', 'Opacity'],
  unlocking: ['A desbloquear…', 'Unlocking…'],
  unlocked: ['A cópia guardada ficará sem palavra-passe.', 'The saved copy will have no password.'],
  unlockFail: ['Não foi possível desbloquear o PDF.', 'Could not unlock this PDF.'],
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
  cancel: ['Cancelar', 'Cancel'],
  badImage: ['Escolhe uma imagem PNG, JPG ou WebP.', 'Choose a PNG, JPG or WebP image.'],
  leave: ['Tens alterações por guardar.', 'You have unsaved changes.'],
  replace: ['Abrir outro PDF e perder as alterações?', 'Open another PDF and lose your changes?'],
  hint: ['Arrasta as miniaturas para reordenar. Usa Del para apagar a selecção.', 'Drag thumbnails to reorder. Press Del to delete the selection.'],
  pageBefore: ['Página antes', 'Page before'], pageAfter: ['Página depois', 'Page after'],
  duplicate: ['Duplicar', 'Duplicate'], importPages: ['Inserir de outro PDF', 'Insert from PDF'],
  importHint: ['Indica páginas como 1, 3–5. Deixa vazio para inserir todas.', 'Enter pages such as 1, 3–5. Leave blank to insert all.'],
  range: ['Páginas a inserir', 'Pages to insert'], position: ['Posição', 'Position'],
  invalidRange: ['Escolhe páginas válidas, por exemplo 1, 3–5.', 'Choose valid pages, for example 1, 3–5.'],
  extract: ['Extrair seleccionadas', 'Extract selected'], extractMark: ['Seleccionar página', 'Select page'],
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

let native: EditorNative | undefined
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
const button = (key: Key, glyph: string, attrs: string) => `<button class="tool icon-only" type="button" ${attrs} ${aria(key)}>${icon(glyph, 19)}</button>`
const action = (key: Key, glyph: string) => button(key, glyph, `data-act="${key}"`)
const toolButton = (key: Key, glyph: string = key) => button(key, glyph, `data-tool="${key}" aria-pressed="false"`)
const group = (key: Key, contents: string) => `<div class="ed-group" role="group" aria-labelledby="ed-${key}"><span class="ed-group-label" id="ed-${key}" data-k="${key}">${tx(key)}</span><div class="ed-group-controls">${contents}</div></div>`
const menu = (key: Key, attr: string, values: readonly Key[]) =>
  `<select class="ed-menu" ${attr} ${aria(key)}><option value="" data-k="${key}">${tx(key)}</option>${values.map(value => `<option value="${value}" data-k="${value}">${tx(value)}</option>`).join('')}</select>`
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
        <div class="ed-document">
          <label>${span('name')} <input type="text" maxlength="180" autocomplete="off" spellcheck="false" data-document-name></label>
          ${button('openAnother', 'file', 'data-pick')}
          <button class="button ed-save" type="button" data-act="save">${icon('save', 19)} ${span('save')}</button>
        </div>
        <div class="ed-tool-groups">
          ${group('edit', toolButton('select') + toolButton('text') + action('undo', 'undo') + action('redo', 'redo') + action('delNote', 'close') + action('zoomout', 'zoomout') + action('zoomin', 'zoomin'))}
          ${group('insert', button('image', 'image', 'data-image') + button('sign', 'sign', 'data-sign'))}
          ${group('annotate', toolButton('pen') + toolButton('hl', 'highlight') + toolButton('cover') + toolButton('comment') + menu('shapes', 'data-shape', shapeKinds) + menu('stamps', 'data-stamp', ['approved', 'draft', 'date']))}
          ${group('pages', button('grid', 'grid', 'data-act="grid" aria-pressed="false"') + action('all', 'check') + action('none', 'close') +
            ([['pageBefore', 'pageBefore'], ['pageAfter', 'pageAfter'], ['duplicate', 'duplicate'], ['del', 'trash'], ['rotl', 'rotl'], ['rotr', 'rotr'],
              ['first', 'first'], ['earlier', 'left'], ['later', 'right'], ['last', 'last'], ['importPages', 'upload'], ['extract', 'down']] as const)
              .map(([key, glyph]) => action(key, glyph)).join('') + '<span data-selection aria-live="polite"></span>')}
        </div>
        <div class="ed-props" hidden>
          <span class="ed-swatches" role="group" data-ka="colour" aria-label="${tx('colour')}">${swatches.map(color => `<button type="button" class="swatch" data-color="${color}" style="--c:${color}" aria-label="${color}" aria-pressed="false"></button>`).join('')}</span>
          <label>${span('size')} <input type="range" data-size min="8" max="72" value="18"></label>
          <label data-font-label>${span('font')} <select data-font>${(['sans', 'serif', 'mono'] as const).map(family => `<option value="${family}" data-k="${family}">${tx(family)}</option>`).join('')}</select></label>
        </div>
        <div class="ed-image-tools" role="group" data-ka="pictureTools" aria-label="${tx('pictureTools')}" hidden>
          ${button('pictureLeft', 'rotl', 'data-picture="left"')}
          ${button('pictureRight', 'rotr', 'data-picture="right"')}
          ${button('crop', 'crop', 'data-picture="crop"')}
          ${button('replacePicture', 'image', 'data-picture="replace"')}
          <label>${span('opacity')} <input type="range" data-opacity min="0" max="100" value="100"></label><span data-opacity-value>100%</span>
        </div>
      </div>
      <p class="ed-visual" data-k="visual">${tx('visual')}</p>
      <div class="ed-body" data-body>
        <nav class="ed-thumbs" aria-label="${tx('pages')}" data-ka="pages"><ol data-thumbs></ol></nav>
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
    <input type="file" hidden accept="image/png,image/jpeg,image/webp,.png,.jpg,.jpeg,.webp" data-replace-pic>
  </main>
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
const nameInput = q<HTMLInputElement>('[data-document-name]')
const askingPassword = () => Boolean(app.querySelector('[data-password-dialog][open]'))
const sizeInput = q<HTMLInputElement>('[data-size]'), fontSelect = q<HTMLSelectElement>('[data-font]')

let file: File | undefined
let documentName = ''
let grid = false
let groupAnchor: number | undefined
let secureCopy = false
let sources: Source[] = []
let formValues: Record<string, FormValue> = {}
const extracting = new Set<number>()
let stamp: StampKind = 'approved'
let pendingImport: { source: Source; metas: Meta[] } | undefined
let pendingComment: { sheet: Sheet; at: Point; id?: number } | undefined
let displayedBlocks: Awaited<ReturnType<OriginalInspector>> | undefined
let inspectOriginals: Promise<typeof import('./editor-original') | undefined> | undefined
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
let thumbnails: ReturnType<typeof import('./editor-pages').makeThumbnails> | undefined
let moveSelection: typeof import('./editor-pages').moveSelection
const say = (message: string) => { status.textContent = message }

function applyLanguage() {
  document.documentElement.lang = language === 'pt' ? 'pt-MZ' : 'en'
  document.title = 'Versa — ' + tx('title')
  app.querySelectorAll<HTMLElement>('[data-k]').forEach(element => { element.textContent = tx(element.dataset.k as Key) })
  app.querySelectorAll<HTMLElement>('[data-ka]').forEach(element => {
    element.setAttribute('aria-label', tx(element.dataset.ka as Key))
    if (element.tagName === 'BUTTON' || element.tagName === 'SELECT') element.title = tx(element.dataset.ka as Key)
  })
  q('[data-language]').textContent = language === 'pt' ? 'EN' : 'PT'
  q('[data-language]').setAttribute('aria-label', t(language, copy.language))
  q('[data-theme]').setAttribute('aria-label', t(language, copy.theme))
  if (file) { renderFields(); renderThumbs(); syncControls() }
  if (secureCopy) say(tx('unlocked'))
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
const snapshot = () => JSON.stringify({ sheets, current, formValues, documentName })
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
  const state = JSON.parse(previous) as { sheets: Sheet[]; current: number; formValues: Record<string, FormValue>; documentName: string }
  sheets = state.sheets
  for (const selected of extracting) if (!sheets.some(sheet => sheet.id === selected)) extracting.delete(selected)
  formValues = state.formValues
  documentName = nameInput.value = state.documentName
  current = Math.min(state.current, sheets.length - 1)
  selected = undefined
  dirty = true
  renderAll()
}
const undo = () => recall(undoStack, redoStack)
const redo = () => recall(redoStack, undoStack)

async function readSource(next: File, index: number, mine: number) {
  inspectOriginals ??= import('./editor-original').catch(() => undefined)
  const [{ readEditablePdf, requestPassword }, pagesUi] = await Promise.all([import('./editor-source'), import('./editor-pages')])
  moveSelection = pagesUi.moveSelection
  if (!thumbnails) {
    thumbnails = pagesUi.makeThumbnails(thumbsEl, paintThumb)
    pagesUi.wirePageDrag(thumbsEl, () => grid, extracting, (ids, slot) => {
      if (!grid) current = sheets.findIndex(sheet => ids.has(sheet.id))
      rearrange(moveSelection(sheets, sheet => ids.has(sheet.id), slot))
    })
  }
  return readEditablePdf(next, index, {
    active: () => mine === generation,
    password: retry => {
      if (askingPassword()) return Promise.resolve(undefined)
      say('')
      return requestPassword(app, next.name, language, retry, tx('unlocked'))
    },
    status: key => {
      if (mine === generation) say(key === 'empty' || key === 'large' || key === 'type' ? t(language, copy[key]) : tx(key))
    },
  })
}

const makeSheet = (src: number): Sheet => ({ id: nextId++, src, turn: 0, notes: [] })
async function open(next: File) {
  if (askingPassword()) return
  if ((dirty || applyOriginal) && !confirm(tx('replace'))) return
  const id = ++generation
  say(tx('opening'))
  try {
    const result = await readSource(next, 0, id)
    if (!result) return
    if (id !== generation) { await result.source.close(); return }
    stopOriginalEdit()
    drawTask?.cancel()
    for (const old of sources) void Promise.resolve(old.close()).catch(() => {})
    sources = [result.source]
    metas = result.metas
    file = next
    secureCopy = result.secure
    documentName = nameInput.value = next.name.replace(/\.pdf$/i, '')
    grid = false
    groupAnchor = undefined
    sheets = metas.map((_, src) => makeSheet(src))
    thumbnails?.reset()
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
    say(tx(secureCopy ? 'unlocked' : 'opened'))
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
  q('[data-body]').classList.toggle('is-grid', grid)
  stage.hidden = grid
  q('.ed-page-label').hidden = grid
  if (!grid) void showPage()
  else { renderNumber++; drawTask?.cancel() }
  q('[data-current]').textContent = String(current + 1)
  q('[data-total]').textContent = String(sheets.length)
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
    const inspector = await inspectOriginals
    if (!inspector || mine !== renderNumber) return
    const blocks = await inspector.originalBlocks(page, canvas, factor)
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
  form.hidden = grid || !fields.length
  holder.replaceChildren()
  if (source === undefined || grid) return
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
      box.style.transform = `rotate(${note.angle}deg)`
      img.style.opacity = String(note.opacity)
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

async function paintThumb({ sheet, meta }: { sheet: Sheet; meta: Meta }) {
  if (meta.source === undefined || meta.page === undefined) return null
  const page = await sources[meta.source].pdf.getPage(meta.page + 1)
  const rotation = (meta.base + sheet.turn) % 360
  const viewport = page.getViewport({ scale: 1, rotation })
  const small = page.getViewport({ scale: 160 / Math.max(viewport.width, viewport.height), rotation })
  const surface = document.createElement('canvas')
  surface.width = Math.ceil(small.width)
  surface.height = Math.ceil(small.height)
  await page.render({ canvas: surface, canvasContext: surface.getContext('2d')!, viewport: small }).promise
  return new Promise<Blob | null>(resolve => surface.toBlob(resolve, 'image/png'))
}

function renderThumbs() {
  thumbnails?.render(sheets.map(sheet => ({ sheet, meta: metas[sheet.src] })), current, extracting, grid, { page: tx('page'), select: tx('extractMark') })
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
  props.hidden = !kind || grid
  const picture = selectedNote()
  q('[data-picture]').parentElement!.hidden = grid || picture?.kind !== 'pic'
  if (picture?.kind === 'pic') {
    q<HTMLInputElement>('[data-opacity]').value = String(Math.round(picture.opacity * 100))
    q('[data-opacity-value]').textContent = `${Math.round(picture.opacity * 100)}%`
  }
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
  const ids = pageActionIds()
  const positions = sheets.flatMap((sheet, index) => ids.has(sheet.id) ? [index] : [])
  const contiguousFromStart = positions.every((at, index) => at === index)
  const contiguousToEnd = positions.every((at, index) => at === sheets.length - positions.length + index)
  const disabled = (key: Key, value: boolean) => { q<HTMLButtonElement>(`[data-act=${key}]`).disabled = value }
  disabled('earlier', contiguousFromStart)
  disabled('later', contiguousToEnd)
  disabled('first', contiguousFromStart)
  disabled('last', contiguousToEnd)
  disabled('del', !ids.size)
  disabled('duplicate', ids.size === 0)
  disabled('rotl', ids.size === 0)
  disabled('rotr', ids.size === 0)
  q('[data-act=grid]').setAttribute('aria-pressed', String(grid))
  q('[data-act=all]').hidden = !grid
  q('[data-act=none]').hidden = !grid
  disabled('all', extracting.size === sheets.length)
  disabled('none', !extracting.size)
  q('[data-selection]').textContent = grid ? `${tx('selectedPages')}: ${sheets.filter(sheet => extracting.has(sheet.id)).length}` : ''
  sheetEl.dataset.mode = tool
  stage.dataset.mode = tool
}
function setTool(next: Tool) {
  if (grid && next !== 'select') toggleGrid()
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
      const [local] = offset([0, 0], -note.angle * Math.PI / 180, x - start[0], y - start[1])
      note.w = Math.max(16, Math.min(fw, origin.w + local))
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
  const ids = pageActionIds()
  const copies = sheets.filter(sheet => ids.has(sheet.id)).map(sheet => ({ ...structuredClone(sheet), id: nextId++ }))
  if (copies.length) addSheets(copies, true)
}
async function importPdf(next: File) {
  const mine = generation
  if (sources.reduce((total, source) => total + source.data.size, next.size) > 192 * 1024 ** 2) {
    say(t(language, copy.large))
    return
  }
  say(tx('opening'))
  try {
    const candidate = await readSource(next, 0, mine)
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
const pageActionIds = () => grid ? extracting : new Set(sheets[current] ? [sheets[current].id] : [])

function toggleGrid() {
  applyOriginal?.()
  grid = !grid
  groupAnchor = undefined
  selected = undefined
  renderAll()
}
function markPages(all: boolean) {
  extracting.clear()
  if (all) for (const sheet of sheets) extracting.add(sheet.id)
  renderThumbs()
  syncControls()
}

thumbsEl.addEventListener('change', event => {
  const mark = event.target as HTMLInputElement
  if (mark.dataset.extract === undefined) return
  const id = Number(mark.dataset.extract)
  if (mark.checked) extracting.add(id)
  else extracting.delete(id)
  groupAnchor = id
  renderThumbs()
  syncControls()
})

function rearrange(order: Sheet[]) {
  if (order.every((sheet, index) => sheet === sheets[index])) return
  applyOriginal?.()
  snap()
  const active = sheets[current].id
  sheets = order
  current = sheets.findIndex(sheet => sheet.id === active)
  renderAll()
}
function moveEdge(end: boolean) {
  const ids = pageActionIds()
  rearrange(moveSelection(sheets, sheet => ids.has(sheet.id), end ? sheets.length : 0))
}
function moveNear(delta: -1 | 1) {
  const ids = pageActionIds()
  const copy = [...sheets]
  for (let n = 0; n < copy.length; n++) {
    const a = delta < 0 ? n : copy.length - n - 1
    const b = a + delta
    if (copy[b] && ids.has(copy[a].id) && !ids.has(copy[b].id)) [copy[a], copy[b]] = [copy[b], copy[a]]
  }
  rearrange(copy)
}
function turnPage(delta: number) {
  const ids = pageActionIds()
  if (!ids.size) return
  applyOriginal?.()
  snap()
  for (const sheet of sheets) if (ids.has(sheet.id)) sheet.turn = normalise(sheet.turn + delta)
  renderAll()
}
function deletePage() {
  const ids = pageActionIds()
  if (sheets.length <= ids.size) { say(tx('lastPage')); return }
  if (!ids.size) return
  applyOriginal?.()
  snap()
  const active = sheets[current].id
  sheets = sheets.filter(sheet => !ids.has(sheet.id))
  for (const id of ids) extracting.delete(id)
  const found = sheets.findIndex(sheet => sheet.id === active)
  current = found < 0 ? Math.min(current, sheets.length - 1) : found
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
  if (!button) return
  const index = Number(button.dataset.thumb)
  if (!grid) { goto(index); return }
  const id = sheets[index].id
  const anchor = groupAnchor === undefined ? -1 : sheets.findIndex(sheet => sheet.id === groupAnchor)
  if (event.shiftKey && anchor !== -1) {
    const range = sheets.slice(Math.min(anchor, index), Math.max(anchor, index) + 1)
    for (const sheet of range) extracting.add(sheet.id)
  } else {
    if (extracting.has(id)) extracting.delete(id)
    else extracting.add(id)
    groupAnchor = id
  }
  goto(index)
})
// ---------- images and signature ----------
const imageTools = () => import('./editor-images')
const storePicture = (bitmap: Bitmap) => bitmaps.push(bitmap) - 1
const pictureInput = q<HTMLInputElement>('[data-replace-pic]')

async function addImage(blob: Blob) {
  const sheet = sheets[current]
  const mine = generation
  if (!sheet) return
  try {
    const bitmap = await (await imageTools()).decodePicture(blob)
    if (mine !== generation || sheet !== sheets[current]) { URL.revokeObjectURL(bitmap.url); return }
    const [fw, fh] = frameOf(sheet)
    snap()
    const w = Math.min(fw * .4, fh * .55 * bitmap.w / bitmap.h, bitmap.w)
    const h = w * bitmap.h / bitmap.w
    const note: Picture = { kind: 'pic', id: nextId++, x: (fw - w) / 2, y: (fh - h) / 2, w, h, image: storePicture(bitmap), angle: 0, opacity: 1 }
    if (grid) toggleGrid()
    sheet.notes.push(note)
    selected = note.id
    setTool('select')
    renderNotes()
    notesEl.querySelector<HTMLElement>(`[data-ann="${note.id}"]`)?.focus({ preventScroll: true })
    return note
  } catch { if (mine === generation) say(tx('badImage')) }
}

const selectedPicture = () => {
  const selected = selectedNote()
  return selected?.kind === 'pic' ? selected : undefined
}
let replacingPicture: Picture | undefined
async function editPicture(action: string) {
  const note = selectedPicture()
  if (!note) return
  if (action === 'replace') { replacingPicture = note; pictureInput.click(); return }
  if (action === 'crop') {
    const original = bitmaps[note.image]
    const mine = generation
    try {
      const { requestCrop, cropPicture } = await imageTools()
      if (mine !== generation || note !== selectedPicture() || app.querySelector('dialog[open]')) return
      const crop = await requestCrop(app, original, language)
      if (!crop?.some(Boolean)) return
      const bitmap = await cropPicture(original, crop)
      if (mine !== generation || note !== selectedPicture()) { URL.revokeObjectURL(bitmap.url); return }
      applyCrop(note, bitmap, crop)
    } catch { if (mine === generation) say(tx('badImage')) }
    return
  }
  snap()
  note.angle = normalise(note.angle + (action === 'right' ? 90 : -90))
  renderNotes()
  syncControls()
}

function applyCrop(note: Picture, bitmap: Bitmap, [left, top, right, bottom]: Crop) {
  snap()
  const w = note.w * (1 - left - right), h = note.h * (1 - top - bottom)
  const centre: Point = [note.x + note.w / 2, note.y + note.h / 2]
  const [cx, cy] = offset(centre, note.angle * Math.PI / 180, note.w * (left - right) / 2, note.h * (top - bottom) / 2)
  Object.assign(note, { x: cx - w / 2, y: cy - h / 2, w, h, image: storePicture(bitmap) })
  renderNotes()
  syncControls()
}

async function replacePicture(blob: Blob, note: Picture) {
  const mine = generation
  try {
    const bitmap = await (await imageTools()).decodePicture(blob)
    if (mine !== generation || note !== selectedPicture()) { URL.revokeObjectURL(bitmap.url); return }
    snap()
    const fit = Math.min(note.w / bitmap.w, note.h / bitmap.h)
    const w = fit * bitmap.w, h = fit * bitmap.h
    Object.assign(note, { x: note.x + (note.w - w) / 2, y: note.y + (note.h - h) / 2, w, h, image: storePicture(bitmap) })
    renderNotes()
    syncControls()
  } catch { if (mine === generation) say(tx('badImage')) }
}

pictureInput.addEventListener('change', () => {
  const next = pictureInput.files?.[0]
  pictureInput.value = ''
  const note = replacingPicture
  replacingPicture = undefined
  if (next && note) void replacePicture(next, note)
})

const opacityInput = q<HTMLInputElement>('[data-opacity]')
let opacityEdit: Picture | undefined
opacityInput.addEventListener('input', () => {
  const note = selectedPicture()
  if (!note) return
  if (opacityEdit !== note) { snap(); opacityEdit = note }
  note.opacity = Number(opacityInput.value) / 100
  const element = notesEl.querySelector<HTMLElement>(`[data-ann="${note.id}"] img`)
  if (element) element.style.opacity = String(note.opacity)
  syncControls()
})
opacityInput.addEventListener('change', () => { opacityEdit = undefined })

let signing = false
async function useSignature() {
  if (signing) return
  signing = true
  const mine = generation
  try {
    const { requestSignature } = await import('./editor-signature')
    if (mine !== generation) return
    const blob = await requestSignature(app, language)
    if (!blob || mine !== generation) return
    const note = await addImage(blob)
    if (note) {
      const w = Math.min(note.w, frameOf(sheets[current])[0] * .3)
      note.h *= w / note.w
      note.w = w
      renderNotes()
    }
  } finally { signing = false }
}

// ---------- saving ----------
function filenameFor(extract: boolean) {
  const clean = documentName.trim().replace(/\.pdf$/i, '').replace(/[\x00-\x1f<>:"/\\|?*]/g, '_').replace(/[. ]+$/, '').trim()
  let base = clean || tx('unnamed')
  if (/^(con|prn|aux|nul|com[1-9¹²³]|lpt[1-9¹²³])(?:\.|$)/i.test(base)) base = '_' + base
  const suffix = extract ? (language === 'pt' ? ' - páginas' : ' - pages') : ''
  const encoder = new TextEncoder()
  let length = 0
  const shortened = Array.from(base).filter(char => (length += encoder.encode(char).length) <= 200).join('').trimEnd()
  return shortened + suffix + '.pdf'
}
let typingName = false
nameInput.addEventListener('focus', () => { typingName = false })
nameInput.addEventListener('input', () => {
  if (!typingName) { snap(); typingName = true }
  documentName = nameInput.value
  syncControls()
})

async function save(extract = false) {
  if (!file || saving) return
  applyOriginal?.()
  if (document.activeElement instanceof HTMLElement) document.activeElement.blur()
  const pages = extract ? sheets.filter(sheet => extracting.has(sheet.id)) : sheets
  if (!pages.length) return
  const stamp = snapshot()
  const mine = generation
  const name = filenameFor(extract)
  saving = true
  syncControls()
  say(tx('saving'))
  try {
    const bytes = await editInWorker({ action: 'save', sheets: pages, metas, sources: sources.map(source => source.data), bitmaps, values: formValues })
    if (mine !== generation) return
    if (native) {
      if (!await native.save(name, bytes)) { say(''); return }
    } else {
      const url = URL.createObjectURL(new Blob([bytes], { type: 'application/pdf' }))
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
  else if (data.picture) void editPicture(data.picture)
  else if ('cancelDialog' in data) button.closest('dialog')?.close()
  else if ('sign' in data) void useSignature()
  else if (data.color) changeProperty((note, kind) => { prefs.color[kind] = data.color!; if (note) note.color = data.color! })
  else if (data.act) ({
    undo, redo, delNote: removeSelected, save: () => void save(), del: deletePage,
    pageBefore: () => blankPage(false), pageAfter: () => blankPage(true), duplicate: duplicatePage,
    importPages: () => q<HTMLInputElement>('[data-import]').click(), extract: () => void save(true),
    rotl: () => turnPage(-90), rotr: () => turnPage(90),
    earlier: () => moveNear(-1), later: () => moveNear(1), first: () => moveEdge(false), last: () => moveEdge(true),
    grid: toggleGrid, all: () => markPages(true), none: () => markPages(false),
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
    if (grid) toggleGrid()
    else if (selected !== undefined) select(undefined)
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
new ResizeObserver(() => { if (file && !work.hidden && !grid) { const next = fitScale(sheets[current]); if (Math.abs(next - scale) > .01) void showPage() } }).observe(stage)

export function startEditor(platform?: EditorNative) {
  native = platform
  if (native) {
    const backUrl = '/desktop.html?desktop=main'
    native.titlebar(() => language)
    const back = document.createElement('a')
    back.className = 'text-link ed-back ed-native-back'
    back.href = backUrl
    back.innerHTML = `${icon('arrow', 16)} ${span('back')}`
    q('main').prepend(back)
    native.onDrop(async next => {
      if (/\.(png|jpe?g|webp)$/i.test(next.name) && !work.hidden) await addImage(next)
      else await open(next)
    }, () => say(t(language, copy.damaged)))
  }
  applyTheme()
  applyLanguage()
  syncControls()
  if (location.hash === '#abrir') {
    history.replaceState(null, '', location.pathname)
    void takeHandOff().then(next => { if (next) void open(next) })
  }
}
