export type Language = 'pt' | 'en'
export type Phrase = readonly [string, string]
export type Kind = 'pdf' | 'docx' | 'xlsx' | 'pptx' | 'jpg' | 'png' | 'webp' | 'avif'
export const categories = [
  { id: 'pdf', name: ['PDF', 'PDF'], color: '#E8432E', ink: '#210e1a' },
  { id: 'docs', name: ['Word / Docs', 'Word / Docs'], color: '#2B50E8', ink: '#fff' },
  { id: 'image', name: ['Imagem', 'Image'], color: '#1FA35C', ink: '#101a20' },
  { id: 'slides', name: ['Slides', 'Slides'], color: '#FF8A00', ink: '#21152a' },
  { id: 'school', name: ['Escola', 'School'], color: '#FFD60A', ink: '#21152a' },
  { id: 'tools', name: ['Utilitários', 'Tools'], color: '#B598FF', ink: '#21152a' },
] as const
export type Category = typeof categories[number]['id']
export interface Recipe {
  id: string
  category: Category
  name: Phrase
  inputs: readonly Kind[]
  output: string
  multiple?: boolean
  min?: number
}
const images = ['jpg', 'png', 'webp', 'avif'] as const
const pdf = ['pdf'] as const
export const recipes: Recipe[] = [
  { id: 'pdf-word', category: 'pdf', name: ['Para Word', 'To Word'], inputs: pdf, output: 'DOCX' },
  { id: 'pdf-jpg', category: 'pdf', name: ['Para JPG', 'To JPG'], inputs: pdf, output: 'JPG' },
  { id: 'pdf-text', category: 'pdf', name: ['Para texto', 'To text'], inputs: pdf, output: 'TXT' },
  { id: 'pdf-merge', category: 'pdf', name: ['Juntar', 'Merge'], inputs: pdf, output: 'PDF', multiple: true, min: 2 },
  { id: 'pdf-split', category: 'pdf', name: ['Dividir', 'Split'], inputs: pdf, output: 'PDF' },
  { id: 'pdf-compress', category: 'pdf', name: ['Comprimir', 'Compress'], inputs: pdf, output: 'PDF' },
  { id: 'pdf-rotate', category: 'pdf', name: ['Girar', 'Rotate'], inputs: pdf, output: 'PDF' },
  { id: 'word-pdf', category: 'docs', name: ['Word → PDF', 'Word → PDF'], inputs: ['docx'], output: 'PDF' },
  { id: 'excel-pdf', category: 'docs', name: ['Excel → PDF', 'Excel → PDF'], inputs: ['xlsx'], output: 'PDF' },
  { id: 'word-text', category: 'docs', name: ['Extrair texto', 'Extract text'], inputs: ['docx'], output: 'TXT' },
  { id: 'word-count', category: 'docs', name: ['Contar palavras', 'Word count'], inputs: ['docx'], output: 'TXT' },
  { id: 'image-pdf', category: 'image', name: ['Para PDF', 'To PDF'], inputs: images, output: 'PDF', multiple: true },
  { id: 'image-jpg', category: 'image', name: ['Para JPG', 'To JPG'], inputs: images, output: 'JPG' },
  { id: 'image-png', category: 'image', name: ['Para PNG', 'To PNG'], inputs: images, output: 'PNG' },
  { id: 'image-webp', category: 'image', name: ['Para WebP', 'To WebP'], inputs: images, output: 'WEBP' },
  { id: 'image-avif', category: 'image', name: ['Para AVIF', 'To AVIF'], inputs: images, output: 'AVIF' },
  { id: 'slides-pdf', category: 'slides', name: ['Para PDF', 'To PDF'], inputs: ['pptx'], output: 'PDF' },
  { id: 'slides-img', category: 'slides', name: ['Para imagens', 'To images'], inputs: ['pptx'], output: 'JPG' },
  { id: 'school-header', category: 'school', name: ['Cabeçalho', 'Header'], inputs: pdf, output: 'PDF' },
  { id: 'school-scan', category: 'school', name: ['Fotos → PDF', 'Photos → PDF'], inputs: images, output: 'PDF', multiple: true },
  { id: 'school-a4', category: 'school', name: ['2 por A4', '2 per A4'], inputs: pdf, output: 'PDF' },
  { id: 'school-merge', category: 'school', name: ['Juntar testes', 'Merge tests'], inputs: pdf, output: 'PDF', multiple: true, min: 2 },
  { id: 'image-compress', category: 'tools', name: ['Reduzir imagem', 'Compress image'], inputs: images, output: 'JPG' },
  { id: 'image-resize', category: 'tools', name: ['Redimensionar', 'Resize'], inputs: images, output: 'PNG' },
]
export const t = (language: Language, message: Phrase) => message[language === 'pt' ? 0 : 1]
export const categoryFor = (id: Category) => categories.find(category => category.id === id)!
export const available = (recipe: Recipe, kinds: readonly Kind[]) =>
  !kinds.length || (kinds.length >= (recipe.min ?? 1) && (kinds.length === 1 || recipe.multiple) && kinds.every(kind => recipe.inputs.includes(kind)))
export const kindFromName = (name: string): Kind | undefined => {
  const extension = name.split('.').at(-1)?.toLowerCase().replace(/^jpeg$/, 'jpg')
  return ['pdf', 'docx', 'xlsx', 'pptx', ...images].find(kind => kind === extension) as Kind | undefined
}
