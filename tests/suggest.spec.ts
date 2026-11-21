import { expect, test, type Page } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'
import { recipes, suggest } from '../packages/engine/catalog'
import { samplePdf } from '../src/sample'

const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAIAAAD91JpzAAAAFklEQVR4nGP8z8DAwMDAxMDAwMDAAAANHQEDasKb6QAAAABJRU5ErkJggg==', 'base64')

test('suggests one conversion for each kind of drop', () => {
  expect(suggest(['pdf'])?.id).toBe('pdf-word')
  expect(suggest(['pdf', 'pdf'])?.id).toBe('pdf-merge')
  expect(suggest(['docx'])?.id).toBe('word-pdf')
  expect(suggest(['xlsx'])?.id).toBe('excel-pdf')
  expect(suggest(['pptx'])?.id).toBe('slides-pdf')
  expect(suggest(['png'])?.id).toBe('image-pdf')
  expect(suggest(['jpg', 'webp'])?.id).toBe('image-pdf')
  expect(suggest(['pdf', 'png'])).toBeUndefined()
  expect(suggest(['docx', 'docx'])).toBeUndefined()
  expect(suggest([])).toBeUndefined()
  for (const kinds of [['pdf'], ['docx'], ['xlsx'], ['pptx'], ['png']] as const) expect(suggest(kinds)?.load).toBeDefined()
  expect(recipes.some(recipe => recipe.id === 'pdf-word')).toBe(true)
})

async function dropFiles(page: Page, files: { name: string; type: string; bytes: number[] }[], selector = '#faq') {
  const data = await page.evaluateHandle(items => {
    const transfer = new DataTransfer()
    for (const item of items) transfer.items.add(new File([new Uint8Array(item.bytes)], item.name, { type: item.type }))
    return transfer
  }, files)
  const target = page.locator(selector)
  for (const type of ['dragenter', 'dragover', 'drop']) await target.dispatchEvent(type, { dataTransfer: data })
}
const pdfFile = async (name = 'ficha.pdf') => ({ name, type: 'application/pdf', bytes: [...new Uint8Array(await samplePdf().arrayBuffer())] })

test('a PDF dropped anywhere offers the conversion and Enter runs it', async ({ page }) => {
  const errors: string[] = []
  page.on('pageerror', error => errors.push(error.message))
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.goto('/')
  await dropFiles(page, [await pdfFile()])
  const suggestion = page.getByRole('region', { name: 'Sugestão' })
  await expect(suggestion).toBeVisible()
  await expect(suggestion.getByRole('button', { name: /Converter PDF → DOCX/ })).toBeFocused()
  await page.locator('body').click({ position: { x: 2, y: 2 } })
  await page.keyboard.press('Enter')
  await expect(page.getByRole('status')).toHaveText('Conversão concluída')
  await expect(suggestion).toBeHidden()
  const download = page.waitForEvent('download')
  await page.getByRole('link', { name: 'Descarregar', exact: true }).click()
  expect((await download).suggestedFilename()).toBe('ficha (Versa).docx')
  expect(errors).toEqual([])
})

test('the suggestion can be clicked, adapts to several images, and hides when a category is chosen', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.goto('/')
  const image = (name: string) => ({ name, type: 'image/png', bytes: [...png] })
  await dropFiles(page, [image('a.png'), image('b.png')])
  const suggestion = page.getByRole('region', { name: 'Sugestão' })
  await expect(suggestion.getByRole('button', { name: /2 ficheiros → PDF/ })).toBeVisible()
  await expect(suggestion.getByRole('button', { name: 'Editar este PDF' })).toHaveCount(0)
  await page.locator('.wheel-buttons [data-slice=image]').click()
  await expect(suggestion).toBeHidden()
  await page.getByRole('button', { name: 'Voltar às categorias' }).click()
  await expect(suggestion).toBeVisible()
  await page.getByRole('button', { name: 'Limpar ficheiros' }).click()
  await dropFiles(page, [image('c.png')])
  await suggestion.getByRole('button', { name: /PNG → PDF/ }).click()
  await expect(page.getByRole('status')).toHaveText('Conversão concluída')
})

test('mixed or protected drops get no suggestion', async ({ page }) => {
  await page.goto('/')
  await dropFiles(page, [await pdfFile(), { name: 'a.png', type: 'image/png', bytes: [...png] }], '.wheel-centre')
  await expect(page.getByRole('status')).toHaveText('Ficheiros verificados')
  await expect(page.locator('.wheel')).not.toHaveClass(/is-subring/)
  await expect(page.getByRole('region', { name: 'Sugestão' })).toBeHidden()
  await page.getByRole('button', { name: 'Limpar ficheiros' }).click()
  await dropFiles(page, [{ name: 'quebrado.pdf', type: 'application/pdf', bytes: [1, 2, 3] }])
  await expect(page.getByRole('status')).toContainText('incompleto ou danificado')
  await expect(page.getByRole('region', { name: 'Sugestão' })).toBeHidden()
})

