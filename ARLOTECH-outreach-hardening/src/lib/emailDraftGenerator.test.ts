import { describe, expect, it } from 'vitest'
import {
  generateFollowUpDraft,
  generateProfessionalEmailDraft,
  rewriteProfessionalEmail,
} from './emailDraftGenerator'

const prospect = {
  business_name: 'AK Plumbing and Heating',
  contact_name: 'Alex Kent',
  website: 'https://akplumbing.example',
  business_category: 'Plumbing and Heating',
  city: 'Leeds',
}

function analysis(overrides: Record<string, unknown> = {}) {
  return {
    website_url: 'https://akplumbing.example',
    overall_score: 94,
    category_scores: {
      performance: 94,
      seo: 92,
      accessibility: 91,
      'best-practices': 96,
    },
    findings: [],
    positive_observations: [],
    analysis_details: {},
    ...overrides,
  }
}

describe('professional email draft generation', () => {
  it('recognizes strong scores and keeps an individual accessibility finding in context', () => {
    const result = generateProfessionalEmailDraft({
      prospect,
      analysis: analysis({
        findings: [{
          id: 'color-contrast',
          audit_id: 'color-contrast',
          source: 'lighthouse',
          classification: 'verified_issue',
          title: 'Low contrast text',
          evidence: 'Some text has a contrast ratio of 2.1:1.',
          priority: 'low',
        }],
      }),
    })

    expect(result.body).toContain('strong results in Performance (94/100), SEO (92/100), Accessibility (91/100)')
    expect(result.body).toContain('some text may be difficult to read against its background')
    expect(result.body).not.toMatch(/broken|severely defective|poorly optimised/i)
    expect(result.body).not.toContain('overall accessibility score')
    expect(result.observationsUsed).toHaveLength(1)
  })

  it('focuses on measured loading evidence for a technical-improvement approach', () => {
    const result = generateProfessionalEmailDraft({
      prospect,
      strategy: 'technical_improvement',
      analysis: analysis({
        category_scores: { performance: 42, seo: 91, accessibility: 91, 'best-practices': 91 },
        findings: [{
          id: 'largest-contentful-paint',
          audit_id: 'largest-contentful-paint',
          source: 'lighthouse',
          classification: 'verified_issue',
          title: 'Largest Contentful Paint',
          evidence: 'Main content appeared after 4.8 s.',
          priority: 'high',
        }],
      }),
    })

    expect(result.body).toContain('main content loading time')
    expect(result.body).toContain('Main content appeared after 4.8 s.')
    expect(result.body).toContain('helping customers quickly find the right service and request a quote')
    expect(result.body).not.toMatch(/guarantee|increase revenue/i)
  })

  it('does not infer visual problems from saved screenshots', () => {
    const result = generateProfessionalEmailDraft({
      prospect,
      strategy: 'website_redesign',
      analysis: analysis({
        analysis_details: {
          screenshot_review: {
            pages: [{
              page_url: 'https://akplumbing.example',
              viewport: 'mobile',
              image_path: 'user-id/analysis-id/0-mobile.jpg',
            }],
          },
        },
      }),
    })

    expect(result.body).toContain('We do not have a verified visual observation')
    expect(result.body).not.toContain('mobile navigation overlaps')
    expect(result.observationsUsed).toEqual([])
  })

  it('creates a useful introduction when no analysis exists without inventing findings or an attachment', () => {
    const result = generateProfessionalEmailDraft({ prospect, includeReport: true })

    expect(result.body).toContain('We do not have enough verified website review information')
    expect(result.body).toContain('plumbing and heating businesses')
    expect(result.body).not.toMatch(/attached|PageSpeed|Lighthouse|score|broken|defect/i)
    expect(result.includesReportReference).toBe(false)
    expect(result.observationsUsed).toEqual([])
  })

  it('prioritizes a small number of confirmed findings rather than listing every issue', () => {
    const result = generateProfessionalEmailDraft({
      prospect,
      length: 'detailed',
      analysis: analysis({
        findings: [
          { title: 'Low importance observation', evidence: 'Recorded evidence.', priority: 'low', classification: 'verified_issue' },
          { title: 'Important loading observation', evidence: '4.8 seconds.', priority: 'high', classification: 'verified_issue' },
          { title: 'Medium observation', evidence: 'Recorded evidence.', priority: 'medium', classification: 'verified_issue' },
        ],
      }),
    })

    expect(result.observationsUsed.length).toBeLessThanOrEqual(2)
    expect(result.observationsUsed[0]).toContain('Important loading observation')
    expect(result.body).not.toContain('Low importance observation')
  })

  it('does not confuse a failed individual audit with a high overall website score', () => {
    const result = generateProfessionalEmailDraft({
      prospect,
      analysis: analysis({
        overall_score: 94,
        findings: [{
          title: 'An individual accessibility check failed',
          evidence: 'One check needs review.',
          classification: 'verified_issue',
          priority: 'low',
        }],
      }),
    })

    expect(result.body).toContain('strong results in Performance (94/100), SEO (92/100), Accessibility (91/100)')
    expect(result.body).toContain('an individual accessibility check failed')
    expect(result.body).not.toContain('your website failed accessibility')
    expect(result.body).not.toContain('overall accessibility score')
  })

  it('builds a contextual follow-up without claiming a previous conversation happened', () => {
    const result = generateFollowUpDraft(
      { subject: 'A quick website observation for AK Plumbing and Heating', body: 'Original draft context.' },
      prospect,
      'first',
    )

    expect(result.subjectSuggestions[0]).toContain('Re:')
    expect(result.body.toLowerCase()).toContain('a quick website observation for ak plumbing and heating')
    expect(result.body).not.toMatch(/as discussed|following our conversation|you told me/i)
  })

  it('supports direct edits through focused rewrite actions', () => {
    const body = 'Hi Alex,\n\nWe reviewed your website.\n\nWould it be helpful to talk this through?\n\nKind regards,'
    expect(rewriteProfessionalEmail(body, 'improve_cta')).toContain('Would you be open to a brief, no-obligation conversation')
    expect(rewriteProfessionalEmail(body, 'conversational')).toContain('Best wishes,')
    expect(rewriteProfessionalEmail(body, 'professional')).toContain('Kind regards,')
  })

  it('offers multiple short, relevant subject suggestions', () => {
    const result = generateProfessionalEmailDraft({ prospect })
    expect(result.subjectSuggestions.length).toBeGreaterThanOrEqual(3)
    expect(result.subjectSuggestions.length).toBeLessThanOrEqual(5)
    expect(result.subjectSuggestions.every((subject) => subject.length < 90)).toBe(true)
  })
})


