import { available, kindFromFile, recipes } from './catalog'
import type { Options } from './types'
import { runBatch } from './batch'
export type { ConversionResult, Options } from './types'

export async function convertLocal(id: string, files: File[], options: Options = {}, progress: (percent: number) => void = () => {}) {
  const recipe = recipes.find(entry => entry.id === id)
  const kinds = files.map(kindFromFile)
  if (!recipe || !recipe.load || !files.length || !kinds.every(kind => kind !== undefined) || !available(recipe, kinds)) {
    throw new Error('Unsupported conversion')
  }
  const run = await recipe.load()
  progress(5)
  if (files.length > 1 && recipe.batch && !recipe.multiple) {
    return runBatch(run, files, options, progress)
  }
  const result = await run({ files, options, progress })
  progress(100)
  return result
}