test('"Editar este PDF" opens the dropped file in the editor without leaving the device', async ({ page }) => {
  const requests: string[] = []
  page.on('request', request => requests.push(request.url()))
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.goto('/')
  await dropFiles(page, [await pdfFile('turma.pdf')])
  await page.getByRole('button', { name: 'Editar este PDF' }).click()
  await expect(page).toHaveURL(/\/editor\.html$/)
  await expect(page.locator('[data-total]')).toHaveText('1')
  await expect(page.getByRole('status')).toHaveText('PDF aberto.')
  const origin = new URL(page.url()).origin
  expect(requests.filter(url => !url.startsWith(origin) && !url.startsWith('data:') && !url.startsWith('blob:'))).toEqual([])
})

test('the suggestion fits at 390px and the editor is linked from the home page', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.goto('/')
  await dropFiles(page, [await pdfFile()])
  const button = page.getByRole('button', { name: /Converter PDF → DOCX/ })
  await expect(button).toBeVisible()
  const box = (await button.boundingBox())!
  expect(box.x).toBeGreaterThanOrEqual(0)
  expect(box.x + box.width).toBeLessThanOrEqual(390)
  expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(0)
  await expect(page.getByRole('link', { name: 'Abrir o editor de PDF' })).toHaveAttribute('href', '/editor.html')
  expect((await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze()).violations).toEqual([])
})

test('a PDF dropped on the initial wheel is recognised by MIME and awaits an action', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.goto('/')
  await dropFiles(page, [await pdfFile('ficha')], '.wheel-centre')
  await expect(page.getByRole('status')).toHaveText('Ficheiros verificados')
  await expect(page.locator('.wheel')).toHaveClass(/is-subring/)
  await expect(page.locator('.wheel-centre')).toContainText('ficha')
  await expect(page.getByRole('region', { name: 'Sugestão' })).toBeHidden()
  await page.locator('.wheel-buttons [data-slice=pdf-text]').click()
  const download = page.waitForEvent('download')
  await page.getByRole('link', { name: 'Descarregar', exact: true }).click()
  expect((await download).suggestedFilename()).toBe('ficha (Versa).txt')
})

test('the initial wheel routes image, document and slide extensions and keeps unknown files in categories', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.goto('/')
  const selector = '.wheel-centre'
  const jpg = await page.evaluate(async () => {
    const canvas = document.createElement('canvas')
    canvas.width = canvas.height = 2
    const blob = await new Promise<Blob | null>(resolve => canvas.toBlob(resolve, 'image/jpeg'))
    return [...new Uint8Array(await blob!.arrayBuffer())]
  })
  await dropFiles(page, [
    { name: 'a.PNG', type: '', bytes: [...png] },
    { name: 'b', type: 'image/jpeg', bytes: jpg },
  ], selector)
  await expect(page.getByRole('status')).toHaveText('Ficheiros verificados')
  await expect(page.locator('.wheel-buttons [data-slice=image-pdf]')).toBeEnabled()
  await page.getByRole('button', { name: 'Voltar às categorias' }).click()

  await dropFiles(page, [
    { name: 'a.docx', type: '', bytes: [1] },
    { name: 'b.odt', type: '', bytes: [1] },
  ], selector)
  await expect(page.locator('.wheel-buttons [data-slice=word-pdf]')).toHaveAttribute('aria-disabled', 'true')
  await page.getByRole('button', { name: 'Voltar às categorias' }).click()

  for (const [name, action] of [
    ['a.doc', 'word-pdf'], ['a.docx', 'word-pdf'], ['a.odt', 'word-pdf'], ['a.txt', 'word-pdf'],
    ['a.ppt', 'slides-pdf'], ['a.pptx', 'slides-pdf'],
  ]) {
    await dropFiles(page, [{ name, type: '', bytes: [1] }], selector)
    await expect(page.locator(`.wheel-buttons [data-slice=${action}]`)).toHaveAttribute('aria-disabled', 'true')
    await page.getByRole('button', { name: 'Voltar às categorias' }).click()
  }
  await dropFiles(page, [{ name: 'a.zip', type: 'application/zip', bytes: [1] }], selector)
  await expect(page.locator('.wheel')).not.toHaveClass(/is-subring/)
  await expect(page.locator('.wheel-buttons [data-slice=pdf]')).toBeVisible()
})
