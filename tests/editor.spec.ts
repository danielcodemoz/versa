import { expect, test, type Locator, type Page } from '@playwright/test'
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
  expect(name).toBe('tres.pdf')
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

test('uses the right side of the desktop toolbar for pages and image controls', async ({ page }) => {
  await openEditor(page, await document3())
  const toolbar = page.getByRole('toolbar', { name: 'Ferramentas' })
  const pages = toolbar.getByRole('group', { name: 'Páginas' })
  const annotate = toolbar.getByRole('group', { name: 'Anotar' })
  const imageTools = toolbar.getByRole('group', { name: 'Editar imagem' })
  await expect(imageTools).toBeHidden()
  await page.locator('input[data-pic]').setInputFiles({ name: 'imagem.png', mimeType: 'image/png', buffer: png })
  await expect(imageTools).toBeVisible()
  for (const width of [1280, 1440]) {
    await page.setViewportSize({ width, height: 900 })
    const pageBox = (await pages.boundingBox())!
    const annotateBox = (await annotate.boundingBox())!
    const imageBox = (await imageTools.boundingBox())!
    expect(pageBox.x).toBeGreaterThanOrEqual(annotateBox.x + annotateBox.width)
    expect(pageBox.y).toBeLessThan(annotateBox.y + annotateBox.height)
    expect(imageBox.x).toBe(pageBox.x)
  }
  await expect(toolbar.getByText('Página 1 de 3')).toBeVisible()
  await page.locator('[data-thumb]').nth(1).click()
  await expect(toolbar.getByText('Página 2 de 3')).toBeVisible()
  await toolbar.getByRole('button', { name: 'Aumentar' }).click()
  await expect(toolbar.getByText('Zoom 125%')).toBeVisible()
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
    await page.locator('input[data-pic]').setInputFiles({ name: 'imagem.png', mimeType: 'image/png', buffer: png })
    await expect(page.getByLabel('Opacidade')).toBeVisible()
    expect(await overflow()).toBeLessThanOrEqual(0)
    await page.getByRole('button', { name: 'Texto', exact: true }).click()
    await expect(page.getByLabel('Tamanho')).toBeVisible()
    expect(await overflow()).toBeLessThanOrEqual(0)
  })
}

async function expectControlInsets(container: Locator) {
  await expect(container).toBeVisible()
  const violations = await container.evaluate(element => {
    const bounds = element.getBoundingClientRect()
    const style = getComputedStyle(element)
    const innerEdges = {
      left: bounds.left + parseFloat(style.borderLeftWidth),
      right: bounds.right - parseFloat(style.borderRightWidth),
      top: bounds.top + parseFloat(style.borderTopWidth),
      bottom: bounds.bottom - parseFloat(style.borderBottomWidth),
    }

    return [...element.querySelectorAll('button, input, select, textarea, canvas')].flatMap(control => {
      const rect = control.getBoundingClientRect()
      if (!rect.width || !rect.height) return []
      const inset = Math.min(rect.left - innerEdges.left, innerEdges.right - rect.right,
        rect.top - innerEdges.top, innerEdges.bottom - rect.bottom)
      return inset < 12 ? [{ control: control.outerHTML.slice(0, 200), inset }] : []
    })
  })
  expect(violations).toEqual([])
}

