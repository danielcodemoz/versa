import { degrees, PDFDocument } from 'pdf-lib'
import { pdfOutput, unlockedPdf } from './pdf'
import { canvasBlob, localName, type Context } from './types'

export async function watermarkPdf({ files: [file], options, progress }: Context) {
  const source = await unlockedPdf(file, options.password)
  const output = await PDFDocument.load(await source.arrayBuffer(), { updateMetadata: false })
  const text = options.watermark?.trim() || 'Versa'
  const canvas = document.createElement('canvas')
  const ctx = canvas.getContext('2d')!
  const font = 'bold 96px sans-serif'
  ctx.font = font
  canvas.width = Math.min(2048, Math.ceil(ctx.measureText(text).width) + 16)
  canvas.height = 128
  let watermark
  try {
    ctx.font = font
    ctx.textBaseline = 'middle'
    ctx.fillStyle = '#263238'
    ctx.fillText(text, 8, 64, canvas.width - 16)
    watermark = await output.embedPng(await (await canvasBlob(canvas, 'image/png')).arrayBuffer())
  } finally {
    canvas.width = canvas.height = 0
  }
  const pages = output.getPages()
  for (const [index, page] of pages.entries()) {
    const crop = page.getCropBox()
    const rotation = page.getRotation().angle
    const rotated = rotation % 180 !== 0
    const visibleWidth = rotated ? crop.height : crop.width
    const visibleHeight = rotated ? crop.width : crop.height
    const rise = Math.atan2(visibleHeight, visibleWidth)
    const angle = rise + rotation * Math.PI / 180
    const aspect = watermark.width / watermark.height
    const width = Math.min(Math.hypot(crop.width, crop.height) * .66, Math.min(crop.width, crop.height) * .18 * aspect)
    const height = width / aspect
    page.drawImage(watermark, {
      x: crop.x + (crop.width - width * Math.cos(angle) + height * Math.sin(angle)) / 2,
      y: crop.y + (crop.height - width * Math.sin(angle) - height * Math.cos(angle)) / 2,
      width, height,
      rotate: degrees(angle * 180 / Math.PI),
      opacity: .23,
    })
    progress(Math.round((index + 1) / pages.length * 92))
  }
  return pdfOutput(output, localName(file, 'pdf', ' - marca de água (Versa)'))
}
