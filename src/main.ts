import './style.css'
import { categories, recipes, t, type Category, type Language } from '../packages/engine/catalog'
import { copy, questions, windowsSteps } from './copy'
import { icon } from './icons'
import { mountWheel } from './wheel'
import { installerUrl } from './release'
import logoLight from '../brand/logo-light.svg'
import logoDark from '../brand/logo-dark.svg'

const app = document.querySelector<HTMLDivElement>('#app')!
const stored = (key: string) => {
  try { return localStorage.getItem(key) } catch { return null }
}
const persist = (key: string, value: string) => {
  try { localStorage.setItem(key, value) } catch { /* Private browsing. */ }
}
const desktop = new URLSearchParams(location.search).get('desktop')
const overlay = desktop === 'gesture'
let language: Language = stored('versa-language') === 'en' ? 'en' : 'pt'
let theme = stored('versa-theme') ?? (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light')
const local = (key: keyof typeof copy) => t(language, copy[key])
const label = (key: keyof typeof copy) => `<span data-copy="${key}">${local(key)}</span>`
const themeButton = () => `<button class="switch theme-switch" type="button" data-theme-switch aria-label="${local('theme')}"></button>`
const languageButton = () => `<button class="switch language-switch" type="button" data-language-switch aria-label="${local('language')}"></button>`
const logo = () => `<img class="brand brand-light" src="${logoLight}" width="118" height="42" alt="Versa"><img class="brand brand-dark" src="${logoDark}" width="118" height="42" alt="Versa">`
const spark = (className: string) => `<span aria-hidden="true" class="spark ${className}">${icon('spark', 28)}</span>`
const heading = (key: keyof typeof copy) => `<h2>${label(key)}</h2>`

app.innerHTML = `
  <a class="skip" href="#roda">${label('skip')}</a>
  <header class="masthead">
    <div class="shell masthead-inner">
      <a class="brand-link" href="#top" aria-label="Versa">${logo()}</a>
      <nav aria-label="Versa">
        <a href="#categorias">${label('categories')}</a>
        <a href="#escolas">${label('school')}</a>
        ${desktop === null ? `<a class="nav-editor" href="/editor.html">${label('editor')}</a>` : ''}
        <a href="#faq">${label('help')}</a>
      </nav>
      <div class="switches">${languageButton()}${themeButton()}</div>
    </div>
  </header>
  <main id="top">
    <section class="hero" aria-labelledby="hero-title">
      <div class="shell hero-grid">
        <div class="hero-copy">
          ${spark('hero-spark')}
          <h1 id="hero-title"><span class="title-line"><span data-copy="title1">${local('title1')}</span></span>
          <span class="title-line"><span data-copy="title2">${local('title2')}</span></span>
          <span class="title-line marker"><span data-copy="title3">${local('title3')}</span></span></h1>
          <p class="tagline" data-copy="tag">${local('tag')}</p>
          <p class="hero-description" data-copy="description">${local('description')}</p>
          <div class="hero-actions">
            <a class="button download" href="${installerUrl}">${icon('windows', 20)} ${label('download')}</a>
            <a class="text-link" href="#roda">${label('browser')} ${icon('down', 16)}</a>
          </div>
          <p class="download-info">${label('downloadInfo')} · <a href="/windows.html">${label('downloadOptions')}</a></p>
        </div>
        <section class="lab" id="roda" tabindex="-1" aria-labelledby="wheel-title">
          ${overlay ? `<button class="switch gesture-close" type="button" data-dismiss aria-label="${t(language, ['Fechar a roda', 'Close wheel'])}">${icon('close', 19)}</button>` : ''}
          <div class="lab-heading">
            <h2 id="wheel-title" data-copy="wheel">${local('wheel')}</h2>
            <span class="lab-tag"><i></i>${label('demo')}</span>
            <button class="quiet wheel-back" type="button" data-back hidden></button>
          </div>
          <div class="wheel-stage">
            <span class="wheel-note" data-note>${t(language, ['larga aqui!', 'drop it here!'])}</span>
            <svg class="note-arrow" viewBox="0 0 58 48" fill="none" aria-hidden="true"><path d="M3 3q44-5 42 38M34 34l12 10 9-15"/></svg>
            ${spark('wheel-spark')}
            <div class="wheel">
              <svg class="wheel-graphic" viewBox="0 0 440 440" aria-hidden="true"></svg>
              <div class="wheel-buttons"></div>
              <button class="wheel-centre" type="button"></button>
            </div>
          </div>
          <div class="wheel-controls">
            <input class="file-input" type="file" hidden multiple accept=".pdf,.docx,.xlsx,.pptx,.png,.jpg,.jpeg,.webp,.avif">
            <button class="button button-small pick" type="button" data-pick>${icon('upload', 17)} ${label('pick')}</button>
            <button class="quiet" type="button" data-example>${label('example')}</button>
          </div>
          <button class="quiet wheel-clear" type="button" data-clear hidden></button>
          <div class="wheel-settings" hidden></div>
          <div class="wheel-status" role="status"></div>
          <div class="wheel-suggest" role="region" aria-label="${local('suggestion')}" hidden></div>
          <div class="wheel-message" hidden></div>
        </section>
      </div>
      ${desktop ? '<section class="native-settings shell" hidden></section>' : ''}
      <div class="shell hero-bottom"><span>${icon('lock', 15)} ${label('bytes')}</span><a href="#categorias">${label('categories')} ${icon('down', 15)}</a></div>
    </section>
    <section class="band shell" id="categorias">
      ${heading('categoryTitle')}
      <p data-copy="categoryHint">${local('categoryHint')}</p>
      <div class="category-grid"></div>
    </section>
    <section class="windows-band" id="windows">
      <div class="band shell feature">
        <div>
          <p class="kicker" data-copy="windows">${local('windows')}</p>
          ${heading('windowsTitle')}
          <p data-copy="windowsInfo">${local('windowsInfo')}</p>
        </div>
        <div class="windows-demo">
          <div class="explorer" aria-hidden="true">
            <div class="explorer-bar"><i></i><i></i><i></i> <span>Versa / Escola</span></div>
            <div class="explorer-body">
              <div class="explorer-file">${icon('pdf', 31)} ficha.pdf</div>
              <div class="explorer-moving">${icon('file', 36)}</div>
              <kbd>Shift</kbd>
              <div class="explorer-wheel"></div>
              <div class="explorer-result">${icon('docs', 31)} ficha (Versa).docx</div>
            </div>
          </div>
          <ol class="windows-steps"></ol>
        </div>
      </div>
    </section>
    ${desktop === null ? `<section class="band shell feature editor-band" id="editor">
      <div><p class="kicker" data-copy="editor">${local('editor')}</p>${heading('editorTitle')}<p data-copy="editorInfo">${local('editorInfo')}</p>
      <a class="button" href="/editor.html">${icon('pdf', 20)} ${label('editorLink')}</a></div>
      <div class="lock-sticker" aria-hidden="true">${icon('pdf', 72)}</div>
    </section>` : ''}
    <section class="band shell feature privacy" id="privacidade">
      <div><div class="lock-sticker">${icon('lock', 72)}</div><p class="bytes" data-copy="bytes">${local('bytes')}</p></div>
      <div>${heading('privacy')}<p data-copy="privacyInfo">${local('privacyInfo')}</p></div>
    </section>
    <section class="school-band" id="escolas">
      <div class="band shell feature">
        <div><p class="kicker" data-copy="school">${local('school')}</p>${heading('schoolTitle')}<p data-copy="schoolInfo">${local('schoolInfo')}</p>
        <button class="button button-small" type="button" data-school>${label('schoolLink')} ${icon('arrow', 16)}</button></div>
        <ul class="school-list"></ul>
      </div>
    </section>
    <section class="band shell faq" id="faq">${heading('faq')}<div class="questions"></div></section>
  </main>
  <footer><div class="shell footer-inner"><a class="brand-link" href="#top" aria-label="Versa">${logo()}</a><p>${label('footer')} <a href="https://danielpro.dev">Daniel Marcos</a></p><div class="switches">${languageButton()}${themeButton()}</div></div></footer>
  <div class="drag-shade" aria-hidden="true"></div>`

const wheelRoot = app.querySelector<HTMLElement>('.lab')!
const wheel = mountWheel(wheelRoot, () => language)
const categoryGrid = app.querySelector('.category-grid')!
const windowsList = app.querySelector<HTMLOListElement>('.windows-steps')!
const schoolList = app.querySelector('.school-list')!
const faqList = app.querySelector('.questions')!
function openWheel(category: Category) {
  wheelRoot.scrollIntoView({ block: 'center', behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth' })
  wheel.openCategory(category)
}

function renderTheme() {
  document.documentElement.dataset.theme = theme
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', theme === 'dark' ? '#172825' : '#f4efe3')
  app.querySelectorAll<HTMLButtonElement>('[data-theme-switch]').forEach(button => {
    button.innerHTML = icon(theme === 'dark' ? 'sun' : 'moon', 19)
    button.setAttribute('aria-pressed', String(theme === 'dark'))
  })
}

const schoolFeatures = [
  ['Pôr cabeçalho e logótipo num PDF', 'Add a header and logo to a PDF'],
  ['Transformar fotos de fichas num PDF limpo', 'Turn worksheet photos into a clean PDF'],
  ['Imprimir duas fichas por folha A4', 'Print two worksheets on one A4 sheet'],
  ['Juntar os testes da turma num PDF', 'Merge class tests into one PDF'],
] as const
let step = 0
function renderLanguage() {
  document.documentElement.lang = language === 'pt' ? 'pt-MZ' : 'en'
  document.title = 'Versa — ' + local('tag')
  app.querySelectorAll<HTMLElement>('[data-copy]').forEach(element => { element.textContent = local(element.dataset.copy as keyof typeof copy) })
  app.querySelector<HTMLElement>('[data-note]')!.textContent = t(language, ['larga aqui!', 'drop it here!'])
  app.querySelectorAll<HTMLButtonElement>('[data-language-switch]').forEach(button => {
    button.textContent = language === 'pt' ? 'EN' : 'PT'
    button.setAttribute('aria-label', local('language'))
  })
  app.querySelectorAll('[data-theme-switch]').forEach(button => button.setAttribute('aria-label', local('theme')))
  categoryGrid.innerHTML = categories.map(category => `<button class="category-card" type="button" data-category="${category.id}" style="--card:${category.color};--card-ink:${category.ink}">
    <span class="card-rotator"><span class="card-face">${icon(category.id, 35)}<strong>${t(language, category.name)}</strong>${icon('arrow', 20)}</span>
    <span class="card-face card-back" aria-hidden="true">${recipes.filter(recipe => recipe.category === category.id).map(recipe => t(language, recipe.name)).join(' · ')}</span></span>
    <span class="sr-only">${t(language, ['Na roda', 'In the wheel'])}: ${recipes.filter(recipe => recipe.category === category.id).map(recipe => t(language, recipe.name)).join(', ')}</span>
  </button>`).join('')
  windowsList.innerHTML = windowsSteps.map((text, index) => `<li${step === index ? ' class="current"' : ''}>${t(language, text)}</li>`).join('')
  schoolList.innerHTML = schoolFeatures.map(item => `<li>${icon('check', 21)} ${t(language, item)}</li>`).join('')
  faqList.innerHTML = questions.map(([question, answer]) => `<details><summary>${t(language, question)}${icon('plus', 20)}</summary><div><p>${t(language, answer)}</p></div></details>`).join('')
  wheel.render()
}

app.addEventListener('click', event => {
  const button = (event.target as Element).closest<HTMLButtonElement>('button')
  if (!button) return
  if ('themeSwitch' in button.dataset) {
    theme = theme === 'dark' ? 'light' : 'dark'
    persist('versa-theme', theme)
    renderTheme()
  } else if ('languageSwitch' in button.dataset) {
    language = language === 'pt' ? 'en' : 'pt'
    persist('versa-language', language)
    renderLanguage()
  } else if (button.dataset.category) openWheel(button.dataset.category as Category)
  else if ('school' in button.dataset) openWheel('school')
})

const motion = matchMedia('(prefers-reduced-motion: reduce)')
const hero = app.querySelector<HTMLElement>('.hero')!
hero.addEventListener('pointermove', event => {
  if (motion.matches || event.pointerType === 'touch') return
  hero.style.setProperty('--mx', `${(event.clientX / innerWidth - .5) * 18}px`)
  hero.style.setProperty('--my', `${(event.clientY / innerHeight - .5) * 18}px`)
})
hero.addEventListener('pointerleave', () => {
  hero.style.removeProperty('--mx')
  hero.style.removeProperty('--my')
})
app.querySelectorAll<HTMLElement>('.hero-actions .button').forEach(button => {
  button.addEventListener('pointermove', event => {
    if (motion.matches || event.pointerType === 'touch') return
    const rect = button.getBoundingClientRect()
    button.style.translate = `${(event.clientX - rect.x - rect.width / 2) * .07}px ${(event.clientY - rect.y - rect.height / 2) * .1}px`
  })
  button.addEventListener('pointerleave', () => { button.style.translate = '' })
})
const explorer = app.querySelector<HTMLElement>('.explorer')!
function animateWindows() {
  if (!motion.matches && !document.hidden) step = (step + 1) % windowsSteps.length
  explorer.dataset.step = String(step)
  Array.from(windowsList.children).forEach((item, index) => item.classList.toggle('current', index === step))
}
if (!desktop) setInterval(animateWindows, 1800)
if (desktop !== null) {
  document.documentElement.classList.add('desktop')
  if (overlay) document.documentElement.classList.add('gesture')
  void import('./native').then(({ mountNative }) => mountNative(wheel, () => language, overlay)).catch(() => {
    if ('__TAURI_INTERNALS__' in window) wheel.report(t(language, ['A ligação com Windows falhou.', 'Could not connect to Windows.']))
  })
}
renderTheme()
renderLanguage()
animateWindows()
