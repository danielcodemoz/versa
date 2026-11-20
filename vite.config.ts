import { copyFileSync, cpSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { gzipSync } from 'node:zlib'
import { defineConfig } from 'vite'
import release from './downloads/windows-release.json'

export default defineConfig({
  build: {
    rollupOptions: {
      input: ["index.html", "desktop.html", "downloads/index.html"],
      output: {
        // Static hosts (nginx default mime.types) serve .mjs as application/octet-stream,
        // which browsers refuse for module workers. Emit .mjs assets (pdf.js worker) as .js.
        assetFileNames: asset => (asset.names?.[0] ?? asset.name ?? '').endsWith('.mjs') ? 'assets/[name]-[hash].js' : 'assets/[name]-[hash][extname]',
      },
    },
  },
  plugins: [{
    name: 'versa-brand',
    enforce: 'pre',
    transform(code, id) {
      if (id.endsWith('/codec/enc/avif_enc.js')) {
        return code.replace('new URL("avif_enc.wasm",import.meta.url).href', '"avif_enc.wasm"')
      }
    },
    closeBundle() {
      const exe = `Versa-Setup-${release.version}.exe`
      const url = `https://github.com/danielcodemoz/versa/releases/download/v${release.version}/${exe}`
      mkdirSync(`dist/downloads/${exe}`, { recursive: true })
      writeFileSync(`dist/downloads/${exe}/index.html`, `<!doctype html>
<html lang="pt-MZ"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; base-uri 'none'; form-action 'none'">
<meta http-equiv="refresh" content="0;url=${url}">
<title>Descarregar Versa</title></head>
<body><a href="${url}">Descarregar ${exe} / Download ${exe}</a><p><a href="/downloads/">Outros instaladores / Other installers</a></p></body></html>
`)

      mkdirSync('dist/avif', { recursive: true })
      writeFileSync('dist/avif/encoder.wasm.gzip', gzipSync(readFileSync('node_modules/@jsquash/avif/codec/enc/avif_enc.wasm'), { level: 9 }))
      copyFileSync('node_modules/@jsquash/avif/LICENSE', 'dist/avif/LICENSE')
      mkdirSync('dist/pdfjs', { recursive: true })
      copyFileSync('node_modules/pdfjs-dist/LICENSE', 'dist/pdfjs/LICENSE')
      mkdirSync('dist/brand', { recursive: true })
      for (const name of ['favicon.svg', 'favicon.ico', 'og-image.png', 'logo-light.svg', 'logo-dark.svg']) {
        copyFileSync(`brand/${name}`, `dist/brand/${name}`)
      }
      for (const directory of ['cmaps', 'iccs', 'standard_fonts', 'wasm']) {
        cpSync(`node_modules/pdfjs-dist/${directory}`, `dist/pdfjs/${directory}`, {
          recursive: true,
          filter: source => !source.includes('quickjs-eval.'),
        })
      }
    },
  }],
})
