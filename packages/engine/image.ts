import { PDFDocument } from 'pdf-lib'
import { bytesBlob, canvasBlob, localName, type Context, type Handler } from './types'
import { pdfOutput } from './pdf'

export async function imageCanvas(file: File, maxDimension = 8192, whiteBackground = false) {
  const bitmap = await createImageBitmap(file)
  try {
    const scale = Math.min(1, maxDimension / Math.max(bitmap.width, bitmap.height), Math.sqrt(30_000_000 / (bitmap.width * bitmap.height)))
    const canvas = document.createElement('canvas')
    canvas.width = Math.max(1, Math.round(bitmap.width * scale))
    canvas.height = Math.max(1, Math.round(bitmap.height * scale))
    const context = canvas.getContext('2d')!
    if (whiteBackground) {
      context.fillStyle = '#fff'
      context.fillRect(0, 0, canvas.width, canvas.height)
    }
    context.drawImage(bitmap, 0, 0, canvas.width, canvas.height)
    return canvas
  } finally {
    bitmap.close()
  }
}

export function encodeImage(extension: 'jpg' | 'png' | 'webp' | 'avif', sizing?: number, quality?: number): Handler {
  return async ({ files: [file], options, progress }) => {
    const canvas = await imageCanvas(file, options.maxDimension ?? sizing, extension === 'jpg')
    progress(45)
    try {
      const adjusted = options.quality ?? quality ?? .88
      if (extension === 'avif') {
        const { encodeAvif } = await import('./avif')
        const pixels = canvas.getContext('2d')!.getImageData(0, 0, canvas.width, canvas.height)
        const encoded = await encodeAvif(pixels, Math.round(adjusted * 100))
        return { blob: bytesBlob(new Uint8Array(encoded), 'image/avif'), name: localName(file, 'avif') }
      }
      const mime = extension === 'jpg' ? 'image/jpeg' : `image/${extension}`
      return { blob: await canvasBlob(canvas, mime, adjusted), name: localName(file, extension, ' (Versa)') }
    } finally {
      canvas.width = canvas.height = 0
    }
  }
}

export async function imagesPdf({ files, progress }: Context) {
  const output = await PDFDocument.create()
  for (const [index, file] of files.entries()) {
    const canvas = await imageCanvas(file, 2100, true)
    try {
      const ratio = canvas.width / canvas.height
      const page = output.addPage(ratio > 1 ? [841.89, 595.28] : [595.28, 841.89])
      const picture = await output.embedJpg(await (await canvasBlob(canvas, 'image/jpeg', .92)).arrayBuffer())
      const scale = Math.min(page.getWidth() / picture.width, page.getHeight() / picture.height)
      const { width, height } = picture.scale(scale)
      page.drawImage(picture, { x: (page.getWidth() - width) / 2, y: (page.getHeight() - height) / 2, width, height })
    } finally {
      canvas.width = canvas.height = 0
    }
    progress(Math.round((index + 1) / files.length * 94))
  }
  return pdfOutput(output, localName(files[0], 'pdf', ' (Versa)'))
}
