import './style.css'
import { t, type Language, type Phrase } from '../packages/engine/catalog'
import { icon } from './icons'
import config from '../apps/desktop/src-tauri/tauri.conf.json'
import logoLight from '../brand/logo-light.svg'
import logoDark from '../brand/logo-dark.svg'

const app = document.querySelector<HTMLDivElement>('#download-app')!
let language: Language = localStorage.getItem('versa-language') === 'en' ? 'en' : 'pt'
let theme = localStorage.getItem('versa-theme') ?? (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light')
const phrase = (message: Phrase) => t(language, message)
const releases = 'https://github.com/danielcodemoz/versa/releases'

function render() {
  document.documentElement.lang = language === 'pt' ? 'pt-MZ' : 'en'
  document.documentElement.dataset.theme = theme
  document.title = phrase(['Versa para Windows', 'Versa for Windows'])
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', theme === 'dark' ? '#172825' : '#f4efe3')
  app.innerHTML = `
    <header class="masthead"><div class="shell masthead-inner">
      <a class="brand-link" href="/" aria-label="Versa"><img class="brand brand-light" src="${logoLight}" alt="Versa"><img class="brand brand-dark" src="${logoDark}" alt="Versa"></a>
      <div class="switches">
        <button class="switch language-switch" type="button" data-language aria-label="${phrase(['Mudar para inglês', 'Switch to Portuguese'])}">${language === 'pt' ? 'EN' : 'PT'}</button>
        <button class="switch theme-switch" type="button" data-theme aria-label="${phrase(['Mudar tema', 'Change theme'])}" aria-pressed="${theme === 'dark'}">${icon(theme === 'dark' ? 'sun' : 'moon', 19)}</button>
      </div>
    </div></header>
    <main class="hero download-hero">
      <div class="shell release-sheet">
        <a class="text-link release-back" href="/#roda">${icon('arrow', 16)} ${phrase(['Voltar à roda no browser', 'Back to the browser wheel'])}</a>
        <div class="release-heading">
          <span class="release-icon">${icon('windows', 39)}</span>
          <div><h1>${phrase(['Versa para Windows', 'Versa for Windows'])}</h1><p class="kicker">Windows 10/11 · x64 · v${config.version}</p></div>
        </div>
        <p>${phrase(['Arrasta um ficheiro no Explorador e toca em Shift, que a roda trata do resto.', 'Drag a file in File Explorer and tap Shift to open the wheel.'])}</p>
        <div class="release-actions">
          <a class="button" href="${releases}">${icon('down', 22)} ${phrase(['Ver instaladores no GitHub', 'View installers on GitHub'])}</a>
        </div>
        <p class="release-formats">${phrase(['O .exe instala para o utilizador actual. O .msi serve para instalação gerida.', 'The .exe installs for the current user. The .msi is for managed installation.'])}</p>
      </div>
    </main>
  `
}

app.addEventListener('click', event => {
  const button = (event.target as Element).closest<HTMLButtonElement>('button')
  if (!button) return
  const preference = 'language' in button.dataset ? 'language' : 'theme'
  if (preference === 'language') {
    language = language === 'pt' ? 'en' : 'pt'
    localStorage.setItem('versa-language', language)
  } else {
    theme = theme === 'dark' ? 'light' : 'dark'
    localStorage.setItem('versa-theme', theme)
  }
  render()
  app.querySelector<HTMLButtonElement>(`[data-${preference}]`)?.focus()
})
render()
