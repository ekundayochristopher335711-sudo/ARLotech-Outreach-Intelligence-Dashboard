import { describe, expect, it } from 'vitest'
import { extractPhoneNumbers } from './phoneNumbers'

describe('extractPhoneNumbers', () => {
  it('normalizes Nigerian local-format numbers using an NG language locale', () => {
    expect(extractPhoneNumbers(
      ['Call us on 0803 123 4567 or 08031234567'],
      'https://example.com.ng',
      'en-NG',
    )).toContain('+2348031234567')
  })

  it('uses the country stated on a general .com website to normalize a Nigerian number', () => {
    expect(extractPhoneNumbers(
      ['Serving customers across Nigeria. Call 0809-876-5432.'],
      'https://example.com',
      'en',
    )).toContain('+2348098765432')
  })

  it('prefers and decodes Nigerian telephone links, including an optional trunk zero', () => {
    expect(extractPhoneNumbers(
      ['<a href="tel:%2B234%200803%20123%204567">Call</a>'],
      'https://example.ng',
      null,
    )).toContain('+2348031234567')
  })

  it('keeps already international numbers and does not apply the Nigerian prefix to another country', () => {
    expect(extractPhoneNumbers(
      ['+44 20 7946 0958', '020 7946 0958'],
      'https://example.co.uk',
      'en-GB',
    )).toEqual(['+442079460958', '020 7946 0958'])
  })

  it('rejects oversized numeric strings and extracts phone-like links', () => {
    expect(extractPhoneNumbers(
      ['Reference 12345678901234567890', '<a href="tel:+1-202-555-0148">Call us</a>'],
      'https://example.com',
      null,
    )).toEqual(['+12025550148'])
  })
})
