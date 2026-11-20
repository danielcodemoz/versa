import { copyFileSync, existsSync, mkdirSync } from 'node:fs'
import { defineConfig } from 'vite'

export default defineConfig({
  plugins: [{
    name: 'versa-brand',
    closeBundle() {
      mkdirSync('dist/brand', { recursive: true })
      for (const name of ['favicon.svg', 'favicon.ico', 'og-image.png', 'logo-light.svg', 'logo-dark.svg']) {
        copyFileSync(`brand/${name}`, `dist/brand/${name}`)
      }
      if (existsSync('downloads')) {
        mkdirSync('dist/downloads', { recursive: true })
        copyFileSync('downloads/index.html', 'dist/downloads/index.html')
      }
    },
  }],
})
