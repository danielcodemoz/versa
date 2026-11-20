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