for (const width of [1440, 1280, 1024, 768, 390, 360]) {
  for (const theme of ['light', 'dark'] as const) {
    test(`editor controls fit at ${width}px in ${theme} mode`, async ({ page }) => {
      await page.setViewportSize({ width, height: 844 })
      await page.emulateMedia({ colorScheme: theme, reducedMotion: 'reduce' })
      const pdf = await document3()
      await openEditor(page, pdf)
      await expect(page.locator('html')).toHaveAttribute('data-theme', theme)
      await page.evaluate(() => document.fonts.ready)
      const expectNoOverflow = async () => {
        expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width)
      }
      await expectNoOverflow()
      const back = page.getByRole('link', { name: width <= 420 ? 'Voltar' : 'Voltar ao Versa', exact: true })
      const backText = back.locator('[data-k]:visible')
      await expect(backText).toBeVisible()
      expect(await backText.evaluate(text => {
        const range = document.createRange()
        range.selectNodeContents(text)
        return range.getClientRects().length
      })).toBe(1)
      await expect(page.locator('.masthead .switches')).toHaveCSS('gap', '8px')

      const toolbar = page.getByRole('toolbar')
      await expect(toolbar).toHaveCSS('padding', width <= 760 ? '12px' : '16px')
      await expectControlInsets(toolbar)
      const name = toolbar.getByRole('textbox', { name: 'Nome do documento' })
      await name.focus()
      await expect(name).toHaveCSS('outline-width', '3px')
      await expect(name).toHaveCSS('outline-offset', '5px')
      const nameBox = (await name.boundingBox())!
      const nameLabel = (await toolbar.locator('.ed-document label span').boundingBox())!
      expect(nameBox.x).toBe(nameLabel.x)
      expect(nameBox.y - (nameLabel.y + nameLabel.height)).toBe(8)

      if (width <= 760) {
        const groups = await toolbar.locator('.ed-group').evaluateAll(elements =>
          elements.map(element => element.getBoundingClientRect().toJSON()))
        expect(groups).toHaveLength(4)
        for (const [index, group] of groups.entries()) {
          expect(group.left).toBe(nameBox.x)
          expect(group.width).toBe(nameBox.width)
          if (index > 0) expect(group.top - groups[index - 1].bottom).toBeGreaterThanOrEqual(12)
        }
      }

      await toolbar.locator('[data-tool="text"]').click()
      await expect(toolbar.locator('.ed-props')).toBeVisible()
      await expectControlInsets(toolbar)

      const checkDialog = async (selector: string) => {
        const dialog = page.locator(selector)
        await expectControlInsets(dialog)
        await expectNoOverflow()
        const fields = dialog.locator('.ed-type')
        for (const field of await fields.all()) {
          const input = field.locator('input, select, textarea')
          const alignment = await field.evaluate(label => {
            const field = label.querySelector('input, select, textarea')!.getBoundingClientRect()
            const range = document.createRange()
            range.selectNode(label.firstChild!)
            const text = range.getBoundingClientRect()
            return { left: field.left - text.left, gap: field.top - text.bottom }
          })
          expect(alignment.left).toBe(0)
          expect(alignment.gap).toBeGreaterThanOrEqual(8)
          expect((await input.boundingBox())!.width).toBe((await field.boundingBox())!.width)
        }
        await page.keyboard.press('Escape')
        await expect(dialog).toBeHidden()
      }

      await toolbar.locator('[data-act="split"]').click()
      await checkDialog('[data-split-dialog]')
      await page.locator('[data-import]').setInputFiles({ name: 'anexo.pdf', mimeType: 'application/pdf', buffer: pdf })
      await checkDialog('[data-import-dialog]')

      await toolbar.locator('[data-sign]').click()
      await checkDialog('.ed-dialog[open]')
      await toolbar.locator('[data-tool="comment"]').click()
      await page.locator('[data-sheet]').click({ position: { x: 60, y: 60 } })
      await checkDialog('[data-comment-dialog]')

      await page.locator('[data-pic]').setInputFiles({ name: 'imagem.png', mimeType: 'image/png', buffer: png })
      await expect(toolbar.locator('.ed-image-tools')).toBeVisible()
      await expectControlInsets(toolbar)
      await toolbar.locator('[data-picture="crop"]').click()
      await checkDialog('.ed-dialog[open]')

      await page.goto('/editor.html')
      await page.locator('[data-open]').setInputFiles('tests/fixtures/editor-protected.pdf')
      await checkDialog('[data-password-dialog]')
    })
  }
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

  await page.getByRole('checkbox', { name: 'Seleccionar página · Página 1' }).check()
  await page.getByRole('checkbox', { name: 'Seleccionar página · Página 2' }).check()
  const pending = page.waitForEvent('download')
  await page.getByRole('button', { name: 'Extrair seleccionadas' }).click()
  const download = await pending
  expect(download.suggestedFilename()).toBe('tres - páginas.pdf')
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

