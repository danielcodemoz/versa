import { expect, test, type Page } from '@playwright/test'
import { degrees, PDFDocument, StandardFonts } from 'pdf-lib'
import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { unzipSync } from 'fflate'

const pdfFile = (bytes: Uint8Array, name = 'scan.pdf') =>
  ({ name, mimeType: 'application/pdf', buffer: Buffer.from(bytes) })

async function openTool(page: Page, files: ReturnType<typeof pdfFile> | ReturnType<typeof pdfFile>[], category = 'pdf') {
  await page.goto('/')
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.locator('input[type=file]').setInputFiles(files)
  await expect(page.getByRole('status')).toHaveText('Ficheiros verificados')
  await page.locator(`.wheel-buttons [data-slice=${category}]`).click()
}

async function convert(page: Page, recipe: string, timeout = 15000) {
  await page.locator(`.wheel-buttons [data-slice=${recipe}]`).click()
  const status = page.getByRole('status')
  await expect(status).toHaveText(/^(Conversão concluída|Não foi possível preparar o resultado)/, { timeout })
  expect(await status.textContent()).toBe('Conversão concluída')
  const pending = page.waitForEvent('download')
  await page.getByRole('link', { name: 'Descarregar', exact: true }).click()
  const download = await pending
  return { bytes: await readFile((await download.path())!), name: download.suggestedFilename() }
}

async function scannedPdf(page: Page, texture = false) {
  await page.goto('/')
  const data = await page.evaluate(texture => {
    const canvas = document.createElement('canvas')
    canvas.width = 1200
    canvas.height = 760
    const ctx = canvas.getContext('2d')!
    ctx.fillStyle = '#fff'
    ctx.fillRect(0, 0, 1200, 760)
    if (texture) {
      const pixels = ctx.getImageData(0, 0, canvas.width, canvas.height)
      let seed = 1
      for (let offset = 0; offset < pixels.data.length; offset += 4) {
        seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0
        pixels.data.fill(225 + (seed >>> 27) % 30, offset, offset + 3)
      }
      ctx.putImageData(pixels, 0, 0)
    }
    ctx.fillStyle = '#000'
    ctx.font = 'bold 58px sans-serif'
    ctx.fillText('INFORMAÇÃO E EDUCAÇÃO', 90, 260)
    ctx.fillText('Searchable English document', 90, 390)
    return canvas.toDataURL()
  }, texture)
  const document = await PDFDocument.create()
  const image = await document.embedPng(data)
  const scan = document.addPage([380, 600])
  scan.setRotation(degrees(90))
  scan.drawImage(image, { x: 380, y: 0, width: 600, height: 380, rotate: degrees(90) })
  const existing = document.addPage([600, 380])
  existing.drawText('Original selectable text', { font: await document.embedFont(StandardFonts.Helvetica) })
  return pdfFile(await document.save())
}

test('OCR makes a rotated scan searchable in Portuguese and English and preserves existing text', async ({ page }) => {
  test.setTimeout(110_000)
  const languages = new Set<string>()
  await page.context().route('https://cdn.jsdelivr.net/npm/**', async route => {
    const path = new URL(route.request().url()).pathname
    const core = path.match(/tesseract\.js-core@[^/]+\/(tesseract-core-[a-z-]+\.wasm\.js)$/)
    const model = path.match(/@tesseract\.js-data\/(por|eng)\/4\.0\.0_best_int\/\w+\.traineddata\.gz$/)
    if (!core && !model) return route.abort()
    if (model) languages.add(model[1])
    const asset = core ? `tesseract.js-core/${core[1]}` : `@tesseract.js-data/${model![1]}/4.0.0_best_int/${model![1]}.traineddata.gz`
    await route.fulfill({
      path: resolve('node_modules', asset),
      contentType: core ? 'application/javascript' : 'application/octet-stream',
      headers: { 'access-control-allow-origin': '*' },
    })
  })
  const file = await scannedPdf(page)
  const assets: string[] = []
  page.on('request', request => {
    if (/pdf-ocr|traineddata|tesseract|worker\.min/.test(request.url()) && !/pdf\.worker/.test(request.url())) assets.push(request.url())
  })
  await openTool(page, file)
  expect(assets).toEqual([])
  const before = await convert(page, 'pdf-text')
  expect(before.bytes.toString().trim()).toBe('Original selectable text')
  const beforeRender = unzipSync((await convert(page, 'pdf-jpg')).bytes)
  const result = await convert(page, 'pdf-ocr', 95_000)
  expect(result.name).toContain('OCR')
  expect(languages).toEqual(new Set(['por', 'eng']))
  const document = await PDFDocument.load(result.bytes)
  expect(document.getPageCount()).toBe(2)
  expect(document.getPage(0).getRotation().angle).toBe(90)
  await openTool(page, pdfFile(result.bytes))
  const afterRender = unzipSync((await convert(page, 'pdf-jpg')).bytes)
  expect(afterRender).toEqual(beforeRender)
  const extracted = (await convert(page, 'pdf-text')).bytes.toString()
  expect(extracted).toContain('INFORMAÇÃO E EDUCAÇÃO')
  expect(extracted).toContain('Searchable English document')
  expect(extracted.match(/Original selectable text/g)).toHaveLength(1)
  const repeatedOcr = await convert(page, 'pdf-ocr')
  expect(repeatedOcr.bytes).toEqual(result.bytes)
})

