import { available, needsPro, categories, categoryFor, kindFromFile, kindFromMime, recipes, suggest, t, type Category, type Kind, type Language, type Recipe } from '../packages/engine/catalog'
import { categoryForDrop } from './drop-category'
import { copy } from './copy'
import { icon } from './icons'
import { inspectFiles, type Preflight, type Problem } from '../packages/engine/preflight'
import { canRun, convert, type ConversionResult } from './conversion'
import type { Options } from '../packages/engine'
import { samplePdf } from './sample'
import { handOff } from './handoff'

const polar = (radius: number, degrees: number) => {
  const radians = degrees * Math.PI / 180
  return [220 + Math.cos(radians) * radius, 220 + Math.sin(radians) * radius]
}
const point = (radius: number, degrees: number) => polar(radius, degrees).map(n => n.toFixed(2)).join(' ')
const wedge = (outer: number, inner: number, start: number, end: number) =>
  `M${point(outer, start)} A${outer} ${outer} 0 0 1 ${point(outer, end)} L${point(inner, end)} A${inner} ${inner} 0 0 0 ${point(inner, start)}Z`
const escape = (value: string) => value.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!)
const fileDrag = (event: DragEvent) => event.dataTransfer?.types.includes('Files')
const frame = () => new Promise<void>(resolve => requestAnimationFrame(() => resolve()))
type NativeResult = { name: string; open: (reveal: boolean) => Promise<void> }
interface NativeSource {
  activity: (active: boolean) => Promise<void>
  idle: () => Promise<void>
  office: (recipe: Recipe, files: File[]) => Promise<ConversionResult | undefined>
  save: (result: ConversionResult) => Promise<NativeResult>
}
type Slice = { id: string; category: Category; name: string; recipe?: Recipe; disabled: boolean; reason?: string }

