import './style.css'
import './windows-safety.css'
import { t, type Language, type Phrase } from '../packages/engine/catalog'
import { icon } from './icons'
import { exeName, releaseFiles, releases, sizeInMB, version } from './release'
import logoLight from '../brand/logo-light.svg'
import logoDark from '../brand/logo-dark.svg'

const app = document.querySelector<HTMLDivElement>('#download-app')!
let language: Language = localStorage.getItem('versa-language') === 'en' ? 'en' : 'pt'
let theme = localStorage.getItem('versa-theme') ?? (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light')
const phrase = (message: Phrase) => t(language, message)

// SHA256SUMS.txt and the corresponding asset digests from the official v0.1.5 release.
const publishedHashes: Partial<Record<string, string>> = {
  'Versa-Setup-0.1.5.exe': '1b25ecaf6c4cffe315b10ba93790ab5d1b2922b6ae81df891c9c1a307515736d',
  'Versa-0.1.5-x64.msi': '54555e6a5f88a6bd523159546295b720b0391ad9d446e8ae65453beb08086f5e',
}
const windowsChecksums = [exeName, `Versa-${version}-x64.msi`].flatMap(filename =>
  publishedHashes[filename] ? [{ filename, sha256: publishedHashes[filename] }] : [])
const guideFrames = [
  'Download for Windows',
  '⋯ File menu',
  'Keep',
  'Arrow beside Delete',
  'Keep anyway',
]

function safetyGuide() {
  if (windowsChecksums.length !== 2 || windowsChecksums.some(file => !/^[a-f0-9]{64}$/.test(file.sha256))) return ''
  return `<section class="shell versa-safety" id="windows-safety" aria-labelledby="safety-title">
    <div class="versa-safety-copy">
      <p class="kicker">${phrase(['Windows · Confirma primeiro', 'Windows · Verify first'])}</p>
      <h2 id="safety-title">${phrase(['Se o Edge mostrar um aviso', 'If Edge shows a warning'])}</h2>
      <p>${phrase(['Estes passos aplicam-se apenas ao aviso de reputação «isn’t commonly downloaded» no Microsoft Edge. Poucas transferências não significam que o ficheiro seja seguro. Não prossigas se o Edge ou o Windows indicar ficheiro perigoso, malware ou bloqueio por uma política da organização.', 'These steps apply only to the “isn’t commonly downloaded” reputation notice in Microsoft Edge. Low download reputation does not mean the file is safe. Do not continue if Edge or Windows reports a dangerous file, malware, or an organization policy block.'])}</p>
      <ol>
        <li>${phrase(['Confirma que o link desta página oficial abre a versão certa no GitHub do Versa. Verifica o domínio versa.danielpro.dev, a versão, o nome exacto do ficheiro e a existência do SHA-256 publicado abaixo. Depois, usa «Descarregar .exe» ou «Descarregar .msi» para Windows nesta página.', 'Confirm that the link from this official page leads to the right Versa release on GitHub. Check the versa.danielpro.dev domain, version, exact filename, and that a published SHA-256 is available below. Then use “Download .exe” or “Download .msi” for Windows on this page.'])}</li>
        <li>${phrase(['Na linha do ficheiro nas Transferências do Edge, abre «⋯» e escolhe «Keep». No painel seguinte, abre o menu junto a «Delete» e escolhe «Keep anyway». Isto só guarda o ficheiro. Não o abras ainda.', 'In the file row in Edge Downloads, open “⋯” and choose “Keep”. In the next panel, open the menu next to “Delete” and choose “Keep anyway”. This only saves the file. Do not open it yet.'])}</li>
        <li>${phrase(['Compara o SHA-256 com a referência oficial e, se houver assinatura digital, confirma que está válida e pertence ao editor esperado. Um hash igual confirma a integridade, não a segurança nem a identidade do editor. Se não conseguires verificar o ficheiro, não o executes. Não desactives as protecções.', 'Compare SHA-256 against the official reference. If a digital signature is present, confirm that it is valid and belongs to the expected publisher. A matching hash confirms file integrity, not safety or publisher identity. If you cannot verify the file, do not run it. Do not disable protections.'])}</li>
      </ol>
      <details>
        <summary>${phrase(['Comparar SHA-256 no PowerShell', 'Compare SHA-256 in PowerShell'])}</summary>
        <p>${phrase(['Abre o PowerShell na pasta do ficheiro e executa o comando correspondente. Compara todos os caracteres com o valor publicado.', 'Open PowerShell in the file’s folder and run the matching command. Compare every character against the published value.'])} <a href="${releaseFiles}/SHA256SUMS.txt">SHA256SUMS.txt</a></p>
        ${windowsChecksums.filter(file => /^[a-f0-9]{64}$/.test(file.sha256)).map(({filename, sha256}) => `<div class="versa-checksum"><strong>${filename}</strong><code>Get-FileHash -LiteralPath '.\\${filename}' -Algorithm SHA256</code><code>${sha256}</code></div>`).join('')}
      </details>
    </div>
    <figure class="versa-guide" lang="en"><div class="versa-guide-stage" aria-hidden="true"><small>MICROSOFT EDGE · ILLUSTRATION</small><strong>${exeName}</strong><p class="versa-guide-notice">If Edge says “isn’t commonly downloaded”:</p><div class="versa-guide-frames">${guideFrames.map((frame, i) => `<span data-frame="${i + 1}">${frame}</span>`).join('')}</div><b>Check the official SHA-256 before opening.</b></div><figcaption lang="${language === 'pt' ? 'pt-MZ' : 'en'}">${phrase(['Ilustração em inglês. Só para o aviso de reputação indicado, não para bloqueios de segurança.', 'Illustration. Only for the reputation notice shown, not for security blocks.'])}</figcaption><button type="button" data-safety-motion lang="${language === 'pt' ? 'pt-MZ' : 'en'}">${phrase(['Pausar animação', 'Pause animation'])}</button></figure>
  </section>`
}

let stopWatchingGuide = () => {}
let guideManuallyPaused = false

function watchGuide() {
  const guide = app.querySelector('.versa-guide')
  if (!guide) return
  const button = guide.querySelector('[data-safety-motion]')
  guide.classList.toggle('is-paused', guideManuallyPaused)
  if (guideManuallyPaused && button) button.textContent = phrase(['Retomar animação', 'Resume animation'])
  if (typeof IntersectionObserver === 'undefined') return
  let inView = false
  const update = () => guide.classList.toggle('in-view', inView && !document.hidden)
  const observer = new IntersectionObserver(([entry]) => {
    inView = entry.isIntersecting
    update()
  })
  observer.observe(guide.querySelector('.versa-guide-stage')!)
  document.addEventListener('visibilitychange', update)
  stopWatchingGuide = () => {
    observer.disconnect()
    document.removeEventListener('visibilitychange', update)
  }
}

function render() {
  stopWatchingGuide()
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
          <div><h1>${phrase(['Versa para Windows', 'Versa for Windows'])}</h1><p class="kicker">Windows 10/11 · x64 · v${version}</p></div>
        </div>
        <p>${phrase(['Arrasta um ficheiro no Explorador e toca em Shift, que a roda trata do resto.', 'Drag a file in File Explorer and tap Shift to open the wheel.'])}</p>
        <div class="release-actions">
          <a class="button" href="${releaseFiles}/${exeName}">${icon('down', 22)} ${phrase(['Descarregar .exe', 'Download .exe'])} · ${sizeInMB('exe', language)}</a>
          <a class="button button-secondary" href="${releaseFiles}/Versa-${version}-x64.msi">${phrase(['Descarregar .msi', 'Download .msi'])} · ${sizeInMB('msi', language)}</a>
        </div>
        <p class="release-formats">${phrase(['O .exe instala para o utilizador actual. O .msi serve para instalação gerida.', 'The .exe installs for the current user. The .msi is for managed installation.'])}</p>
      </div>
      ${safetyGuide()}
      <div class="shell release-other">
        <a href="${releaseFiles}/SHA256SUMS.txt">SHA-256</a>
        <a href="${releases}">${phrase(['Versões no GitHub', 'GitHub releases'])}</a>
      </div>
    </main>
  `
  watchGuide()
}

app.addEventListener('click', event => {
  const button = (event.target as Element).closest<HTMLButtonElement>('button')
  if (!button) return
  if ('safetyMotion' in button.dataset) {
    guideManuallyPaused = !guideManuallyPaused
    button.closest('figure')?.classList.toggle('is-paused', guideManuallyPaused)
    button.textContent = guideManuallyPaused ? phrase(['Retomar animação', 'Resume animation']) : phrase(['Pausar animação', 'Pause animation'])
    return
  }
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
