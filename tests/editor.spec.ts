import { expect, test, type Page } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'
import { PDFDict, PDFDocument, PDFName, StandardFonts, degrees, rgb } from 'pdf-lib'
import { framePointToPdf, frameSize, sheetTransform, viewToFrame } from '../src/editor-geometry'

const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAIAAAD91JpzAAAAFklEQVR4nGP8z8DAwMDAxMDAwMDAAAANHQEDasKb6QAAAABJRU5ErkJggg==', 'base64')
const sizes = [[400, 300], [300, 300], [200, 300]] as const

async function document3(rotate = 0) {
  const document = await PDFDocument.create()
  for (const [width, height] of sizes) document.addPage([width, height]).setRotation(degrees(rotate))
  return Buffer.from(await document.save())
}

async function openEditor(page: Page, buffer: Buffer, name = 'tres.pdf') {
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.goto('/editor.html')
  await page.locator('input[data-open]').setInputFiles({ name, mimeType: 'application/pdf', buffer })
  await expect(page.locator('[data-total]')).toHaveText(String(sizes.length))
  await expect(page.locator('[data-thumbs] img')).toHaveCount(sizes.length)
}

async function save(page: Page) {
  const download = page.waitForEvent('download')
  await page.getByRole('button', { name: 'Guardar PDF' }).click()
  const file = await download
  const path = await file.path()
  const { readFile } = await import('node:fs/promises')
  return { name: file.suggestedFilename(), bytes: await readFile(path) }
}

/** Bounding box (as fractions of the canvas) of pixels matching the stroke red. */
const redBox = (page: Page) => page.evaluate(() => {
  const canvas = document.querySelector<HTMLCanvasElement>('[data-canvas]')!
  const { data, width, height } = canvas.getContext('2d')!.getImageData(0, 0, canvas.width, canvas.height)
  let x0 = width, y0 = height, x1 = -1, y1 = -1
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    const at = (y * width + x) * 4
    if (data[at] > 200 && data[at + 1] < 110 && data[at + 2] < 90) { x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y) }
  }
  return x1 < 0 ? undefined : { cx: (x0 + x1) / 2 / width, cy: (y0 + y1) / 2 / height, w: (x1 - x0) / width }
})

test('editor geometry maps frame points to PDF user space and back', () => {
  const box = { x: 0, y: 0, width: 400, height: 300 }
  expect(framePointToPdf(0, box, 0, 0)).toEqual([0, 300])
  expect(framePointToPdf(90, box, 0, 0)).toEqual([0, 0])
  expect(framePointToPdf(180, box, 0, 0)).toEqual([400, 0])
  expect(framePointToPdf(270, box, 0, 0)).toEqual([400, 300])
  expect(frameSize(90, box)).toEqual([300, 400])
  // A click in the middle of the displayed sheet is the middle of the frame for every turn.
  for (const turn of [0, 90, 180, 270] as const) {
    const frame: [number, number] = [400, 300]
    const [vw, vh] = turn % 180 ? [300, 400] : [400, 300]
    const [x, y] = viewToFrame(turn, frame, 1, vw / 2, vh / 2)
    expect([x, y]).toEqual([200, 150])
  }
  expect(sheetTransform(90, [400, 300], 2)).toBe('translate(600px,0) rotate(90deg)')
})

test('opens a PDF, reorders, rotates, deletes pages and saves a new copy', async ({ page }) => {
  const errors: string[] = []
  page.on('pageerror', error => errors.push(error.message))
  await openEditor(page, await document3())
  await page.getByRole('button', { name: 'Mover para a frente' }).click()
  await expect(page.locator('[data-current]')).toHaveText('2')
  await page.getByRole('button', { name: 'Rodar à direita' }).click()
  await page.getByRole('button', { name: 'Página 3' }).click()
  await page.getByRole('button', { name: 'Apagar página' }).click()
  await expect(page.locator('[data-total]')).toHaveText('2')
  const { name, bytes } = await save(page)
  expect(name).toBe('tres (Versa).pdf')
  const result = await PDFDocument.load(bytes)
  // Page 1 and 2 swapped (400x300 moved after 300x300), the moved page is rotated 90°, the 200x300 page is gone.
  expect(result.getPages().map(entry => [entry.getWidth(), entry.getHeight(), entry.getRotation().angle])).toEqual([[300, 300, 0], [400, 300, 90]])
  await expect(page.getByRole('status')).toContainText('PDF guardado')
  expect(errors).toEqual([])
})

