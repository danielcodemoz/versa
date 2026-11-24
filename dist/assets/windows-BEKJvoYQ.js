import{c as e,i as t,l as n,n as r,o as i,r as a,s as o,t as s,y as c}from"./logo-dark-DINnK-br.js";var l=document.querySelector(`#download-app`),u=localStorage.getItem(`versa-language`)===`en`?`en`:`pt`,d=localStorage.getItem(`versa-theme`)??(matchMedia(`(prefers-color-scheme: dark)`).matches?`dark`:`light`),f=e=>c(u,e),p={"Versa-Setup-0.1.5.exe":`1b25ecaf6c4cffe315b10ba93790ab5d1b2922b6ae81df891c9c1a307515736d`,"Versa-0.1.5-x64.msi":`54555e6a5f88a6bd523159546295b720b0391ad9d446e8ae65453beb08086f5e`},m=[t,`Versa-${n}-x64.msi`].flatMap(e=>p[e]?[{filename:e,sha256:p[e]}]:[]),h=[`Download for Windows`,`⋯ File menu`,`Keep`,`Arrow beside Delete`,`Keep anyway`];function g(){return m.length!==2||m.some(e=>!/^[a-f0-9]{64}$/.test(e.sha256))?``:`<section class="shell versa-safety" id="windows-safety" aria-labelledby="safety-title">
    <div class="versa-safety-copy">
      <p class="kicker">${f([`Windows · Confirma primeiro`,`Windows · Verify first`])}</p>
      <h2 id="safety-title">${f([`Se o Edge mostrar um aviso`,`If Edge shows a warning`])}</h2>
      <p>${f([`Estes passos aplicam-se apenas ao aviso de reputação «isn’t commonly downloaded» no Microsoft Edge. Poucas transferências não significam que o ficheiro seja seguro. Não prossigas se o Edge ou o Windows indicar ficheiro perigoso, malware ou bloqueio por uma política da organização.`,`These steps apply only to the “isn’t commonly downloaded” reputation notice in Microsoft Edge. Low download reputation does not mean the file is safe. Do not continue if Edge or Windows reports a dangerous file, malware, or an organization policy block.`])}</p>
      <ol>
        <li>${f([`Confirma que o link desta página oficial abre a versão certa no GitHub do Versa. Verifica o domínio versa.danielpro.dev, a versão, o nome exacto do ficheiro e a existência do SHA-256 publicado abaixo. Depois, usa «Descarregar .exe» ou «Descarregar .msi» para Windows nesta página.`,`Confirm that the link from this official page leads to the right Versa release on GitHub. Check the versa.danielpro.dev domain, version, exact filename, and that a published SHA-256 is available below. Then use “Download .exe” or “Download .msi” for Windows on this page.`])}</li>
        <li>${f([`Na linha do ficheiro nas Transferências do Edge, abre «⋯» e escolhe «Keep». No painel seguinte, abre o menu junto a «Delete» e escolhe «Keep anyway». Isto só guarda o ficheiro. Não o abras ainda.`,`In the file row in Edge Downloads, open “⋯” and choose “Keep”. In the next panel, open the menu next to “Delete” and choose “Keep anyway”. This only saves the file. Do not open it yet.`])}</li>
        <li>${f([`Compara o SHA-256 com a referência oficial e, se houver assinatura digital, confirma que está válida e pertence ao editor esperado. Um hash igual confirma a integridade, não a segurança nem a identidade do editor. Se não conseguires verificar o ficheiro, não o executes. Não desactives as protecções.`,`Compare SHA-256 against the official reference. If a digital signature is present, confirm that it is valid and belongs to the expected publisher. A matching hash confirms file integrity, not safety or publisher identity. If you cannot verify the file, do not run it. Do not disable protections.`])}</li>
      </ol>
      <details>
        <summary>${f([`Comparar SHA-256 no PowerShell`,`Compare SHA-256 in PowerShell`])}</summary>
        <p>${f([`Abre o PowerShell na pasta do ficheiro e executa o comando correspondente. Compara todos os caracteres com o valor publicado.`,`Open PowerShell in the file’s folder and run the matching command. Compare every character against the published value.`])} <a href="${i}/SHA256SUMS.txt">SHA256SUMS.txt</a></p>
        ${m.filter(e=>/^[a-f0-9]{64}$/.test(e.sha256)).map(({filename:e,sha256:t})=>`<div class="versa-checksum"><strong>${e}</strong><code>Get-FileHash -LiteralPath '.\\${e}' -Algorithm SHA256</code><code>${t}</code></div>`).join(``)}
      </details>
    </div>
    <figure class="versa-guide" lang="en"><div class="versa-guide-stage" aria-hidden="true"><small>MICROSOFT EDGE · ILLUSTRATION</small><strong>${t}</strong><p class="versa-guide-notice">If Edge says “isn’t commonly downloaded”:</p><div class="versa-guide-frames">${h.map((e,t)=>`<span data-frame="${t+1}">${e}</span>`).join(``)}</div><b>Check the official SHA-256 before opening.</b></div><figcaption lang="${u===`pt`?`pt-MZ`:`en`}">${f([`Ilustração em inglês. Só para o aviso de reputação indicado, não para bloqueios de segurança.`,`Illustration. Only for the reputation notice shown, not for security blocks.`])}</figcaption><button type="button" data-safety-motion lang="${u===`pt`?`pt-MZ`:`en`}">${f([`Pausar animação`,`Pause animation`])}</button></figure>
  </section>`}var _=()=>{},v=!1;function y(){let e=l.querySelector(`.versa-guide`);if(!e)return;let t=e.querySelector(`[data-safety-motion]`);if(e.classList.toggle(`is-paused`,v),v&&t&&(t.textContent=f([`Retomar animação`,`Resume animation`])),typeof IntersectionObserver>`u`)return;let n=!1,r=()=>e.classList.toggle(`in-view`,n&&!document.hidden),i=new IntersectionObserver(([e])=>{n=e.isIntersecting,r()});i.observe(e.querySelector(`.versa-guide-stage`)),document.addEventListener(`visibilitychange`,r),_=()=>{i.disconnect(),document.removeEventListener(`visibilitychange`,r)}}function b(){_(),document.documentElement.lang=u===`pt`?`pt-MZ`:`en`,document.documentElement.dataset.theme=d,document.title=f([`Versa para Windows`,`Versa for Windows`]),document.querySelector(`meta[name="theme-color"]`)?.setAttribute(`content`,d===`dark`?`#172825`:`#f4efe3`),l.innerHTML=`
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
      ${g()}
      <div class="shell release-other">
        <a href="${i}/SHA256SUMS.txt">SHA-256</a>
        <a href="${o}">${f([`Versões no GitHub`,`GitHub releases`])}</a>
      </div>
    </main>
  `,y()}l.addEventListener(`click`,e=>{let t=e.target.closest(`button`);if(!t)return;if(`safetyMotion`in t.dataset){v=!v,t.closest(`figure`)?.classList.toggle(`is-paused`,v),t.textContent=f(v?[`Retomar animação`,`Resume animation`]:[`Pausar animação`,`Pause animation`]);return}let n=`language`in t.dataset?`language`:`theme`;n===`language`?(u=u===`pt`?`en`:`pt`,localStorage.setItem(`versa-language`,u)):(d=d===`dark`?`light`:`dark`,localStorage.setItem(`versa-theme`,d)),b(),l.querySelector(`[data-${n}]`)?.focus()}),b();