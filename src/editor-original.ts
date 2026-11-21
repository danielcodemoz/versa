import type { PDFPageProxy } from 'pdfjs-dist'
import { offset, type Original, type Point } from './editor-model'

const hex = (rgb: number[]) => '#' + rgb.slice(0, 3).map(value => value.toString(16).padStart(2, '0')).join('')
const distance = (a: number[], b: number[]) => a.reduce((sum, value, index) => sum + Math.abs(value - b[index]), 0)
function sampleColors(canvas: HTMLCanvasElement, block: Original, scale: number) {
  const context = canvas.getContext('2d')!
  const { origin, angle, ascent, h, w } = block
  if (!canvas.width || !canvas.height) return
  const at = (x: number, y: number) => {
    const point = offset(origin, angle, x, y)
    const a = Math.max(0, Math.min(canvas.width - 1, Math.round(point[0] * scale)))
    const b = Math.max(0, Math.min(canvas.height - 1, Math.round(point[1] * scale)))
    const data = context.getImageData(a, b, 1, 1).data
    return data[3] ? Array.from(data.slice(0, 3)) : [255, 255, 255]
  }
  const outside = [
    at(0, -ascent - 1.5), at(w / 2, -ascent - 1.5), at(w, -ascent - 1.5),
    at(0, h - ascent + 1.5), at(w / 2, h - ascent + 1.5), at(w, h - ascent + 1.5),
  ]
  const background = outside.reduce((best, value) =>
    outside.filter(other => distance(other, value) < 25).length > outside.filter(other => distance(other, best) < 25).length ? value : best)
  let ink = background
  for (let x = 1; x < 34; x++) {
    for (let y = 1; y < 9; y++) {
      const pixel = at(w * x / 34, -ascent + h * y / 9)
      if (distance(pixel, background) > distance(ink, background)) ink = pixel
    }
  }
  block.background = hex(background)
  if (distance(ink, background) > 48) block.color = hex(ink)
}

export async function originalBlocks(page: PDFPageProxy, canvas: HTMLCanvasElement, scale: number) {
  const text = await page.getTextContent()
  const [a, b, c, d, e, f] = page.getViewport({ scale: 1 }).transform
  const blocks: Original[] = []
  for (const [index, item] of text.items.entries()) {
    if (!('str' in item) || !item.str.trim()) continue
    const [m0, m1, m2, m3, x, y] = item.transform
    const style = text.styles[item.fontName]
    const origin: Point = [a * x + c * y + e, b * x + d * y + f]
    const angle = Math.atan2(b * m0 + d * m1, a * m0 + c * m1)
    const size = Math.hypot(a * m2 + c * m3, b * m2 + d * m3)
    const w = item.width * page.userUnit
    if (!Number.isFinite(size) || w < 1 || size < 1 || style?.vertical) continue
    const ascent = size * (style?.ascent || .82)
    const family = style?.fontFamily ?? ''
    const block: Original = {
      index, origin, angle, w, size, ascent, h: ascent + size * Math.abs(style?.descent || -.22),
      font: /mono|courier/i.test(family) ? 'mono' : /sans/i.test(family) ? 'sans' : /serif|times/i.test(family) ? 'serif' : 'sans',
      text: item.str, color: '#1a1a2e', background: '#ffffff',
    }
    // Sample only on activation, once the canvas of this page has finished painting.
    blocks.push(block)
  }
  return { blocks, color: (block: Original) => sampleColors(canvas, block, scale) }
}
