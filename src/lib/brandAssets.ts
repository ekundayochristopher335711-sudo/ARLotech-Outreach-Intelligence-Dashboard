export const ARLOTECH_LOGO_FILE = 'system logo.png'
export const ARLOTECH_BLACKSITE_LOGO_FILE = 'blacksite logo.png'
export const ARLOTECH_BLACKSITE_PDF_LOGO_FILE = 'blacksite-logo-pdf.png'
export const ARLOTECH_FAVICON_FILE = 'favicon-32x32.png'

export interface InlineEmailLogo {
  filename: 'arlotech-logo.png'
  content: string
}

export function getBrandAssetUrl(fileName: string) {
  return `${import.meta.env.BASE_URL}${encodeURIComponent(fileName)}`
}

export async function createInlineEmailLogo(): Promise<InlineEmailLogo> {
  const response = await fetch(getBrandAssetUrl(ARLOTECH_BLACKSITE_LOGO_FILE))
  if (!response.ok) {
    throw new Error(`Could not load the Arlotech logo for the email (${response.status}).`)
  }

  const bitmap = await createImageBitmap(await response.blob())
  try {
    const scale = Math.min(256 / bitmap.width, 256 / bitmap.height, 1)
    const width = Math.round(bitmap.width * scale)
    const height = Math.round(bitmap.height * scale)
    const canvas = document.createElement('canvas')
    canvas.width = width
    canvas.height = height
    const context = canvas.getContext('2d')
    if (!context) throw new Error('Could not prepare the Arlotech logo for the email.')
    context.drawImage(bitmap, 0, 0, width, height)

    const match = /^data:image\/png;base64,([A-Za-z0-9+/]+={0,2})$/.exec(canvas.toDataURL('image/png'))
    if (!match) throw new Error('The Arlotech logo could not be prepared for the email.')
    return { filename: 'arlotech-logo.png', content: match[1] }
  } finally {
    bitmap.close()
  }
}

export async function loadArlotechLogoDataUrl(fileName = ARLOTECH_LOGO_FILE) {
  const response = await fetch(getBrandAssetUrl(fileName))
  if (!response.ok) {
    throw new Error(`Could not load the Arlotech Digital Solutions logo (${response.status}).`)
  }

  const bytes = new Uint8Array(await response.arrayBuffer())
  let binary = ''
  for (let offset = 0; offset < bytes.length; offset += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + 0x8000))
  }
  return `data:image/png;base64,${btoa(binary)}`
}
