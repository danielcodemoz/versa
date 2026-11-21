import type { Bitmap, FormField, FormValue, Meta, Sheet } from './editor-model'

type Save = { action: 'save'; sheets: Sheet[]; metas: Meta[]; sources: Blob[]; bitmaps: Bitmap[]; values: Record<string, FormValue> }
type Forms = { action: 'forms'; source: Blob }
type Unlock = { action: 'unlock'; source: Blob; password: string }
export type EditorRequest = Save | Forms | Unlock

export function editInWorker(request: Save): Promise<ArrayBuffer>
export function editInWorker(request: Forms): Promise<FormField[]>
export function editInWorker(request: Unlock): Promise<Blob>
export function editInWorker(request: EditorRequest) {
  const worker = new Worker(new URL('./editor.worker.ts', import.meta.url), { type: 'module', name: 'versa-pdf-editor' })
  return new Promise((resolve, reject) => {
    const fail = () => {
      worker.terminate()
      reject(new Error('PDF editing worker failed'))
    }
    worker.onerror = fail
    worker.onmessageerror = fail
    worker.onmessage = ({ data }) => {
      if (data === null) return fail()
      worker.terminate()
      resolve(data)
    }
    try { worker.postMessage(request) } catch { fail() }
  })
}
