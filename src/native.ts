import { invoke, isTauri } from '@tauri-apps/api/core'
import { listen } from '@tauri-apps/api/event'
import { kindFromName, t, type Language, type Recipe } from '../packages/engine/catalog'
import type { ConversionResult } from '../packages/engine'
import { inspectFiles, type Preflight, type Problem } from '../packages/engine/preflight'
import type { mountWheel } from './wheel'
import { mountTitlebar } from './native-window'

type Wheel = ReturnType<typeof mountWheel>
interface Entry { name: string; size: number }
interface Offer { id: number | null; entries: Entry[]; x: number; y: number; problem: Problem | null }
interface History { id: number; name: string }

const viewport = (x: number, y: number): [number, number] => [x / devicePixelRatio, y / devicePixelRatio]
function packet(header: string, bytes: ArrayBuffer | Uint8Array) {
  const prefix = new TextEncoder().encode(header + '\n')
  const source = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes)
  const payload = new Uint8Array(prefix.length + source.length)
  payload.set(prefix)
  payload.set(source, prefix.length)
  return payload
}

async function nativeOffice(recipe: Recipe, files: File[]): Promise<ConversionResult | undefined> {
  if (!['word-pdf', 'excel-pdf', 'slides-pdf'].includes(recipe.id)) return undefined
  try {
    const { openOffice, sanitiseOffice } = await import('../packages/engine/ooxml')
    const parts = await openOffice(files[0])
    const linked = /(?:externalLinks\/|connections\.xml|queryTables\/|vbaProject\.bin)/i
    if (Object.keys(parts).some(name => linked.test(name))) return undefined
    const wordFields = /\b(?:INCLUDETEXT|INCLUDEPICTURE|LINK|DDE(?:AUTO)?)\b/i
    const excelFunctions = /\b(?:WEBSERVICE|HYPERLINK|IMAGE|RTD|STOCKHISTORY|DDE|CALL)\s*\(/i
    const decoder = new TextDecoder()
    if (Object.entries(parts).some(([name, contents]) => {
      if (/^word\/(?:document|header\d+|footer\d+)\.xml$/i.test(name)) {
        const text = decoder.decode(contents)
        return wordFields.test([...text.matchAll(/<(?:[\w-]+:)?instrText\b[^>]*>(.*?)<\//gs)].map(match => match[1]).join('')) ||
          /(?:instr|fieldCode)=["'][^"']*(?:INCLUDETEXT|INCLUDEPICTURE|DDE(?:AUTO)?)\b/i.test(text)
      }
      return /^xl\/worksheets\/[^/]+\.xml$/i.test(name) && (excelFunctions.test(decoder.decode(contents)) || /\[[^\]]+\][^<]*!/.test(decoder.decode(contents)))
    })) return undefined
    const bytes = sanitiseOffice(parts)
    const output = await invoke<ArrayBuffer>('office_pdf', packet(recipe.id, bytes))
    if (output.byteLength === 0) return undefined
    return { name: files[0].name.replace(/\.[^.]+$/, '.pdf'), blob: new Blob([output], { type: 'application/pdf' }) }
  } catch {
    return undefined
  }
}

export async function mountNative(wheel: Wheel, language: () => Language, overlay: boolean) {
  if (!isTauri()) return
  document.documentElement.classList.add('native-app')
  if (!overlay) mountTitlebar(language)
  // The native drop target owns Explorer files. Keep any drop delivered to the
  // webview from navigating away from the desktop UI.
  window.addEventListener('dragover', event => event.preventDefault(), true)
  window.addEventListener('drop', event => event.preventDefault(), true)
  const shell = document.querySelector<HTMLElement>('.native-settings')!
  let history: History[] = []
  let startup = false
  let folder: string | null = null
  let sound = localStorage.getItem('versa-sound') === 'on'
  let audio: AudioContext | undefined
  let current: { id: number; signature: string; pending: Promise<{ files: File[]; verdict: Preflight }> } | undefined
  let readVersion = 0

  const save = (id: number) => ({
    office: nativeOffice,
    activity: (active: boolean) => invoke<void>('conversion_activity', { active }),
    idle: () => invoke<void>('idle'),
    async save(output: ConversionResult) {
      const extension = output.name.split('.').at(-1)
      const header = JSON.stringify({ id, extension, english: language() === 'en' })
      const row = await invoke<History>('save_result', packet(header, await output.blob.arrayBuffer()))
      if (sound) {
        try {
          audio ??= new AudioContext()
          const note = audio.createOscillator()
          const gain = audio.createGain()
          gain.gain.value = .025
          note.frequency.value = 523
          note.connect(gain).connect(audio.destination)
          note.start()
          note.stop(audio.currentTime + .12)
        } catch { /* Audio is optional. */ }
      }
      return { ...row, open: (reveal: boolean) => invoke<void>('open_result', { id: row.id, reveal }) }
    },
  })

  async function read(offer: Offer) {
    const files: File[] = []
    let total = 0
    for (const [index, entry] of offer.entries.entries()) {
      const bytes = await invoke<ArrayBuffer>('read_file', { id: offer.id, index })
      total += bytes.byteLength
      if (total > 192 * 1024 ** 2) return { files, verdict: { kinds: [], problem: 'large' } as Preflight }
      files.push(new File([bytes], entry.name))
    }
    return { files, verdict: await inspectFiles(files) }
  }

  async function use(offer: Offer, drop: boolean) {
    const version = ++readVersion
    const target = drop ? wheel.nativeTarget(...viewport(offer.x, offer.y)) : undefined
    const hovered = current
    current = undefined
    if (offer.problem || offer.id === null) {
      wheel.lock(offer.problem ?? 'damaged')
      return
    }
    const signature = JSON.stringify(offer.entries)
    const pending = drop && hovered?.id === offer.id && hovered.signature === signature ? hovered.pending : read(offer)
    wheel.nativeReading()
    try {
      const { files, verdict } = await pending
      if (version !== readVersion) return
      if (verdict.problem && files.length !== offer.entries.length) wheel.lock(verdict.problem)
      else await wheel.stageNative(files, save(offer.id), verdict, target)
    } catch {
      if (version === readVersion) wheel.lock('damaged')
    }
  }

  wheel.setPicker(async () => {
    try {
      const offer = await invoke<Offer | null>('pick')
      if (offer) await use(offer, false)
    } catch { wheel.lock('damaged') }
  })
  wheel.setDismiss(() => invoke('hide'))
  const events = { target: { kind: 'Window' as const, label: overlay ? 'gesture' : 'main' } }
  await Promise.all([
    listen<Offer>('versa-drag-enter', event => {
      const offer = event.payload
      const kinds = offer.entries.map(entry => kindFromName(entry.name))
      wheel.nativeEnter(kinds.every(kind => kind !== undefined) ? kinds : [], ...viewport(offer.x, offer.y), offer.problem ?? (kinds.includes(undefined) ? 'type' : undefined))
      if (offer.id === null || offer.problem || kinds.includes(undefined)) return
      const pending = read(offer)
      current = { id: offer.id, signature: JSON.stringify(offer.entries), pending }
      void pending.then(({ verdict }) => {
        if (current?.pending === pending) wheel.nativeInspect(verdict)
      }, () => {
        if (current?.pending === pending) wheel.nativeInspect({ kinds: [], problem: 'damaged' })
      })
    }, events),
    listen<[number, number]>('versa-drag-over', event => wheel.nativeOver(...viewport(...event.payload)), events),
    listen<Offer>('versa-drag-drop', event => void use(event.payload, true), events),
    listen('versa-drag-leave', () => { current = undefined; wheel.nativeLeave() }, events),
    listen('versa-wake', () => wheel.reset(), events),
  ])
  const text = (pt: string, en: string) => t(language(), [pt, en])
  const paint = () => {
    if (overlay) return
    const selected = shell.querySelector('details')?.open
    shell.innerHTML = `
      <details ${selected ? 'open' : ''}>
        <summary>${text('Definições', 'Settings')}</summary>
        <label><input type="checkbox" data-startup ${startup ? 'checked' : ''}> ${text('Iniciar com Windows', 'Start with Windows')}</label>
        <label><input type="checkbox" data-sound ${sound ? 'checked' : ''}> ${text('Som ao concluir', 'Completion sound')}</label>
        <p><span data-folder></span> <button class="quiet" type="button" data-choose-folder>${text('Mudar pasta', 'Change folder')}</button>
        ${folder ? `<button class="quiet" type="button" data-reset-folder>${text('Usar pasta do original', 'Use the source folder')}</button>` : ''}</p>
      </details>
      <h2>${text('Últimas conversões', 'Recent conversions')}</h2>
      <ul></ul>`
    shell.querySelector('[data-folder]')!.textContent = folder ?? text('Ao lado do original', 'Beside the original')
    const list = shell.querySelector('ul')!
    for (const entry of history) {
      const item = document.createElement('li')
      const name = document.createElement('button')
      name.type = 'button'
      name.className = 'quiet'
      name.textContent = entry.name
      name.addEventListener('click', () => void open(entry.id, false))
      const reveal = document.createElement('button')
      reveal.type = 'button'
      reveal.className = 'quiet'
      reveal.textContent = text('Mostrar na pasta', 'Show in folder')
      reveal.addEventListener('click', () => void open(entry.id, true))
      item.append(name, reveal)
      list.append(item)
    }
    shell.hidden = false
  }
  async function open(id: number, reveal: boolean) {
    try { await invoke('open_result', { id, reveal }) }
    catch { wheel.report(text('Ficheiro indisponível.', 'File unavailable.')) }
  }
  async function refresh() {
    try {
      [history, startup, folder] = await Promise.all([invoke<History[]>('history'), invoke<boolean>('startup'), invoke<string | null>('output_folder')])
      paint()
    } catch { wheel.report(text('Definições indisponíveis.', 'Settings unavailable.')) }
  }
  function syncAppearance() {
    document.documentElement.dataset.theme = localStorage.getItem('versa-theme') ?? document.documentElement.dataset.theme
    const next = localStorage.getItem('versa-language') === 'en' ? 'en' : 'pt'
    if (next !== language()) window.location.reload()
  }

  shell.addEventListener('click', event => {
    const control = (event.target as Element).closest<HTMLButtonElement>('button')
    if (!control || !('chooseFolder' in control.dataset || 'resetFolder' in control.dataset)) return
    void invoke<string | null>('output_folder', { change: 'chooseFolder' in control.dataset }).then(value => {
      folder = value
      paint()
    }, () => wheel.report(text('Pasta indisponível.', 'Folder unavailable.')))
  })
  shell.addEventListener('change', event => {
    const input = event.target as HTMLInputElement
    if ('startup' in input.dataset) {
      void invoke<boolean>('startup', { enabled: input.checked }).then(value => { startup = value }, () => {
        input.checked = startup
        wheel.report(text('Não foi possível mudar o arranque.', 'Could not change startup.'))
      })
    } else if ('sound' in input.dataset) {
      sound = input.checked
      localStorage.setItem('versa-sound', sound ? 'on' : 'off')
      if (sound) {
        audio ??= new AudioContext()
        void audio.resume().catch(() => {})
      }
    }
  })
  window.addEventListener('storage', event => {
    if (event.key === 'versa-language' || event.key === 'versa-theme') syncAppearance()
    if (event.key === 'versa-sound') sound = event.newValue === 'on'
  })
  if (!overlay) {
    await listen('versa-history', () => void refresh(), events)
    await refresh()
    new MutationObserver(paint).observe(document.documentElement, { attributes: true, attributeFilter: ['lang'] })
  }
}
