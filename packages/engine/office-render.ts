import { PDFDocument } from 'pdf-lib'
import { canvasBlob } from './types'
import { pdfOutput } from './pdf'

export function newCanvas(width: number, height: number) {
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext('2d')!
  ctx.fillStyle = 'white'
  ctx.fillRect(0, 0, width, height)
  return { canvas, ctx }
}
export function linesFor(ctx: CanvasRenderingContext2D, text: string, width: number) {
  const lines: string[] = []
  for (const paragraph of text.split('\n')) {
    let line = ''
    for (const word of paragraph.split(/\s+/)) {
      const together = line ? line + ' ' + word : word
      if (line && ctx.measureText(together).width > width) {
        lines.push(line)
        line = word
      } else line = together
    }
    lines.push(line)
  }
  return lines
}

export async function canvasPage(document: PDFDocument, canvas: HTMLCanvasElement, width: number, height: number) {
  try {
    const picture = await document.embedJpg(await (await canvasBlob(canvas, 'image/jpeg', .93)).arrayBuffer())
    const page = document.addPage([width, height])
    page.drawImage(picture, { x: 0, y: 0, width, height })
  } finally {
    canvas.width = canvas.height = 0
  }
}

export async function newPdf(name: string) {
  const document = await PDFDocument.create()
  return { document, finish: () => pdfOutput(document, name) }
}
