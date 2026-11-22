import {
  PDFArray, PDFCheckBox, PDFDict, PDFDocument, PDFDropdown, PDFHexString, PDFName,
  PDFObjectCopier, PDFOptionList, PDFPage, PDFRadioGroup, PDFRef, PDFTextField,
  StandardFonts, degrees, rgb, LineCapStyle, type PDFField, type PDFFont,
} from 'pdf-lib'
import { baseline, framePointToPdf, lineHeight, normalise } from './editor-geometry'
import { arrowHead, bounds, fieldKey, offset, type Bitmap, type Family, type FormField, type FormValue, type Meta, type Point, type Sheet } from './editor-model'

export async function describeForms(bytes: Uint8Array): Promise<FormField[]> {
  const doc = await PDFDocument.load(bytes, { updateMetadata: false })
  return doc.getForm().getFields().flatMap<FormField>(field => {
    if (field.isReadOnly()) return []
    const name = field.getName()
    if (field instanceof PDFTextField && !field.isRichFormatted()) {
      return [{ name, kind: 'text', value: field.getText() ?? '', multiline: field.isMultiline(), maxLength: field.getMaxLength() }]
    }
    if (field instanceof PDFCheckBox) return [{ name, kind: 'check', value: field.isChecked() }]
    if (field instanceof PDFRadioGroup) return [{ name, kind: 'choice', options: field.getOptions(), value: field.getSelected() ?? '' }]
    if (field instanceof PDFDropdown || field instanceof PDFOptionList) {
      return [{ name, kind: 'choice', options: field.getOptions(), value: field.getSelected(), multiple: field.isMultiselect(), editable: field instanceof PDFDropdown && field.isEditable() }]
    }
    return []
  })
}

function fill(field: PDFField, value: FormValue) {
  if (field instanceof PDFTextField && typeof value === 'string') field.setText(value)
  else if (field instanceof PDFCheckBox && typeof value === 'boolean') value ? field.check() : field.uncheck()
  else if (field instanceof PDFRadioGroup && typeof value === 'string') value ? field.select(value) : field.clear()
  else if ((field instanceof PDFDropdown || field instanceof PDFOptionList) && typeof value !== 'boolean') {
    if (value.length) field.select(value)
    else field.clear()
  }
}

const name = PDFName.of
const fieldProperties = ['FT', 'Ff', 'V', 'DV', 'DA', 'Q', 'Opt', 'MaxLen', 'TU', 'TM', 'I', 'TI']
const colour = (hex: string) => rgb(...([1, 3, 5].map(index => parseInt(hex.slice(index, index + 2), 16) / 255) as [number, number, number]))
const standard = { sans: StandardFonts.Helvetica, serif: StandardFonts.TimesRoman, mono: StandardFonts.Courier } as const
const encodable = (font: PDFFont, line: string) => [...line].map(character => {
  try { font.encodeText(character); return character } catch { return '?' }
}).join('')

export function editedPdfWriter(metas: Meta[], sources: Blob[], bitmaps: Bitmap[], values: Record<string, FormValue>) {
  const loaded = new Map<number, { doc: PDFDocument; widgets: Map<PDFDict, PDFField> }>()
  let unicodeFont: Promise<ArrayBuffer> | undefined

  async function loadSource(id: number) {
    const cached = loaded.get(id)
    if (cached) return cached
    const doc = await PDFDocument.load(await sources[id].arrayBuffer(), { updateMetadata: false })
    const form = doc.getForm()
    const widgets = new Map<PDFDict, PDFField>()
    const edited: FormValue[] = []
    for (const field of form.getFields()) {
      for (const widget of field.acroField.getWidgets()) widgets.set(widget.dict, field)
      const value = values[fieldKey(id, field.getName())]
      if (value !== undefined) { fill(field, value); edited.push(value) }
    }
    if (edited.length) {
      const standardFont = await doc.embedFont(StandardFonts.Helvetica)
      const needsUnicode = edited.some(value => typeof value !== 'boolean' && [value].flat().some(text =>
        text.split(/\r?\n/).some(line => encodable(standardFont, line) !== line)))
      if (needsUnicode) {
        const { default: fontkit } = await import('@pdf-lib/fontkit')
        doc.registerFontkit(fontkit)
        const support = import.meta.env.DEV ? '/node_modules/pdfjs-dist/' : import.meta.env.BASE_URL + 'pdfjs/'
        unicodeFont ??= fetch(support + 'standard_fonts/LiberationSans-Regular.ttf').then(response => {
          if (!response.ok) throw new Error('PDF form font unavailable')
          return response.arrayBuffer()
        })
        form.updateFieldAppearances(await doc.embedFont(await unicodeFont, { subset: true }))
      } else form.updateFieldAppearances(standardFont)
    }
    await doc.flush()
    const input = { doc, widgets }
    loaded.set(id, input)
    return input
  }

  return (sheets: Sheet[]) => writeEditedPdf(sheets, metas, bitmaps, loadSource)
}