test('custom watermark changes the page render and preserves existing text', async ({ page }) => {
  const document = await PDFDocument.create()
  document.addPage([420, 310]).drawText('Still searchable')
  const rotated = document.addPage([300, 460])
  rotated.setRotation(degrees(90))
  rotated.setCropBox(12, 17, 270, 410)
  const file = pdfFile(await document.save())
  await openTool(page, file)
  const original = unzipSync((await convert(page, 'pdf-jpg')).bytes)
  await page.getByText('Opções de saída', { exact: true }).click()
  await page.getByLabel('Texto da marca de água').fill('Revisão — Moçambique')
  const marked = await convert(page, 'pdf-watermark')
  const output = await PDFDocument.load(marked.bytes)
  expect(output.getPage(1).getCropBox()).toEqual({ x: 12, y: 17, width: 270, height: 410 })
  await openTool(page, pdfFile(marked.bytes))
  const rendered = unzipSync((await convert(page, 'pdf-jpg')).bytes)
  expect(Object.keys(rendered)).toEqual(['scan-1.jpg', 'scan-2.jpg'])
  expect(rendered['scan-1.jpg']).not.toEqual(original['scan-1.jpg'])
  expect(rendered['scan-2.jpg']).not.toEqual(original['scan-2.jpg'])
  expect((await convert(page, 'pdf-text')).bytes.toString().trim()).toBe('Still searchable')
  const images = Object.entries(rendered).map(([name, bytes]) => ({ name, mimeType: 'image/jpeg', buffer: Buffer.from(bytes) }))
  await openTool(page, images, 'image')
  const roundTrip = await PDFDocument.load((await convert(page, 'image-pdf')).bytes)
  expect(roundTrip.getPageCount()).toBe(2)
  expect(roundTrip.getPage(0).getWidth()).toBeGreaterThan(roundTrip.getPage(0).getHeight())
})

test('compression reduces a scan and preserves its page dimensions', async ({ page }) => {
  const source = await scannedPdf(page, true)
  const mixed = await PDFDocument.load(source.buffer)
  mixed.removePage(1)
  const file = pdfFile(await mixed.save())
  await openTool(page, file)
  const result = await convert(page, 'pdf-compress')
  expect(result.bytes.length).toBeLessThan(file.buffer.length)
  const compressed = await PDFDocument.load(result.bytes)
  expect(compressed.getPageCount()).toBe(1)
  expect(compressed.getPage(0).getSize()).toEqual({ width: 600, height: 380 })
})

test('an unavailable OCR engine releases the PDF menu for another action', async ({ page }) => {
  const file = await scannedPdf(page)
  await page.context().route('https://cdn.jsdelivr.net/npm/tesseract.js-core@*/**', route => route.abort())
  await page.setViewportSize({ width: 390, height: 844 })
  await openTool(page, file)

  const buttons = page.locator('.wheel-buttons button')
  await expect(buttons).toHaveCount(9)
  await page.locator('.wheel-buttons').scrollIntoViewIfNeeded()
  const covered = await buttons.evaluateAll(nodes => nodes.filter(node => {
    const { x, y, width, height } = node.getBoundingClientRect()
    return document.elementFromPoint(x + width / 2, y + height / 2)?.closest('button') !== node
  }).map(node => node.getAttribute('data-slice')))
  expect(covered).toEqual([])

  await page.locator('.wheel-buttons [data-slice=pdf-ocr]').click()
  await expect(page.getByRole('status')).toContainText('Não foi possível preparar o resultado')
  expect((await convert(page, 'pdf-text')).bytes.toString().trim()).toBe('Original selectable text')
})
