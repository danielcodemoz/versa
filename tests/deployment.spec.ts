import { expect, test } from '@playwright/test'
import { installerUrl } from '../src/release'

test('the published worker has JavaScript MIME and the example PDF converts', async ({ page }) => {
  const url = process.env.VERSA_DEPLOYMENT_URL
  test.skip(!url, 'Set VERSA_DEPLOYMENT_URL to test the published site.')
  const errors: string[] = []
  page.on('pageerror', error => errors.push(error.message))
  page.on('console', message => { if (message.type() === 'error') errors.push(message.text()) })
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.goto(url!)
  const workerPending = page.waitForEvent('worker', worker => /pdf\.worker\.min-.*\.js$/.test(worker.url()))
  await page.getByRole('button', { name: 'Experimentar com exemplo' }).click()
  const worker = await workerPending
  expect(new URL(worker.url()).origin).toBe(new URL(url!).origin)
  const response = await page.request.get(worker.url())
  expect(response.status()).toBe(200)
  expect(response.headers()['content-type']).toMatch(/^(?:application|text)\/javascript\b/i)
  await expect(page.locator('.wheel-status')).toHaveText('Ficheiros verificados')
  await page.locator('.wheel-buttons [data-slice=pdf]').click()
  await page.locator('.wheel-buttons [data-slice=pdf-text]').click()
  await expect(page.locator('.wheel-status')).toHaveText('Conversão concluída')
  const pending = page.waitForEvent('download')
  await page.getByRole('link', { name: 'Descarregar', exact: true }).click()
  expect((await pending).suggestedFilename()).toBe('ficha-de-exemplo (Versa).txt')
  expect(errors).toEqual([])
})

test('the published downloads page links to the released EXE', async ({ page }) => {
  const url = process.env.VERSA_DEPLOYMENT_URL
  test.skip(!url || !process.env.VERSA_EXPECT_INSTALLER, 'Download verification requires the published site.')
  test.setTimeout(240_000)
  const downloads = new URL('/windows.html', url).href
  await expect.poll(async () => {
    try {
      const response = await page.request.get(downloads, { timeout: 10_000 })
      return response.ok() && (await response.text()).includes('id="download-app"')
    } catch {
      return false
    }
  }, { timeout: 210_000, intervals: [2000, 6000, 12000, 20000] }).toBe(true)
  await page.goto(downloads)
  await expect(page.getByRole('link', { name: /^Descarregar \.exe/ })).toHaveAttribute('href', installerUrl)
})
