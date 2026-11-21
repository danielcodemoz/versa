import type { EditorRequest } from './editor-worker'

self.onmessage = async ({ data }: MessageEvent<EditorRequest>) => {
  try {
    if (data.action === 'unlock') {
      const { unlock } = await import('./editor-unlock')
      self.postMessage(await unlock(data.source, data.password))
      return
    }
    const { describeForms, writeEditedPdf } = await import('./editor-pdf')
    if (data.action === 'forms') {
      self.postMessage(await describeForms(new Uint8Array(await data.source.arrayBuffer())))
      return
    }
    const bytes = await writeEditedPdf(data.sheets, data.metas, data.sources, data.bitmaps, data.values)
    const buffer = bytes.buffer instanceof ArrayBuffer && bytes.byteOffset === 0 && bytes.byteLength === bytes.buffer.byteLength
      ? bytes.buffer : Uint8Array.from(bytes).buffer
    self.postMessage(buffer, { transfer: [buffer] })
  } catch {
    self.postMessage(null)
  }
}
