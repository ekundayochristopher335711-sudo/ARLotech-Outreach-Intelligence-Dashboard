import { describe, expect, it } from 'vitest'
import { createOutreachPreview, hasMatchingWebsiteAnalysis } from './outreachEmail'

describe('outreach eligibility and previews', () => {
  it('matches a completed audit to the same normalized website host', () => {
    expect(hasMatchingWebsiteAnalysis(
      { website: 'https://www.example.com/services' },
      { website_url: 'http://example.com' },
    )).toBe(true)
    expect(hasMatchingWebsiteAnalysis(
      { website: 'https://example.com' },
      { website_url: 'https://other.example' },
    )).toBe(false)
  })

  it('requires a matching website analysis before creating a website outreach', () => {
    expect(() => createOutreachPreview({
      id: 'prospect-1',
      business_name: 'Example',
      contact_name: '',
      website: 'https://example.com',
      business_category: null,
    })).toThrow('A completed audit for this exact website is required')
  })

  it('uses a separate introduction for prospects without a website', () => {
    const preview = createOutreachPreview({
      id: 'prospect-1',
      business_name: 'Example',
      contact_name: 'Taylor Jones',
      website: null,
      business_category: 'Legal Services',
    })

    expect(preview.has_website_report).toBe(false)
    expect(preview.body).toContain('Hi Taylor,')
    expect(preview.body).not.toContain('attached a concise website review')
  })
})
