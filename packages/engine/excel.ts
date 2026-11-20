import fontkit from '@pdf-lib/fontkit'
import { PDFDocument, rgb, type PDFFont } from 'pdf-lib'
import { attr, nodes, openOffice, relationId, relations, xml } from './ooxml'
import { calculateCells } from './excel-formulas'
import { pdfOutput } from './pdf'
import { localName, type Context } from './types'

const columnIndex = (address: string) => [...address.replace(/[^A-Z]/g, '')].reduce((value, letter) => value * 26 + letter.charCodeAt(0) - 64, 0) - 1
const textColor = rgb(.09, .16, .15)
const border = rgb(.77, .83, .81)
const lightRow = rgb(.94, .97, .95)

async function fonts(document: PDFDocument) {
  document.registerFontkit(fontkit)
  const base = import.meta.env.DEV ? '/node_modules/pdfjs-dist/' : import.meta.env.BASE_URL + 'pdfjs/'
  return Promise.all(['Regular', 'Bold'].map(async style => {
    const response = await fetch(`${base}standard_fonts/LiberationSans-${style}.ttf`)
    if (!response.ok) throw new Error('Excel fonts unavailable')
    return document.embedFont(await response.arrayBuffer(), { subset: true })
  }))
}
function fit(text: string, font: PDFFont, size: number, width: number, supported: Set<number>): string {
  const clean = [...text.replace(/[\r\n\t]/g, ' ')].map(character => supported.has(character.codePointAt(0)!) ? character : '?')
  if (font.widthOfTextAtSize(clean.join(''), size) <= width) return clean.join('')
  let low = 0, high = clean.length
  while (low < high) {
    const middle = Math.ceil((low + high) / 2)
    if (font.widthOfTextAtSize(clean.slice(0, middle).join('') + '…', size) <= width) low = middle
    else high = middle - 1
  }
  return clean.slice(0, low).join('') + '…'
}

export async function excelPdf({ files: [file], progress }: Context) {
  const parts = await openOffice(file)
  const source = 'xl/workbook.xml'
  const workbook = xml(parts, source)
  const paths = relations(parts, source)
  const shared = parts['xl/sharedStrings.xml'] ? nodes(xml(parts, 'xl/sharedStrings.xml'), 'si').map(item => nodes(item, 't').map(node => node.textContent).join('')) : []
  const sheets = nodes(workbook, 'sheet').flatMap(sheet => {
    const path = paths.get(relationId(sheet) ?? '')
    return path && attr(sheet, 'state') !== 'hidden' && attr(sheet, 'state') !== 'veryHidden' ? [{ name: attr(sheet, 'name') ?? 'Excel', path }] : []
  })
  if (!sheets.length) throw new Error('Excel workbook has no visible sheets')
  const output = await PDFDocument.create()
  const [regular, bold] = await fonts(output)
  const regularChars = new Set(regular.getCharacterSet())
  const boldChars = new Set(bold.getCharacterSet())
  for (const [sheetIndex, sheet] of sheets.entries()) {
    const worksheet = xml(parts, sheet.path)
    const sourceRows = nodes(worksheet, 'row').map(row => nodes(row, 'c').flatMap(cell => {
      const address = attr(cell, 'r')?.toUpperCase()
      if (!address || !/^[A-Z]{1,3}\d+$/.test(address)) return []
      const raw = nodes(cell, 'v')[0]?.textContent || undefined
      const type = attr(cell, 't')
      const formula = nodes(cell, 'f')[0]?.textContent || undefined
      const value = type === 'inlineStr' ? nodes(cell, 't').map(node => node.textContent).join('') :
        raw === undefined ? undefined :
        type === 's' ? shared[Number(raw)] :
        type === 'b' ? raw === '1' :
        !type || type === 'n' ? Number(raw) : raw
      return [{ address, value, formula }]
    }))
    const lookup = new Map(sourceRows.flat().map(cell => [cell.address, cell]))
    const calculate = calculateCells(lookup)
    const rows = sourceRows.map(row => row.flatMap(cell => {
      const value = calculate(cell.address)
      if (value === undefined && !cell.formula) return []
      const text = value === undefined ? '—' : typeof value === 'boolean' ? (value ? 'TRUE' : 'FALSE') :
        typeof value === 'number' && Number.isFinite(value) ? String(Number(value.toPrecision(15))) : String(value)
      return [{ column: columnIndex(cell.address), text, numeric: typeof value === 'number' }]
    })).filter(row => row.length)
    const columns = [...new Set(rows.flatMap(row => row.map(cell => cell.column)))].sort((a, b) => a - b)
    const rowCount = Math.max(rows.length, 1)
    const columnCount = Math.max(columns.length, 1)
    for (let startRow = 0; startRow < rowCount; startRow += 28) {
      for (let startColumn = 0; startColumn < columnCount; startColumn += 8) {
        const page = output.addPage([841.89, 595.28])
        page.drawText(fit(sheet.name, bold, 20, 765, boldChars), { x: 28, y: 556, font: bold, size: 20, color: textColor })
        const visible = columns.slice(startColumn, startColumn + 8)
        const positions = new Map(visible.map((column, index) => [column, index]))
        const width = (page.getWidth() - 56) / Math.max(visible.length, 1)
        const rowHeight = 18
        for (const [index, row] of rows.slice(startRow, startRow + 28).entries()) {
          const y = 537 - (index + 1) * rowHeight
          for (let col = 0; col < visible.length; col++) {
            page.drawRectangle({ x: 28 + col * width, y, width, height: rowHeight, color: index % 2 ? lightRow : rgb(1, 1, 1), borderColor: border, borderWidth: .45 })
          }
          for (const cell of row) {
            const position = positions.get(cell.column)
            if (position === undefined) continue
            const text = fit(cell.text, regular, 10.5, width - 11, regularChars)
            const x = 28 + position * width + (cell.numeric ? width - 5 - regular.widthOfTextAtSize(text, 10.5) : 5)
            page.drawText(text, { x, y: y + 4.5, font: regular, size: 10.5, color: textColor })
          }
        }
      }
    }
    progress(Math.round(10 + 84 * (sheetIndex + 1) / sheets.length))
  }
  return pdfOutput(output, localName(file, 'pdf'))
}
