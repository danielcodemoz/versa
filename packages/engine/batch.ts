import { zip } from 'fflate'
import { bytesBlob, localName, type ConversionResult, type Handler, type Options } from './types'

/** Runs a one-file handler over many files and returns every result in one ZIP. */
export async function runBatch(run: Handler, files: File[], options: Options, progress: (percent: number) => void): Promise<ConversionResult> {
  const parts: Record<string, Uint8Array> = {}
  for (const [index, file] of files.entries()) {
    const part = await run({ files: [file], options, progress: value => progress(5 + Math.round((index + value / 100) / files.length * 90)) })
    let name = part.name
    for (let copy = 2; name in parts; copy++) name = part.name.replace(/(\.[^.]+)?$/, ` ${copy}$1`)
    parts[name] = new Uint8Array(await part.blob.arrayBuffer())
  }
  const archive = await new Promise<Uint8Array>((resolve, reject) => zip(parts, { level: 3 }, (error, data) => error ? reject(error) : resolve(data)))
  progress(100)
  return { blob: bytesBlob(archive, 'application/zip'), name: localName(files[0], 'zip', ` + ${files.length - 1} (Versa)`) }
}
