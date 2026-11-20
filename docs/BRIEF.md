VERSA — conversor de documentos grátis, local e irreverente. Repo: danielcodemoz/versa (site publica em https://versa.danielpro.dev a cada merge). Lê HANDOFF.md e AGENTS.md primeiro. Trabalha só em branches codex/..., abre PR para main (auto-merge activo). Nunca commits segredos nem binários pesados (o .exe vai para /downloads via release/servidor, não para o git).

== 1. CONCEITO ==
Versa transforma documentos com um gesto. Público: estudantes, professores e escolas lusófonas (PT primeiro, EN depois). Tudo corre no dispositivo: o ficheiro NUNCA sai do PC/browser (sem upload, sem servidor de conversão). Grátis, sem conta, sem anúncios. Inspiração técnica: Crow Docs (site como motor + app Windows com roda radial ao arrastar + Shift), mas com identidade própria, muito mais viva e académica.

== 2. IDENTIDADE VISUAL — ESCOLHIDA: "CADERNO REBELDE" (já está em /brand/caderno-rebelde no repo) ==
Usa /brand/caderno-rebelde/board.png como referência visual obrigatória e README.md lá dentro (paleta, tipos, ícones). Estética: caderno escolar atrevido — papel quadriculado e pautado, marcador amarelo, caneta vermelha e azul, cartões tipo autocolante com sombra dura (offset sem blur), rabiscos à mão, setas desenhadas, fita-cola nos cantos.
- Logo: "V" desenhado a marcador sobre ponto amarelo de marcador, com seta vermelha de volta; wordmark "Versa" em Bricolage Grotesque com sublinhado-rabisco vermelho. CONVERTER o texto do wordmark em contornos (paths) nos SVG finais. Gerar favicon, .ico 256 e og-image 1200x630.
- Categorias e cores: PDF #E8432E, Word/Docs #2B50E8, Imagem #1FA35C, Apresentações #FF8A00, Escola #FFD60A (+ Utilitários se precisares, escolhe tom coerente).
- Tipos: Bricolage Grotesque (títulos), DM Sans (texto), DM Mono (detalhes), Caveat Brush (anotações à mão). Self-host.
- Tagline: "Larga o ficheiro. Ganha o recreio." / "Drop the file. Win recess."
- A roda segue o mesmo estilo: fatias como autocolantes de cor com contorno a caneta, a fatia activa levanta-se com sombra dura maior e um rabisco de marcador à volta; o centro parece uma etiqueta de caderno. Modo escuro = "quadro de ardósia" (fundo verde-escuro/grafite, giz e néon de marcador).
- Animações com carácter: elementos entram como se fossem colados (rotação ligeira + assentar), rabiscos desenham-se (stroke-dashoffset), setas a mão ligam passos. Sem bounce exagerado.

== 3. WEBSITE (versa.danielpro.dev) — tem de ser MUITO dinâmico ==
Stack: Vite + TypeScript (sem framework pesado; ou Svelte se preferires), build estático em /dist servido pelo fluxo do template.
Estrutura:
a) Hero em ecrã inteiro: fundo papel quadriculado com rabiscos, autocolantes e marcas de marcador que reagem ao rato (parallax leve). Título que escreve palavras a deslizar para cima uma a uma: "Arrasta. Escolhe. Versa." Sub: "Converte PDFs, Word, imagens e slides no teu próprio computador. Grátis. Sem enviar nada para lado nenhum." Dois botões: [Descarregar para Windows] (primário, com ícone Windows, versão e tamanho do ficheiro, aponta para /downloads/Versa-Setup-x.y.z.exe) e [Converter já no browser] (scroll suave até à roda).
b) A RODA (componente central, igual em espírito à imagem de referência): roda radial com fatias por CATEGORIA (PDF, Word, Imagem, Apresentações, Escola, Utilitários). Comportamento:
   - Em repouso, a roda "respira" (escala 1.0↔1.02, brilho dos anéis néon a pulsar lentamente) e as fatias têm o contorno exterior na cor da categoria.
   - Quando o utilizador começa a arrastar um ficheiro para a janela, a página escurece, a roda cresce com spring animation e mostra SÓ as fatias que servem esse tipo de ficheiro (detecção por extensão+magic bytes); as que não servem ficam esbatidas com cadeado e tooltip do motivo.
   - Ao passar o ficheiro por cima de uma fatia: a fatia acende (preenchimento em gradiente da cor, levanta 6px, sombra glow), o centro da roda mostra o nome da acção e "PDF → Word" e um mini-preview do ícone de destino. Som opcional muito discreto (desligado por omissão).
   - Clicar numa categoria abre uma segunda roda (sub-anel) com as acções dessa categoria (ex.: PDF → Word, JPG, Texto, Juntar, Dividir, Comprimir, Girar). Transição: o anel exterior expande e roda 30° enquanto as novas fatias entram em cascata.
   - Largar o ficheiro: a fatia "engole" o ficheiro (animação do ícone a ser sugado para o centro), o centro vira um anel de progresso com percentagem real, depois explode em confetti mínimo da cor da categoria e aparece o cartão do resultado com [Descarregar], [Converter outro], tamanho antes/depois.
   - Erros prevenidos ANTES de largar: ficheiro vazio, corrompido, com senha (pedir senha num campo inline), tipo não suportado, demasiado grande para o dispositivo. A roda abre "trancada" com o motivo e o que fazer. Nunca uma mensagem de erro depois de largar se for evitável.
   - Funciona com teclado (Tab entre fatias, Enter escolhe, Esc fecha) e no telemóvel (tocar para escolher ficheiro, roda adapta-se a 390px, fatias grandes para o dedo). prefers-reduced-motion desliga animações grandes.
   - Vários ficheiros de uma vez: o centro mostra "3 ficheiros", e acções como Juntar PDFs ficam em destaque.
