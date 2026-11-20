import { degrees, PDFDocument } from 'pdf-lib'
import { zip } from 'fflate'
import { bytesBlob, canvasBlob, localName, type Context } from './types'
import { openPdf, renderPage } from './render-pdf'

export const pdfBlob = (bytes: Uint8Array) => bytesBlob(bytes, 'application/pdf')
export const pdfOutput = async (document: PDFDocument, name: string) => ({ blob: pdfBlob(await document.save()), name })

export async function zipFiles(files: Record<string, Uint8Array>) {
  const output = await new Promise<Uint8Array>((resolve, reject) => {
    zip(files, { level: 3 }, (error, data) => error ? reject(error) : resolve(data))
  })
  return bytesBlob(output, 'application/zip')
}

async function rasterPdf(file: File, password: string | undefined, quality: number, resolution: number, progress: Context['progress']) {
  const rendered = await openPdf(file, password)
  try {
    const document = await PDFDocument.create()
    for (let index = 1; index <= rendered.numPages; index++) {
      const source = await rendered.getPage(index)
      const viewport = source.getViewport({ scale: 1 })
      const canvas = await renderPage(source, resolution)
      try {
        const image = await document.embedJpg(await (await canvasBlob(canvas, 'image/jpeg', quality)).arrayBuffer())
        const page = document.addPage([viewport.width, viewport.height])
        page.drawImage(image, { x: 0, y: 0, width: viewport.width, height: viewport.height })
      } finally {
        canvas.width = canvas.height = 0
        source.cleanup()
      }
      progress(Math.round(index / rendered.numPages * 92))
    }
    return document
  } finally {
    await rendered.destroy()
  }
}

export async function editablePdf(file: File, password?: string) {
  try {
    return await PDFDocument.load(await file.arrayBuffer())
  } catch (error) {
    if (!password || !(error instanceof Error) || !error.message.includes('encrypted')) throw error
    return rasterPdf(file, password, .92, 1800, () => {})
  }
}

export async function mergePdf({ files, options, progress }: Context) {
  const output = await PDFDocument.create()
  for (const [index, file] of files.entries()) {
    const input = await editablePdf(file, options.password)
    const pages = await output.copyPages(input, input.getPageIndices())
    pages.forEach(page => output.addPage(page))
    progress(Math.round((index + 1) / files.length * 90))
  }
  return pdfOutput(output, localName(files[0], 'pdf', ' (Versa - juntos)'))
}

export async function splitPdf({ files: [file], options, progress }: Context) {
  const input = await editablePdf(file, options.password)
  const parts: Record<string, Uint8Array> = {}
  for (const index of input.getPageIndices()) {
    const output = await PDFDocument.create()
    const [page] = await output.copyPages(input, [index])
    output.addPage(page)
    parts[localName(file, 'pdf', `-${index + 1}`)] = await output.save()
    progress(Math.round((index + 1) / input.getPageCount() * 85))
  }
  return { blob: await zipFiles(parts), name: localName(file, 'zip', ' (Versa - paginas)') }
}

export async function rotatePdf({ files: [file], options, progress }: Context) {
  const output = await editablePdf(file, options.password)
  for (const page of output.getPages()) page.setRotation(degrees((page.getRotation().angle + (options.rotation ?? 90)) % 360))
  progress(85)
  return pdfOutput(output, localName(file, 'pdf', ' (Versa - rodado)'))
}

export async function compressPdf({ files: [file], options, progress }: Context) {
  const output = await rasterPdf(file, options.password, options.quality ?? .58, 1280, progress)
  const result = await pdfOutput(output, localName(file, 'pdf', ' (Versa - comprimido)'))
  return result.blob.size < file.size || options.password ? result : { ...result, blob: file }
}

export async function exportPdfImages({ files: [file], options, progress }: Context) {
  const pdf = await openPdf(file, options.password)
  try {
    const images: Record<string, Uint8Array> = {}
    for (let index = 1; index <= pdf.numPages; index++) {
      const page = await pdf.getPage(index)
      const canvas = await renderPage(page, 1700)
      try {
        const blob = await canvasBlob(canvas, 'image/jpeg', options.quality ?? .9)
        if (pdf.numPages === 1) return { blob, name: localName(file, 'jpg') }
        images[localName(file, 'jpg', `-${index}`)] = new Uint8Array(await blob.arrayBuffer())
      } finally {
        canvas.width = canvas.height = 0
        page.cleanup()
      }
      progress(Math.round(index / pdf.numPages * 87))
    }
    return { blob: await zipFiles(images), name: localName(file, 'zip', ' (Versa - imagens)') }
  } finally {
    await pdf.destroy()
  }
}

export async function extractPdfText({ files: [file], options, progress }: Context) {
  const pdf = await openPdf(file, options.password)
  const pages: string[] = []
  try {
    for (let index = 1; index <= pdf.numPages; index++) {
      const page = await pdf.getPage(index)
      const text = await page.getTextContent()
      pages.push(text.items.map(item => 'str' in item ? item.str + (item.hasEOL ? '\n' : '') : '').join('').trim())
      page.cleanup()
      progress(Math.round(index / pdf.numPages * 92))
    }
    return { blob: new Blob([pages.join('\n\n')], { type: 'text/plain;charset=utf-8' }), name: localName(file, 'txt') }
  } finally {
    await pdf.destroy()
  }
}
