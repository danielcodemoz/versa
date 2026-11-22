import type { EditorRequest } from './editor-worker'

self.onmessage = async ({ data }: MessageEvent<EditorRequest>) => {
  try {
    if (data.action === 'unlock') {
      const { unlock } = await import('./editor-unlock')
      self.postMessage(await unlock(data.source, data.password))
      return
    }
    const { describeForms, editedPdfWriter } = await import('./editor-pdf')
    if (data.action === 'forms') {
      self.postMessage(await describeForms(new Uint8Array(await data.source.arrayBuffer())))
      return
    }
    const write = editedPdfWriter(data.metas, data.sources, data.bitmaps, data.values)
    let bytes: Uint8Array
    if (data.action === 'split') {
      const { zipSync } = await import('fflate')
      const files: Record<string, Uint8Array> = {}
      for (const part of data.parts) files[part.name] = await write(part.sheets)
      bytes = zipSync(files, { level: 0 })
    } else bytes = await write(data.sheets)
    const buffer = bytes.buffer instanceof ArrayBuffer && bytes.byteOffset === 0 && bytes.byteLength === bytes.buffer.byteLength
      ? bytes.buffer : Uint8Array.from(bytes).buffer
    self.postMessage(buffer, { transfer: [buffer] })
  } catch {
    self.postMessage(null)
  }
}