c) Secção "Categorias": cartões grandes por categoria que, ao passar o rato, viram (flip 3D) e mostram as conversões disponíveis; clicar leva a roda para essa categoria.
d) Secção "Como funciona na app Windows": vídeo/animação em loop (CSS/Lottie ou canvas) a mostrar: ficheiro no Explorador → arrastar → toque no Shift → roda aparece à volta do cursor → largar → ficheiro novo aparece ao lado do original. Com legenda passo a passo sincronizada.
e) Secção "Privado de verdade": animação de um cadeado + "0 bytes enviados". Explica que tudo corre localmente (WebAssembly/JS).
f) Secção "Para escolas": acções da categoria Escola (pôr cabeçalho/logótipo da escola num PDF, fotos de fichas → PDF limpo e direito, 2 fichas por A4 para imprimir, juntar testes da turma num só PDF).
g) FAQ em acordeão animado, rodapé com "Feito em Moçambique por Daniel Marcos" (link danielpro.dev), toggle PT/EN e claro/escuro.
Micro-interacções em todo o lado: botões com magnetismo leve, cursor personalizado opcional que vira ícone de ficheiro ao arrastar, scroll reveal com palavras a deslizar para cima (sem bounce), contadores animados. Performance: Lighthouse ≥ 90, nada de bibliotecas gigantes no carregamento inicial (o motor de conversão carrega lazy só quando é usado).

== 4. MOTOR DE CONVERSÃO (packages/engine, TypeScript, partilhado site+app) ==
Usar o melhor que for grátis e open-source, a correr no cliente:
- PDF: pdf-lib (juntar, dividir, rodar, cabeçalho/logótipo, 2-por-A4), pdf.js (render para JPG/PNG, extrair texto), compressão por re-render de imagens com qualidade ajustável; detecção de PDF com senha.
- PDF → Word (.docx): extração de texto+estrutura via pdf.js e geração com a lib docx; manter parágrafos, títulos e imagens quando possível.
- Word/Excel/PowerPoint → PDF: no browser usar a melhor opção viável (ex.: render docx-preview/SheetJS para PDF); na app Windows, se o Office/LibreOffice existir, usar esse para fidelidade máxima e cair para o motor JS se não existir.
- Imagem: conversões JPG/PNG/WebP/AVIF via canvas/WASM (ex.: squoosh codecs), imagem(s) → PDF, compressão, redimensionar.
- Escola: fotos de fichas → PDF limpo (detecção de bordas e correcção de perspectiva, ex.: OpenCV.js/jscanify, carregado lazy), cabeçalho da escola, 2 por A4.
- Cada acção = uma "receita" registada num catálogo (id, categoria, tipos de entrada, saída, cor, ícone, função). Adicionar acção nova = 1 entrada no catálogo.
- Testes unitários para cada receita com ficheiros de exemplo pequenos.

== 5. APP WINDOWS (apps/desktop, Tauri 2 + WebView2) ==
- Fica no tabuleiro do sistema (ícone Versa perto do relógio), arranca com o Windows (opção), consumo mínimo em repouso.
- GESTO: o utilizador arrasta um ficheiro do Explorador/Ambiente de Trabalho e toca no Shift → aparece a roda transparente à volta do cursor (janela sempre por cima, sem moldura, fundo translúcido com blur). Detecção por polling GetAsyncKeyState (sem hook de teclado global), confirmar arrasto pelo DragEnter (CF_HDROP). Shift já premido no clique não conta.
- A roda é a MESMA do site (mesmos componentes), com as mesmas animações; largar numa fatia converte e grava o resultado ao lado do original (nome "documento (Versa).docx"), nunca move/altera o original (drop effect sempre copiar). No Ambiente de Trabalho, o resultado aparece perto do original.
- Notificação discreta "Feito" com botão Abrir/Mostrar na pasta.
- Janela principal opcional (abrir pelo ícone): a mesma roda grande + histórico das últimas conversões + definições (idioma, tema, iniciar com Windows, pasta de saída, som).
- Nunca correr como administrador. Reiniciar o motor WebView a cada 40 conversões ou >1 GB para libertar memória.
- Build: GitHub Actions windows-latest a gerar Versa-Setup-x.y.z.exe (NSIS) e .msi; artefacto pronto para pôr em /downloads. (Atenção: as Actions desta conta podem estar bloqueadas por faturação; se estiverem, deixa o workflow pronto e documenta como fazer o build localmente em Windows.)

== 6. ENTREGA E QUALIDADE ==
- PRs pequenos e por fases: (1) brand + site estático com hero e roda animada (sem conversão real) — para o Daniel ver o design cedo; (2) motor + conversões PDF/Imagem no site; (3) Word/Excel/PPT + Escola; (4) app Tauri; (5) workflow de build do .exe e página de download.
- Cada PR: screenshots/GIF desktop e 390px, claro e escuro; testes a passar; sem erros na consola.
- Acessibilidade: contraste AA, labels ARIA na roda, foco visível.
- Escreve no AGENTS.md/HANDOFF.md o que foi feito e o que falta.
