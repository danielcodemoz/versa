import { children, nodes, openOffice, sanitiseOffice, xml } from './ooxml'
import { canvasPage, newPdf } from './office-render'
import { localName, type Context } from './types'

async function wordText(file: File) {
  const parts = await openOffice(file)
  const doc = xml(parts, 'word/document.xml')
  return nodes(doc, 'p').map(paragraph =>
    nodes(paragraph, 'r').flatMap(run => Array.from(run.children)).map(child => {
      if (child.localName === 't') return child.textContent ?? ''
      if (child.localName === 'tab') return '\t'
      if (child.localName === 'br') return '\n'
      return ''
    }).join('')
  ).join('\n')
}

export async function extractWord({ files: [file], progress }: Context) {
  const text = await wordText(file)
  progress(90)
  return { blob: new Blob([text], { type: 'text/plain;charset=utf-8' }), name: localName(file, 'txt') }
}

export async function countWords({ files: [file], progress }: Context) {
  const text = await wordText(file)
  const total = [...new Intl.Segmenter(undefined, { granularity: 'word' }).segment(text)].filter(segment => segment.isWordLike).length
  progress(90)
  return { blob: new Blob([`${total}\n`], { type: 'text/plain;charset=utf-8' }), name: localName(file, 'txt', ' - palavras (Versa)') }
}

export async function wordPdf({ files: [file], progress }: Context) {
  const [{ renderAsync }, { default: renderCanvas }] = await Promise.all([import('docx-preview'), import('html2canvas')])
  const container = document.createElement('div')
  container.setAttribute('aria-hidden', 'true')
  Object.assign(container.style, { position: 'absolute', left: '-11000px', top: '0', width: '1000px', background: '#fff', colorScheme: 'light', pointerEvents: 'none' })
  document.body.append(container)
  try {
    const bytes = sanitiseOffice(await openOffice(file))
    await renderAsync(bytes, container, container, {
      className: 'versa-docx',
      inWrapper: false,
      breakPages: true,
      ignoreLastRenderedPageBreak: false,
      renderAltChunks: false,
      useBase64URL: true,
    })
    await document.fonts.ready
    await Promise.all(Array.from(container.querySelectorAll('img')).map(image => image.decode().catch(() => {})))
    const pages = children(container, 'section')
    if (!pages.length) throw new Error('Word document has no pages')
    const pdf = await newPdf(localName(file, 'pdf'))
    for (const [index, page] of pages.entries()) {
      const bounds = page.getBoundingClientRect()
      const scale = Math.min(1.5, 1785 / bounds.width)
      const canvas = await renderCanvas(page as HTMLElement, { scale, backgroundColor: '#fff', logging: false, useCORS: false })
      const sheetHeight = Math.round(bounds.height || 1122)
      const maxPageHeight = Math.round(Math.min(sheetHeight, bounds.width * 1.65) * scale)
      if (canvas.height <= maxPageHeight) {
        await canvasPage(pdf.document, canvas, bounds.width * .75, sheetHeight * .75)
      } else {
        for (let y = 0; y < canvas.height; y += maxPageHeight) {
          const slice = document.createElement('canvas')
          slice.width = canvas.width
          slice.height = Math.min(maxPageHeight, canvas.height - y)
          slice.getContext('2d')!.drawImage(canvas, 0, y, slice.width, slice.height, 0, 0, slice.width, slice.height)
          await canvasPage(pdf.document, slice, bounds.width * .75, slice.height * .75 / scale)
        }
        canvas.width = canvas.height = 0
      }
      progress(Math.round(10 + 83 * (index + 1) / pages.length))
    }
    return pdf.finish()
  } finally {
    container.remove()
  }
}
