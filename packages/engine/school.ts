import { degrees, PDFDocument, rgb, type PDFPage } from 'pdf-lib'
import { editablePdf, pdfOutput } from './pdf'
import { imageCanvas } from './image'
import { canvasPage, newCanvas } from './office-render'
import { canvasBlob, localName, type Context } from './types'

function dimensions(page: PDFPage) {
  const { width, height } = page.getSize()
  const angle = (page.getRotation().angle % 360 + 360) % 360
  return { width, height, angle, rotatedWidth: angle % 180 ? height : width, rotatedHeight: angle % 180 ? width : height }
}

async function placePage(output: PDFDocument, page: PDFPage, viewport: PDFPage, left: number, bottom: number, areaWidth: number, areaHeight: number) {
  const { width, height, angle, rotatedWidth, rotatedHeight } = dimensions(page)
  const scale = Math.min(areaWidth / rotatedWidth, areaHeight / rotatedHeight)
  const x = left + (areaWidth - rotatedWidth * scale) / 2 + (angle === 180 ? width * scale : angle === 270 ? height * scale : 0)
  const y = bottom + (areaHeight - rotatedHeight * scale) / 2 + (angle === 90 ? width * scale : angle === 180 ? height * scale : 0)
  if (page.node.Contents()) {
    const embedded = await output.embedPage(page)
    viewport.drawPage(embedded, { x, y, width: width * scale, height: height * scale, rotate: degrees(-angle) })
  }
}

export async function schoolHeader({ files: [file], options, progress }: Context) {
  const input = await editablePdf(file, options.password)
  const output = await PDFDocument.create()
  const { canvas, ctx } = newCanvas(1440, 135)
  ctx.fillStyle = '#24322e'
  ctx.font = 'bold 51px sans-serif'
  ctx.textBaseline = 'middle'
  let start = 30
  if (options.logo) {
    const logo = await imageCanvas(options.logo, 512)
    try {
      const scale = 98 / Math.max(logo.width, logo.height)
      ctx.drawImage(logo, 25, (130 - logo.height * scale) / 2, logo.width * scale, logo.height * scale)
      start += 119
    } finally { logo.width = logo.height = 0 }
  }
  ctx.fillText(options.header?.trim() || 'Escola', start, 64, 1375 - start)
  ctx.fillStyle = '#253b35'
  ctx.fillRect(30, 122, 1380, 3)
  const header = await output.embedPng(await (await canvasBlob(canvas, 'image/png')).arrayBuffer())
  canvas.width = canvas.height = 0
  for (const [index, page] of input.getPages().entries()) {
    const { rotatedWidth, rotatedHeight } = dimensions(page)
    const headerHeight = Math.max(38, Math.min(90, rotatedWidth * .115))
    const target = output.addPage([rotatedWidth, rotatedHeight + headerHeight])
    await placePage(output, page, target, 0, 0, rotatedWidth, rotatedHeight)
    target.drawImage(header, { x: 0, y: rotatedHeight + 7, width: rotatedWidth, height: headerHeight - 7 })
    progress(Math.round((index + 1) / input.getPageCount() * 93))
  }
  return pdfOutput(output, localName(file, 'pdf', ' (Versa - escola)'))
}

const a4 = [595.28, 841.89] as [number, number]
export async function schoolA4({ files: [file], options, progress }: Context) {
  const input = await editablePdf(file, options.password)
  const output = await PDFDocument.create()
  for (let index = 0; index < input.getPageCount(); index += 2) {
    const sheet = output.addPage(a4)
    const [width, height] = a4
    const half = height / 2
    await placePage(output, input.getPage(index), sheet, 22, half + 12, width - 44, half - 30)
    if (index + 1 < input.getPageCount()) await placePage(output, input.getPage(index + 1), sheet, 22, 18, width - 44, half - 30)
    sheet.drawLine({ start: { x: 16, y: half }, end: { x: width - 16, y: half }, color: rgb(.66, .66, .66), thickness: .5, dashArray: [4, 4] })
    progress(Math.round(Math.min(index + 2, input.getPageCount()) / input.getPageCount() * 93))
  }
  return pdfOutput(output, localName(file, 'pdf', ' (Versa - 2 por A4)'))
}

type Point = [number, number]
const luminance = (rgba: Uint8ClampedArray, offset: number) => (.2126 * rgba[offset] + .7152 * rgba[offset + 1] + .0722 * rgba[offset + 2])