test('drag-reorders thumbnails with the mouse', async ({ page }) => {
  await openEditor(page, await document3())
  const items = page.locator('[data-thumbs] li')
  await items.nth(2).scrollIntoViewIfNeeded()
  await items.nth(0).dragTo(items.nth(2))
  await expect(page.locator('[data-thumbs] li.is-current')).toHaveCount(1)
  const { bytes } = await save(page)
  expect((await PDFDocument.load(bytes)).getPages().map(entry => entry.getWidth())).toEqual([300, 200, 400])
})

test('text, drawing, image and signature end up on the saved page at the right place', async ({ page }) => {
  const errors: string[] = []
  page.on('pageerror', error => errors.push(error.message))
  await openEditor(page, await document3(90))
  await page.getByRole('button', { name: 'Rodar à direita' }).click()
  const wrap = page.locator('[data-wrap]')
  const at = async (u: number, v: number) => {
    const box = (await wrap.boundingBox())!
    return [box.x + box.width * u, box.y + box.height * v] as const
  }

  await page.getByRole('button', { name: 'Texto', exact: true }).click()
  await page.mouse.click(...await at(.2, .2))
  await page.keyboard.type('Olá Moçambique')
  await page.keyboard.press('Escape')
  await expect(page.locator('.ed-text textarea')).toHaveValue('Olá Moçambique')

  await page.getByRole('button', { name: 'Desenhar' }).click()
  await page.getByRole('button', { name: '#e8432e' }).click()
  await page.getByRole('slider').fill('8')
  await page.mouse.move(...await at(.3, .5))
  await page.mouse.down()
  await page.mouse.move(...await at(.5, .5), { steps: 6 })
  await page.mouse.move(...await at(.7, .5), { steps: 6 })
  await page.mouse.up()

  await page.getByRole('button', { name: 'Realçar' }).click()
  await page.mouse.move(...await at(.3, .8))
  await page.mouse.down()
  await page.mouse.move(...await at(.7, .8), { steps: 6 })
  await page.mouse.up()

  await page.locator('input[data-pic]').setInputFiles({ name: 'foto.png', mimeType: 'image/png', buffer: png })
  await expect(page.locator('.ed-pic')).toHaveCount(1)
  await page.getByRole('button', { name: 'Assinatura' }).click()
  await page.locator('[data-typed]').fill('Daniel')
  await expect.poll(() => page.evaluate(() => {
    const pad = document.querySelector<HTMLCanvasElement>('[data-pad]')!
    return pad.getContext('2d')!.getImageData(0, 0, pad.width, pad.height).data.some((value, index) => index % 4 === 3 && value > 0)
  })).toBe(true)
  await page.getByRole('button', { name: 'Usar assinatura' }).click()
  await expect(page.locator('.ed-pic')).toHaveCount(2)

  const before = { cx: .5, cy: .5, w: .4 + 8 / 300 }
  const { bytes } = await save(page)
  const result = await PDFDocument.load(bytes)
  expect(result.getPageCount()).toBe(3)
  expect(result.getPage(0).getRotation().angle).toBe(180)

  // Reopen the saved copy: the stroke must be where it was drawn on the rotated page.
  const again = await page.context().newPage()
  await openEditor(again, Buffer.from(bytes), 'guardado.pdf')
  await expect.poll(async () => (await redBox(again))?.w ?? 0).toBeGreaterThan(.25)
  const after = (await redBox(again))!
  expect(after.cx).toBeCloseTo(before.cx, 1)
  expect(after.cy).toBeCloseTo(before.cy, 1)
  expect(after.w).toBeCloseTo(before.w, 1)
  expect(errors).toEqual([])
})

