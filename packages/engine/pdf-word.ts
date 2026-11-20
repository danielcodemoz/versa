import { Document, HeadingLevel, ImageRun, Packer, Paragraph, TextRun } from 'docx'
import { OPS } from 'pdfjs-dist'
import { openPdf, renderPage } from './render-pdf'
import { canvasBlob, localName, type Context } from './types'

export async function pdfWord({ files: [file], options, progress }: Context) {
  const { pdf, close } = await openPdf(file, options.password)
  const children: Paragraph[] = []
  try {
    for (let index = 1; index <= pdf.numPages; index++) {
      const page = await pdf.getPage(index)
      const text = (await page.getTextContent()).items.filter(item => 'str' in item)
      const operations = await page.getOperatorList()
      const hasImage = operations.fnArray.some(operation => operation === OPS.paintImageXObject || operation === OPS.paintInlineImageXObject)
      if (!text.some(item => item.str.trim()) || hasImage) {
        const canvas = await renderPage(page, 1200)
        try {
          const image = await canvasBlob(canvas, 'image/png')
          const scale = Math.min(1, 515 / canvas.width, 650 / canvas.height)
          children.push(new Paragraph({ pageBreakBefore: index > 1, children: [new ImageRun({
            data: await image.arrayBuffer(),
            type: 'png',
            transformation: { width: Math.round(canvas.width * scale), height: Math.round(canvas.height * scale) },
          })] }))
        } finally {
          canvas.width = canvas.height = 0
        }
      } else {
        const sizes = text.map(item => item.height).filter(size => size > 0).sort((a, b) => a - b)
        const typicalSize = sizes[Math.floor(sizes.length / 2)] || 12
        let line: TextRun[] = []
        let lines = 0
        let max = 0
        const addLine = () => {
          if (!line.length) return
          children.push(new Paragraph({
            children: line,
            pageBreakBefore: index > 1 && lines === 0,
            heading: max > typicalSize * 1.35 ? HeadingLevel.HEADING_1 : undefined,
          }))
          lines++
          max = 0
          line = []
        }
        for (const item of text) {
          if (item.str) {
            max = Math.max(max, item.height)
            line.push(new TextRun({ text: item.str, size: Math.round(Math.max(8, Math.min(48, item.height || typicalSize)) * 2), rightToLeft: item.dir === 'rtl' }))
          }
          if (item.hasEOL) addLine()
        }
        addLine()
      }
      page.cleanup()
      progress(Math.round(index / pdf.numPages * 90))
    }
    const document = new Document({ sections: [{ children }] })
    return { blob: await Packer.toBlob(document), name: localName(file, 'docx') }
  } finally {
    await close()
  }
}
