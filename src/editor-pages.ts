import type { Meta, Sheet } from './editor-model'

type Entry = { sheet: Sheet; meta: Meta }
type Paint = (entry: Entry) => Promise<Blob | null>
type Labels = { page: string; select: string }

export function makeThumbnails(list: HTMLElement, paint: Paint) {
  const urls = new Map<string, string>()
  const images = new Map<HTMLElement, Entry>()
  const visible = new Set<HTMLElement>()
  let queue = Promise.resolve()
  let session = 0
  const keyOf = ({ sheet }: Entry) => `${sheet.src}:${sheet.turn}`
  const observer = new IntersectionObserver(entries => {
    for (const { target, isIntersecting } of entries) {
      const element = target as HTMLElement
      if (isIntersecting) {
        visible.add(element)
        const mine = session
        queue = queue.then(async () => {
          const entry = images.get(element)
          if (mine !== session || !entry || !visible.has(element)) return
          const key = keyOf(entry)
          let url = urls.get(key)
          if (!url) {
            const blob = await paint(entry)
            if (!blob || mine !== session) return
            url = URL.createObjectURL(blob)
            urls.set(key, url)
          }
          if (images.has(element)) showImage(element, url)
          observer.unobserve(element)
          images.delete(element)
          visible.delete(element)
        }).catch(() => {})
      } else visible.delete(element)
    }
  }, { rootMargin: '100px 72px' })

  function showImage(button: HTMLElement, url: string) {
    if (button.querySelector('img')) return
    const img = document.createElement('img')
    img.src = url
    img.alt = ''
    img.draggable = false
    button.prepend(img)
  }

  function render(entries: Entry[], current: number, selected: Set<number>, grid: boolean, labels: Labels) {
    const focus = (document.activeElement as HTMLElement | null)?.closest<HTMLElement>('[data-sheet-id]')
    const focusId = focus?.dataset.sheetId
    const focusMark = document.activeElement instanceof HTMLInputElement
    observer.disconnect()
    images.clear()
    visible.clear()
    list.replaceChildren(...entries.map((entry, index) => {
      const { sheet, meta } = entry
      const item = document.createElement('li')
      item.draggable = true
      item.dataset.index = String(index)
      item.dataset.sheetId = String(sheet.id)
      item.classList.toggle('is-current', index === current)
      item.classList.toggle('is-marked', selected.has(sheet.id))
      const button = document.createElement('button')
      button.type = 'button'
      button.dataset.thumb = String(index)
      button.setAttribute('aria-label', `${labels.page} ${index + 1}`)
      if (grid) button.setAttribute('aria-pressed', String(selected.has(sheet.id)))
      else if (index === current) button.setAttribute('aria-current', 'page')
      button.style.aspectRatio = sheet.turn % 180 ? `${meta.h} / ${meta.w}` : `${meta.w} / ${meta.h}`
      const url = urls.get(keyOf(entry))
      if (url) showImage(button, url)
      else if (meta.source !== undefined) images.set(button, entry)
      const number = document.createElement('span')
      number.textContent = String(index + 1)
      button.append(number)
      const mark = document.createElement('input')
      mark.type = 'checkbox'
      mark.dataset.extract = String(sheet.id)
      mark.checked = selected.has(sheet.id)
      mark.setAttribute('aria-label', `${labels.select} · ${labels.page} ${index + 1}`)
      item.append(button, mark)
      if (grid) {
        const handle = document.createElement('span')
        handle.dataset.touchReorder = ''
        handle.setAttribute('aria-hidden', 'true')
        item.append(handle)
      }
      return item
    }))
    for (const button of images.keys()) observer.observe(button)
    if (focusId) list.querySelector<HTMLElement>(`[data-sheet-id="${focusId}"] ${focusMark ? 'input' : 'button'}`)?.focus({ preventScroll: true })
  }

  return {
    render,
    reset() {
      session++
      observer.disconnect()
      images.clear()
      visible.clear()
      urls.forEach(url => URL.revokeObjectURL(url))
      urls.clear()
      queue = Promise.resolve()
    },
  }
}

