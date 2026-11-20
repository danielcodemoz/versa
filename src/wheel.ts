import { available, categories, categoryFor, kindFromName, recipes, t, type Category, type Kind, type Language, type Recipe } from './catalog'
import { copy } from './copy'
import { icon } from './icons'
import { inspectFiles, type Problem } from './preflight'
import { canRun, convert, type ConversionResult } from './conversion'
import { samplePdf } from './sample'

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
  const control = root.querySelector<HTMLButtonElement>('[data-back]')!
  const overlay = document.querySelector<HTMLElement>('.drag-shade')!
  const reduce = matchMedia('(prefers-reduced-motion: reduce)')
  let category: Category | undefined
  let slices: Slice[] = []
  let active: string | undefined
  let files: File[] = []
  let kinds: Kind[] = []
  let problem: Problem | undefined
  let checking = false
  let dragDepth = 0
  let dragKinds: Kind[] = []
  let dragging = false
  let percent: number | undefined
  let token = 0
  let result: (ConversionResult & { url: string; before: number }) | undefined

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
    } else if (checking || problem || dragging && !current) {
      centre.innerHTML = `${icon(problem ? 'lock' : 'file', 28)}<strong>${local(checking ? 'verifying' : problem ? 'locked' : 'drop')}</strong>`
    } else if (current) {
      const label = action && !current.disabled ? `${[...new Set(action.inputs.map(kind => kind.toUpperCase()))].length === 1 ? action.inputs[0].toUpperCase() : t(getLanguage(), categoryFor(current.category).name)} → ${action.output}` : current.name
      const destination = action ? ({ PDF: 'pdf', DOCX: 'docs', JPG: 'image', PNG: 'image', AVIF: 'image', WEBP: 'image' }[action.output] ?? 'file') : current.category
      centre.innerHTML = `${icon(current.disabled ? 'lock' : destination, 26)}<strong>${escape(current.name)}</strong><small>${escape(current.disabled ? local('locked') : label)}</small>`
    } else if (result) {
      centre.innerHTML = `${icon('check', 29)}<strong>${result.demo ? local('done') : t(getLanguage(), ['Concluído', 'Done'])}</strong>`
    } else {
      centre.innerHTML = `${icon('file', 31)}<strong>${escape(fileLabel ?? local('wheelHint'))}</strong><small>${local(category ? 'chooseAction' : files.length ? 'select' : 'pick')}</small>`
    }
  }

  function render() {
    const detected = dragging ? dragKinds : kinds
    const locked = Boolean(problem || checking || percent !== undefined)
    const disabledReason = (candidates: Recipe[]) => problem ? local(problem) : checking ? local('verifying')
      : candidates.some(candidate => canRun(candidate) && available(candidate, detected)) ? undefined
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
    control.hidden = !category && !files.length
    control.innerHTML = `${icon(category ? 'arrow' : 'close', 14)} ${local(category ? 'back' : 'close')}`
    control.classList.toggle('is-back', Boolean(category))
    status.textContent = problem ? local(problem) : checking ? local('verifying') : dragging ? local('drop') : files.length ? local('ready') : ''
    message.hidden = !problem && !result
    if (problem) {
      message.innerHTML = `<p>${icon('lock', 18)} ${local(problem)}</p>${problem === 'password' ? `<form><label>${local('passwordLabel')} <input type="password" required autocomplete="off"></label><button type="submit">${local('unlock')}</button><p role="status"></p></form>` : ''}`
      message.querySelector('form')?.addEventListener('submit', event => {
        event.preventDefault()
        const form = event.currentTarget as HTMLFormElement
        form.reset()
        form.querySelector('p')!.textContent = local('passwordDemo')
      })
    } else if (result) {
      const units = new Intl.NumberFormat(getLanguage(), { style: 'unit', unit: 'kilobyte', maximumFractionDigits: 2 })
      message.innerHTML = `<strong>${result.demo ? local('done') : escape(result.name)}</strong>
        <p>${local('before')} ${units.format(result.before / 1000)} · ${local('after')} ${units.format(result.blob.size / 1000)}</p>
        ${result.demo ? `<p>${local('resultInfo')}</p>` : ''}
        <div><a class="button button-small" href="${result.url}" download="${escape(result.name)}">${icon('down', 16)} ${result.demo ? local('save') : t(getLanguage(), ['Descarregar', 'Download'])}</a>
        <button class="quiet" type="button" data-reset>${local('reset')}</button></div>`
      message.querySelector('[data-reset]')?.addEventListener('click', () => {
        reset()
        pick.focus()
      })
    }
    const previous = active
    active = undefined
    setActive(previous && slices.some(slice => slice.id === previous) ? previous : undefined)
    renderCentre()
  }

  const clearResult = () => {
    if (result) URL.revokeObjectURL(result.url)
    result = undefined
  }

  async function stage(next: File[], recipe?: Recipe) {
    if (!next.length || percent !== undefined) return
    const generation = ++token
    clearResult()
    files = next
    kinds = []
    problem = undefined
    checking = true
    render()
    const verdict = await inspectFiles(next)
    if (generation !== token) return
    checking = false
    kinds = verdict.kinds
    problem = verdict.problem
    if (category && !problem && !recipes.some(recipe => recipe.category === category && canRun(recipe) && available(recipe, kinds))) category = undefined
    render()
    if (recipe && !problem && canRun(recipe) && available(recipe, kinds)) await run(recipe)
  }

  function reset() {
    ++token
    clearResult()
    files = []
    kinds = []
    problem = undefined
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
    if (focus) buttons.querySelector<HTMLButtonElement>('button:not([aria-disabled])')?.focus()
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
    try {
      const before = files.reduce((sum, file) => sum + file.size, 0)
      const output = await convert(recipe, files, getLanguage(), value => {
        percent = value
        renderCentre()
      })
      percent = 100
      renderCentre()
      await frame()
      if (output.demo && !reduce.matches) await new Promise(resolve => setTimeout(resolve, 440))
      result = { ...output, before, url: URL.createObjectURL(output.blob) }
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
    }
    percent = undefined
    render()
    status.textContent = result?.demo ? local('done') : t(getLanguage(), ['Conversão concluída', 'Conversion complete'])
    message.querySelector('a')?.focus({ preventScroll: true })
  }

  function choose(id: string) {
    const slice = slices.find(option => option.id === id)
    if (!slice || slice.disabled) return
    if (!slice.recipe) openCategory(slice.category)
    else if (files.length) void run(slice.recipe)
    else fileInput.click()
  }
  function hit(target: EventTarget | null) {
    return target instanceof Element ? (target.closest<HTMLElement | SVGElement>('[data-hit], [data-slice]')?.dataset.hit ?? target.closest<HTMLElement>('[data-slice]')?.dataset.slice) : undefined
  }
  function endDrag() {
    if (!dragging) return
    dragging = false
    dragDepth = 0
    dragKinds = []
    overlay.classList.remove('visible')
    root.classList.remove('is-dragging')
    active = undefined
    render()
  }

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
  pick.addEventListener('click', () => fileInput.click())
  centre.addEventListener('click', () => fileInput.click())
  root.querySelector('[data-example]')!.addEventListener('click', () => void stage([samplePdf()]))
  control.addEventListener('click', () => {
    if (category) {
      const previous = category
      category = undefined
      active = undefined
      render()
      buttons.querySelector<HTMLButtonElement>(`[data-slice="${previous}"]`)?.focus()
    } else {
      reset()
      pick.focus()
    }
  })
  fileInput.addEventListener('change', () => {
    void stage([...fileInput.files ?? []])
    fileInput.value = ''
  })
  window.addEventListener('keydown', event => {
    if (event.key !== 'Escape') return
    if (dragging) endDrag()
    else if (category) control.click()
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
      return file ? kindFromName(file.name) : ({ 'application/pdf': 'pdf', 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'image/avif': 'avif', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'docx', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': 'xlsx', 'application/vnd.openxmlformats-officedocument.presentationml.presentation': 'pptx' } as Record<string, Kind>)[item.type]
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
    const target = slices.find(slice => slice.id === hit(event.target) && !slice.disabled)
    endDrag()
    if (!next.length || percent !== undefined) return
    if (target) openCategory(target.category, false)
    void stage(next, target?.recipe)
  })
  render()
  return { render, openCategory }
}
