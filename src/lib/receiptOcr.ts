import Tesseract from 'tesseract.js'

export async function recognizeReceiptImage(
  file: File,
  onProgress?: (progress: number, status: string) => void,
) {
  const result = await Tesseract.recognize(file, 'jpn+eng', {
    logger: (message) => {
      if (typeof message.progress === 'number') {
        onProgress?.(
          Math.round(message.progress * 100),
          message.status ?? 'OCR処理中',
        )
      }
    },
  })

  return result.data.text.trim()
}