test('undo and delete remove annotations; the last page cannot be deleted', async ({ page }) => {
  const single = await PDFDocument.create()
  single.addPage([300, 300])
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.goto('/editor.html')
  await page.locator('input[data-open]').setInputFiles({ name: 'um.pdf', mimeType: 'application/pdf', buffer: Buffer.from(await single.save()) })
  await expect(page.locator('[data-total]')).toHaveText('1')
  await page.getByRole('button', { name: 'Desenhar' }).click()
  const box = (await page.locator('[data-wrap]').boundingBox())!
  await page.mouse.move(box.x + 40, box.y + 40)
  await page.mouse.down()
  await page.mouse.move(box.x + 120, box.y + 90, { steps: 5 })
  await page.mouse.up()
  await expect(page.locator('.ink-path')).toHaveCount(1)
  await page.getByRole('button', { name: 'Desfazer' }).click()
  await expect(page.locator('.ink-path')).toHaveCount(0)
  await page.getByRole('button', { name: 'Apagar página' }).click()
  await expect(page.getByRole('status')).toContainText('pelo menos uma página')
})

test('rejects a non-PDF and switches language', async ({ page }) => {
  await page.goto('/editor.html')
  await page.locator('input[data-open]').setInputFiles({ name: 'nota.pdf', mimeType: 'application/pdf', buffer: Buffer.from('not a pdf') })
  await expect(page.getByRole('status')).toContainText('incompleto ou danificado')
  await page.getByRole('button', { name: 'Mudar para inglês' }).click()
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Edit PDF')
  await expect(page.getByRole('button', { name: 'Choose a PDF' })).toBeVisible()
})

for (const theme of ['light', 'dark'] as const) {
  test(`editor at 390px in ${theme} mode has no horizontal scroll and passes axe`, async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 })
    await page.emulateMedia({ colorScheme: theme, reducedMotion: 'reduce' })
    await page.goto('/editor.html')
    const overflow = () => page.evaluate(() => document.documentElement.scrollWidth - innerWidth)
    expect(await overflow()).toBeLessThanOrEqual(0)
    expect((await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze()).violations).toEqual([])
    await page.locator('input[data-open]').setInputFiles({ name: 'tres.pdf', mimeType: 'application/pdf', buffer: await document3() })
    await expect(page.locator('[data-thumbs] img')).toHaveCount(3)
    expect(await overflow()).toBeLessThanOrEqual(0)
    expect((await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze()).violations).toEqual([])
  })
}

test('replaces existing text visually and preserves the new page order after reopening', async ({ page }) => {
  const original = await PDFDocument.create()
  const first = original.addPage([400, 300])
  const font = await original.embedFont(StandardFonts.Helvetica)
  first.drawRectangle({ x: 0, y: 0, width: 400, height: 300, color: rgb(1, .9, .8) })
  first.drawText('Texto original comprido', { x: 42, y: 230, size: 21, font, color: rgb(.12, .21, .46) })
  original.addPage([310, 300])
  original.addPage([320, 300])
  await openEditor(page, Buffer.from(await original.save()))
  await expect(page.getByText(/Substituição visual/)).toBeVisible()
  await page.getByRole('button', { name: 'Editar texto original · Texto original comprido' }).click()
  const edit = page.getByRole('textbox', { name: 'Editar texto original' })
  await expect(edit).toHaveValue('Texto original comprido')
  await edit.fill('Revisto')
  await edit.press('Enter')
  await expect(page.locator('.ed-replacement')).toHaveText('Revisto')
  await expect(page.locator('.ed-replacement')).toHaveCSS('background-color', 'rgb(255, 230, 204)')
  await page.getByRole('button', { name: 'Página depois' }).click()
  await expect(page.locator('[data-total]')).toHaveText('4')
  await page.getByRole('button', { name: 'Página antes' }).click()
  await expect(page.locator('[data-total]')).toHaveText('5')
  await page.getByRole('button', { name: 'Apagar página' }).click()
  await expect(page.locator('[data-total]')).toHaveText('4')

  const imported = await PDFDocument.create()
  imported.addPage([180, 300])
  imported.addPage([220, 300])
  await page.locator('[data-import]').setInputFiles({ name: 'anexo.pdf', mimeType: 'application/pdf', buffer: Buffer.from(await imported.save()) })
  await expect(page.getByRole('dialog', { name: 'Inserir de outro PDF' })).toBeVisible()
  await page.getByRole('textbox', { name: 'Páginas a inserir' }).fill('2')
  await page.getByRole('combobox', { name: 'Posição' }).selectOption('before')
  await page.getByRole('dialog').getByRole('button', { name: 'Aplicar' }).click()
  await expect(page.locator('[data-total]')).toHaveText('5')
  await page.getByRole('button', { name: 'Página 3', exact: true }).click()
  await page.getByRole('button', { name: 'Apagar página' }).click()
  await page.getByRole('button', { name: 'Duplicar' }).click()
  const { bytes } = await save(page)
  const result = await PDFDocument.load(bytes)
  expect(result.getPages().map(entry => entry.getWidth())).toEqual([400, 220, 310, 310, 320])
  await page.locator('input[data-open]').setInputFiles({ name: 'revisto.pdf', mimeType: 'application/pdf', buffer: bytes })
  await expect(page.locator('[data-total]')).toHaveText('5')
  await expect(page.getByRole('button', { name: 'Editar texto original · Revisto' })).toBeVisible()
  const originalHit = page.getByRole('button', { name: 'Editar texto original · Texto original comprido' })
  await expect(originalHit).toBeVisible()
  const covered = await originalHit.evaluate(element => {
    const canvas = document.querySelector<HTMLCanvasElement>('[data-canvas]')!
    const original = element.getBoundingClientRect()
    const surface = canvas.getBoundingClientRect()
    const sx = canvas.width / surface.width, sy = canvas.height / surface.height
    const { data } = canvas.getContext('2d')!.getImageData(
      (original.x + original.width / 2 - surface.x) * sx,
      (original.y + 2 - surface.y) * sy,
      original.width * .42 * sx, (original.height - 4) * sy,
    )
    return !data.some((value, index) => index % 4 === 0 && value < 200)
  })
  expect(covered).toBe(true)
})

