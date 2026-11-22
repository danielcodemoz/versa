import { createWorker, OEM, type Word, type Worker as TesseractWorker } from 'tesseract.js'
import workerAsset from 'tesseract.js/dist/worker.min.js?url'

export type OcrMessage = { progress: number } | { words: Pick<Word, 'text' | 'bbox'>[] } | { error: string }

let engine: TesseractWorker | undefined
const send = (message: OcrMessage) => self.postMessage(message)

self.onmessage = async ({ data: image }: MessageEvent<Blob>) => {
  try {
    engine ??= await createWorker(['por', 'eng'], OEM.LSTM_ONLY, {
      workerPath: new URL(workerAsset, self.location.href).href,
      workerBlobURL: false,
      // Initialization errors for language data only reach this callback in Tesseract 7.
      errorHandler: error => send({ error: String(error) }),
      logger: ({ status, progress }) => {
        if (status === 'recognizing text') send({ progress })
      },
    })
    const { data } = await engine.recognize(image, {}, { blocks: true })
    const words = (data.blocks ?? []).flatMap(block => block.paragraphs.flatMap(paragraph =>
      paragraph.lines.flatMap(line => line.words.map(({ text, bbox }) => ({ text, bbox })))))
    send({ words })
  } catch (error) {
    send({ error: String(error) })
  }
}
