import { describe, expect, it } from 'vitest'
import { findContactPageUrls } from './contactPages'

describe('findContactPageUrls', () => {
  it('prioritizes a contact page ahead of earlier team and legal links', () => {
    expect(findContactPageUrls(`
      <a href="/people/alex">Meet Alex</a>
      <a href="/team">Our people</a>
      <a href="/legal">Legal</a>
      <a href="/contact-us">Contact us</a>
    `, 'https://example.com/')).toEqual([
      'https://example.com/contact-us',
      'https://example.com/team',
      'https://example.com/people/alex',
    ])
  })

  it('keeps only safe same-origin HTTP pages', () => {
    expect(findContactPageUrls(`
      <a href="https://other.example/contact">Contact</a>
      <a href="mailto:hello@example.com">Contact</a>
      <a href="/about#team">About us</a>
    `, 'https://example.com/')).toEqual(['https://example.com/about'])
  })
})