test('fills AcroForm fields and extracts selected pages as a new PDF', async ({ page }) => {
  const original = await PDFDocument.create()
  const first = original.addPage([400, 300])
  const second = original.addPage([300, 300])
  const third = original.addPage([200, 300])
  const form = original.getForm()
  form.createTextField('Pessoa.Nome').addToPage(first, { x: 35, y: 223, width: 160, height: 22 })
  form.createCheckBox('Confirmado').addToPage(first, { x: 35, y: 189, width: 18, height: 18 })
  const options = form.createDropdown('Distrito')
  options.addOptions(['KaMpfumo', 'KaMavota'])
  options.addToPage(second, { x: 35, y: 130, width: 110, height: 22 })
  form.createTextField('Só na última').addToPage(third, { x: 20, y: 100, width: 140, height: 20 })
  await openEditor(page, Buffer.from(await original.save()))
  await page.getByText('Campos de formulário', { exact: true }).click()
  await page.getByRole('textbox', { name: 'Pessoa.Nome' }).fill('Mário de Matola')
  await page.getByRole('checkbox', { name: 'Confirmado', exact: true }).check()
  await page.getByRole('combobox', { name: 'Distrito' }).selectOption('KaMavota')
  const { bytes } = await save(page)
  const result = (await PDFDocument.load(bytes)).getForm()
  expect(result.getTextField('Pessoa.Nome').getText()).toBe('Mário de Matola')
  expect(result.getCheckBox('Confirmado').isChecked()).toBe(true)
  expect(result.getDropdown('Distrito').getSelected()).toEqual(['KaMavota'])

  await page.getByRole('checkbox', { name: 'Seleccionar para extrair · Página 1' }).check()
  await page.getByRole('checkbox', { name: 'Seleccionar para extrair · Página 2' }).check()
  const pending = page.waitForEvent('download')
  await page.getByRole('button', { name: 'Extrair seleccionadas' }).click()
  const download = await pending
  expect(download.suggestedFilename()).toBe('tres - páginas (Versa).pdf')
  const { readFile } = await import('node:fs/promises')
  const extracted = await PDFDocument.load(await readFile(await download.path()))
  expect(extracted.getPages().map(entry => entry.getWidth())).toEqual([400, 300])
  expect(extracted.getForm().getFields().map(field => field.getName())).toEqual(['Pessoa.Nome', 'Confirmado', 'Distrito'])
  expect(extracted.getForm().getTextField('Pessoa.Nome').getText()).toBe('Mário de Matola')
})