test('the Windows editor sends PDF and split ZIP output to the native save dialog', async ({ page }) => {
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
  await page.getByRole('textbox', { name: 'Nome do documento' }).fill('Ficha 2026')
  await page.getByRole('button', { name: 'Guardar PDF' }).click()
  await expect(page.getByRole('status')).toContainText('PDF guardado')
  expect(await page.evaluate(() => (window as Window & { editorSave?: object }).editorSave)).toEqual({ name: 'Ficha 2026.pdf', signature: '%PDF-' })
  await page.getByRole('button', { name: 'Dividir PDF', exact: true }).click()
  const dialog = page.getByRole('dialog', { name: 'Dividir PDF' })
  await dialog.getByRole('textbox', { name: 'Intervalos de páginas' }).fill('1, 2-3')
  await dialog.getByRole('button', { name: 'Dividir PDF' }).click()
  await expect.poll(() => page.evaluate(() => (window as Window & { editorSave?: object }).editorSave))
    .toMatchObject({ name: 'Ficha 2026.zip', signature: expect.stringMatching(/^PK\x03\x04/) })
})

test('reorders a multi-selection from the grid and saves with the edited document name', async ({ page }) => {
  await openEditor(page, await document3())
  const pageView = page.getByRole('button', { name: 'Grelha de páginas' })
  await pageView.click()
  await expect(pageView).toHaveAttribute('aria-pressed', 'true')
  await expect(page.locator('[data-stage]')).toBeHidden()
  await page.getByRole('button', { name: 'Página 1', exact: true }).click()
  await page.getByRole('button', { name: 'Página 3', exact: true }).click()
  await expect(page.locator('[data-selection]')).toHaveText('Páginas seleccionadas: 2')
  await page.getByRole('button', { name: 'Mover para o início' }).click()
  await expect(page.locator('[data-thumb][aria-pressed=true]')).toHaveCount(2)
  await expect(page.locator('[data-thumb="1"]')).toHaveAttribute('aria-pressed', 'true')
  await page.getByRole('button', { name: 'Mover para o fim' }).click()
  await expect(page.locator('[data-thumb="0"]')).toHaveAttribute('aria-pressed', 'false')
  const items = page.locator('[data-thumbs] li')
  const target = await items.first().boundingBox()
  await items.nth(1).dragTo(items.first(), { targetPosition: { x: target!.width / 4, y: 14 } })
  await expect(page.locator('[data-thumb="0"]')).toHaveAttribute('aria-pressed', 'true')
  await pageView.click()
  await expect(page.locator('[data-stage]')).toBeVisible()
  await page.getByRole('textbox', { name: 'Nome do documento' }).fill('Ficha revista.pdf')
  const { bytes, name } = await save(page)
  expect(name).toBe('Ficha revista.pdf')
  const result = await PDFDocument.load(bytes)
  expect(result.getPages().map(entry => entry.getWidth())).toEqual([400, 200, 300])
})

test('requests a PDF password in the editor, retries, and saves an unlocked visual edit', async ({ page }) => {
  await page.goto('/editor.html')
  await page.locator('input[data-open]').setInputFiles('tests/fixtures/editor-protected.pdf')
  const prompt = page.getByRole('dialog', { name: 'PDF protegido' })
  const password = prompt.getByLabel('Palavra-passe')
  await expect(prompt).toBeVisible()
  await prompt.getByRole('button', { name: 'Cancelar' }).click()
  await expect(prompt).toBeHidden()
  await page.locator('input[data-open]').setInputFiles('tests/fixtures/editor-protected.pdf')
  await password.fill('incorrecta')
  await prompt.getByRole('button', { name: 'Desbloquear' }).click()
  await expect(prompt.getByRole('alert')).toContainText('Palavra-passe incorrecta')
  await password.fill('versa-teste-14')
  await prompt.getByRole('button', { name: 'Desbloquear' }).click()
  await expect(page.locator('[data-originals] button').first()).toBeVisible()
  await expect(page.getByRole('status')).toContainText('sem palavra-passe')
  await page.locator('[data-originals] button').first().click()
  await page.locator('[data-inline] input').fill('Texto revisto')
  await page.locator('[data-inline] input').press('Enter')
  const { bytes } = await save(page)
  const result = await PDFDocument.load(bytes)
  expect(result.isEncrypted).toBe(false)
  await page.locator('input[data-open]').setInputFiles({ name: 'revisto.pdf', mimeType: 'application/pdf', buffer: bytes })
  await expect(page.locator('[data-originals] button').last()).toHaveAttribute('aria-label', /Texto revisto/)
})

