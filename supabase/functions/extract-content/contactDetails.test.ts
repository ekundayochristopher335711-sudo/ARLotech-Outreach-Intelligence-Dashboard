import { describe, expect, it } from 'vitest'
import { extractContactDetails } from './contactDetails'

describe('extractContactDetails', () => {
  it('does not treat numbers in JavaScript bundles as phone contacts', () => {
    const contacts = extractContactDetails(
      ['<p>Phone: 01603 610911</p>'],
      ['const path = "4.27-1-7.13-1.58-9.54-1"; const id = 8108341958345;'],
      'https://example.co.uk',
      'en-GB',
    )

    expect(contacts.phones).toEqual(['+441603610911'])
  })

  it('can still recover a valid email address from a same-origin app bundle', () => {
    expect(extractContactDetails(
      ['<main>Contact our team</main>'],
      ['window.contactEmail = "hello@example.co.uk"'],
      'https://example.co.uk',
      'en-GB',
    ).emails).toEqual(['hello@example.co.uk'])
  })

  it('does not mix bundle-only addresses into contacts found in page HTML', () => {
    expect(extractContactDetails(
      ['<a href="mailto:info@acme.co.uk">Email us</a>'],
      ['window.contactEmail = "developer@internal.acme.co.uk"'],
      'https://acme.co.uk',
      'en-GB',
    ).emails).toEqual(['info@acme.co.uk'])
  })
})
