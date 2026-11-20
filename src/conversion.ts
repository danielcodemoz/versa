import { type Language, type Recipe, t } from './catalog'

export interface ConversionResult { blob: Blob; name: string; demo?: boolean }
export const canRun = (_recipe: Recipe) => true

export async function convert(recipe: Recipe, files: File[], language: Language, progress: (value: number) => void): Promise<ConversionResult> {
  const total = files.reduce((sum, file) => sum + file.size, 0)
  let read = 0
  for (const file of files) {
    for (let offset = 0; offset < file.size; offset += 1024 * 1024) {
      read += (await file.slice(offset, offset + 1024 * 1024).arrayBuffer()).byteLength
      progress(Math.round(95 * read / total))
    }
  }
  const report = [
    'Versa — ' + t(language, ['Demonstração', 'Demo']),
    t(language, ['Acção', 'Action']) + ': ' + t(language, recipe.name),
    t(language, ['Ficheiros', 'Files']) + ': ' + files.map(file => file.name).join(', '),
    t(language, ['Saída prevista', 'Target output']) + ': ' + recipe.output,
  ].join('\n')
  return { blob: new Blob([report], { type: 'text/plain;charset=utf-8' }), name: 'versa-demonstracao.txt', demo: true }
}
