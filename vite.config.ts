import { copyFileSync, cpSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { gzipSync } from 'node:zlib'
import { defineConfig } from 'vite'

export default defineConfig({
  build: {
    rollupOptions: {
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
      mkdirSync('dist/avif', { recursive: true })
      writeFileSync('dist/avif/encoder.wasm.gzip', gzipSync(readFileSync('node_modules/@jsquash/avif/codec/enc/avif_enc.wasm'), { level: 9 }))
      copyFileSync('node_modules/@jsquash/avif/LICENSE', 'dist/avif/LICENSE')
      mkdirSync('dist/pdfjs', { recursive: true })
      copyFileSync('node_modules/pdfjs-dist/LICENSE', 'dist/pdfjs/LICENSE')
      mkdirSync('dist/brand', { recursive: true })
      for (const name of ['favicon.svg', 'favicon.ico', 'og-image.png', 'logo-light.svg', 'logo-dark.svg']) {
        copyFileSync(`brand/${name}`, `dist/brand/${name}`)
      }
      for (const directory of ['cmaps', 'standard_fonts', 'wasm']) {
        cpSync(`node_modules/pdfjs-dist/${directory}`, `dist/pdfjs/${directory}`, { recursive: true })
      }
      if (existsSync('downloads')) {
        mkdirSync('dist/downloads', { recursive: true })
        copyFileSync('downloads/index.html', 'dist/downloads/index.html')
      }
    },
  }],
})