test('exports shapes, stamps and PDF comments and supports undo, redo and Del', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 1000 })
  await openEditor(page, await document3())
  const draw = async (u: number, v: number) => {
    const rectangle = (await page.locator('[data-wrap]').boundingBox())!
    const at = (x: number, y: number) => [rectangle.x + x * rectangle.width, rectangle.y + y * rectangle.height] as const
    await page.mouse.move(...at(u, v))
    await page.mouse.down()
    await page.mouse.move(...at(u + .12, v + .08), { steps: 4 })
    await page.mouse.up()
  }
  for (const [index, mode] of ['rect', 'circle', 'line', 'arrow'].entries()) {
    await page.getByRole('combobox', { name: 'Formas' }).selectOption(mode)
    await draw(.12 + index * .18, .15)
  }
  await page.getByRole('button', { name: 'Caixa branca' }).click()
  await draw(.18, .32)
  await expect(page.locator('.ed-shape')).toHaveCount(5)
  await page.locator('[data-stage]').focus()
  await page.keyboard.press('Control+z')
  await expect(page.locator('.ed-shape')).toHaveCount(4)
  await page.keyboard.press('Control+y')
  await expect(page.locator('.ed-shape')).toHaveCount(5)
  await page.getByRole('button', { name: 'Rectângulo' }).focus()
  await page.keyboard.press('Delete')
  await expect(page.locator('.ed-shape')).toHaveCount(4)
  await page.getByRole('combobox', { name: 'Carimbos' }).selectOption('approved')
  await page.locator('[data-sheet]').click({ position: { x: 75, y: 280 } })
  await expect(page.locator('.ed-stamp')).toHaveText('Aprovado')
  await page.getByRole('button', { name: 'Comentário', exact: true }).click()
  await page.locator('[data-sheet]').click({ position: { x: 300, y: 300 } })
  await page.getByRole('textbox', { name: 'Texto do comentário' }).fill('Conferir a ficha')
  await page.getByRole('dialog').getByRole('button', { name: 'Aplicar' }).click()
  const { bytes } = await save(page)
  const saved = await PDFDocument.load(bytes)
  const annotation = saved.getPage(0).node.Annots()?.lookup(0, PDFDict)
  expect(annotation?.get(PDFName.of('Subtype'))).toEqual(PDFName.of('Text'))
  expect(annotation?.get(PDFName.of('Contents'))?.toString()).toContain('0043006F006E00660065007200690072')
})

test('the Windows editor opens real PDF bytes and sends a copy to the native save dialog', async ({ page }) => {
  await page.addInitScript(() => {
    const callbacks = new Map<number, (event: object) => void>()
    let next = 0
    Object.assign(window, {
      isTauri: true,
      __TAURI_INTERNALS__: {
        metadata: { currentWindow: { label: 'main' } },
        transformCallback(callback: (event: object) => void) { callbacks.set(++next, callback); return next },
        async invoke(command: string, args: Uint8Array) {
          if (command === 'save_editor_pdf') {
            const end = args.indexOf(10)
            const name = JSON.parse(new TextDecoder().decode(args.subarray(0, end)))
            const signature = new TextDecoder().decode(args.subarray(end + 1, end + 6))
            Object.assign(window, { editorSave: { name, signature } })
            return true
          }
          return 1
        },
      },
    })
  })
  await page.goto('/desktop-editor.html')
  await expect(page.getByRole('link', { name: 'Voltar ao Versa' })).toHaveAttribute('href', '/desktop.html?desktop=main')
  await page.locator('input[data-open]').setInputFiles({ name: 'ficha.pdf', mimeType: 'application/pdf', buffer: await document3() })
  await expect(page.locator('[data-total]')).toHaveText('3')
  await page.getByRole('button', { name: 'Guardar PDF' }).click()
  await expect(page.getByRole('status')).toContainText('PDF guardado')
  expect(await page.evaluate(() => (window as Window & { editorSave?: object }).editorSave)).toEqual({ name: 'ficha (Versa).pdf', signature: '%PDF-' })
})
