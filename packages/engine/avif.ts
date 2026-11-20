import createEncoder from '@jsquash/avif/codec/enc/avif_enc.js'
import { defaultOptions } from '@jsquash/avif/meta.js'

let encoder: ReturnType<typeof createEncoder> | undefined

async function loadEncoder() {
  const asset = import.meta.env.DEV ? '/node_modules/@jsquash/avif/codec/enc/avif_enc.wasm' : import.meta.env.BASE_URL + 'avif/encoder.wasm.gzip'
  const response = await fetch(asset)
  if (!response.ok) throw new Error('AVIF encoder unavailable')
  const buffer = import.meta.env.DEV ? await response.arrayBuffer() :
    await new Response(response.body!.pipeThrough(new DecompressionStream('gzip'))).arrayBuffer()
  return createEncoder({ wasmBinary: new Uint8Array(buffer) })
}

export async function encodeAvif(image: ImageData, quality: number) {
  encoder ??= loadEncoder().catch(error => { encoder = undefined; throw error })
  const codec = await encoder
  const data = new Uint8Array(image.data.buffer)
  const result = codec.encode(data, image.width, image.height, { ...defaultOptions, quality })
  if (!result) throw new Error('AVIF encoding failed')
  return result
}
