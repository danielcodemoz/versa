import { extensionFromName, kindFromMime, type Category } from '../packages/engine/catalog'

const categoriesByFormat = new Map<string, Category>([
  ['pdf', 'pdf'],
  ['doc', 'docs'], ['docx', 'docs'], ['odt', 'docs'], ['txt', 'docs'], ['xlsx', 'docs'],
  ['ppt', 'slides'], ['pptx', 'slides'],
  ...['jpg', 'png', 'webp', 'avif', 'gif', 'bmp', 'tif', 'tiff', 'svg', 'ico', 'heic', 'heif']
    .map(format => [format, 'image'] as const),
])

const extraMimeCategories = new Map<string, Category>([
  ['application/msword', 'docs'],
  ['application/vnd.oasis.opendocument.text', 'docs'],
  ['text/plain', 'docs'],
  ['application/vnd.ms-powerpoint', 'slides'],
])

function fileCategory(file: File): Category | undefined {
  const extension = extensionFromName(file.name)
  const byExtension = extension && categoriesByFormat.get(extension)
  if (byExtension) return byExtension
  if (file.type.startsWith('image/')) return 'image'
  const kind = kindFromMime(file.type)
  return kind ? categoriesByFormat.get(kind) : extraMimeCategories.get(file.type)
}

export function categoryForDrop(files: File[]): Category | undefined {
  const first = files[0] && fileCategory(files[0])
  return first && files.every(file => fileCategory(file) === first) ? first : undefined
}
