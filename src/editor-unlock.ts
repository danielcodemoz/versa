import createQpdf from '@neslinesli93/qpdf-wasm'
import wasmUrl from '@neslinesli93/qpdf-wasm/dist/qpdf.wasm?url'

export async function unlock(source: Blob, password: string) {
  const options = {
    locateFile: () => new URL(wasmUrl, self.location.href).href,
    // The caller validates the password with PDF.js. Avoid writing file information to the console.
    print: () => {},
    printErr: () => {},
  }
  const qpdf = await createQpdf(options)
  qpdf.FS.mkdir('/input')
  qpdf.FS.mount(qpdf.WORKERFS, { blobs: [{ name: 'document.pdf', data: source }] }, '/input')
  const result = qpdf.callMain(['/input/document.pdf', `--password=${password}`, '--decrypt', '--warning-exit-0', '/unlocked.pdf'])
  if (result !== 0) throw new Error('Could not unlock PDF')
  return new Blob([Uint8Array.from(qpdf.FS.readFile('/unlocked.pdf')).buffer], { type: 'application/pdf' })
}