async function writeEditedPdf(
  sheets: Sheet[], metas: Meta[], bitmaps: Bitmap[],
  loadSource: (id: number) => Promise<{ doc: PDFDocument; widgets: Map<PDFDict, PDFField> }>,
) {
  const output = await PDFDocument.create()
  const inputs = new Map<number, {
    doc: PDFDocument; copiers: PDFObjectCopier[]; counts: Map<number, number>; widgets: Map<PDFDict, PDFField>
  }>()
  const fonts = new Map<Family, PDFFont>()
  const images = new Map<number, Awaited<ReturnType<typeof output.embedPng>>>()
  const branches = new Map<string, { ref: PDFRef; kids: PDFArray }>()
  const namespaces = new Map<number, string>()
  const topNames = new Set<string>()
  const fields = new Map<PDFField, { ref: PDFRef; kids: PDFArray }>()

  async function inputFor(id: number) {
    const cached = inputs.get(id)
    if (cached) return cached
    const input = { ...await loadSource(id), copiers: [], counts: new Map<number, number>() }
    inputs.set(id, input)
    return inputs.get(id)!
  }

  function formNode(part: string, parent?: { ref: PDFRef; kids: PDFArray }) {
    const kids = output.context.obj([])
    const dict = output.context.obj({ T: PDFHexString.fromText(part), Kids: kids })
    const ref = output.context.register(dict)
    if (parent) {
      dict.set(name('Parent'), parent.ref)
      parent.kids.push(ref)
    } else output.getForm().acroForm.addField(ref)
    return { ref, kids, dict }
  }

  function registerWidget(field: PDFField, source: number, widget: PDFDict, widgetRef: PDFRef, page: PDFPage, copier: PDFObjectCopier) {
    let root = fields.get(field)
    if (!root) {
      const parts = field.getName().split('.')
      if (source) {
        if (!namespaces.has(source)) {
          const base = `PDF ${source + 1}`
          let unique = base
          for (let suffix = 2; topNames.has(unique); suffix++) unique = `${base} (${suffix})`
          topNames.add(unique)
          namespaces.set(source, unique)
        }
        parts.unshift(namespaces.get(source)!)
      }
      let parent: { ref: PDFRef; kids: PDFArray } | undefined
      for (let index = 0; index < parts.length - 1; index++) {
        const key = JSON.stringify(parts.slice(0, index + 1))
        parent = branches.get(key) ?? formNode(parts[index], parent)
        branches.set(key, parent)
      }
      const terminal = formNode(parts.at(-1)!, parent)
      for (const prop of fieldProperties) {
        const key = name(prop)
        const value = field.acroField.getInheritableAttribute(key)
        if (value !== undefined) terminal.dict.set(key, copier.copy(value))
      }
      root = terminal
      fields.set(field, root)
    }
    for (const prop of [...fieldProperties, 'T', 'Kids', 'A', 'AA']) widget.delete(name(prop))
    widget.set(name('Parent'), root.ref)
    widget.set(name('P'), page.ref)
    root.kids.push(widgetRef)
  }

  async function makePage(meta: Meta) {
    if (meta.source === undefined || meta.page === undefined) return output.addPage([meta.w, meta.h])
    const input = await inputFor(meta.source)
    const oldPage = input.doc.getPage(meta.page)
    const occurrence = input.counts.get(meta.page) ?? 0
    input.counts.set(meta.page, occurrence + 1)
    const copier = input.copiers[occurrence] ??= PDFObjectCopier.for(input.doc.context, output.context)
    const leaf = copier.copy(oldPage.node)
    const page = output.addPage(PDFPage.of(leaf, output.context.register(leaf), output))
    const oldAnnots = oldPage.node.Annots()
    const annots = page.node.Annots()
    for (let index = 0; oldAnnots && annots && index < oldAnnots.size(); index++) {
      const oldWidget = oldAnnots.lookupMaybe(index, PDFDict)
      const field = oldWidget && input.widgets.get(oldWidget)
      const widget = annots.lookupMaybe(index, PDFDict)
      if (!widget || widget.lookup(name('Subtype')) !== name('Widget')) continue
      if (!field) continue
      const annotation = annots.get(index)
      const ref = annotation instanceof PDFRef ? annotation : output.context.register(widget)
      if (annotation !== ref) annots.set(index, ref)
      registerWidget(field, meta.source, widget, ref, page, copier)
    }
    return page
  }

  async function fontFor(family: Family) {
    if (!fonts.has(family)) fonts.set(family, await output.embedFont(standard[family]))
    return fonts.get(family)!
  }

  if (sheets.some(sheet => metas[sheet.src].source === 0)) {
    const primary = await inputFor(0)
    for (const field of primary.doc.getForm().getFields()) topNames.add(field.getName().split('.')[0])
  }

  for (const sheet of sheets) {
    const meta = metas[sheet.src]
    const page = await makePage(meta)
    const base = normalise(page.getRotation().angle)
    const crop = page.getCropBox()
    const unit = meta.unit
    const map = (x: number, y: number) => framePointToPdf(base, crop, x / unit, y / unit)
    const line = (from: Point, to: Point, color: string, width: number) => {
      const [x1, y1] = map(...from), [x2, y2] = map(...to)
      page.drawLine({ start: { x: x1, y: y1 }, end: { x: x2, y: y2 }, color: colour(color), thickness: width / unit, lineCap: LineCapStyle.Round })
    }
    const box = (point: Point, w: number, h: number, color: string, stroke = 0, angle = 0) => {
      const [x, y] = map(...offset(point, angle, 0, h))
      page.drawRectangle({ x, y, width: w / unit, height: h / unit, rotate: degrees(base - angle * 180 / Math.PI),
        ...(stroke ? { borderColor: colour(color), borderWidth: stroke / unit } : { color: colour(color) }) })
    }

    for (const note of sheet.notes) {
      switch (note.kind) {
        case 'text': {
          const font = await fontFor(note.font)
          for (const [row, text] of note.text.split('\n').entries()) {
            if (!text.trim()) continue
            const [x, y] = map(note.x, note.y + note.size * (baseline[note.font] + row * lineHeight))
            page.drawText(encodable(font, text), { x, y, size: note.size / unit, font, color: colour(note.color), rotate: degrees(base) })
          }
          break
        }
        case 'replace': {
          const { origin, angle, ascent, w, h, size, background, color, font: family } = note.block
          box(offset(origin, angle, -.7, -ascent - .7), w + 1.4, h + 1.4, background, 0, angle)
          const font = await fontFor(family)
          const [x, y] = map(...origin)
          if (note.text) page.drawText(encodable(font, note.text), { x, y, size: size / unit, font, color: colour(color), rotate: degrees(base - angle * 180 / Math.PI) })
          break
        }
        case 'ink': {
          const d = note.points.map(([fx, fy], at) => { const [x, y] = map(fx, fy); return `${at ? 'L' : 'M'}${x.toFixed(2)} ${(-y).toFixed(2)}${note.points.length === 1 ? 'l.01 -.01' : ''}` }).join('')
          page.drawSvgPath(d, { x: 0, y: 0, borderColor: colour(note.color), borderWidth: note.width / unit, borderOpacity: note.alpha, borderLineCap: LineCapStyle.Round })
          break
        }
        case 'pic': {
          if (!images.has(note.image)) {
            const bitmap = bitmaps[note.image]
            const bytes = await bitmap.data.arrayBuffer()
            images.set(note.image, bitmap.type === 'jpg' ? await output.embedJpg(bytes) : await output.embedPng(bytes))
          }
          const angle = note.angle * Math.PI / 180
          const centre: Point = [note.x + note.w / 2, note.y + note.h / 2]
          const [x, y] = map(...offset(centre, angle, -note.w / 2, note.h / 2))
          page.drawImage(images.get(note.image)!, { x, y, width: note.w / unit, height: note.h / unit, rotate: degrees(base - note.angle), opacity: note.opacity })
          break
        }
        case 'shape': {
          const { from, to, mode, color, width } = note
          const { x, y, w, h } = bounds(from, to)
          if (mode === 'rect' || mode === 'cover') box([x, y], w, h, mode === 'cover' ? '#ffffff' : color, mode === 'cover' ? 0 : width)
          else if (mode === 'circle') {
            const [cx, cy] = map(x + w / 2, y + h / 2)
            page.drawEllipse({ x: cx, y: cy, xScale: w / (2 * unit), yScale: h / (2 * unit), rotate: degrees(base), borderColor: colour(color), borderWidth: width / unit })
          } else {
            line(from, to, color, width)
            if (mode === 'arrow') for (const end of arrowHead(from, to, width)) line(to, end, color, width)
          }
          break
        }
        case 'stamp': {
          const font = await fontFor('sans')
          const size = 16 / unit
          const label = encodable(font, note.text)
          box(note.at, font.widthOfTextAtSize(label, size) * unit + 18, 29, note.color, 1.6)
          const [x, y] = map(note.at[0] + 9, note.at[1] + 20)
          page.drawText(label, { x, y, size, font, color: colour(note.color), rotate: degrees(base) })
          break
        }
        case 'comment': {
          const corners = [map(...note.at), map(note.at[0] + 18, note.at[1] + 18)]
          const [a, b] = corners
          const annotation = output.context.obj({
            Type: 'Annot', Subtype: 'Text', Name: 'Comment', F: 4, P: page.ref,
            Rect: [Math.min(a[0], b[0]), Math.min(a[1], b[1]), Math.max(a[0], b[0]), Math.max(a[1], b[1])],
            Contents: PDFHexString.fromText(note.text), T: PDFHexString.fromText('Versa'), C: [1, .88, .3],
          })
          page.node.addAnnot(output.context.register(annotation))
        }
      }
    }
    page.setRotation(degrees((base + sheet.turn) % 360))
  }
  return output.save({ updateFieldAppearances: false })
}
