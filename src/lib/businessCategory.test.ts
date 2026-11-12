import { describe, expect, it } from 'vitest'
import { inferBusinessCategory } from './businessCategory'

describe('inferBusinessCategory', () => {
  it('identifies a business from strong homepage title and heading evidence', () => {
    expect(inferBusinessCategory({
      title: 'Northside Plumbing and Heating',
      headings: { h1: ['Local plumbers for boiler repairs and heating installation'] },
      textExcerpt: 'Emergency plumbing and heating services for homes.',
    })).toMatchObject({
      category: 'Plumbing and Heating',
      confidence: 'high',
    })
  })

  it('uses specific structured business types', () => {
    expect(inferBusinessCategory({
      title: 'Greenfield Dental',
      schema: [JSON.stringify({
        '@context': 'https://schema.org',
        '@type': 'Dentist',
        name: 'Greenfield Dental',
      })],
    })?.category).toBe('Dental Care')
  })

  it('does not classify a site from generic or weak website text', () => {
    expect(inferBusinessCategory({
      title: 'Welcome to our business',
      metaDescription: 'We provide high quality services to our customers.',
      headings: { h1: ['Get in touch today'] },
      textExcerpt: 'Learn more about our team and how we work.',
    })).toBeNull()
  })

  it('does not infer a category when website evidence is tied', () => {
    expect(inferBusinessCategory({
      title: 'Professional Services',
      headings: { h1: ['Restaurant and real estate services'] },
    })).toBeNull()
  })

  it('ignores malformed structured data without discarding textual evidence', () => {
    expect(inferBusinessCategory({
      title: 'Brighton Electricians',
      schema: ['{not valid JSON'],
    })?.category).toBe('Electrical Services')
  })
})
