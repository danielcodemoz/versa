import { kindFromName, type Kind } from './catalog'

export type Problem = 'empty' | 'large' | 'type' | 'damaged' | 'password'
export interface Preflight { kinds: Kind[]; problem?: Problem }
const decode = (data: Uint8Array) => new TextDecoder('latin1').decode(data)

export async function inspectFiles(files: File[]): Promise<Preflight> {
  const kinds: Kind[] = []
  const memory = (navigator as Navigator & { deviceMemory?: number }).deviceMemory ?? 4
  const limit = Math.min(memory * 48, 192) * 1024 ** 2
  if (files.reduce((sum, file) => sum + file.size, 0) > limit) return { kinds, problem: 'large' }
  for (const file of files) {
    if (!file.size) return { kinds, problem: 'empty' }
    const kind = kindFromName(file.name)
    if (!kind) return { kinds, problem: 'type' }
    try {
      const head = new Uint8Array(await file.slice(0, 1024).arrayBuffer())
      const header = decode(head)
      const tail = decode(new Uint8Array(await file.slice(-65557).arrayBuffer()))
      if (kind === 'pdf') {
        if (!/%PDF-\d\.\d/.test(header) || !/startxref\s+\d+[\s\S]*%%EOF/.test(tail)) return { kinds, problem: 'damaged' }
        if (/\/Encrypt\b/.test(tail)) return { kinds, problem: 'password' }
      } else if (kind === 'docx' || kind === 'xlsx' || kind === 'pptx') {
        if (head[0] === 0xd0 && head[1] === 0xcf && head[2] === 0x11 && head[3] === 0xe0) return { kinds, problem: 'password' }
        const signature = tail.lastIndexOf('PK\x05\x06')
        const root = { docx: 'word/', xlsx: 'xl/', pptx: 'ppt/' }[kind]
        if (!header.startsWith('PK\x03\x04') || signature < 0 || !tail.includes(root)) return { kinds, problem: 'damaged' }
      } else {
        const valid = {
          jpg: head[0] === 255 && head[1] === 216 && head[2] === 255,
          png: head[0] === 137 && header.slice(1, 8) === 'PNG\r\n\x1a\n',
          webp: header.startsWith('RIFF') && header.slice(8, 12) === 'WEBP',
          avif: header.slice(4, 8) === 'ftyp' && /avi[fs]/.test(header.slice(8, 40)),
        }[kind]
        if (!valid) return { kinds, problem: 'damaged' }
        const bitmap = await createImageBitmap(file)
        bitmap.close()
      }
    } catch {
      return { kinds, problem: 'damaged' }
    }
    kinds.push(kind)
  }
  return { kinds }
}
