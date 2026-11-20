import { attr, children, nodes, openOffice, relationId, relations, xml } from './ooxml'
import { canvasPage, linesFor, newCanvas, newPdf } from './office-render'
import { zipFiles } from './pdf'
import { bytesBlob, canvasBlob, localName, type Context, type Handler } from './types'

const defaultTheme: Record<string, string> = {
  dk1: '#151515', lt1: '#ffffff', dk2: '#1a1a2e', lt2: '#f4efe3',
  accent1: '#2b50e8', accent2: '#e8432e', accent3: '#1fa35c', accent4: '#ff8a00', accent5: '#a98afa', accent6: '#ffd60a',
  tx1: '#151515', tx2: '#1a1a2e', bg1: '#ffffff', bg2: '#f4efe3',
}
function colour(element: Element | undefined, theme: Record<string, string>) {
  if (!element) return undefined
  const rgb = attr(nodes(element, 'srgbClr')[0], 'val')
  const themeColour = attr(nodes(element, 'schemeClr')[0], 'val')
  return rgb && /^[0-9a-f]{6}$/i.test(rgb) ? '#' + rgb : themeColour ? theme[themeColour] : undefined
}

interface Box { x: number; y: number; w: number; h: number }
function bounds(shape: Element, scale: number, width: number, height: number): Box {
  const transform = nodes(shape, 'xfrm')[0]
  const offset = transform && children(transform, 'off')[0]
  const extents = transform && children(transform, 'ext')[0]
  const type = attr(nodes(shape, 'ph')[0], 'type')
  const title = type === 'title' || type === 'ctrTitle'
  if (!offset || !extents) return title
    ? { x: width * .06, y: height * .06, w: width * .88, h: height * .18 }
    : { x: width * .08, y: height * .28, w: width * .84, h: height * .65 }
  return { x: Number(attr(offset, 'x')) * scale, y: Number(attr(offset, 'y')) * scale, w: Number(attr(extents, 'cx')) * scale, h: Number(attr(extents, 'cy')) * scale }
}

function paintShape(ctx: CanvasRenderingContext2D, shape: Element, box: Box, theme: Record<string,string>, scale: number) {
  const properties = children(shape, 'spPr')[0]
  const background = properties && colour(children(properties, 'solidFill')[0], theme)
  const outline = properties && children(properties, 'ln')[0]
  const line = outline && colour(children(outline, 'solidFill')[0], theme)
  const geometry = properties && attr(children(properties, 'prstGeom')[0], 'prst')
  if (background || line) {
    ctx.beginPath()
    if (geometry === 'ellipse') ctx.ellipse(box.x + box.w / 2, box.y + box.h / 2, box.w / 2, box.h / 2, 0, 0, Math.PI * 2)
    else if (geometry === 'roundRect') ctx.roundRect(box.x, box.y, box.w, box.h, Math.min(box.w, box.h) * .13)
    else ctx.rect(box.x, box.y, box.w, box.h)
    if (background) { ctx.fillStyle = background; ctx.fill() }
    if (line) { ctx.strokeStyle = line; ctx.lineWidth = Math.max(1, Number(attr(outline, 'w') ?? 12000) * scale); ctx.stroke() }
  }
  const text = children(shape, 'txBody')[0]
  if (!text) return
  ctx.beginPath()
  ctx.rect(box.x, box.y, box.w, box.h)
  ctx.clip()
  const scalePt = scale * 12700
  let y = box.y + 6
  for (const paragraph of children(text, 'p')) {
    const style = children(paragraph, 'pPr')[0]
    const runs = children(paragraph, 'r')
    const formats = runs.map(run => children(run, 'rPr')[0])
    const defaultFormat = style && children(style, 'defRPr')[0]
    const first = formats.find(Boolean) ?? defaultFormat
    const placeholder = attr(nodes(shape, 'ph')[0], 'type')
    const pts = Number(attr(first, 'sz') ?? (placeholder?.toLowerCase().includes('title') ? 3400 : 1800)) / 100
    const size = Math.max(9, Math.min(125, pts * scalePt))
    const bold = attr(first, 'b') === '1' || Boolean(placeholder?.toLowerCase().includes('title'))
    const italic = attr(first, 'i') === '1'
    ctx.font = `${italic ? 'italic ' : ''}${bold ? 'bold ' : ''}${size}px sans-serif`
    ctx.fillStyle = colour(first, theme) ?? '#171a21'
    const alignment = attr(style, 'algn')
    ctx.textAlign = alignment === 'ctr' ? 'center' : alignment === 'r' ? 'right' : 'left'
    const x = alignment === 'ctr' ? box.x + box.w / 2 : alignment === 'r' ? box.x + box.w - 8 : box.x + 8
    const textContent = Array.from(paragraph.children).map(element => element.localName === 'br' ? '\n' : children(element, 't')[0]?.textContent ?? '').join('')
    const bullet = style && children(style, 'buChar')[0]
    for (const row of linesFor(ctx, (bullet ? (attr(bullet, 'char') ?? '•') + ' ' : '') + textContent, Math.max(1, box.w - 16))) {
      y += size * 1.13
      ctx.fillText(row, x, y, Math.max(1, box.w - 16))
    }
    y += size * .15
  }
}

