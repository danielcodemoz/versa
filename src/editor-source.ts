import { kindFromFile, t, type Language } from '../packages/engine/catalog'
import { inputByteLimit } from '../packages/engine/input-limit'
import { openPdf } from '../packages/engine/render-pdf'
import { normalise } from './editor-geometry'
import type { Meta, Source } from './editor-model'
import { editInWorker } from './editor-worker'
import { copy } from './copy'

type SourceStatus = 'empty' | 'large' | 'type' | 'opening' | 'unlocking' | 'unlockFail'
interface Options {
  active(): boolean
  password(retry: boolean): Promise<string | undefined>
  status(key: SourceStatus): void
}

export async function readEditablePdf(file: File, index: number, options: Options) {
  const problem = !file.size ? 'empty' : file.size > inputByteLimit() ? 'large' : kindFromFile(file) !== 'pdf' ? 'type' : undefined
  if (problem) { options.status(problem); return }
  const head = new TextDecoder().decode(await file.slice(0, 1024).arrayBuffer())
  if (!/%PDF-\d\.\d/.test(head)) throw new Error('Invalid PDF')
  let password: string | undefined
  let opened
  while (options.active()) {
    try { opened = await openPdf(file, password); break }
    catch (error) {
      if (!(error instanceof Error) || error.name !== 'PasswordException') throw error
      if (!options.active()) return
      password = await options.password(password !== undefined)
      if (password === undefined) return
      options.status('opening')
    }
  }
  if (!opened) return
  try {
    const { info } = await opened.pdf.getMetadata()
    const { IsAcroFormPresent, EncryptFilterName } = info as { IsAcroFormPresent?: boolean; EncryptFilterName?: string }
    const secure = Boolean(EncryptFilterName)
    let data: Blob = file
    if (secure && options.active()) {
      options.status('unlocking')
      try { data = await editInWorker({ action: 'unlock', source: file, password: password ?? '' }) }
      catch { options.status('unlockFail'); await opened.close(); return }
    }
    password = undefined
    const metas: Meta[] = []
    const document = opened.pdf
    for (let batch = 0; batch < document.numPages && options.active(); batch += 16) {
      const count = Math.min(16, document.numPages - batch)
      const proxies = await Promise.all(Array.from({ length: count }, (_, offset) => document.getPage(batch + offset + 1)))
      for (const [offset, proxy] of proxies.entries()) {
        const view = proxy.getViewport({ scale: 1 })
        metas.push({ w: view.width, h: view.height, base: normalise(proxy.rotate), unit: proxy.userUnit, source: index, page: batch + offset })
      }
    }
    if (!options.active()) { await opened.close(); return }
    const fields = IsAcroFormPresent ? await editInWorker({ action: 'forms', source: data }).catch(() => []) : []
    const source: Source = { ...opened, data, fields }
    return { source, metas, secure }
  } catch (error) {
    await opened.close()
    throw error
  }
}

export function requestPassword(parent: HTMLElement, filename: string, language: Language, retry: boolean, warning: string) {
  const [title, field, submit, cancel] = language === 'pt'
    ? ['PDF protegido', 'Palavra-passe', 'Desbloquear', 'Cancelar']
    : ['Protected PDF', 'Password', 'Unlock', 'Cancel']
  const error = retry ? t(language, copy['wrong-password']) : ''
  const dialog = document.createElement('dialog')
  dialog.className = 'ed-dialog'
  dialog.dataset.passwordDialog = ''
  dialog.setAttribute('aria-labelledby', 'password-title')
  dialog.innerHTML = `
    <h2 id="password-title">${title}</h2>
    <p data-password-file></p><p>${warning}</p>
    <form>
      <label class="ed-type">${field} <input data-password type="password" required autocomplete="off" aria-describedby="password-error"></label>
      <p class="ed-error" id="password-error" role="alert"></p>
      <div class="ed-dialog-actions"><button class="button button-small" type="submit">${submit}</button><button class="quiet" type="button" data-cancel-dialog>${cancel}</button></div>
    </form>`
  dialog.querySelector('[data-password-file]')!.textContent = filename
  dialog.querySelector('#password-error')!.textContent = error
  const input = dialog.querySelector('input')!
  input.setAttribute('aria-invalid', String(Boolean(error)))
  let value: string | undefined
  dialog.querySelector('form')!.onsubmit = event => {
    event.preventDefault()
    value = input.value
    dialog.close()
  }
  parent.append(dialog)
  dialog.showModal()
  input.focus()
  return new Promise<string | undefined>(resolve => {
    dialog.addEventListener('close', () => {
      input.value = ''
      dialog.remove()
      resolve(value)
    }, { once: true })
  })
}
