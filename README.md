# Versa

O Versa é um conversor gratuito de ficheiros para o navegador e para Windows. Arrasta um ficheiro para a roda de conversão ou escolhe-o no teu dispositivo. O processamento é local e os ficheiros nunca saem do dispositivo.

[Usar o Versa em versa.danielpro.dev](https://versa.danielpro.dev)

## O que podes converter

| Categoria | Operações |
| --- | --- |
| PDF | Converter para Word, JPG ou texto. Juntar, dividir, comprimir e rodar PDFs. |
| Word e Excel | Converter DOCX e XLSX para PDF. Extrair texto e contar palavras em DOCX. |
| Imagens | Converter para PDF, JPG, PNG, WebP ou AVIF. Comprimir e redimensionar. |
| Apresentações | Converter PowerPoint (PPTX) para PDF ou imagens. |
| Escola | Acrescentar cabeçalho e logótipo, converter fotos de fichas em PDF, preparar duas fichas por folha A4 e juntar testes. |

O **editor de PDF** ([versa.danielpro.dev/editor.html](https://versa.danielpro.dev/editor.html)) acrescenta texto, desenho, imagens e assinatura, e reordena, roda e apaga páginas, tudo no browser. Largar um ficheiro em qualquer ponto da página inicial sugere logo a conversão certa (clique ou Enter).

A interface abre em português de Moçambique e inclui uma versão em inglês.

## Windows v0.1.0

Instaladores para Windows 10 e 11, x64. O EXE instala para o utilizador actual. O MSI destina-se a instalações geridas.

- [Instalador EXE](https://github.com/danielcodemoz/versa/releases/download/v0.1.0/Versa-Setup-0.1.0.exe)
- [Instalador MSI](https://github.com/danielcodemoz/versa/releases/download/v0.1.0/Versa-0.1.0-x64.msi)
- [Release v0.1.0 e somas SHA-256](https://github.com/danielcodemoz/versa/releases/tag/v0.1.0)

## Desenvolvimento

Com Node.js 24, executa `npm ci` e `npm run dev`. Para testar a compilação, executa `npm run build`, `npx playwright install chromium` e `npm test`.

O site e a app Tauri partilham o motor em `packages/engine`. As instruções para compilar a app estão no [README de Windows](apps/desktop/README.md).
