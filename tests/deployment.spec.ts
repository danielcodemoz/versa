import { expect, test } from '@playwright/test'
import { installerUrl, releaseFiles, version } from '../src/release'

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

test('the published editor opens the example PDF with the worker and saves a copy', async ({ page }) => {
  const url = process.env.VERSA_DEPLOYMENT_URL
  test.skip(!url, 'Set VERSA_DEPLOYMENT_URL to test the published site.')
  const errors: string[] = []
  page.on('pageerror', error => errors.push(error.message))
  page.on('console', message => { if (message.type() === 'error') errors.push(message.text()) })
  await page.emulateMedia({ reducedMotion: 'reduce' })
  test.setTimeout(240_000)
  await expect(async () => {
    await page.goto(new URL('/editor.html', url).href, { waitUntil: 'domcontentloaded', timeout: 10_000 })
    await expect(page.locator('[data-document-name]')).toBeAttached({ timeout: 3000 })
  }).toPass({ timeout: 210_000, intervals: [2000, 6000, 12000, 20000] })
  errors.length = 0
  await page.getByRole('button', { name: 'Experimentar com exemplo' }).click()
  await expect(page.locator('[data-thumbs] img')).toHaveCount(1)
  const [worker, download] = await Promise.all([
    page.waitForEvent('worker', entry => /editor\.worker-.*\.js$/.test(entry.url())),
    page.waitForEvent('download'),
    page.getByRole('button', { name: 'Guardar PDF' }).click(),
  ])
  expect(new URL(worker.url()).origin).toBe(new URL(url!).origin)
  const response = await page.request.get(worker.url())
  expect(response.status()).toBe(200)
  expect(response.headers()['content-type']).toMatch(/^(?:application|text)\/javascript\b/i)
  expect(download.suggestedFilename()).toBe('ficha-de-exemplo.pdf')
  expect(errors).toEqual([])
})

test('the published editor unlocks an AES-256 PDF locally', async ({ page }) => {
  const url = process.env.VERSA_DEPLOYMENT_URL
  test.skip(!url, 'Set VERSA_DEPLOYMENT_URL to test the published site.')
  test.setTimeout(240_000)
  await expect(async () => {
    await page.goto(new URL('/editor.html', url).href, { waitUntil: 'domcontentloaded', timeout: 10_000 })
    await expect(page.locator('[data-document-name]')).toBeAttached({ timeout: 3000 })
  }).toPass({ timeout: 210_000, intervals: [2000, 6000, 12000, 20000] })
  await page.locator('input[data-open]').setInputFiles('tests/fixtures/editor-protected.pdf')
  const prompt = page.getByRole('dialog', { name: 'PDF protegido' })
  await prompt.getByLabel('Palavra-passe').fill('versa-teste-14')
  await prompt.getByRole('button', { name: 'Desbloquear' }).click()
  await expect(page.locator('[data-originals] button').first()).toHaveAttribute('aria-label', /Conteudo cifrado/)
  await expect(page.getByRole('status')).toContainText('sem palavra-passe')
})

test('the published site links to the current Windows release', async ({ page }) => {
  const url = process.env.VERSA_DEPLOYMENT_URL
  test.skip(!url || !process.env.VERSA_EXPECT_INSTALLER, 'Download verification requires the published site.')
  test.setTimeout(240_000)
  const downloads = new URL('/windows.html', url).href
  await expect(async () => {
    await page.goto(downloads, { waitUntil: 'domcontentloaded', timeout: 10_000 })
    await expect(page.getByRole('link', { name: /^Descarregar \.exe/ })).toHaveAttribute('href', installerUrl, { timeout: 3000 })
  }).toPass({ timeout: 210_000, intervals: [2000, 6000, 12000, 20000] })
  await expect(page.getByRole('link', { name: /^Descarregar \.msi/ })).toHaveAttribute('href', `${releaseFiles}/Versa-${version}-x64.msi`)
  await expect(page.getByRole('link', { name: 'SHA-256' })).toHaveAttribute('href', `${releaseFiles}/SHA256SUMS.txt`)
  await page.goto(url!)
  await expect(page.getByRole('link', { name: 'Descarregar para Windows' })).toHaveAttribute('href', installerUrl)
})
