import { describe, expect, it } from 'vitest'
import { extractBusinessLocation } from './location'

describe('extractBusinessLocation', () => {
  it('extracts city and country from nested LocalBusiness JSON-LD', () => {
    expect(extractBusinessLocation([
      `<script type="application/ld+json">${JSON.stringify({
        '@context': 'https://schema.org',
        '@type': 'LocalBusiness',
        address: {
          '@type': 'PostalAddress',
          addressLocality: 'Lagos',
          addressCountry: { '@type': 'Country', name: 'Nigeria' },
        },
      })}</script>`,
    ])).toEqual({ city: 'Lagos', country: 'Nigeria' })
  })

  it('reads business geo metadata when structured addresses are unavailable', () => {
    expect(extractBusinessLocation([
      '<meta property="business:contact_data:locality" content="Accra">' +
        '<meta property="business:contact_data:country_name" content="Ghana">',
    ])).toEqual({ city: 'Accra', country: 'Ghana' })
  })

  it('reads city and country from HTML microdata', () => {
    expect(extractBusinessLocation([
      '<span itemprop="addressLocality">Nairobi</span>' +
        '<meta itemprop="addressCountry" content="Kenya">',
    ])).toEqual({ city: 'Nairobi', country: 'Kenya' })
  })

  it('does not infer a location from unrelated website text', () => {
    expect(extractBusinessLocation(['We serve customers around the world.'])).toBeNull()
  })
})
