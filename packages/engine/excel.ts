import { attr, nodes, openOffice, relationId, relations, xml } from './ooxml'
import { canvasPage, newCanvas, newPdf } from './office-render'
import { localName, type Context } from './types'

const columnIndex = (address: string) => [...address.replace(/[^A-Z]/g, '')].reduce((value, letter) => value * 26 + letter.charCodeAt(0) - 64, 0) - 1

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
  const output = await newPdf(localName(file, 'pdf', ' (Versa)'))
  for (const [sheetIndex, sheet] of sheets.entries()) {
    const worksheet = xml(parts, sheet.path)
    const rows = nodes(worksheet, 'row').map(row => nodes(row, 'c').flatMap(cell => {
      const column = columnIndex(attr(cell, 'r') ?? '')
      const value = nodes(cell, 'v')[0]?.textContent ?? ''
      const type = attr(cell, 't')
      const text = type === 's' ? shared[Number(value)] ?? '' : type === 'inlineStr' ? nodes(cell, 't').map(node => node.textContent).join('') :
        type === 'b' ? value === '1' ? 'TRUE' : 'FALSE' : value || nodes(cell, 'f')[0]?.textContent || ''
      return column >= 0 && text ? [{ column, text, numeric: !type || type === 'n' }] : []
    })).filter(row => row.length)
    const columns = [...new Set(rows.flatMap(row => row.map(cell => cell.column)))].sort((a, b) => a - b)
    const rowCount = Math.max(rows.length, 1)
    const columnCount = Math.max(columns.length, 1)
    for (let startRow = 0; startRow < rowCount; startRow += 28) {
      for (let startColumn = 0; startColumn < columnCount; startColumn += 8) {
        const { canvas, ctx } = newCanvas(1160, 820)
        ctx.fillStyle = '#172826'
        ctx.font = 'bold 28px sans-serif'
        ctx.fillText(sheet.name, 38, 55, 1020)
        ctx.font = '15px sans-serif'
        const visible = columns.slice(startColumn, startColumn + 8)
        const positions = new Map(visible.map((column, index) => [column, index]))
        const width = 1084 / Math.max(visible.length, 1)
        const chunk = rows.slice(startRow, startRow + 28)
        for (const [index, row] of chunk.entries()) {
          const y = 78 + index * 25
          ctx.fillStyle = index % 2 ? '#f0f5f2' : '#fff'
          ctx.fillRect(38, y, 1084, 25)
          ctx.strokeStyle = '#c7d5ce'
          ctx.strokeRect(38, y, 1084, 25)
          ctx.fillStyle = '#172826'
          for (const cell of row) {
            const position = positions.get(cell.column)
            if (position === undefined) continue
            const x = 38 + position * width
            ctx.strokeRect(x, y, width, 25)
            ctx.textAlign = cell.numeric ? 'right' : 'left'
            ctx.fillText(cell.text, x + (cell.numeric ? width - 8 : 8), y + 18, width - 16)
          }
        }
        await canvasPage(output.document, canvas, 841.89, 595.28)
      }
    }
    progress(Math.round(10 + 84 * (sheetIndex + 1) / sheets.length))
  }
  return output.finish()
}