describe('specialized outreach message types', () => {
  it('creates a cautious website offer for a prospect with no recorded website', () => {
    const result = generateProfessionalEmailDraft({
      prospect: { ...prospect, website: '' },
      strategy: 'no_website',
    })
    expect(result.body).toContain("couldn't find a website associated with your business")
    expect(result.body).toContain('responsive website')
    expect(result.body).not.toMatch(/PageSpeed|Lighthouse|broken|defect/i)
    expect(result.observationsUsed).toEqual([])
  })

  it('creates a short first-contact introduction without inventing audit findings', () => {
    const result = generateProfessionalEmailDraft({ prospect, strategy: 'cold_outreach' })
    expect(result.body).toContain('briefly introduce Arlotech Digital Solutions')
    expect(result.body).toContain('couple of ideas for your online presence')
    expect(result.observationsUsed).toEqual([])
  })

  it('does not invent a price when responding to a pricing question', () => {
    const result = generateProfessionalEmailDraft({ prospect, strategy: 'pricing_response' })
    expect(result.body).toContain('cost depends on the scope of work')
    expect(result.body).not.toMatch(/£\s?\d+|₦\s?\d+|\$\s?\d+/)
  })

  it('includes operator-supplied confirmed details in a pricing response', () => {
    const result = generateProfessionalEmailDraft({
      prospect,
      strategy: 'pricing_response',
      senderContext: 'Our starter website package is £75 and includes up to five pages.',
    })
    expect(result.body).toContain('Our starter website package is £75')
  })

  it('creates a discovery-call reply without inventing availability', () => {
    const result = generateProfessionalEmailDraft({ prospect, strategy: 'meeting_request' })
    expect(result.body).toContain('Would you be available for a 15-minute conversation?')
    expect(result.body).not.toMatch(/Tuesday at|tomorrow at|2:00 PM/i)
  })
})
