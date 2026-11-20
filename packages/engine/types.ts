export interface ConversionResult {
  blob: Blob
  name: string
}

export interface Options {
  password?: string
  quality?: number
  maxDimension?: number
  rotation?: 90 | 180 | 270
  header?: string
  logo?: File
}

export interface Context {
  files: File[]
  progress: (percent: number) => void
  options: Options
}

export type Handler = (context: Context) => Promise<ConversionResult>
export const localName = (file: File, extension: string, suffix = ' (Versa)') =>
  `${file.name.replace(/\.[^.]+$/, '')}${suffix}.${extension}`

export function bytesBlob(bytes: Uint8Array, type: string) {
  return new Blob([Uint8Array.from(bytes).buffer], { type })
}

export function canvasBlob(canvas: HTMLCanvasElement, type: string, quality?: number) {
  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(blob => {
      if (blob?.type === type) resolve(blob)
      else reject(new Error(`Unsupported encoding: ${type}`))
    }, type, quality)
  })
}
