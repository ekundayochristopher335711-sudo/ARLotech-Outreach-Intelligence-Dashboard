export const ARLOTECH_LOGO_FILE = 'overall logo.png'
export const ARLOTECH_FAVICON_FILE = 'favicon-32x32.png'

export function getBrandAssetUrl(fileName: string) {
  return `${import.meta.env.BASE_URL}${encodeURIComponent(fileName)}`
}

export async function loadArlotechLogoDataUrl() {
  const response = await fetch(getBrandAssetUrl(ARLOTECH_LOGO_FILE))
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
