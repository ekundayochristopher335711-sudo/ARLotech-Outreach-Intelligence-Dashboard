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

  it('pairs ordered website buttons with repeated Google Maps business names when listing links are omitted', () => {
    const html = [
      '<div><a href="https://www.google.com/url?q=https%3A%2F%2Fleathesprior.co.uk">Website</a></div>',
      '<div><a href="https://www.google.com/url?q=https%3A%2F%2Fbirketts.co.uk" aria-label="Website"></a></div>',
    ].join('')
    const pastedText = [
      'Leathes Prior Solicitors',
      'Leathes Prior Solicitors',
      '4.8 (368)',
      'Website',
      'Directions',
      'Birketts LLP - Solicitors Norwich',
      'Birketts LLP - Solicitors Norwich',
      '4.0 (48)',
      'Website',
      'Directions',
    ].join('\n')

    expect(extractGoogleMapsWebsitesFromHtml(html, pastedText)).toEqual([
      { business_name: 'Leathes Prior Solicitors', website: 'https://leathesprior.co.uk/' },
      { business_name: 'Birketts LLP - Solicitors Norwich', website: 'https://birketts.co.uk/' },
    ])
  })

  it('combines directly matched listings with remaining ordered website links', () => {
    const html = [
      '<a href="https://www.google.com/maps/place/Leathes+Prior">Leathes Prior Solicitors</a>',
      '<a href="https://leathesprior.co.uk/">Website</a>',
      '<a href="https://birketts.co.uk/" aria-label="Website"></a>',
    ].join('')
    const pastedText = [
      'Leathes Prior Solicitors',
      'Leathes Prior Solicitors',
      'Website',
      'Birketts LLP',
      'Birketts LLP',
      'Website',
    ].join('\n')

    expect(extractGoogleMapsWebsitesFromHtml(html, pastedText)).toEqual([
      { business_name: 'Leathes Prior Solicitors', website: 'https://leathesprior.co.uk/' },
      { business_name: 'Birketts LLP', website: 'https://birketts.co.uk/' },
    ])
  })

  it('does not guess website URLs when the pasted data only contains Website labels', () => {
    const pastedText = 'Leathes Prior Solicitors\nLeathes Prior Solicitors\nWebsite'
    expect(extractGoogleMapsWebsitesFromHtml('<div>Website</div>', pastedText)).toEqual([])
  })

  it('ignores Google Maps links without an external website link', () => {
    expect(extractGoogleMapsWebsitesFromText(
      '[Business](https://www.google.com/maps/place/Business)\n[Directions](https://www.google.com/maps/dir/)',
    )).toEqual([])
  })
})
