import type { Language } from '../packages/engine/catalog'

export function requestSignature(parent: HTMLElement, language: Language) {
  const labels = language === 'pt'
    ? { title: 'Desenha a tua assinatura', type: 'Ou escreve o teu nome', pad: 'Área da assinatura', use: 'Usar assinatura', clear: 'Limpar', cancel: 'Cancelar' }
    : { title: 'Draw your signature', type: 'Or type your name', pad: 'Signature area', use: 'Use signature', clear: 'Clear', cancel: 'Cancel' }
  const dialog = document.createElement('dialog')
  dialog.className = 'ed-dialog'
  dialog.setAttribute('aria-labelledby', 'sign-title')
  dialog.innerHTML = `
    <h2 id="sign-title">${labels.title}</h2>
    <canvas class="ed-pad" data-pad width="600" height="220" role="img" aria-label="${labels.pad}"></canvas>
    <label class="ed-type">${labels.type} <input type="text" maxlength="40" data-typed autocomplete="off"></label>
    <div class="ed-dialog-actions"><button class="button button-small" type="button" data-sign-use>${labels.use}</button><button class="quiet" type="button" data-sign-clear>${labels.clear}</button><button class="quiet" type="button" data-sign-cancel>${labels.cancel}</button></div>`
  const canvas = dialog.querySelector('canvas')!
  const field = dialog.querySelector('input')!
  const context = canvas.getContext('2d')!
  const clearCanvas = () => context.clearRect(0, 0, canvas.width, canvas.height)
  let result: HTMLCanvasElement | undefined
  let active: number | undefined
  const at = (event: PointerEvent): [number, number] => {
    const rect = canvas.getBoundingClientRect()
    return [(event.clientX - rect.left) * canvas.width / rect.width, (event.clientY - rect.top) * canvas.height / rect.height]
  }
  canvas.onpointerdown = event => {
    if (!event.isPrimary || event.button !== 0) return
    if (field.value) { field.value = ''; clearCanvas() }
    active = event.pointerId
    canvas.setPointerCapture(active)
    context.strokeStyle = '#14213d'
    context.lineWidth = 3.5
    context.lineCap = 'round'
    context.lineJoin = 'round'
    context.beginPath()
    context.moveTo(...at(event))
  }
  canvas.onpointermove = event => {
    if (event.pointerId !== active) return
    const [x, y] = at(event)
    context.lineTo(x, y)
    context.stroke()
    context.beginPath()
    context.moveTo(x, y)
  }
  canvas.onlostpointercapture = () => { active = undefined }
  field.oninput = async () => {
    clearCanvas()
    const text = field.value
    if (!text.trim()) return
    await document.fonts.load('80px "Caveat Brush"').catch(() => [])
    if (field.value !== text) return
    context.fillStyle = '#14213d'
    context.font = '80px "Caveat Brush", cursive'
    context.textBaseline = 'middle'
    context.fillText(text, 24, canvas.height / 2, canvas.width - 48)
  }
  dialog.querySelector<HTMLButtonElement>('[data-sign-clear]')!.onclick = () => { field.value = ''; clearCanvas() }
  dialog.querySelector<HTMLButtonElement>('[data-sign-cancel]')!.onclick = () => dialog.close()
  dialog.querySelector<HTMLButtonElement>('[data-sign-use]')!.onclick = () => {
    result = trimInk(canvas, context)
    if (result) dialog.close()
  }
  parent.append(dialog)
  dialog.showModal()
  field.focus()
  return new Promise<Blob | null>(resolve => dialog.addEventListener('close', () => {
    dialog.remove()
    if (result) result.toBlob(resolve, 'image/png')
    else resolve(null)
  }, { once: true }))
}

function trimInk(canvas: HTMLCanvasElement, context: CanvasRenderingContext2D) {
  const { width, height } = canvas
  const { data } = context.getImageData(0, 0, width, height)
  let x0 = width, y0 = height, x1 = 0, y1 = 0
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    if (data[(y * width + x) * 4 + 3] > 8) {
      x0 = Math.min(x0, x); y0 = Math.min(y0, y)
      x1 = Math.max(x1, x); y1 = Math.max(y1, y)
    }
  }
  if (x1 <= x0 || y1 <= y0) return undefined
  const crop = document.createElement('canvas')
  crop.width = x1 - x0 + 12
  crop.height = y1 - y0 + 12
  crop.getContext('2d')!.drawImage(canvas, 6 - x0, 6 - y0)
  return crop
}
