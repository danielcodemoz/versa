import { defineConfig } from '@playwright/test'

const port = process.env.VERSA_TEST_PORT ?? '4173'
const url = `http://127.0.0.1:${port}`

export default defineConfig({
  testDir: 'tests',
  use: {
    baseURL: url,
    launchOptions: { executablePath: process.env.CHROMIUM_PATH },
  },
  webServer: { command: `npm run preview -- --host 127.0.0.1 --port ${port} --strictPort`, url, reuseExistingServer: true },
})
