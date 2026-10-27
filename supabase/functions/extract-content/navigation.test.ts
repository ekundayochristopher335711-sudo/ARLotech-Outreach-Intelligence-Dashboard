import { describe, expect, it } from 'vitest'
import { extractNavigationPages } from './navigation'

describe('extractNavigationPages', () => {
  it('returns unique same-origin links found inside navigation landmarks', () => {
    const pages = extractNavigationPages(`
      <nav>
        <a href="/services#top">Our <strong>Services</strong></a>
        <a href="/services">Duplicate</a>
        <a href="https://external.example/contact">External</a>
        <a href="mailto:hello@example.com">Email</a>
      </nav>
      <main><a href="/not-navigation">Skip</a></main>
    `, 'https://example.com/')

    expect(pages).toEqual([
      { label: 'Our Services', url: 'https://example.com/services' },
    ])
  })

  it('caps the number of discovered pages and ignores credentials', () => {
    const pages = extractNavigationPages(`
      <nav>
        <a href="/one">One</a>
        <a href="/two">Two</a>
        <a href="https://user:pass@example.com/three">Three</a>
      </nav>
    `, 'https://example.com/', 1)

    expect(pages).toEqual([{ label: 'One', url: 'https://example.com/one' }])
  })
})
