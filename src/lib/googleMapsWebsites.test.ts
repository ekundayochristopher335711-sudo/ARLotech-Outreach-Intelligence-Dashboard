import { describe, expect, it } from 'vitest'
import {
  extractGoogleMapsWebsitesFromHtml,
  extractGoogleMapsWebsitesFromText,
} from './googleMapsWebsites'

describe('Google Maps website extraction', () => {
  it('associates Markdown website links with the preceding business listing', () => {
    expect(extractGoogleMapsWebsitesFromText(
      '[Leathes Prior Solicitors](https://www.google.com/maps/place/Leathes+Prior)\n' +
      '[Website](http://www.leathesprior.co.uk/)\n' +
      '[Fosters Solicitors](https://www.google.com/maps/place/Fosters)\n' +
      '[Website](https://fosters-solicitors.co.uk/)',
    )).toEqual([
      { business_name: 'Leathes Prior Solicitors', website: 'http://www.leathesprior.co.uk/' },
      { business_name: 'Fosters Solicitors', website: 'https://fosters-solicitors.co.uk/' },
    ])
  })

  it('recovers website destinations hidden behind Google Maps clipboard HTML links', () => {
    const html = [
      '<div><a href="https://www.google.com/maps/place/Leathes+Prior">Leathes Prior Solicitors</a>',
      '<a href="https://www.google.com/url?q=https%3A%2F%2Fwww.leathesprior.co.uk%2F&amp;sa=U">🌐 Website</a></div>',
      '<div><a href="https://www.google.com/maps/place/Fosters">Fosters Solicitors</a>',
      '<a href="https://fosters-solicitors.co.uk/">Website</a></div>',
    ].join('')

    expect(extractGoogleMapsWebsitesFromHtml(html)).toEqual([
      { business_name: 'Leathes Prior Solicitors', website: 'https://www.leathesprior.co.uk/' },
      { business_name: 'Fosters Solicitors', website: 'https://fosters-solicitors.co.uk/' },
    ])
  })

  it('ignores Google Maps links without an external website link', () => {
    expect(extractGoogleMapsWebsitesFromText(
      '[Business](https://www.google.com/maps/place/Business)\n[Directions](https://www.google.com/maps/dir/)',
    )).toEqual([])
  })
})
