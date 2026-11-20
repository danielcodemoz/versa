import { unzipSync, zipSync, strFromU8, strToU8 } from 'fflate'

export const nodes = (root: Document | Element, name: string) => Array.from(root.getElementsByTagNameNS('*', name))
export const children = (root: Element, name: string) => Array.from(root.children).filter(child => child.localName === name)
export const attr = (element: Element | undefined, name: string): string | undefined =>
  Array.from(element?.attributes ?? []).find(attribute => attribute.localName === name)?.value
const relNamespace = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships'
export const relationId = (element: Element, name = 'id') => element.getAttributeNS(relNamespace, name)
  ?? Array.from(element.attributes).find(attribute => attribute.localName === name && attribute.prefix === 'r')?.value

export function parseXml(source: string) {
  const doc = new DOMParser().parseFromString(source, 'application/xml')
  if (nodes(doc, 'parsererror').length || doc.doctype) throw new Error('Invalid Office XML')
  return doc
}
export function xml(parts: Record<string, Uint8Array>, path: string) {
  const data = parts[path]
  if (!data) throw new Error('Office part missing')
  return parseXml(strFromU8(data))
}

export async function openOffice(file: File) {
  let expandedSize = 0
  let count = 0
  return unzipSync(new Uint8Array(await file.arrayBuffer()), { filter(entry) {
    expandedSize += entry.originalSize
    if (++count > 12000 || entry.originalSize > 55 * 1024 ** 2 || expandedSize > 160 * 1024 ** 2) throw new Error('Office package too large')
    return !entry.name.endsWith('/') && !entry.name.split('/').some(part => part === '..' || part === '.') && !entry.name.includes('\\')
  } })
}

export function packageTarget(origin: string, target: string) {
  const parts = target.startsWith('/') ? [] : origin.split('/').slice(0, -1)
  for (const segment of target.split('/')) {
    if (segment === '..') parts.pop()
    else if (segment && segment !== '.') parts.push(segment)
  }
  return parts.join('/')
}

export function relations(parts: Record<string, Uint8Array>, source: string) {
  const segments = source.split('/')
  const filename = segments.pop()
  const path = [...segments, '_rels', filename + '.rels'].join('/')
  if (!parts[path]) return new Map<string, string>()
  return new Map(nodes(xml(parts, path), 'Relationship').flatMap(item => {
    const id = item.getAttribute('Id')
    const target = item.getAttribute('Target')
    return id && target && !/^[a-z][a-z0-9+.-]*:|^\/\//i.test(target) && item.getAttribute('TargetMode') !== 'External'
      ? [[id, packageTarget(source, target)] as const] : []
  }))
}

export function sanitiseOffice(parts: Record<string, Uint8Array>) {
  const cleaned: Record<string, Uint8Array> = {}
  for (const [name, payload] of Object.entries(parts)) {
    if (!name.endsWith('.rels')) {
      cleaned[name] = payload
      continue
    }
    const doc = parseXml(strFromU8(payload))
    for (const relation of nodes(doc, 'Relationship')) {
      const target = relation.getAttribute('Target') ?? ''
      if (relation.getAttribute('TargetMode') === 'External' || /^[a-z][a-z0-9+.-]*:|^\/\//i.test(target)) relation.remove()
    }
    cleaned[name] = strToU8(new XMLSerializer().serializeToString(doc))
  }
  return zipSync(cleaned, { level: 0 })
}