function findSheet(pixels: Uint8ClampedArray, width: number, height: number): Point[] | undefined {
  const step = Math.max(2, Math.ceil(Math.max(width, height) / 650))
  let borderTotal = 0
  let borderCount = 0
  for (let x = 0; x < width; x += step) {
    borderTotal += luminance(pixels, x * 4) + luminance(pixels, ((height - 1) * width + x) * 4)
    borderCount += 2
  }
  for (let y = 0; y < height; y += step) {
    borderTotal += luminance(pixels, y * width * 4) + luminance(pixels, (y * width + width - 1) * 4)
    borderCount += 2
  }
  const threshold = Math.min(231, Math.max(151, borderTotal / borderCount + 30))
  const scores = [Infinity, Infinity, Infinity, Infinity]
  const points: Point[] = []
  let selected = 0
  let samples = 0
  for (let y = step; y < height - step; y += step) for (let x = step; x < width - step; x += step) {
    samples++
    if (luminance(pixels, (y * width + x) * 4) < threshold ||
        luminance(pixels, ((y + step) * width + x) * 4) < threshold ||
        luminance(pixels, (y * width + x + step) * 4) < threshold) continue
    selected++
    const nx = x / width
    const ny = y / height
    const candidates = [nx + ny, 1 - nx + ny, 2 - nx - ny, 1 + nx - ny]
    candidates.forEach((score, index) => {
      if (score < scores[index]) { scores[index] = score; points[index] = [x, y] }
    })
  }
  if (points.length !== 4 || selected < .18 * samples || selected > .94 * samples) return undefined
  const area = Math.abs(points.reduce((sum, [x, y], index) => {
    const [nextX, nextY] = points[(index + 1) % 4]
    return sum + x * nextY - nextX * y
  }, 0)) / 2
  return area > width * height * .23 && area < width * height * .95 ? points : undefined
}

function cleanPhoto(source: HTMLCanvasElement) {
  const { width, height } = source
  const pixels = source.getContext('2d')!.getImageData(0, 0, width, height).data
  const [tl, tr, br, bl] = findSheet(pixels, width, height) ?? [[0, 0], [width - 1, 0], [width - 1, height - 1], [0, height - 1]]
  const distance = ([x, y]: Point, [a, b]: Point) => Math.hypot(x - a, y - b)
  const outWidth = Math.max(1, Math.round(Math.max(distance(tl, tr), distance(bl, br))))
  const outHeight = Math.max(1, Math.round(Math.max(distance(tl, bl), distance(tr, br))))
  const { canvas, ctx } = newCanvas(outWidth, outHeight)
  const result = ctx.createImageData(outWidth, outHeight)
  const dx1 = tr[0] - br[0], dx2 = bl[0] - br[0], dx3 = tl[0] - tr[0] + br[0] - bl[0]
  const dy1 = tr[1] - br[1], dy2 = bl[1] - br[1], dy3 = tl[1] - tr[1] + br[1] - bl[1]
  const determinant = dx1 * dy2 - dx2 * dy1
  const g = determinant ? (dx3 * dy2 - dx2 * dy3) / determinant : 0
  const h = determinant ? (dx1 * dy3 - dx3 * dy1) / determinant : 0
  const a = tr[0] - tl[0] + g * tr[0], b = bl[0] - tl[0] + h * bl[0]
  const d = tr[1] - tl[1] + g * tr[1], e = bl[1] - tl[1] + h * bl[1]
  for (let y = 0; y < outHeight; y++) for (let x = 0; x < outWidth; x++) {
    const u = x / outWidth, v = y / outHeight
    const divisor = g * u + h * v + 1
    const sx = Math.max(0, Math.min(width - 1, Math.round((a * u + b * v + tl[0]) / divisor)))
    const sy = Math.max(0, Math.min(height - 1, Math.round((d * u + e * v + tl[1]) / divisor)))
    const gray = Math.max(0, Math.min(255, (luminance(pixels, (sy * width + sx) * 4) - 26) * 1.27))
    const offset = (y * outWidth + x) * 4
    result.data[offset] = result.data[offset + 1] = result.data[offset + 2] = gray
    result.data[offset + 3] = 255
  }
  ctx.putImageData(result, 0, 0)
  return canvas
}

export async function schoolScan({ files, progress }: Context) {
  const output = await PDFDocument.create()
  for (const [index, file] of files.entries()) {
    const original = await imageCanvas(file, 1900, true)
    try {
      const corrected = cleanPhoto(original)
      const scale = Math.min(a4[0] / corrected.width, a4[1] / corrected.height)
      await canvasPage(output, corrected, corrected.width * scale, corrected.height * scale)
    } finally { original.width = original.height = 0 }
    progress(Math.round((index + 1) / files.length * 93))
  }
  return pdfOutput(output, localName(files[0], 'pdf', ' (Versa - fichas)'))
}