test('rotates, crops and replaces images, and exports their opacity', async ({ page }) => {
  await openEditor(page, await document3())
  const image = await page.evaluate(() => {
    const surface = document.createElement('canvas')
    surface.width = 200
    surface.height = 100
    const ctx = surface.getContext('2d')!
    ctx.fillStyle = '#ff0000'
    ctx.fillRect(0, 0, 100, 100)
    ctx.fillStyle = '#0000ff'
    ctx.fillRect(100, 0, 100, 100)
    return surface.toDataURL().split(',')[1]
  })
  const buffer = Buffer.from(image, 'base64')
  const imageBlob = { name: 'duas-cores.png', mimeType: 'image/png', buffer }
  await page.locator('input[data-pic]').setInputFiles(imageBlob)
  const picture = page.locator('.ed-pic img')
  await expect(picture).toBeVisible()
  await page.getByRole('button', { name: 'Substituir imagem' }).click()
  await page.locator('input[data-replace-pic]').setInputFiles(imageBlob)
  await expect(picture).toBeVisible()
  await page.getByRole('button', { name: 'Rodar imagem à direita' }).click()
  await expect(page.locator('.ed-pic')).toHaveCSS('transform', 'matrix(0, 1, -1, 0, 0, 0)')
  await page.getByRole('button', { name: 'Recortar imagem' }).click()
  const crop = page.getByRole('dialog', { name: 'Recortar imagem' })
  await crop.getByLabel('Direita').fill('50')
  await crop.getByRole('button', { name: 'Aplicar' }).click()
  await expect(crop).toBeHidden()
  await expect.poll(() => picture.evaluate((img: HTMLImageElement) => img.naturalWidth)).toBe(100)
  await page.getByLabel('Opacidade').fill('50')
  await expect(picture).toHaveCSS('opacity', '0.5')
  const { bytes } = await save(page)
  const result = await PDFDocument.load(bytes)
  const resources = result.getPage(0).node.Resources()!
  const [xobj] = resources.lookup(PDFName.of('XObject'), PDFDict).entries().map(([, ref]) => result.context.lookup(ref))
  expect(String(xobj)).toContain('/Width 100')
  const [graphics] = resources.lookup(PDFName.of('ExtGState'), PDFDict).entries().map(([, ref]) => result.context.lookup(ref))
  expect(String(graphics)).toContain('/ca 0.5')
})

test('keeps grouped tools compact at 460px and avoids native and offscreen thumbnail work on the web', async ({ page }) => {
  await page.setViewportSize({ width: 460, height: 640 })
  const requests: string[] = []
  page.on('request', request => requests.push(new URL(request.url()).pathname))
  const doc = await PDFDocument.create()
  for (let i = 0; i < 50; i++) doc.addPage([400, 600])
  await page.goto('/editor.html')
  await page.locator('[data-open]').setInputFiles({ name: '50-paginas.pdf', mimeType: 'application/pdf', buffer: Buffer.from(await doc.save()) })
  await expect(page.locator('[data-total]')).toHaveText('50')
  await expect(page.locator('[data-thumbs] img').first()).toBeVisible()
  await expect(page.getByRole('group', { name: 'Páginas', exact: true })).toBeVisible()
  await expect(page.locator('.ed-thumbs [data-act]')).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'Página depois' })).toHaveAttribute('title', 'Página depois')
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(460)
  expect(await page.locator('[data-thumbs] img').count()).toBeLessThan(15)
  expect(requests.some(path => /native-window|editor\.worker|editor-pdf/.test(path))).toBe(false)
  await page.getByRole('button', { name: 'Grelha de páginas' }).click()
  await page.getByRole('button', { name: 'Página 50', exact: true }).scrollIntoViewIfNeeded()
  await expect(page.locator('[data-thumb="49"] img')).toBeVisible()
})

