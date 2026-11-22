import type { Bitmap, FormField, FormValue, Meta, Sheet } from './editor-model'

type Content = { metas: Meta[]; sources: Blob[]; bitmaps: Bitmap[]; values: Record<string, FormValue> }
type Save = Content & { action: 'save'; sheets: Sheet[] }
type Split = Content & { action: 'split'; parts: { name: string; sheets: Sheet[] }[] }
type Forms = { action: 'forms'; source: Blob }
type Unlock = { action: 'unlock'; source: Blob; password: string }
export type EditorRequest = Save | Split | Forms | Unlock

export function editInWorker(request: Save | Split): Promise<ArrayBuffer>
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
