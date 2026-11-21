# Versa — handoff para o Codex (Dots)

Produto novo. Trabalha **apenas em ramos `codex/...`** e abre o PR para `main`. Não faças push directo para `main`, não faças force push, e não mexas noutros repositórios. O subdomínio já está definido em `danielpro-site.json` (`versa` → https://versa.danielpro.dev). **Não o mudes.**

Brief completo: docs/BRIEF.md; identidade escolhida: brand/caderno-rebelde

## O que é

**Versa** é um conversor de documentos **grátis e só local**: os ficheiros nunca saem do dispositivo. Público: escolas, professores e estudantes. Língua por defeito: português de Moçambique, com inglês (EN).

## Categorias de conversão

- **PDF:** para Word, para JPG, para texto; juntar, dividir, comprimir, rodar.
- **Office:** Word, Excel e PowerPoint para PDF.
- **Imagem:** para PDF, JPG, PNG, WebP; comprimir.
- **Apresentações:** PPTX para PDF ou imagens.
- **Escola:** pôr cabeçalho e logótipo da escola num PDF; transformar fotos de fichas num PDF limpo; preparar impressão de duas fichas por folha A4.

## Website (versa.danielpro.dev)

Design único e irreverente. Roda radial de conversão (fundo escuro, cores de neon por fatia): arrasta o ficheiro para a fatia certa e converte no próprio browser. Botão grande **«Descarregar para Windows»**.

## App de Windows

**Tauri 2** (WebView2), a reutilizar o **mesmo motor TypeScript** do site. Ícone junto ao relógio. Arrastar um ficheiro no Explorador e tocar no **Shift** abre a roda à volta do cursor. O resultado grava-se ao lado do original; o original nunca é movido nem alterado. Instalador/MSIX fica para mais tarde.

## Motor

Um único pacote TypeScript (pdf-lib, pdf.js e similares), partilhado pelo site e pela app. Sem PHP, sem servidor, sem base de dados.

## Publicação

Site estático (HTML/CSS/JS); `index.html` na raiz **ou** `dist/index.html`. Não commits `.exe`, `.zip`, `.msi` nem ficheiros grandes — o instalador liga-se a uma Release pública ou URL externo. Segue o `AGENTS.md`.

## Progresso por fase

- **Fase 1** entrega identidade Caderno Rebelde e site Vite estático com demonstração da roda. Inclui selecção de ficheiros, arrasto, teclado, PT-MZ/EN, temas, movimento reduzido e fotos de referência em `docs/screenshots/fase-1`.
- Ao arrastar do sistema, o browser só disponibiliza os bytes na primeira largada. A roda pré-selecciona a categoria a partir dos tipos expostos e valida os ficheiros antes de activar a acção. A versão de demonstração produz um resumo de texto e pede uma cópia desbloqueada de ficheiros protegidos.
- A Fase 2 introduz o motor PDF/imagem. Seguem-se Office/Escola, a app Tauri e a publicação do instalador.
- **Fase 2** partilha o motor TypeScript em `packages/engine` e activa conversões reais PDF/imagem no browser. O motor só carrega quando se verifica ou converte um ficheiro. Inclui validação da palavra-passe de PDF, compressão, rotação e redimensionamento configuráveis e saídas ZIP quando a acção gera vários ficheiros.
- O PDF → Word recria texto e títulos simples. Páginas com imagens mantêm o aspecto através de rasterização. A edição de PDFs protegidos reconstrói páginas a partir do conteúdo renderizado após a validação da palavra-passe.
- **Fase 3** activa Word, Excel, PowerPoint e Escola. O browser usa a pré-visualização DOCX com paginação, uma grelha de valores para Excel e renderização de texto, formas básicas e imagens para PowerPoint. Os PDFs destas receitas usam páginas rasterizadas. O modo nativo de maior fidelidade fica na fase Windows.
- Em Escola, usa as opções de saída para configurar o nome e o logótipo. A digitalização tenta endireitar os contornos do papel e realça o texto. Se a margem tiver pouco contraste, mantém o enquadramento da foto.
- **Ajustes após a publicação** actualizam pdf.js para 6.5, endurecem a CSP e mantêm o worker com MIME JavaScript no nginx. Excel gera PDFs de texto seleccionável e calcula fórmulas comuns sem valores guardados. Fórmulas não suportadas aparecem como um travessão quando não existe valor em cache.
- O cabeçalho Escola cabe em A4, o botão do logótipo acompanha PT/EN e os ficheiros descarregados terminam em `(Versa)` antes da extensão.
- **Fase 4** liga a roda e o motor ao Tauri 2 para Windows. Inclui gesto Shift no Explorador, gravação local com nomes únicos, notificações, tabuleiro, histórico e definições. Vê `apps/desktop/README.md` para arrancar e verificar o gesto. A Fase 5 acrescenta os instaladores NSIS e MSI e a página de download.
- **Fase 5** activa instaladores NSIS/MSI e adiciona a página estática de download. O GitHub Actions compila em Windows x64 e cria a Release da tag com os instaladores e SHA-256. O NSIS instala para o utilizador actual. A Release v0.1.0 inclui o EXE, o MSI e os SHA-256. O botão principal aponta directamente para o EXE versionado da Release pública. O README da app descreve o build local.
- **Arrasto na versão 0.1.2**. Largar na roda inicial abre automaticamente a categoria quando todos os ficheiros pertencem à mesma, mesmo com formatos diferentes, como JPG com PNG ou DOCX com ODT. A extensão tem prioridade sobre o MIME disponível. Ficheiros de categorias diferentes ou desconhecidos seguem o percurso de sugestão existente. A regra é comum ao browser e à app Tauri com arrasto nativo do Explorador. Formatos que o motor ainda não converte abrem a categoria com as acções incompatíveis indisponíveis.
- **Editor de PDF e arrastar-e-converter** (`editor.html`, `src/editor.ts`): editor 100% local com pdf.js (vista) e pdf-lib (gravação). Texto, desenho, realçar, imagem e assinatura (desenhada ou escrita), rodar, apagar e reordenar páginas (arrastar miniaturas ou botões), desfazer e gravar cópia `nome (Versa).pdf`. As notas vivem na «moldura» da página (com o `/Rotate` original) e `src/editor-geometry.ts` mapeia-as para o PDF; está coberto por testes. PDFs protegidos pedem uma cópia sem senha. Largar um ficheiro em qualquer ponto da home mostra agora uma **sugestão** (`suggest()` em `packages/engine/catalog.ts`): botão primário ou Enter converte; PDFs também têm «Editar este PDF» (passa o ficheiro por IndexedDB, apagado ao abrir). A sugestão aparece também na app Windows (mesma roda), sem o botão de editar. Testes em `tests/editor.spec.ts` e `tests/suggest.spec.ts`.
