import type { Language } from '../packages/engine/catalog'
import type { Bitmap } from './editor-model'

const pngType = 'image/png'
const jpgType = 'image/jpeg'

function bitmap(data: Blob, type: Bitmap['type'], w: number, h: number): Bitmap {
  return { data, type, url: URL.createObjectURL(data), w, h }
}

function toBlob(canvas: HTMLCanvasElement, type: string) {
  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(blob => blob ? resolve(blob) : reject(new Error('Could not encode the image')), type, .92)
  })
}

export async function decodePicture(source: Blob): Promise<Bitmap> {
  const header = new Uint8Array(await source.slice(0, 12).arrayBuffer())
  const png = header[0] === 0x89 && header[1] === 0x50
  const jpg = header[0] === 0xff && header[1] === 0xd8
  const webp = new TextDecoder().decode(header.slice(8, 12)) === 'WEBP'
  if (!png && !jpg && !webp) throw new Error('Unsupported image')
  const decoded = await createImageBitmap(source)
  const type = jpg ? 'jpg' : 'png'
  const mime = jpg ? jpgType : pngType
  try {
    const factor = Math.min(1, 2400 / Math.max(decoded.width, decoded.height))
    if (!webp && factor === 1) return bitmap(new Blob([source], { type: mime }), type, decoded.width, decoded.height)
    const canvas = document.createElement('canvas')
    canvas.width = Math.max(1, Math.round(decoded.width * factor))
    canvas.height = Math.max(1, Math.round(decoded.height * factor))
    canvas.getContext('2d')!.drawImage(decoded, 0, 0, canvas.width, canvas.height)
    return bitmap(await toBlob(canvas, mime), type, canvas.width, canvas.height)
  } finally { decoded.close() }
}

export type Crop = [left: number, top: number, right: number, bottom: number]

export async function cropPicture(source: Bitmap, [left, top, right, bottom]: Crop) {
  const decoded = await createImageBitmap(source.data)
  try {
    const x = Math.floor(decoded.width * left)
    const y = Math.floor(decoded.height * top)
    const w = Math.max(1, Math.ceil(decoded.width * (1 - right)) - x)
    const h = Math.max(1, Math.ceil(decoded.height * (1 - bottom)) - y)
    const canvas = document.createElement('canvas')
    canvas.width = w
    canvas.height = h
    canvas.getContext('2d')!.drawImage(decoded, x, y, w, h, 0, 0, w, h)
    const mime = source.type === 'jpg' ? jpgType : pngType
    return bitmap(await toBlob(canvas, mime), source.type, w, h)
  } finally { decoded.close() }
}

export function requestCrop(parent: HTMLElement, source: Bitmap, language: Language) {
  const ui = language === 'pt'
    ? { title: 'Recortar imagem', hint: 'Ajusta as quatro margens ou arrasta o contorno na pré-visualização.', edges: ['Esquerda', 'Topo', 'Direita', 'Fundo'], apply: 'Aplicar', cancel: 'Cancelar' }
    : { title: 'Crop image', hint: 'Adjust the four margins or drag the outline in the preview.', edges: ['Left', 'Top', 'Right', 'Bottom'], apply: 'Apply', cancel: 'Cancel' }
  const dialog = document.createElement('dialog')
  dialog.className = 'ed-dialog'
  dialog.dataset.cropDialog = ''
  dialog.setAttribute('aria-labelledby', 'crop-title')
  dialog.innerHTML = `
    <h2 id="crop-title">${ui.title}</h2><p>${ui.hint}</p>
    <form>
      <div class="ed-crop-preview" data-crop-preview><img alt=""><div class="ed-crop-frame" aria-hidden="true"></div></div>
      <div class="ed-crop-edges">
        ${ui.edges.map(label => `<label><span>${label}</span> <input type="range" min="0" max="99" value="0" data-crop-edge><output>0%</output></label>`).join('')}
      </div>
      <div class="ed-dialog-actions"><button class="button button-small" type="submit">${ui.apply}</button><button class="quiet" type="button" data-cancel-dialog>${ui.cancel}</button></div>
    </form>`
  const form = dialog.querySelector('form')!
  const preview = dialog.querySelector<HTMLElement>('[data-crop-preview]')!
  const outline = preview.querySelector<HTMLElement>('.ed-crop-frame')!
  preview.querySelector('img')!.src = source.url
  const edges = [...dialog.querySelectorAll<HTMLInputElement>('[data-crop-edge]')]
  const abort = new AbortController()
  const { signal } = abort
  let crop: Crop | undefined
  const invalidate = () => {
    const margins = edges.map(edge => Number(edge.value))
    for (const [index, edge] of edges.entries()) {
      edge.max = String(99 - margins[(index + 2) % 4])
      edge.parentElement!.querySelector('output')!.value = `${margins[index]}%`
    }
    const [left, top, right, bottom] = margins
    outline.style.inset = `${top}% ${right}% ${bottom}% ${left}%`
  }
  const setMargins = (margins: Crop) => {
    edges.forEach((edge, index) => { edge.max = '99'; edge.value = String(margins[index]) })
    invalidate()
  }
  setMargins([0, 0, 0, 0])
  form.addEventListener('input', invalidate, { signal })
  const point = (event: PointerEvent): [number, number] => {
    const rect = preview.getBoundingClientRect()
    const clamp = (n: number) => Math.round(100 * Math.min(1, Math.max(0, n)))
    return [clamp((event.clientX - rect.left) / rect.width), clamp((event.clientY - rect.top) / rect.height)]
  }
  let drag: { id: number; from: [number, number] } | undefined
  preview.addEventListener('pointerdown', event => {
    if (!event.isPrimary || event.button !== 0) return
    preview.setPointerCapture(event.pointerId)
    drag = { id: event.pointerId, from: point(event) }
  }, { signal })
  preview.addEventListener('pointermove', event => {
    if (drag?.id !== event.pointerId) return
    const [x0, y0] = drag.from
    const [x1, y1] = point(event)
    if (Math.abs(x1 - x0) < 1 || Math.abs(y1 - y0) < 1) return
    setMargins([Math.min(x0, x1), Math.min(y0, y1), 100 - Math.max(x0, x1), 100 - Math.max(y0, y1)])
  }, { signal })
  preview.addEventListener('lostpointercapture', () => { drag = undefined }, { signal })
  form.addEventListener('submit', event => {
    event.preventDefault()
    crop = edges.map(edge => Number(edge.value) / 100) as Crop
    dialog.close()
  }, { signal })
  parent.append(dialog)
  dialog.showModal()
  return new Promise<Crop | undefined>(resolve => dialog.addEventListener('close', () => {
    abort.abort()
    dialog.remove()
    resolve(crop)
  }, { once: true }))
}
