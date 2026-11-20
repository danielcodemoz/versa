import { expect, test } from '@playwright/test'
import { PDFDocument } from 'pdf-lib'
import { unzipSync } from 'fflate'
import { readFile } from 'node:fs/promises'
import { samplePdf } from '../src/sample'

const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAIAAAD91JpzAAAAFklEQVR4nGP8z8DAwMDAxMDAwMDAAAANHQEDasKb6QAAAABJRU5ErkJggg==', 'base64')

const cases = [
  ['pdf-word', 'docx'], ['pdf-jpg', 'jpg'], ['pdf-text', 'txt'], ['pdf-merge', 'pdf'],
  ['pdf-split', 'zip'], ['pdf-rotate', 'pdf'], ['pdf-compress', 'pdf'],
  ['image-jpg', 'jpg'], ['image-pdf', 'pdf'], ['image-png', 'png'],
  ['image-webp', 'webp'], ['image-avif', 'avif'], ['image-compress', 'jpg'], ['image-resize', 'png'],
] as const

for (const [id, extension] of cases) {
  test(`converts ${id} to a valid ${extension} in Chromium`, async ({ page }) => {
    const errors: string[] = []
    page.on('pageerror', error => errors.push(error.message))
    page.on('console', message => { if (message.type() === 'error') errors.push(message.text()) })
    await page.emulateMedia({ reducedMotion: 'reduce' })
    await page.goto('/')
    const image = id.startsWith('image-')
    const pdf = Buffer.from(await samplePdf().arrayBuffer())
    const file = image ? { name: 'photo.png', mimeType: 'image/png', buffer: png } : { name: 'sample.pdf', mimeType: 'application/pdf', buffer: pdf }
    await page.locator('input[type=file]').setInputFiles(id === 'pdf-merge' ? [file, { ...file, name: 'second.pdf' }] : file)
    await expect(page.getByRole('status')).toHaveText('Ficheiros verificados')
    const category = id === 'image-compress' || id === 'image-resize' ? 'tools' : image ? 'image' : 'pdf'
    await page.locator(`.wheel-buttons [data-slice=${category}]`).click()
    await page.locator(`.wheel-buttons [data-slice=${id}]`).click()
    await expect(page.getByRole('status')).toHaveText('Conversão concluída', { timeout: 15000 })
    const downloadPending = page.waitForEvent('download')
    await page.getByRole('link', { name: 'Descarregar', exact: true }).click()
    const download = await downloadPending
    expect(download.suggestedFilename()).toMatch(new RegExp(` \\(Versa\\)\\.${extension}$`))
    const bytes = await readFile((await download.path())!)
    expect(bytes.length).toBeGreaterThan(10)
    if (extension === 'txt') expect(bytes.toString()).toContain('Versa - Ficha de exemplo')
    if (extension === 'docx') expect(Object.keys(unzipSync(bytes))).toContain('word/document.xml')
    if (extension === 'zip') expect(Object.keys(unzipSync(bytes))).toEqual(['sample-1.pdf'])
    if (extension === 'pdf') {
      const result = await PDFDocument.load(bytes)
      expect(result.getPageCount()).toBe(id === 'pdf-merge' ? 2 : 1)
      if (id === 'pdf-rotate') expect(result.getPage(0).getRotation().angle).toBe(90)
      if (id === 'pdf-compress') expect(bytes.length).toBeLessThanOrEqual(pdf.length)
    }
    if (extension === 'jpg') expect([...bytes.subarray(0, 3)]).toEqual([255, 216, 255])
    if (extension === 'png') expect(bytes.subarray(1, 4).toString()).toBe('PNG')
    if (extension === 'webp') expect(bytes.subarray(8, 12).toString()).toBe('WEBP')
    if (extension === 'avif') expect(bytes.subarray(4, 12).toString()).toBe('ftypavif')
    expect(errors).toEqual([])
  })
}

test('a protected PDF asks for its password and blocks actions until it is correct', async ({ page }) => {
  await page.goto('/')
  await page.locator('input[type=file]').setInputFiles('tests/fixtures/protected.pdf')
  await expect(page.getByRole('status').first()).toContainText('Ficheiro protegido')
  await expect(page.locator('.wheel-buttons button:not([aria-disabled])')).toHaveCount(0)
  await page.getByLabel('Senha do ficheiro').fill('wrong')
  await page.getByRole('button', { name: 'Verificar senha' }).click()
  await expect(page.getByRole('status').first()).toContainText('Senha incorrecta')
  await page.getByLabel('Senha do ficheiro').fill('versa-demo')
  await page.getByRole('button', { name: 'Verificar senha' }).click()
  await expect(page.getByRole('status')).toHaveText('Ficheiros verificados')
  await expect(page.locator('.wheel-buttons [data-slice=pdf]')).not.toHaveAttribute('aria-disabled')
})

test('dropping a valid PDF on an action produces a real result', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.goto('/')
  await page.locator('.wheel-buttons [data-slice=pdf]').click()
  const bytes = Array.from(new Uint8Array(await samplePdf().arrayBuffer()))
  const dataTransfer = await page.evaluateHandle(bytes => {
    const data = new DataTransfer()
    data.items.add(new File([new Uint8Array(bytes)], 'ficha.pdf', { type: 'application/pdf' }))
    return data
  }, bytes)
  const target = page.locator('[data-hit=pdf-text]')
  await target.dispatchEvent('dragenter', { dataTransfer })
  await target.dispatchEvent('dragover', { dataTransfer })
  await target.dispatchEvent('drop', { dataTransfer })
  await expect(page.getByRole('status')).toHaveText('Conversão concluída')
  await expect(page.locator('.wheel-message')).toContainText('ficha (Versa).txt')
})
