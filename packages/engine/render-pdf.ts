import { getDocument, GlobalWorkerOptions, PasswordResponses, type PDFPageProxy } from 'pdfjs-dist'
import pdfWorker from 'pdfjs-dist/build/pdf.worker.min.mjs?url'

GlobalWorkerOptions.workerSrc = pdfWorker

export async function openPdf(file: File, password?: string) {
  const support = new URL(import.meta.env.DEV ? '/node_modules/pdfjs-dist/' : import.meta.env.BASE_URL + 'pdfjs/', location.href)
  const task = getDocument({
    data: await file.arrayBuffer(),
    password,
    cMapUrl: new URL('cmaps/', support).href,
    cMapPacked: true,
    standardFontDataUrl: new URL('standard_fonts/', support).href,
    wasmUrl: new URL('wasm/', support).href,
    stopAtErrors: true,
  })
  try {
    return await task.promise
  } catch (error) {
    await task.destroy()
    throw error
  }
}

export async function checkPdf(file: File, password?: string) {
  try {
    const pdf = await openPdf(file, password)
    try {
      await pdf.getPage(1)
      return undefined
    } finally {
      await pdf.destroy()
    }
  } catch (error) {
    if (error instanceof Error && error.name === 'PasswordException') {
      return 'code' in error && error.code === PasswordResponses.INCORRECT_PASSWORD ? 'wrong-password' : 'password'
    }
    return 'damaged'
  }
}

export async function renderPage(page: PDFPageProxy, maxDimension: number) {
  const base = page.getViewport({ scale: 1 })
  const viewport = page.getViewport({ scale: Math.min(2, maxDimension / Math.max(base.width, base.height)) })
  const canvas = document.createElement('canvas')
  canvas.width = Math.ceil(viewport.width)
  canvas.height = Math.ceil(viewport.height)
  await page.render({ canvas, canvasContext: canvas.getContext('2d')!, viewport }).promise
  return canvas
}