export function slidesHandler(asImages: boolean): Handler {
  return async ({ files: [file], progress }: Context) => {
    const source = 'ppt/presentation.xml'
    const parts = await openOffice(file)
    const presentation = xml(parts, source)
    const slideIds = nodes(presentation, 'sldId')
    const references = relations(parts, source)
    const paths = slideIds.map(relationship => references.get(relationId(relationship) ?? '')).filter((path): path is string => Boolean(path))
    if (!paths.length) throw new Error('PowerPoint file has no slides')
    const size = nodes(presentation, 'sldSz')[0]
    const sourceWidth = Math.max(1000, Number(attr(size, 'cx') ?? 12192000))
    const sourceHeight = Math.max(1000, Number(attr(size, 'cy') ?? 6858000))
    const scale = 1600 / Math.max(sourceWidth, sourceHeight)
    const width = Math.max(1, Math.round(sourceWidth * scale))
    const height = Math.max(1, Math.round(sourceHeight * scale))
    const theme = { ...defaultTheme }
    if (parts['ppt/theme/theme1.xml']) {
      const set = nodes(xml(parts, 'ppt/theme/theme1.xml'), 'clrScheme')[0]
      for (const entry of Array.from(set?.children ?? [])) {
        const rgb = colour(entry, theme) ?? (attr(nodes(entry, 'sysClr')[0], 'lastClr') ? '#' + attr(nodes(entry, 'sysClr')[0], 'lastClr') : undefined)
        if (rgb) theme[entry.localName] = rgb
      }
    }
    const output = asImages ? undefined : await newPdf(localName(file, 'pdf', ' (Versa)'))
    const bitmaps: Record<string, Uint8Array> = {}
    for (const [index, path] of paths.entries()) {
      const slide = xml(parts, path)
      const links = relations(parts, path)
      const { canvas, ctx } = newCanvas(width, height)
      const background = colour(nodes(slide, 'bgPr')[0], theme)
      if (background) { ctx.fillStyle = background; ctx.fillRect(0, 0, width, height) }
      const tree = nodes(slide, 'spTree')[0]
      if (tree) {
        for (const shape of Array.from(tree.children)) {
          if (!['sp', 'pic', 'cxnSp'].includes(shape.localName)) continue
          const box = bounds(shape, scale, width, height)
          if (!(box.w > 0 && box.h > 0)) continue
          ctx.save()
          try {
            const rotation = Number(attr(nodes(shape, 'xfrm')[0], 'rot') ?? 0) / 60000 * Math.PI / 180
            if (rotation) {
              ctx.translate(box.x + box.w / 2, box.y + box.h / 2)
              ctx.rotate(rotation)
              ctx.translate(-box.x - box.w / 2, -box.y - box.h / 2)
            }
            if (shape.localName === 'pic') {
              const blip = nodes(shape, 'blip')[0]
              const media = blip ? links.get(relationId(blip, 'embed') ?? '') : undefined
              if (media && parts[media] && /\.(png|jpe?g|gif|webp)$/i.test(media)) {
                const bitmap = await createImageBitmap(bytesBlob(parts[media], 'application/octet-stream'))
                try { ctx.drawImage(bitmap, box.x, box.y, box.w, box.h) } finally { bitmap.close() }
              }
            } else paintShape(ctx, shape, box, theme, scale)
          } finally { ctx.restore() }
        }
      }
      if (output) await canvasPage(output.document, canvas, 720, 720 * height / width)
      else {
        const name = localName(file, 'jpg', `-${String(index + 1).padStart(2, '0')}`)
        bitmaps[name] = new Uint8Array(await (await canvasBlob(canvas, 'image/jpeg', .93)).arrayBuffer())
        canvas.width = canvas.height = 0
      }
      progress(Math.round(10 + 83 * (index + 1) / paths.length))
    }
    return output ? output.finish() : { blob: await zipFiles(bitmaps), name: localName(file, 'zip', ' (Versa - slides)') }
  }
}