test.describe('page grid with touch input', () => {
  test.use({ hasTouch: true, viewport: { width: 460, height: 640 } })

  test('moves marked pages with the touch drag handle', async ({ page }) => {
    await openEditor(page, await document3())
    await page.getByRole('button', { name: 'Grelha de páginas' }).tap()
    await page.getByRole('button', { name: 'Página 1', exact: true }).tap()
    await page.getByRole('button', { name: 'Página 2', exact: true }).tap()
    const grip = page.locator('[data-thumbs] li').first().locator('[data-touch-reorder]')
    const target = page.getByRole('button', { name: 'Página 3', exact: true })
    await expect(grip).toBeVisible()
    await target.scrollIntoViewIfNeeded()
    const from = (await grip.boundingBox())!
    const to = (await target.boundingBox())!
    const input = await page.context().newCDPSession(page)
    await input.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: from.x + from.width / 2, y: from.y + from.height / 2 }] })
    await input.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: to.x + to.width * .75, y: to.y + 15 }] })
    await input.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] })
    await expect(page.locator('[data-thumb="0"]')).toHaveAttribute('aria-pressed', 'false')
    await expect(page.locator('[data-thumb="2"]')).toHaveAttribute('aria-pressed', 'true')
  })
})

test('merges a batch in picker order, preserving independently editable fields', async ({ page }) => {
  const pdf = async (width: number, fieldName: string, value: string) => {
    const document = await PDFDocument.create()
    const sheet = document.addPage([width, 300])
    const field = document.getForm().createTextField(fieldName)
    field.addToPage(sheet, { x: 10, y: 20, width: 120, height: 22 })
    field.setText(value)
    return { name: `${width}.pdf`, mimeType: 'application/pdf', buffer: Buffer.from(await document.save()) }
  }
  const first = await pdf(400, 'PDF 2.Nome', 'Primeiro')
  const second = await pdf(250, 'Nome', 'Segundo')
  const third = await pdf(350, 'Nome', 'Terceiro')
  await page.goto('/editor.html')
  const chooser = page.waitForEvent('filechooser')
  await page.getByRole('button', { name: 'Juntar PDFs' }).click()
  await (await chooser).setFiles([first, second, third])
  await expect(page.locator('[data-total]')).toHaveText('3')
  await page.locator('[data-thumbs] button[data-thumb]').nth(1).click()
  await page.getByText('Campos de formulário', { exact: true }).click()
  await page.getByRole('textbox', { name: 'Nome', exact: true }).fill('Editado')
  const result = await PDFDocument.load((await save(page)).bytes)
  expect(result.getPages().map(sheet => sheet.getWidth())).toEqual([400, 250, 350])
  expect(result.getForm().getTextField('PDF 2.Nome').getText()).toBe('Primeiro')
  expect(result.getForm().getTextField('PDF 2 (2).Nome').getText()).toBe('Editado')
  expect(result.getForm().getTextField('PDF 3.Nome').getText()).toBe('Terceiro')

  await page.locator('[data-merge]').setInputFiles([second, { ...third, buffer: Buffer.from('corrupt') }])
  await expect(page.locator('[data-status]')).toContainText('Ficheiro incompleto ou danificado')
  await expect(page.locator('[data-total]')).toHaveText('3')

  await page.locator('[data-merge]').setInputFiles([third, second])
  await expect(page.locator('[data-total]')).toHaveText('5')
  const appended = await PDFDocument.load((await save(page)).bytes)
  expect(appended.getPages().map(sheet => sheet.getWidth())).toEqual([400, 250, 350, 350, 250])
  await page.getByRole('button', { name: 'Desfazer' }).click()
  await expect(page.locator('[data-total]')).toHaveText('3')
})

