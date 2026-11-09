import { describe, expect, it } from 'vitest'
import { extractPhoneNumbers } from './phoneNumbers'

describe('extractPhoneNumbers', () => {
  it('normalizes Nigerian local-format numbers from the country domain and locale', () => {
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
    )).toEqual(['+442079460958'])
  })

  it('adds the country calling code for local numbers on other country-code domains', () => {
    expect(extractPhoneNumbers(
      ['Call 02 9876 5432'],
      'https://example.com.au',
      'en',
    )).toContain('+61298765432')
  })

  it('uses a country explicitly identified on a general domain', () => {
    expect(extractPhoneNumbers(
      ['Our team is based in Kenya. Call 0712 345 678.'],
      'https://example.com',
      'en',
    )).toContain('+254712345678')
  })

  it('uses an international number on the page to infer the country for local numbers', () => {
    expect(extractPhoneNumbers(
      ['International office: +234 1 234 5678. Local office: 0803 123 4567.'],
      'https://example.com',
      'en',
    )).toContain('+2348031234567')
  })

  it('does not guess a country when the website mentions multiple countries', () => {
    expect(extractPhoneNumbers(
      ['Offices in Nigeria and Ghana. Call 0803 123 4567.'],
      'https://example.com',
      'en',
    )).toContain('0803 123 4567')
  })

  it('rejects oversized numeric strings and extracts phone-like links', () => {
    expect(extractPhoneNumbers(
      ['Reference 12345678901234567890', '<a href="tel:+1-202-555-0148">Call us</a>'],
      'https://example.com',
      null,
    )).toEqual(['+12025550148'])
  })
})