export function moveSelection<T>(ordered: T[], picked: (item: T) => boolean, at: number) {
  const before = ordered.slice(0, at).filter(item => !picked(item)).length
  const rest = ordered.filter(item => !picked(item))
  rest.splice(before, 0, ...ordered.filter(picked))
  return rest
}

export function wirePageDrag(list: HTMLElement, isGrid: () => boolean, marks: Set<number>, move: (ids: Set<number>, slot: number) => void) {
  let picked: Set<number> | undefined
  let from = 0
  const itemFor = (target: EventTarget | null) => target instanceof Element ? target.closest<HTMLElement>('[data-sheet-id]') : null
  const indexOf = (item: HTMLElement) => Number(item.dataset.index)
  const idOf = (item: HTMLElement) => Number(item.dataset.sheetId)
  const dropAfter = (x: number, target: HTMLElement) => {
    if (!isGrid()) return indexOf(target) > from
    const box = target.getBoundingClientRect()
    return x > box.left + box.width / 2
  }
  function start(item: HTMLElement) {
    const id = idOf(item)
    picked = isGrid() && marks.has(id) ? new Set(marks) : new Set([id])
    from = indexOf(item)
    for (const entry of list.children) if (picked.has(idOf(entry as HTMLElement))) entry.classList.add('is-dragged')
  }
  function valid(target: HTMLElement | null): target is HTMLElement {
    return Boolean(target && list.contains(target) && !picked?.has(idOf(target)))
  }
  function highlight(target: HTMLElement | null, x: number) {
    list.querySelectorAll('.drop-before,.drop-after').forEach(element => element.classList.remove('drop-before', 'drop-after'))
    if (valid(target)) target.classList.add(dropAfter(x, target) ? 'drop-after' : 'drop-before')
  }
  function finish(target: HTMLElement | null = null, x = 0) {
    const ids = picked
    const slot = valid(target) ? indexOf(target) + Number(dropAfter(x, target)) : undefined
    picked = undefined
    list.querySelectorAll('.is-dragged,.drop-before,.drop-after').forEach(element => element.classList.remove('is-dragged', 'drop-before', 'drop-after'))
    if (ids && slot !== undefined) move(ids, slot)
  }

  list.addEventListener('dragstart', event => {
    const item = itemFor(event.target)
    if (!item || !event.dataTransfer) return
    if (event.target instanceof HTMLInputElement) { event.preventDefault(); return }
    start(item)
    event.dataTransfer.effectAllowed = 'move'
    event.dataTransfer.setData('application/x-versa-page', String(idOf(item)))
  })
  list.addEventListener('dragover', event => {
    if (!picked) return
    event.preventDefault()
    highlight(itemFor(event.target), event.clientX)
  })
  list.addEventListener('drop', event => {
    if (!picked) return
    event.preventDefault()
    event.stopPropagation()
    finish(itemFor(event.target), event.clientX)
  })
  list.addEventListener('dragend', () => finish())

  let finger: number | undefined
  list.addEventListener('pointerdown', event => {
    if (event.pointerType === 'mouse' || !event.isPrimary || !(event.target instanceof HTMLElement) || !event.target.matches('[data-touch-reorder]')) return
    const item = itemFor(event.target)
    if (!item) return
    list.setPointerCapture(event.pointerId)
    finger = event.pointerId
    start(item)
  })
  list.addEventListener('pointermove', event => {
    if (finger === event.pointerId) highlight(itemFor(document.elementFromPoint(event.clientX, event.clientY)), event.clientX)
  })
  list.addEventListener('pointerup', event => {
    if (finger !== event.pointerId) return
    finger = undefined
    finish(itemFor(document.elementFromPoint(event.clientX, event.clientY)), event.clientX)
  })
  list.addEventListener('lostpointercapture', event => {
    if (finger !== event.pointerId) return
    finger = undefined
    finish()
  })
}
