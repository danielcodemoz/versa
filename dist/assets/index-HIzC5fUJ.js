import{l as e,n as t,r as n,t as r}from"./logo-dark-CG_i06Qu.js";var i={$schema:`https://schema.tauri.app/config/2`,productName:`Versa`,version:`0.1.0`,identifier:`dev.danielpro.versa`,build:{devUrl:`http://127.0.0.1:5173`,frontendDist:`../../../dist`},app:{windows:[{label:`main`,title:`Versa`,url:`desktop.html?desktop=main`,width:690,height:720,minWidth:390,minHeight:480,visible:!1,dragDropEnabled:!0},{label:`gesture`,title:`Versa`,url:`desktop.html?desktop=gesture`,width:510,height:550,visible:!1,transparent:!0,decorations:!1,alwaysOnTop:!0,resizable:!1,shadow:!1,skipTaskbar:!0,focus:!1,dragDropEnabled:!0}],security:{capabilities:[`versa`]}},bundle:{active:!0,icon:[`icons/icon.png`,`icons/icon.ico`],targets:[`nsis`,`msi`],windows:{nsis:{installMode:`currentUser`}}}},a=document.querySelector(`#download-app`),o=localStorage.getItem(`versa-language`)===`en`?`en`:`pt`,s=localStorage.getItem(`versa-theme`)??(matchMedia(`(prefers-color-scheme: dark)`).matches?`dark`:`light`),c=t=>e(o,t),l=`https://github.com/danielcodemoz/versa/releases`;function u(){document.documentElement.lang=o===`pt`?`pt-MZ`:`en`,document.documentElement.dataset.theme=s,document.title=c([`Versa para Windows`,`Versa for Windows`]),document.querySelector(`meta[name="theme-color"]`)?.setAttribute(`content`,s===`dark`?`#172825`:`#f4efe3`),a.innerHTML=`
    <header class="masthead"><div class="shell masthead-inner">
      <a class="brand-link" href="/" aria-label="Versa"><img class="brand brand-light" src="${t}" alt="Versa"><img class="brand brand-dark" src="${r}" alt="Versa"></a>
      <div class="switches">
        <button class="switch language-switch" type="button" data-language aria-label="${c([`Mudar para inglês`,`Switch to Portuguese`])}">${o===`pt`?`EN`:`PT`}</button>
        <button class="switch theme-switch" type="button" data-theme aria-label="${c([`Mudar tema`,`Change theme`])}" aria-pressed="${s===`dark`}">${n(s===`dark`?`sun`:`moon`,19)}</button>
      </div>
    </div></header>
    <main class="hero download-hero">
      <div class="shell release-sheet">
        <a class="text-link release-back" href="/#roda">${n(`arrow`,16)} ${c([`Voltar à roda no browser`,`Back to the browser wheel`])}</a>
        <div class="release-heading">
          <span class="release-icon">${n(`windows`,39)}</span>
          <div><h1>${c([`Versa para Windows`,`Versa for Windows`])}</h1><p class="kicker">Windows 10/11 · x64 · v${i.version}</p></div>
        </div>
        <p>${c([`Arrasta um ficheiro no Explorador e toca em Shift, que a roda trata do resto.`,`Drag a file in File Explorer and tap Shift to open the wheel.`])}</p>
        <div class="release-actions">
          <a class="button" href="${l}">${n(`down`,22)} ${c([`Ver instaladores no GitHub`,`View installers on GitHub`])}</a>
        </div>
        <p class="release-formats">${c([`O .exe instala para o utilizador actual. O .msi serve para instalação gerida.`,`The .exe installs for the current user. The .msi is for managed installation.`])}</p>
      </div>
    </main>
  `}a.addEventListener(`click`,e=>{let t=e.target.closest(`button`);if(!t)return;let n=`language`in t.dataset?`language`:`theme`;n===`language`?(o=o===`pt`?`en`:`pt`,localStorage.setItem(`versa-language`,o)):(s=s===`dark`?`light`:`dark`,localStorage.setItem(`versa-theme`,s)),u(),a.querySelector(`[data-${n}]`)?.focus()}),u();