export function mountWheel(root: HTMLElement, getLanguage: () => Language) {
  const wheel = root.querySelector<HTMLElement>('.wheel')!
  const graphics = wheel.querySelector<SVGSVGElement>('svg')!
  const buttons = wheel.querySelector<HTMLElement>('.wheel-buttons')!
  const centre = wheel.querySelector<HTMLButtonElement>('.wheel-centre')!
  const fileInput = root.querySelector<HTMLInputElement>('.file-input')!
  const status = root.querySelector<HTMLElement>('.wheel-status')!
  const message = root.querySelector<HTMLElement>('.wheel-message')!
  const pick = root.querySelector<HTMLButtonElement>('[data-pick]')!
  const settings = root.querySelector<HTMLElement>('.wheel-settings')!
  const control = root.querySelector<HTMLButtonElement>('[data-back]')!
  const clear = root.querySelector<HTMLButtonElement>('[data-clear]')!
  const tag = root.querySelector<HTMLElement>('.lab-tag')!
  const suggestion = root.querySelector<HTMLElement>('.wheel-suggest')!
  const overlay = document.querySelector<HTMLElement>('.drag-shade')!
  const reduce = matchMedia('(prefers-reduced-motion: reduce)')
  let category: Category | undefined
  let slices: Slice[] = []
  let active: string | undefined
  let files: File[] = []
  let kinds: Kind[] = []
  let problem: Problem | undefined
  let options: Options = {}
  let checking = false
  let dragDepth = 0
  let dragKinds: Kind[] = []
  let dragging = false
  let percent: number | undefined
  let token = 0
  let nativeSource: NativeSource | undefined
  let nativePicker: (() => Promise<void>) | undefined
  let dismiss: (() => Promise<void>) | undefined
  let nativeHover: ReturnType<typeof setTimeout> | undefined
  let lastNativeHover: string | undefined
  let dragProblem: Problem | undefined
  let dragVerified = false
  let result: (ConversionResult & { url: string; before: number; native?: NativeResult }) | undefined
  const chooseFile = () => nativePicker ? void nativePicker() : fileInput.click()
  const visibleProblem = () => dragging ? dragProblem : problem

  const local = (key: keyof typeof copy) => t(getLanguage(), copy[key])
  function setActive(id?: string) {
    if (active === id) return
    active = id
    wheel.querySelectorAll<HTMLElement | SVGElement>('[data-slice]').forEach(element => {
      element.classList.toggle('is-active', element.dataset.slice === id)
    })
    renderCentre()
  }

  function renderCentre() {
    const current = slices.find(slice => slice.id === active)
    const action = current?.recipe ?? (current ? recipes.find(recipe => recipe.category === current.category && available(recipe, dragKinds.length ? dragKinds : kinds)) : undefined)
    centre.setAttribute('aria-label', local('pick'))
    centre.disabled = percent !== undefined
    centre.classList.toggle('is-progress', percent !== undefined)
    const fileLabel = files.length > 1 ? `${files.length} ${local('files')}` : files[0]?.name
    if (percent !== undefined) {
      centre.innerHTML = `<span class="progress-track" style="--progress:${percent}%"></span><strong>${percent}%</strong><small>${local('progress')}</small>`
    } else if (checking || visibleProblem() || dragging && !current) {
      centre.innerHTML = `${icon(visibleProblem() ? 'lock' : 'file', 28)}<strong>${local(checking ? 'verifying' : visibleProblem() ? 'locked' : 'drop')}</strong>`
    } else if (current) {
      const label = action && !current.disabled ? `${[...new Set(action.inputs.map(kind => kind.toUpperCase()))].length === 1 ? action.inputs[0].toUpperCase() : t(getLanguage(), categoryFor(current.category).name)} → ${action.output}` : current.name
      const destination = action ? ({ PDF: 'pdf', DOCX: 'docs', JPG: 'image', PNG: 'image', AVIF: 'image', WEBP: 'image' }[action.output] ?? 'file') : current.category
      centre.innerHTML = `${icon(current.disabled ? 'lock' : destination, 26)}<strong>${escape(current.name)}</strong><small>${escape(current.disabled ? local('locked') : label)}</small>`
    } else if (result) {
      centre.innerHTML = `${icon('check', 29)}<strong>${local('done')}</strong>`
    } else {
      centre.innerHTML = `${icon('file', 31)}<strong>${escape(fileLabel ?? local('wheelHint'))}</strong><small>${local(category ? 'chooseAction' : files.length ? 'select' : 'pick')}</small>`
    }
  }

  function render() {
    const detected = dragging ? dragKinds : kinds
    const issue = visibleProblem()
    const locked = Boolean(issue || checking || percent !== undefined)
    const disabledReason = (candidates: Recipe[]) => issue ? local(issue) : checking ? local('verifying')
      : candidates.some(candidate => canRun(candidate) && available(candidate, detected)) ? undefined
      : candidates.some(candidate => needsPro(candidate, detected)) ? t(getLanguage(), ['Vários ficheiros de uma vez: Versa Pro.', 'Many files at once: Versa Pro.'])
      : candidates.some(canRun) ? local('wrong') : t(getLanguage(), ['Disponível em breve.', 'Coming soon.'])
    slices = category ? recipes.filter(recipe => recipe.category === category).map(recipe => {
      const reason = disabledReason([recipe])
      return { id: recipe.id, category: recipe.category, recipe, name: t(getLanguage(), recipe.name), disabled: locked || Boolean(reason), reason }
    }) : categories.map(item => {
      const reason = disabledReason(recipes.filter(recipe => recipe.category === item.id))
      return { id: item.id, category: item.id, name: t(getLanguage(), item.name), disabled: locked || Boolean(reason), reason }
    })
    const outer = category ? 206 : 198
    const inner = category ? 88 : 84
    const step = 360 / slices.length
    graphics.innerHTML = `<defs>${categories.map(item =>
      `<linearGradient id="paint-${item.id}" x2="100%" y2="100%"><stop stop-color="${item.color}"/><stop offset="1" stop-color="${item.color}" stop-opacity=".68"/></linearGradient>`).join('')}</defs>
      <circle class="wheel-dial" cx="220" cy="220" r="${outer + 9}"/>
      ${slices.map((slice, index) => {
        const angle = -90 + step * index
        const item = categoryFor(slice.category)
        const [dx, dy] = polar(6, angle).map(n => n - 220)
        return `<g class="wedge${slice.disabled ? ' is-disabled' : ''}" data-slice="${slice.id}" style="--slice:${item.color};--slice-ink:${item.ink};--paint:url(#paint-${item.id});--dx:${dx}px;--dy:${dy}px;--order:${index}">
          <path class="wedge-shadow" d="${wedge(outer, inner, angle - step / 2 + 1.4, angle + step / 2 - 1.4)}"/>
          <path class="wedge-face" data-hit="${slice.id}" fill="${item.color}" d="${wedge(outer, inner, angle - step / 2 + 1.4, angle + step / 2 - 1.4)}"/>
          <path class="wedge-marker" d="M${point(outer - 8, angle - step / 2 + 4)} A${outer - 8} ${outer - 8} 0 0 1 ${point(outer - 8, angle + step / 2 - 4)}"/>
        </g>`
      }).join('')}`
    buttons.innerHTML = slices.map((slice, index) => {
      const [x, y] = polar(category ? 148 : 141, -90 + step * index)
      const item = categoryFor(slice.category)
      return `<button type="button" data-slice="${slice.id}" ${slice.disabled ? 'aria-disabled="true"' : ''} ${slice.reason ? `title="${escape(slice.reason)}" aria-label="${escape(slice.name + ' — ' + slice.reason)}"` : ''} style="--x:${x / 4.4}%;--y:${y / 4.4}%;--slice-ink:${item.ink};--slice:${item.color}">${icon(slice.disabled ? 'lock' : slice.recipe ? 'arrow' : slice.category, 25)}<span>${escape(slice.name)}</span></button>`
    }).join('')
    wheel.classList.toggle('is-subring', Boolean(category))
    wheel.classList.toggle('is-busy', percent !== undefined)
    const configure = category === 'pdf' || category === 'tools' || category === 'image' || category === 'school'
    const wasOpen = settings.querySelector('details')?.open
    settings.hidden = !configure || Boolean(problem) || !files.length || percent !== undefined
    if (!settings.hidden) settings.innerHTML = `<details ${wasOpen ? 'open' : ''}><summary>${t(getLanguage(), ['Opções de saída', 'Output options'])}</summary>
      ${category === 'school' ? `
        <label>${t(getLanguage(), ['Nome da escola', 'School name'])} <input type="text" maxlength="100" value="${escape(options.header ?? '')}" placeholder="Escola" data-option="header"></label>
        <input type="file" accept=".png,.jpeg,.jpg,.webp" data-option="logo" hidden>
        <button class="quiet logo-picker" type="button" data-logo-picker aria-describedby="logo-status">${t(getLanguage(), ['Escolher logótipo', 'Choose a logo'])}</button>
        <span class="logo-label" id="logo-status" role="status">${escape(options.logo?.name ?? t(getLanguage(), ['Nenhum ficheiro seleccionado', 'No file selected']))}</span>
      ` : `<label>${t(getLanguage(), ['Qualidade', 'Quality'])} <input type="range" min="20" max="100" value="${Math.round((options.quality ?? (category === 'pdf' ? .58 : .88)) * 100)}" data-option="quality"></label>
      ${category === 'pdf' ? `<label>${t(getLanguage(), ['Rotação', 'Rotation'])} <select data-option="rotation">${[90,180,270].map(value => `<option value="${value}" ${options.rotation === value ? 'selected' : ''}>${value}°</option>`).join('')}</select></label>` : `<label>${t(getLanguage(), ['Dimensão máxima (px)', 'Maximum dimension (px)'])}<input type="number" min="64" max="8192" placeholder="1200" value="${options.maxDimension ?? ''}" data-option="maxDimension"></label>`}`}
      ${category === 'pdf' ? `<label>${t(getLanguage(), ['Texto da marca de água', 'Watermark text'])} <input type="text" maxlength="100" placeholder="Versa" value="${escape(options.watermark ?? '')}" data-option="watermark"></label>` : ''}
      </details>`
    control.hidden = !category
    control.innerHTML = `${icon('arrow', 14)} ${local('back')}`
    tag.hidden = Boolean(category)
    clear.hidden = Boolean(category) || !files.length
    clear.innerHTML = `${icon('close', 14)} ${local('close')}`
    status.textContent = issue ? local(issue) : checking ? local('verifying') : dragging ? local(dragVerified ? 'ready' : 'drop') : files.length ? local('ready') : ''
    message.hidden = !problem && !result || dragging
    if (problem && !dragging) {
      message.innerHTML = `<p>${icon('lock', 18)} ${local(problem)}</p>${(problem === 'password' || problem === 'wrong-password') ? `<form><label>${local('passwordLabel')} <input type="password" required autocomplete="off"></label><button type="submit">${local('unlock')}</button><p role="status"></p></form>` : ''}`
      message.querySelector('form')?.addEventListener('submit', event => {
        event.preventDefault()
        const form = event.currentTarget as HTMLFormElement
        const input = form.querySelector('input')!
        void stage(files, { password: input.value }).then(() => {
          if (problem) message.querySelector('input')?.focus({ preventScroll: true })
        })
      })
    } else if (result) {
      const units = new Intl.NumberFormat(getLanguage(), { style: 'unit', unit: 'kilobyte', maximumFractionDigits: 2 })
      message.innerHTML = `<strong>${escape(result.name)}</strong>
        <p>${local('before')} ${units.format(result.before / 1000)} · ${local('after')} ${units.format(result.blob.size / 1000)}</p>
        <div>${result.native ? `<button class="button button-small" type="button" data-open>${t(getLanguage(), ['Abrir', 'Open'])}</button>
        <button class="quiet" type="button" data-reveal>${t(getLanguage(), ['Mostrar na pasta', 'Show in folder'])}</button>` :
        `<a class="button button-small" href="${result.url}" download="${escape(result.name)}">${icon('down', 16)} ${local('save')}</a>`}
        <button class="quiet" type="button" data-reset>${local('reset')}</button></div>`
      const openResult = (reveal: boolean) => void result?.native?.open(reveal).catch(() => {
        status.textContent = t(getLanguage(), ['Ficheiro indisponível.', 'File unavailable.'])
      })
      message.querySelector('[data-open]')?.addEventListener('click', () => openResult(false))
      message.querySelector('[data-reveal]')?.addEventListener('click', () => openResult(true))
      message.querySelector('[data-reset]')?.addEventListener('click', () => {
        const source = nativeSource
        reset()
        if (root.querySelector('[data-dismiss]')) void dismiss?.()
        else {
          pick.focus()
          void source?.idle().catch(() => {})
        }
      })
    }
    renderSuggestion()
    const previous = active
    active = undefined
    setActive(previous && slices.some(slice => slice.id === previous) ? previous : undefined)
    renderCentre()
  }

  let suggested: Recipe | undefined
  let suggestionKey = ''
  function renderSuggestion() {
    const next = files.length && !category && !checking && !problem && !dragging && percent === undefined && !result ? suggest(kinds) : undefined
    const edit = kinds.length === 1 && kinds[0] === 'pdf' && !nativeSource && !('__TAURI_INTERNALS__' in window)
    if (!next) suggestionKey = ''
    const key = next ? [next.id, files.length, kinds.join(), edit, getLanguage()].join('|') : ''
    suggested = next
    suggestion.hidden = !next
    if (!next || key === suggestionKey) return
    suggestionKey = key
    suggestion.setAttribute('aria-label', local('suggestion'))
    const from = files.length > 1 ? `${files.length} ${local('files')}` : kinds[0].toUpperCase()
    suggestion.innerHTML = `<p class="suggest-label">${local('suggestion')}</p>
      <div><button class="button suggest-run" type="button" data-suggest>${icon('arrow', 18)} ${local('convertNow')} ${from} → ${next.output} <kbd aria-hidden="true">Enter</kbd></button>
      ${edit ? `<button class="quiet" type="button" data-edit>${local('editPdf')}</button>` : ''}</div>`
  }
  const runSuggestion = () => { if (suggested && !suggestion.hidden) void run(suggested) }
  suggestion.addEventListener('click', event => {
    const button = (event.target as Element).closest('button')
    if (button?.hasAttribute('data-suggest')) runSuggestion()
    else if (button?.hasAttribute('data-edit') && files[0]) void handOff(files[0]).then(() => { location.href = '/editor.html#abrir' })
  })

  const clearResult = () => {
    if (result) URL.revokeObjectURL(result.url)
    result = undefined
  }

  async function stage(next: File[], { recipe, password, preflight, inferred }: {
    recipe?: Recipe
    password?: string
    preflight?: Preflight
    inferred?: Category
  } = {}) {
    if (!next.length || percent !== undefined) return
    const generation = ++token
    clearResult()
    files = next
    kinds = []
    problem = undefined
    checking = true
    if (inferred) openCategory(inferred, false)
    else render()
    options = { ...options, password }
    const verdict = preflight ?? await inspectFiles(next, password)
    if (generation !== token) return
    checking = false
    kinds = verdict.kinds
    problem = verdict.problem
    if (category && category !== inferred && !problem && !recipes.some(recipe => recipe.category === category && canRun(recipe) && available(recipe, kinds))) category = undefined
    render()
    if (recipe && !problem && canRun(recipe) && available(recipe, kinds)) await run(recipe)
    else if (!suggestion.hidden) suggestion.querySelector<HTMLElement>('[data-suggest]')?.focus({ preventScroll: true })
  }

  function reset() {
    ++token
    clearResult()
    nativeSource = undefined
    files = []
    kinds = []
    problem = undefined
    options = {}
    checking = false
    category = undefined
    active = undefined
    render()
  }

  function openCategory(id: Category, focus = true) {
    category = id
    active = undefined
    render()
    if (!reduce.matches) graphics.animate([{ transform: 'scale(.88) rotate(-30deg)', opacity: .55 }, { transform: 'scale(1) rotate(0)', opacity: 1 }], { duration: 360, easing: 'cubic-bezier(.19,1,.36,1)' })
    if (focus) buttons.querySelector<HTMLButtonElement>('button:not([aria-disabled])')?.focus({ preventScroll: true })
  }

  async function run(recipe: Recipe) {
    percent = 0
    active = undefined
    render()
    status.textContent = local('progress')
    if (!reduce.matches) {
      const suction = document.createElement('span')
      suction.className = 'suction'
      suction.innerHTML = icon('file', 36)
      wheel.append(suction)
      await suction.animate([{ transform: 'translate(60px,-54px) rotate(-20deg)' }, { transform: 'translate(0,0) scale(.1)', opacity: 0 }], { duration: 420, easing: 'cubic-bezier(.5,0,.85,.3)' }).finished
      suction.remove()
    }
    const native = nativeSource
    try {
      await native?.activity(true)
      const before = files.reduce((sum, file) => sum + file.size, 0)
      const output = await native?.office(recipe, files) ?? await convert(recipe, files, options, value => {
        percent = native ? Math.min(96, value) : value
        renderCentre()
      })
      if (native) { percent = 96; renderCentre() }
      const saved = await native?.save(output)
      percent = 100
      renderCentre()
      await frame()
      result = { ...output, name: saved?.name ?? output.name, before, url: saved ? '' : URL.createObjectURL(output.blob), native: saved }
      if (!reduce.matches) {
        const burst = document.createElement('div')
        burst.className = 'confetti'
        burst.style.color = categoryFor(recipe.category).color
        burst.innerHTML = Array.from({ length: 9 }, (_, index) => `<i style="--turn:${index * 40}deg"></i>`).join('')
        wheel.append(burst)
        setTimeout(() => burst.remove(), 720)
      }
    } catch (error) {
      percent = undefined
      render()
      const description = error instanceof Error ? error.message : ''
      status.textContent = t(getLanguage(), ['Não foi possível preparar o resultado.', 'Could not prepare the result.']) + (description ? ` ${description}` : '')
      return
    } finally {
      void native?.activity(false).catch(() => {})
    }
    percent = undefined
    render()
    status.textContent = local('done')
    if (native) {
      const completed = result
      setTimeout(() => {
        if (result === completed && percent === undefined) void native.idle().catch(() => {})
      }, 3200)
    }
    message.querySelector<HTMLElement>('a, [data-open]')?.focus({ preventScroll: true })
  }

  function choose(id: string) {
    const slice = slices.find(option => option.id === id)
    if (!slice || slice.disabled) return
    if (!slice.recipe) openCategory(slice.category)
    else if (files.length) void run(slice.recipe)
    else chooseFile()
  }
  function hit(target: EventTarget | null) {
    return target instanceof Element ? (target.closest<HTMLElement | SVGElement>('[data-hit], [data-slice]')?.dataset.hit ?? target.closest<HTMLElement>('[data-slice]')?.dataset.slice) : undefined
  }
  function dropTarget(target: EventTarget | null) {
    const initialWheel = !category && target instanceof Node && wheel.contains(target)
    const id = initialWheel ? undefined : hit(target)
    return { initialWheel, slice: slices.find(slice => slice.id === id) }
  }
  function endDrag() {
    if (!dragging) return
    dragging = false
    dragDepth = 0
    dragKinds = []
    dragProblem = undefined
    dragVerified = false
    clearTimeout(nativeHover)
    lastNativeHover = undefined
    overlay.classList.remove('visible')
    root.classList.remove('is-dragging')
    active = undefined
    render()
  }

  settings.addEventListener('click', event => {
    if ((event.target as Element).closest('[data-logo-picker]')) {
      settings.querySelector<HTMLInputElement>('[data-option="logo"]')?.click()
    }
  })
  settings.addEventListener('input', event => {
    const input = event.target as HTMLInputElement
    if (input.dataset.option === 'header') options.header = input.value
    if (input.dataset.option === 'watermark') options.watermark = input.value
  })
  settings.addEventListener('change', event => {
    const input = event.target as HTMLInputElement
    if (input.dataset.option === 'logo') {
      const file = input.files?.[0]
      options.logo = undefined
      const label = settings.querySelector<HTMLElement>('.logo-label')!
      if (!file) { label.textContent = t(getLanguage(), ['Nenhum ficheiro seleccionado', 'No file selected']); return }
      const validation = options
      if (/\.(png|jpe?g|webp)$/i.test(file.name) && file.size <= 8 * 1024 ** 2) {
        void createImageBitmap(file).then(bitmap => {
          bitmap.close()
          if (validation !== options || !label.isConnected || input.files?.[0] !== file) return
          options.logo = file
          label.textContent = file.name
        }, () => { label.textContent = t(getLanguage(), ['Logótipo inválido.', 'Invalid logo.']) })
      } else label.textContent = t(getLanguage(), ['Escolhe um PNG, JPG ou WebP até 8 MB.', 'Choose a PNG, JPG or WebP up to 8 MB.'])
    }
    const value = Number(input.value)
    if (input.dataset.option === 'quality') options.quality = value / 100
    if (input.dataset.option === 'rotation') options.rotation = value as Options['rotation']
    if (input.dataset.option === 'maxDimension') options.maxDimension = input.value ? Math.max(64, Math.min(8192, value)) : undefined
  })
  wheel.addEventListener('pointerover', event => setActive(hit(event.target)))
  wheel.addEventListener('pointerleave', () => setActive(hit(document.activeElement)))
  buttons.addEventListener('focusin', event => setActive(hit(event.target)))
  buttons.addEventListener('focusout', event => {
    if (!buttons.contains(event.relatedTarget as Node)) setActive()
  })
  wheel.addEventListener('click', event => {
    const id = hit(event.target)
    if (id) choose(id)
  })
  pick.addEventListener('click', chooseFile)
  centre.addEventListener('click', chooseFile)
  root.querySelector('[data-dismiss]')?.addEventListener('click', () => void dismiss?.())
  root.querySelector('[data-example]')!.addEventListener('click', () => void stage([samplePdf()]))
  control.addEventListener('click', () => {
    const previous = category
    category = undefined
    active = undefined
    render()
    buttons.querySelector<HTMLButtonElement>(`[data-slice="${previous}"]`)?.focus({ preventScroll: true })
  })
  clear.addEventListener('click', () => {
    reset()
    pick.focus()
  })
  fileInput.addEventListener('change', () => {
    void stage([...fileInput.files ?? []])
    fileInput.value = ''
  })
  window.addEventListener('keydown', event => {
    if (event.key === 'Enter' && !event.defaultPrevented && !event.isComposing && !event.ctrlKey && !event.metaKey && !event.altKey && !suggestion.hidden &&
      !(event.target as Element | null)?.closest?.('button, a, input, select, textarea, summary, [contenteditable]')) {
      event.preventDefault()
      runSuggestion()
      return
    }
    if (event.key !== 'Escape') return
    if (dragging) endDrag()
    else if (category) control.click()
    else if (percent === undefined) void dismiss?.()
  })
  window.addEventListener('dragenter', event => {
    if (!fileDrag(event)) return
    event.preventDefault()
    if (percent !== undefined) return
    ++dragDepth
    if (dragging) return
    dragging = true
    const hinted = [...(event.dataTransfer?.items ?? [])].map(item => {
      const file = item.getAsFile()
      return file ? kindFromFile(file) : kindFromMime(item.type)
    })
    dragKinds = hinted.every((kind): kind is Kind => Boolean(kind)) ? hinted : []
    overlay.classList.add('visible')
    root.classList.add('is-dragging')
    const bounds = wheel.getBoundingClientRect()
    if (bounds.top < 0 || bounds.bottom > innerHeight) root.scrollIntoView({ block: 'center' })
    render()
  })
  window.addEventListener('dragover', event => {
    if (!fileDrag(event)) return
    event.preventDefault()
    if (event.dataTransfer) event.dataTransfer.dropEffect = 'copy'
    setActive(hit(event.target))
  })
  window.addEventListener('dragleave', event => {
    if (fileDrag(event) && --dragDepth <= 0) endDrag()
  })
  window.addEventListener('drop', event => {
    if (!fileDrag(event)) return
    event.preventDefault()
    const next = [...event.dataTransfer?.files ?? []]
    const { initialWheel, slice: target } = dropTarget(event.target)
    endDrag()
    if (!next.length || percent !== undefined) return
    if (target && !target.disabled) openCategory(target.category, false)
    nativeSource = undefined
    void stage(next, {
      recipe: target?.disabled ? undefined : target?.recipe,
      inferred: initialWheel ? categoryForDrop(next) : undefined,
    })
  })
  function nativeTarget(x: number, y: number) {
    return slices.find(slice => slice.id === hit(document.elementFromPoint(x, y)))
  }

  function nativeOver(x: number, y: number) {
    if (!dragging) return
    const target = nativeTarget(x, y)
    setActive(target?.id)
    if (target?.id === lastNativeHover) return
    lastNativeHover = target?.id
    clearTimeout(nativeHover)
    if (target && !target.recipe && !target.disabled) {
      nativeHover = setTimeout(() => {
        if (dragging && lastNativeHover === target.id && !dragProblem) {
          openCategory(target.category, false)
          setActive(nativeTarget(x, y)?.id)
        }
      }, 430)
    }
  }

  render()
  return {
    render, openCategory, reset,
    nativeOver,
    nativeDropTarget: (x: number, y: number) => dropTarget(document.elementFromPoint(x, y)),
    nativeLeave: endDrag,
    nativeEnter(hints: Kind[], x: number, y: number, issue?: Problem) {
      if (percent !== undefined) return
      dragging = true
      dragKinds = hints
      dragProblem = issue
      dragVerified = false
      root.classList.add('is-dragging')
      render()
      nativeOver(x, y)
    },
    nativeInspect(verdict: Preflight) {
      if (!dragging) return
      dragKinds = verdict.kinds
      dragProblem = verdict.problem
      dragVerified = !verdict.problem
      render()
    },
    nativeReading() {
      endDrag()
      if (percent !== undefined) return
      problem = undefined
      clearResult()
      checking = true
      render()
    },
    async stageNative(next: File[], source: NativeSource, verdict: Preflight, drop?: ReturnType<typeof dropTarget>) {
      if (percent !== undefined) return
      nativeSource = source
      const target = drop?.slice
      if (target && !target.disabled) openCategory(target.category, false)
      const recipe = target?.recipe ?? (target ? recipes.find(recipe => recipe.category === target.category && canRun(recipe) && available(recipe, verdict.kinds)) : undefined)
      await stage(next, {
        recipe: target?.disabled ? undefined : recipe,
        preflight: verdict,
        inferred: drop?.initialWheel ? categoryForDrop(next) : undefined,
      })
    },
    lock(reason: Problem) {
      endDrag()
      if (percent !== undefined) return
      reset()
      problem = reason
      render()
    },
    setPicker(handler: () => Promise<void>) { nativePicker = handler },
    setDismiss(handler: () => Promise<void>) { dismiss = handler },
    report(description: string) { status.textContent = description },
  }
}
