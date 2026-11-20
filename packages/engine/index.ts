import { available, kindFromName, recipes } from './catalog'
import type { Options } from './types'
export type { ConversionResult, Options } from './types'

export async function convertLocal(id: string, files: File[], options: Options = {}, progress: (percent: number) => void = () => {}) {
  const recipe = recipes.find(entry => entry.id === id)
  const kinds = files.map(file => kindFromName(file.name))
  if (!recipe || !recipe.load || !files.length || !kinds.every(kind => kind !== undefined) || !available(recipe, kinds)) {
    throw new Error('Unsupported conversion')
  }
  const run = await recipe.load()
  progress(5)
  const result = await run({ files, options, progress })
  progress(100)
  return result
}
