import type { Recipe } from '../packages/engine/catalog'
import { convertLocal, type ConversionResult, type Options } from '../packages/engine'

export type { ConversionResult }
export const canRun = (recipe: Recipe) => Boolean(recipe.load)

export const convert = (recipe: Recipe, files: File[], options: Options, progress: (value: number) => void) => convertLocal(recipe.id, files, options, progress)
