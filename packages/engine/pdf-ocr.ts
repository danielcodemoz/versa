import {
  PDFDocument, StandardFonts, TextRenderingMode, concatTransformationMatrix,
  popGraphicsState, pushGraphicsState, setTextRenderingMode,
} from 'pdf-lib'
import type { OcrMessage } from './pdf-ocr.worker'
import { pdfOutput, unlockedPdf } from './pdf'
import { openPdf, renderPage, renderViewport } from './render-pdf'
import { canvasBlob, localName, type Context } from './types'

const resolution = 2400
const maxScale = 4

async function recognize(worker: Worker, image: Blob, progress: (fraction: number) => void) {
  let timeout: ReturnType<typeof setTimeout> | undefined
  try {
    return await new Promise<Extract<OcrMessage, { words: unknown }>['words']>((resolve, reject) => {
      timeout = setTimeout(() => reject(new Error('OCR timed out')), 90000)
      worker.onmessage = ({ data }: MessageEvent<OcrMessage>) => {
        if ('progress' in data) progress(data.progress)
        else if ('words' in data) resolve(data.words)
        else reject(new Error(data.error))
      }
      worker.onerror = event => reject(new Error(event.message || 'OCR worker failed'))
      worker.postMessage(image)
    })
  } finally {
    clearTimeout(timeout)
    worker.onmessage = worker.onerror = null
  }
}

export async function ocrPdf({ files: [file], options, progress }: Context) {
  const name = localName(file, 'pdf', ' - OCR (Versa)')
  const { pdf, close } = await openPdf(file, options.password)
  let worker: Worker | undefined
  let currentProgress = 5
  const report = (value: number) => {
    currentProgress = Math.max(currentProgress, Math.round(value))
    progress(currentProgress)
  }
  let index = 1
  const pageProgress = (fraction: number) => report(12 + (index - 1 + fraction) / pdf.numPages * 81)
  try {
    const source = await unlockedPdf(file, options.password)
    const output = await PDFDocument.load(await source.arrayBuffer(), { updateMetadata: false })
    const font = await output.embedFont(StandardFonts.Helvetica)
    const characters = new Set(font.getCharacterSet())
    let changed = false
    for (; index <= pdf.numPages; index++) {
      const page = await pdf.getPage(index)
      try {
        const existing = await page.getTextContent()
        if (existing.items.some(item => 'str' in item && item.str.trim())) continue

        worker ??= new Worker(new URL('./pdf-ocr.worker.ts', import.meta.url), { type: 'module' })
        const canvas = await renderPage(page, resolution, maxScale)
        try {
          const image = await canvasBlob(canvas, 'image/png')
          const words = await recognize(worker, image, pageProgress)
          const viewport = renderViewport(page, resolution, maxScale)
          const [x, y] = viewport.convertToPdfPoint(0, 0)
          const [right, rightY] = viewport.convertToPdfPoint(1, 0)
          const [upX, up] = viewport.convertToPdfPoint(0, -1)
          const target = output.getPage(index - 1)
          for (const word of words) {
            const text = Array.from(word.text.normalize('NFC'), char => characters.has(char.codePointAt(0)!) ? char : '?').join('').trim()
            const { x0, y0, x1, y1 } = word.bbox
            if (!text || x1 <= x0 || y1 <= y0) continue
            const size = (y1 - y0) / font.heightAtSize(1, { descender: false })
            const stretch = (x1 - x0) / font.widthOfTextAtSize(text, size)
            const [left, bottom] = viewport.convertToPdfPoint(x0, y1)
            // Map each word from the rotated render back to the original PDF page.
            target.pushOperators(pushGraphicsState(),
              concatTransformationMatrix((right - x) * stretch, (rightY - y) * stretch, upX - x, up - y, left, bottom),
              setTextRenderingMode(TextRenderingMode.Invisible))
            target.drawText(text, { font, size, x: 0, y: 0 })
            target.pushOperators(popGraphicsState())
            changed = true
          }
        } finally {
          canvas.width = canvas.height = 0
        }
      } finally {
        page.cleanup()
        pageProgress(1)
      }
    }
    return changed ? pdfOutput(output, name) : { blob: source, name }
  } finally {
    worker?.terminate()
    await close()
  }
}
