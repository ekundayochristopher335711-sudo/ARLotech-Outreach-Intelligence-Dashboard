import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import {
  ARLOTECH_FAVICON_FILE,
  ARLOTECH_LOGO_FILE,
  getBrandAssetUrl,
} from './brandAssets'

describe('Arlotech brand assets', () => {
  it('uses the supplied logo and favicon everywhere through the public asset paths', () => {
    expect(getBrandAssetUrl(ARLOTECH_LOGO_FILE)).toBe(
      `${import.meta.env.BASE_URL}overall%20logo.png`,
    )
    expect(getBrandAssetUrl(ARLOTECH_FAVICON_FILE)).toBe(
      `${import.meta.env.BASE_URL}favicon-32x32.png`,
    )

    const logo = readFileSync(new URL('../../public/overall logo.png', import.meta.url))
    const favicon = readFileSync(new URL('../../public/favicon-32x32.png', import.meta.url))
    expect(logo.subarray(0, 8)).toEqual(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
    expect(favicon.subarray(0, 8)).toEqual(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
  })
})
