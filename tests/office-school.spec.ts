import { expect, test } from '@playwright/test'
import { PDFDocument } from 'pdf-lib'
import { strToU8, unzipSync, zipSync } from 'fflate'
import { readFile } from 'node:fs/promises'
import { samplePdf } from '../src/sample'

const office = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships'
const packageRel = 'http://schemas.openxmlformats.org/package/2006/relationships'
const relationship = (target: string, kind: string) => `<Relationships xmlns="${packageRel}"><Relationship Id="rId1" Type="${office}/${kind}" Target="${target}"/></Relationships>`
const pack = (parts: Record<string, string>) => Buffer.from(zipSync(Object.fromEntries(Object.entries(parts).map(([name, text]) => [name, strToU8(text)]))))
const word = {
  name: 'ficha.docx', mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  buffer: pack({
    '[Content_Types].xml': '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>',
    '_rels/.rels': relationship('word/document.xml', 'officeDocument'),
    'word/document.xml': '<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body><w:p><w:r><w:t>Versa Ficha Escolar</w:t></w:r></w:p><w:sectPr><w:pgSz w:w="11906" w:h="16838"/><w:pgMar w:top="1000" w:bottom="1000" w:left="1000" w:right="1000"/></w:sectPr></w:body></w:document>',
  }),
}
const excel = {
  name: 'notas.xlsx', mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  buffer: pack({
    'xl/workbook.xml': `<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="${office}"><sheets><sheet name="Notas" sheetId="1" r:id="rId1"/></sheets></workbook>`,
    'xl/_rels/workbook.xml.rels': relationship('worksheets/sheet1.xml', 'worksheet'),
    'xl/worksheets/sheet1.xml': '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData><row r="1"><c r="A1" t="inlineStr"><is><t>Nome</t></is></c><c r="B1" t="inlineStr"><is><t>Nota</t></is></c></row><row r="2"><c r="A2" t="inlineStr"><is><t>Daniel</t></is></c><c r="B2"><v>18</v></c></row></sheetData></worksheet>',
  }),
}
const slides = {
  name: 'aula.pptx', mimeType: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  buffer: pack({
    'ppt/presentation.xml': `<p:presentation xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main" xmlns:r="${office}"><p:sldIdLst><p:sldId id="256" r:id="rId1"/></p:sldIdLst><p:sldSz cx="12192000" cy="6858000"/></p:presentation>`,
    'ppt/_rels/presentation.xml.rels': relationship('slides/slide1.xml', 'slide'),
    'ppt/slides/slide1.xml': '<p:sld xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"><p:cSld><p:spTree><p:sp><p:nvSpPr><p:nvPr><p:ph type="title"/></p:nvPr></p:nvSpPr><p:txBody><a:bodyPr/><a:p><a:r><a:rPr sz="4400" b="1"/><a:t>Ficha da turma</a:t></a:r></a:p></p:txBody></p:sp></p:spTree></p:cSld></p:sld>',
  }),
}

const cases = [
  ['docs', 'word-pdf', 'pdf', word], ['docs', 'word-text', 'txt', word], ['docs', 'word-count', 'txt', word],
  ['docs', 'excel-pdf', 'pdf', excel], ['slides', 'slides-pdf', 'pdf', slides], ['slides', 'slides-img', 'zip', slides],
  ['school', 'school-header', 'pdf', undefined], ['school', 'school-a4', 'pdf', undefined],
  ['school', 'school-scan', 'pdf', undefined], ['school', 'school-merge', 'pdf', undefined],
] as const

for (const [category, recipe, extension, fixture] of cases) {
  test(`runs ${recipe} locally and downloads valid output`, async ({ page }) => {
    const errors: string[] = []
    page.on('pageerror', error => errors.push(error.message))
    page.on('console', message => { if (message.type() === 'error') errors.push(message.text()) })
    await page.emulateMedia({ reducedMotion: 'reduce' })
    await page.goto('/')
    const pdf = { name: 'teste.pdf', mimeType: 'application/pdf', buffer: Buffer.from(await samplePdf().arrayBuffer()) }
    const photo = {
      name: 'photo.png', mimeType: 'image/png', buffer: Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAIAAAD91JpzAAAAFklEQVR4nGP8z8DAwMDAxMDAwMDAAAANHQEDasKb6QAAAABJRU5ErkJggg==', 'base64'),
    }
    await page.locator('.file-input').setInputFiles(fixture ?? (recipe === 'school-scan' ? photo : recipe === 'school-merge' ? [pdf, { ...pdf, name: 'segundo.pdf' }] : pdf))
    await expect(page.locator('.wheel-status')).toHaveText('Ficheiros verificados')
    await page.locator(`.wheel-buttons [data-slice=${category}]`).click()
    if (recipe === 'school-header') {
      await page.getByText('Opções de saída', { exact: true }).click()
      await page.getByLabel('Nome da escola').fill('Escola da Matola')
      await page.getByLabel('Logótipo').setInputFiles(photo)
      await expect(page.locator('.logo-label')).toHaveText(photo.name)
    }
    await page.locator(`.wheel-buttons [data-slice=${recipe}]`).click()
    await expect(page.locator('.wheel-status')).toHaveText('Conversão concluída', { timeout: 15000 })
    const waiting = page.waitForEvent('download')
    await page.getByRole('link', { name: 'Descarregar', exact: true }).click()
    const download = await waiting
    expect(download.suggestedFilename()).toMatch(new RegExp(`\\.${extension}$`))
    const bytes = await readFile((await download.path())!)
    if (extension === 'pdf') {
      const result = await PDFDocument.load(bytes)
      expect(result.getPageCount()).toBe(recipe === 'school-merge' ? 2 : 1)
      if (recipe === 'school-header') expect(result.getPage(0).getHeight()).toBeGreaterThan(842)
      if (recipe === 'school-a4') expect(result.getPage(0).getHeight()).toBeCloseTo(841.89)
    }
    if (extension === 'zip') {
      const jpg = unzipSync(bytes)['aula-01.jpg']
      expect([...jpg.subarray(0, 3)]).toEqual([255, 216, 255])
    }
    if (recipe === 'word-text') expect(bytes.toString()).toContain('Versa Ficha Escolar')
    if (recipe === 'word-count') expect(bytes.toString().trim()).toBe('3')
    expect(errors).toEqual([])
  })
}
