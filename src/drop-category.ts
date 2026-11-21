import { extensionFromName, kindFromMime, type Category } from '../packages/engine/catalog'

const categoriesByFormat = new Map<string, Category>([
  ['pdf', 'pdf'],
  ['doc', 'docs'], ['docx', 'docs'], ['odt', 'docs'], ['txt', 'docs'],
  ['ppt', 'slides'], ['pptx', 'slides'],
  ...['jpg', 'png', 'webp', 'avif', 'gif', 'bmp', 'tif', 'tiff', 'svg', 'ico', 'heic', 'heif']
    .map(format => [format, 'image'] as const),
])

const extraMimeFormats = new Map([
  ['application/msword', 'doc'],
  ['application/vnd.oasis.opendocument.text', 'odt'],
  ['text/plain', 'txt'],
  ['application/vnd.ms-powerpoint', 'ppt'],
  ['image/tiff', 'tif'],
  ['image/svg+xml', 'svg'],
  ['image/x-icon', 'ico'],
  ['image/vnd.microsoft.icon', 'ico'],
])

function identify(file: File) {
  const extension = extensionFromName(file.name)
  if (extension === 'xlsx') return undefined
  if (extension && categoriesByFormat.has(extension)) {
    return { format: extension === 'tiff' ? 'tif' : extension, category: categoriesByFormat.get(extension)! }
  }
  const isImage = file.type.startsWith('image/')
  const format = kindFromMime(file.type) ?? extraMimeFormats.get(file.type) ?? (isImage ? file.type.slice(6) : undefined)
  if (!format) return undefined
  const category = categoriesByFormat.get(format) ?? (isImage ? 'image' : undefined)
  return category ? { format, category } : undefined
}

export function categoryForDrop(files: File[]): Category | undefined {
  const first = files[0] && identify(files[0])
  return first && files.every(file => identify(file)?.format === first.format) ? first.category : undefined
}
