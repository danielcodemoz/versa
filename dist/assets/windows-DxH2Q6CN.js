import{c as e,i as t,l as n,n as r,o as i,r as a,s as o,t as s,y as c}from"./logo-dark-DlKG6rl7.js";var l=document.querySelector(`#download-app`),u=localStorage.getItem(`versa-language`)===`en`?`en`:`pt`,d=localStorage.getItem(`versa-theme`)??(matchMedia(`(prefers-color-scheme: dark)`).matches?`dark`:`light`),f=e=>c(u,e);function p(){document.documentElement.lang=u===`pt`?`pt-MZ`:`en`,document.documentElement.dataset.theme=d,document.title=f([`Versa para Windows`,`Versa for Windows`]),document.querySelector(`meta[name="theme-color"]`)?.setAttribute(`content`,d===`dark`?`#172825`:`#f4efe3`),l.innerHTML=`
    <header class="masthead"><div class="shell masthead-inner">
      <a class="brand-link" href="/" aria-label="Versa"><img class="brand brand-light" src="${r}" alt="Versa"><img class="brand brand-dark" src="${s}" alt="Versa"></a>
      <div class="switches">
        <button class="switch language-switch" type="button" data-language aria-label="${f([`Mudar para inglês`,`Switch to Portuguese`])}">${u===`pt`?`EN`:`PT`}</button>
        <button class="switch theme-switch" type="button" data-theme aria-label="${f([`Mudar tema`,`Change theme`])}" aria-pressed="${d===`dark`}">${a(d===`dark`?`sun`:`moon`,19)}</button>
      </div>
    </div></header>
    <main class="hero download-hero">
      <div class="shell release-sheet">
        <a class="text-link release-back" href="/#roda">${a(`arrow`,16)} ${f([`Voltar à roda no browser`,`Back to the browser wheel`])}</a>
        <div class="release-heading">
          <span class="release-icon">${a(`windows`,39)}</span>
          <div><h1>${f([`Versa para Windows`,`Versa for Windows`])}</h1><p class="kicker">Windows 10/11 · x64 · v${n}</p></div>
        </div>
        <p>${f([`Arrasta um ficheiro no Explorador e toca em Shift, que a roda trata do resto.`,`Drag a file in File Explorer and tap Shift to open the wheel.`])}</p>
        <div class="release-actions">
          <a class="button" href="${i}/${t}">${a(`down`,22)} ${f([`Descarregar .exe`,`Download .exe`])} · ${e(`exe`,u)}</a>
          <a class="button button-secondary" href="${i}/Versa-${n}-x64.msi">${f([`Descarregar .msi`,`Download .msi`])} · ${e(`msi`,u)}</a>
        </div>
        <p class="release-formats">${f([`O .exe instala para o utilizador actual. O .msi serve para instalação gerida.`,`The .exe installs for the current user. The .msi is for managed installation.`])}</p>
      </div>
      <div class="shell release-other">
        <a href="${i}/SHA256SUMS.txt">SHA-256</a>
        <a href="${o}">${f([`Versões no GitHub`,`GitHub releases`])}</a>
      </div>
    </main>
  `}l.addEventListener(`click`,e=>{let t=e.target.closest(`button`);if(!t)return;let n=`language`in t.dataset?`language`:`theme`;n===`language`?(u=u===`pt`?`en`:`pt`,localStorage.setItem(`versa-language`,u)):(d=d===`dark`?`light`:`dark`,localStorage.setItem(`versa-theme`,d)),p(),l.querySelector(`[data-${n}]`)?.focus()}),p();