import './style.css'
import { t, type Language, type Phrase } from '../packages/engine/catalog'
import { activateLicense, loadLicense, removeLicense, type LicenseCheck, type LicenseProblem } from '../packages/engine/license'
import { icon } from './icons'
import { payment, plans } from './pro-config'
import logoLight from '../brand/logo-light.svg'
import logoDark from '../brand/logo-dark.svg'

const app = document.querySelector<HTMLDivElement>('#pro-app')!
const stored = (key: string) => { try { return localStorage.getItem(key) } catch { return null } }
const persist = (key: string, value: string) => { try { localStorage.setItem(key, value) } catch { /* Private browsing. */ } }
let language: Language = stored('versa-language') === 'en' ? 'en' : 'pt'
let theme = stored('versa-theme') ?? (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light')
let current: LicenseCheck | undefined
let message = ''
const phrase = (text: Phrase) => t(language, text)
const money = (value: number) => String(value).replace(/\B(?=(\d{3})+(?!\d))/g, language === 'pt' ? '.' : ',') + ' MT'
const problems: Record<LicenseProblem, Phrase> = {
  'not-configured': ['As licenças ainda não estão activadas nesta versão.', 'Licences are not enabled in this version yet.'],
  format: ['Chave inválida. Copia-a inteira, começa por VERSA1.', 'Invalid key. Copy all of it; it starts with VERSA1.'],
  signature: ['Chave não reconhecida. Confirma que a copiaste sem alterações.', 'Key not recognised. Check that you copied it unchanged.'],
  expired: ['Esta licença já expirou. Pede a renovação.', 'This licence has expired. Ask for a renewal.'],
}
const features: Phrase[] = [
  ['Lote: converter, comprimir, rodar, pôr marca de água, fazer OCR ou pôr o cabeçalho da escola em vários ficheiros de uma vez. Sai um ZIP.', 'Batch: convert, compress, rotate, watermark, OCR or add the school header to many files at once. You get a ZIP.'],
  ['Lote também para Word, Excel e PowerPoint para PDF, e para imagens (JPG, PNG, WebP, AVIF).', 'Batch also for Word, Excel and PowerPoint to PDF, and for images (JPG, PNG, WebP, AVIF).'],
  ['Apoio directo por mensagem.', 'Direct support by message.'],
]

function status() {
  if (current?.ok) {
    const until = current.payload.e ? phrase([`válida até ${current.payload.e}`, `valid until ${current.payload.e}`]) : phrase(['sem data de fim', 'no end date'])
    return `<p class="pro-ok" role="status">${icon('arrow', 16)} ${phrase(['Pro activo para', 'Pro active for'])} <strong data-holder></strong> · ${until}</p>`
  }
  const problem = current && !current.ok ? phrase(problems[current.problem]) : message
  return `<p class="pro-problem" role="status">${problem}</p>`
}
const payLine = (label: string, value: string) => `<li><strong>${label}</strong> ${value ? `<span data-pay></span>` : phrase(['a confirmar', 'to be confirmed'])}</li>`

function render() {
  document.documentElement.lang = language === 'pt' ? 'pt-MZ' : 'en'
  document.documentElement.dataset.theme = theme
  document.title = 'Versa Pro'
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', theme === 'dark' ? '#172825' : '#f4efe3')
  app.innerHTML = `
    <header class="masthead"><div class="shell masthead-inner">
      <a class="brand-link" href="/" aria-label="Versa"><img class="brand brand-light" src="${logoLight}" alt="Versa"><img class="brand brand-dark" src="${logoDark}" alt="Versa"></a>
      <div class="switches">
        <button class="switch language-switch" type="button" data-language aria-label="${phrase(['Mudar para inglês', 'Switch to Portuguese'])}">${language === 'pt' ? 'EN' : 'PT'}</button>
        <button class="switch theme-switch" type="button" data-theme aria-label="${phrase(['Mudar tema', 'Change theme'])}" aria-pressed="${theme === 'dark'}">${icon(theme === 'dark' ? 'sun' : 'moon', 19)}</button>
      </div>
    </div></header>
    <main class="hero download-hero"><div class="shell release-sheet pro-sheet">
      <a class="text-link release-back" href="/#roda">${icon('arrow', 16)} ${phrase(['Voltar à roda', 'Back to the wheel'])}</a>
      <h1>Versa Pro</h1>
      <p>${phrase(['O Versa continua grátis, um ficheiro de cada vez, sem limites e sem enviar nada para lado nenhum. O Pro serve para quem trata muitos ficheiros.', 'Versa stays free, one file at a time, with no limits and nothing uploaded. Pro is for people who handle many files.'])}</p>
      <ul class="pro-features">${features.map(item => `<li>${icon('arrow', 16)} ${phrase(item)}</li>`).join('')}</ul>
      <div class="pro-plans">${plans.map(plan => `<div class="pro-plan"><h2>${phrase(plan.name)}</h2><p class="pro-price">${money(plan.price)}<small>${phrase(['/ano', '/year'])}</small></p><p>${phrase(plan.devices)}</p></div>`).join('')}</div>
      <h2>${phrase(['Como comprar', 'How to buy'])}</h2>
      <ol class="pro-steps">
        <li>${phrase(['Paga por M-Pesa ou e-Mola.', 'Pay by M-Pesa or e-Mola.'])}</li>
        <li>${phrase(['Envia o código da transacção e o teu nome.', 'Send the transaction code and your name.'])}</li>
        <li>${phrase(['Recebes a chave Pro depois de confirmarmos o pagamento.', 'You receive your Pro key once we confirm the payment.'])}</li>
      </ol>
      <ul class="pro-pay">${payLine('M-Pesa', payment.mpesa)}${payLine('e-Mola', payment.emola)}${payLine(phrase(['Contacto', 'Contact']), payment.contact)}</ul>
      <h2>${phrase(['Já tens uma chave?', 'Already have a key?'])}</h2>
      <form class="pro-form" novalidate>
        <label>${phrase(['Chave Pro', 'Pro key'])} <input name="key" autocomplete="off" spellcheck="false" placeholder="VERSA1.…"></label>
        <button class="button" type="submit">${phrase(['Activar', 'Activate'])}</button>
        ${current?.ok ? `<button class="button button-secondary" type="button" data-remove>${phrase(['Remover licença', 'Remove licence'])}</button>` : ''}
      </form>
      ${status()}
    </div></main>`
  if (current?.ok) app.querySelector('[data-holder]')!.textContent = current.payload.n
  const pay = [...app.querySelectorAll('[data-pay]')]
  ;[payment.mpesa, payment.emola, payment.contact].filter(Boolean).forEach((value, index) => { if (pay[index]) pay[index].textContent = value })
}

app.addEventListener('click', event => {
  const button = (event.target as Element).closest<HTMLButtonElement>('button')
  if (!button) return
  if ('remove' in button.dataset) { removeLicense(); current = undefined; message = ''; render(); return }
  const preference = 'language' in button.dataset ? 'language' : 'theme'
  if (preference === 'language') { language = language === 'pt' ? 'en' : 'pt'; persist('versa-language', language) }
  else if ('theme' in button.dataset) { theme = theme === 'dark' ? 'light' : 'dark'; persist('versa-theme', theme) }
  else return
  render()
  app.querySelector<HTMLButtonElement>(`[data-${preference}]`)?.focus()
})
app.addEventListener('submit', async event => {
  event.preventDefault()
  const key = (app.querySelector<HTMLInputElement>('input[name=key]')!).value
  current = await activateLicense(key)
  render()
})
void loadLicense().then(check => { current = check; render() })
render()