test('splits ranges of the edited document into separate PDFs in one download', async ({ page }) => {
  const original = await PDFDocument.load(await document3())
  const dropdown = original.getForm().createDropdown('Bairro')
  dropdown.addOptions(['Central'])
  dropdown.enableEditing()
  dropdown.addToPage(original.getPage(1), { x: 20, y: 100, width: 140, height: 22 })
  await openEditor(page, Buffer.from(await original.save()))
  await page.getByText('Campos de formulário', { exact: true }).click()
  await page.getByRole('combobox', { name: 'Bairro' }).fill('Malhangalene Ł')
  await page.getByRole('button', { name: 'Dividir PDF', exact: true }).click()
  const dialog = page.getByRole('dialog', { name: 'Dividir PDF' })
  const ranges = dialog.getByRole('textbox', { name: 'Intervalos de páginas' })
  const submit = dialog.getByRole('button', { name: 'Dividir PDF' })
  for (const invalid of ['', '3–4', '1–2, 2']) {
    await ranges.fill(invalid)
    await submit.click()
    await expect(ranges).toHaveAttribute('aria-invalid', 'true')
    await expect(dialog.getByRole('alert')).toContainText('Escolhe páginas válidas')
  }
  await ranges.fill('3, 1–2')
  const pending = page.waitForEvent('download')
  await submit.click()
  const download = await pending
  expect(download.suggestedFilename()).toBe('tres.zip')
  const { readFile } = await import('node:fs/promises')
  const { unzipSync } = await import('fflate')
  const files = unzipSync(await readFile(await download.path()))
  expect(Object.keys(files)).toEqual(['tres - 3.pdf', 'tres - 1-2.pdf'])
  const single = await PDFDocument.load(files['tres - 3.pdf'])
  expect(single.getPages().map(sheet => sheet.getWidth())).toEqual([200])
  expect(single.getForm().getFields()).toHaveLength(0)
  const pair = await PDFDocument.load(files['tres - 1-2.pdf'])
  expect(pair.getPages().map(sheet => sheet.getWidth())).toEqual([400, 300])
  expect(pair.getForm().getDropdown('Bairro').getSelected()).toEqual(['Malhangalene Ł'])
  await expect(page.locator('[data-total]')).toHaveText('3')
})

test('draws, moves and resizes a signature before saving', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 1100 })
  await openEditor(page, await document3())
  await page.getByRole('button', { name: 'Assinatura' }).click()
  const pad = (await page.getByRole('img', { name: 'Área da assinatura' }).boundingBox())!
  await page.mouse.move(pad.x + pad.width * .2, pad.y + pad.height * .7)
  await page.mouse.down()
  await page.mouse.move(pad.x + pad.width * .4, pad.y + pad.height * .3, { steps: 5 })
  await page.mouse.move(pad.x + pad.width * .7, pad.y + pad.height * .65, { steps: 5 })
  await page.mouse.up()
  await page.getByRole('button', { name: 'Usar assinatura' }).click()
  const signature = page.locator('.ed-pic')
  await expect(signature).toBeVisible()
  await signature.scrollIntoViewIfNeeded()
  const drag = async (x: number, y: number, dx: number, dy: number) => {
    await page.mouse.move(x, y)
    await page.mouse.down()
    await page.mouse.move(x + dx, y + dy, { steps: 5 })
    await page.mouse.up()
  }
  const before = (await signature.boundingBox())!
  await drag(before.x + before.width / 2, before.y + before.height / 2, 30, 20)
  const moved = (await signature.boundingBox())!
  expect(moved.x - before.x).toBeCloseTo(30)
  expect(moved.y - before.y).toBeCloseTo(20)
  const grip = (await signature.locator('[data-grip]').boundingBox())!
  await drag(grip.x + grip.width / 2, grip.y + grip.height / 2, 40, 0)
  const resized = (await signature.boundingBox())!
  expect(resized.width - moved.width).toBeCloseTo(40)
  expect(resized.width / resized.height).toBeCloseTo(moved.width / moved.height)
  const saved = await PDFDocument.load((await save(page)).bytes)
  expect(saved.getPage(0).node.Resources()?.lookupMaybe(PDFName.of('XObject'), PDFDict)?.keys()).toHaveLength(1)
})
