import { expect, test } from '@playwright/test'
import { exeName, installerPath, releaseFiles } from '../src/release'

test('the published worker has JavaScript MIME and the example PDF converts', async ({ page }) => {
  const url = process.env.VERSA_DEPLOYMENT_URL
  test.skip(!url, 'Set VERSA_DEPLOYMENT_URL to test the published site.')
  const errors: string[] = []
  page.on('pageerror', error => errors.push(error.message))
  page.on('console', message => { if (message.type() === 'error') errors.push(message.text()) })
  await page.emulateMedia({ reducedMotion: 'reduce' })
  if (process.env.VERSA_EXPECT_INSTALLER) {
    test.setTimeout(330_000)
    await expect.poll(async () => {
      try {
        const response = await page.request.get(new URL(installerPath, url).href, { timeout: 10_000 })
        return response.ok() && (await response.text()).includes(`${releaseFiles}/${exeName}`)
      } catch {
        return false
      }
    }, { timeout: 285_000, intervals: [2000, 6000, 15000, 30000] }).toBe(true)
  }
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
