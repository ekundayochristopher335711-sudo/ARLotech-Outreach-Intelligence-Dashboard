import { describe, expect, it } from 'vitest'
import {
  generateFollowUpDraft,
  generateProfessionalEmailDraft,
  rewriteProfessionalEmail,
  validateProfessionalEmailDraft,
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
    ai_analysis: {},
    ...overrides,
  }
}

describe('professional email draft generation', () => {
  it('keeps audit measurements and scores out of customer-facing copy', () => {
    const result = generateProfessionalEmailDraft({
      prospect,
      includeReport: true,
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

    expect(result.body).toMatch(/some text may be difficult for visitors to read/i)
    expect(result.body).toContain('Our website review highlighted a possible point of friction for visitors')
    expect(result.body).not.toMatch(/94\/100|92\/100|91\/100|2\.1:1|Lighthouse|PageSpeed|score/i)
    expect(result.body).toContain('not pitching a costly, full website redesign')
    expect(result.body).toContain('attached a short website review')
    expect(result.body).toContain('take a look')
    expect(result.observationsUsed).toHaveLength(1)
  })

  it('describes a loading finding in plain language without measurements', () => {
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

    expect(result.body).toContain('main page content takes too long to appear')
    expect(result.body).toContain('A longer wait can frustrate potential customers')
    expect(result.body).toContain('customers quickly find the right service and request a quote')
    expect(result.body).not.toMatch(/4\.8 s|Lighthouse|PageSpeed|LCP|score|guarantee|increase revenue/i)
  })

  it('rewrites technical list-structure findings without exposing audit details', () => {
    const result = generateProfessionalEmailDraft({
      prospect,
      analysis: analysis({
        findings: [{
          id: 'list',
          category: 'accessibility',
          classification: 'verified_issue',
          title: 'Lists do not contain only <li> elements and script supporting elements (<script> and <template>).',
          evidence: 'The list has invalid markup.',
          explanation: 'Screen readers have a specific way of announcing lists. Ensuring proper list structure aids screen reader output. https://dequeuniversity.com/rules/axe/4.14/list',
          priority: 'medium',
        }],
      }),
    })

    expect(result.body).toMatch(/service details may be harder for some visitors to follow/i)
    expect(result.body).toContain('visitors may have a harder time scanning the page')
    expect(result.body).not.toMatch(/<li>|<script>|<template>|screen reader|dequeuniversity|axe\/4\.14|invalid markup/i)
  })

  it('rewrites link-name findings without exposing external accessibility references', () => {
    const result = generateProfessionalEmailDraft({
      prospect,
      analysis: analysis({
        findings: [{
          id: 'link-name',
          category: 'accessibility',
          classification: 'verified_issue',
          title: 'Links do not have a discernible name',
          evidence: 'Some links have no accessible name.',
          explanation: 'Link text that is discernible improves navigation. https://dequeuniversity.com/rules/axe/4.14/link-name',
          priority: 'medium',
        }],
      }),
    })

    expect(result.body.toLowerCase()).toContain('some links may be unclear to visitors')
    expect(result.body).toContain('Clear link wording can make it easier to find services or contact information.')
    expect(result.body).not.toMatch(/dequeuniversity|axe\/4\.14|Learn how to make links accessible|discernible name|screen reader/i)
  })

  it('rewrites link-in-text-block findings without accessibility help links', () => {
    const result = generateProfessionalEmailDraft({
      prospect,
      analysis: analysis({
        findings: [{
          id: 'link-in-text-block',
          category: 'accessibility',
          classification: 'verified_issue',
          title: 'Links are not distinguishable without color',
          evidence: 'A link in a paragraph is only differentiated by color.',
          explanation: 'Links need another visual distinction. https://dequeuniversity.com/rules/axe/4.14/link-in-text-block',
          priority: 'medium',
        }],
      }),
    })

    expect(result.body.toLowerCase()).toContain('some links may be difficult to spot within the text')
    expect(result.body).toContain('Making links easy to spot can help people find the next step.')
    expect(result.body).not.toMatch(/dequeuniversity|axe\/4\.14|learn how to make links distinguishable|link-in-text-block/i)
  })

  it('blocks external accessibility references if they are reintroduced by an edit', () => {
    const draft = generateProfessionalEmailDraft({ prospect })
    const result = validateProfessionalEmailDraft({
      ...draft,
      body: `${draft.body}\n\nLearn how to make links distinguishable: https://dequeuniversity.com/rules/axe/4.14/link-in-text-block`,
    }, prospect, false, draft.subjectSuggestions[0])

    expect(result.errors).toContain('Remove external accessibility audit references from the customer-facing email.')
  })

  it('uses the saved visual observation without pitching a redesign', () => {
    const result = generateProfessionalEmailDraft({
      prospect,
      strategy: 'website_redesign',
      analysis: analysis({
        ai_analysis: {
          visual_audit: {
            observations: [{
              title: 'Mobile navigation overlaps the page heading',
              evidence: 'In the saved mobile screenshot, the navigation covers part of the heading.',
              why_it_matters: 'Visitors may have difficulty reading the page heading.',
              recommended_fix: 'Review spacing at the captured screen size.',
            }],
          },
        },
      }),
    })

    expect(result.body).toContain('mobile navigation overlaps the page heading')
    expect(result.body).toContain('Visitors may have difficulty reading the page heading.')
    expect(result.body).toContain('not pitching a costly, full website redesign')
    expect(result.body).not.toContain('In the saved mobile screenshot')
    expect(result.observationsUsed).toHaveLength(1)
  })

  it('creates a useful introduction when no analysis exists without inventing findings or an attachment', () => {
    const result = generateProfessionalEmailDraft({ prospect, includeReport: true })

    expect(result.body).toContain('We have not reviewed the site in enough detail')
    expect(result.body).toContain('plumbing and heating businesses')
    expect(result.body).toMatch(/not pitching a costly, full website redesign/i)
    expect(result.body).not.toMatch(/attached|PageSpeed|Lighthouse|score|broken|defect|4\.8 s/i)
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

    expect(result.body).not.toContain('94/100')
    expect(result.body).not.toContain('an individual accessibility check failed')
    expect(result.body).not.toContain('your website failed accessibility')
    expect(result.body).not.toContain('overall accessibility score')
    expect(result.body).toContain('not pitching a costly, full website redesign')
  })

  it('builds a contextual follow-up without claiming a previous conversation happened', () => {
    const result = generateFollowUpDraft(
      { subject: 'A quick website observation for AK Plumbing and Heating', body: 'Original draft context.' },
      prospect,
      'first',
    )

    expect(result.subjectSuggestions[0]).toContain('Re:')
    expect(result.body.toLowerCase()).toContain('our earlier note')
    expect(result.body).toMatch(/will not follow up/i)
    expect(result.body).toContain('?')
    expect(result.body).not.toMatch(/as discussed|following our conversation|you told me/i)
  })

  it('mentions the attached website review in follow-ups when one will be included', () => {
    const result = generateFollowUpDraft(
      { subject: 'A quick website observation for AK Plumbing and Heating', body: 'Original draft context.' },
      prospect,
      'first',
      undefined,
      true,
    )

    expect(result.body).toContain('attached the short website review again')
    expect(result.body).toContain('take a look')
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
    expect(result.body).toContain('works well on phones')
    expect(result.body).not.toMatch(/PageSpeed|Lighthouse|broken|defect/i)
    expect(result.observationsUsed).toEqual([])
  })

  it('creates a short first-contact introduction without inventing audit findings', () => {
    const result = generateProfessionalEmailDraft({ prospect, strategy: 'cold_outreach' })
    expect(result.body).toContain('briefly introduce Arlotech Digital Solutions')
    expect(result.body).toContain('couple of ideas for your online presence')
    expect(result.body).toContain('not pitching a costly, full website redesign')
    expect(result.body).toMatch(/If this is not relevant, let us know and we will not follow up/i)
    expect(result.observationsUsed).toEqual([])
  })

  it('blocks customer-facing drafts that include jargon or omit the low-pressure close', () => {
    const draft = generateProfessionalEmailDraft({ prospect })
    const invalid = {
      ...draft,
      body: draft.body
        .replace('If this is not relevant, let us know and we will not follow up.', '')
        .replace('We came across', 'Lighthouse measured the page at 4.8 s. We came across'),
    }

    const result = validateProfessionalEmailDraft(invalid, prospect, false, draft.subjectSuggestions[0])

    expect(result.errors).toContain('Add a clear opt-out so the recipient can stop further contact.')
    expect(result.errors).toContain('Remove technical terms or measurements from the customer-facing email.')
  })

  it('requires an attached website review to be mentioned clearly in the email', () => {
    const generated = generateProfessionalEmailDraft({
      prospect,
      includeReport: true,
      analysis: analysis({
        findings: [{
          id: 'color-contrast',
          audit_id: 'color-contrast',
          classification: 'verified_issue',
          title: 'Low contrast text',
          evidence: 'Text is difficult to read.',
        }],
      }),
    })
    const editedDraft = {
      ...generated,
      body: generated.body.replace(/We have attached a short website review[^\n]*/, ''),
    }

    expect(validateProfessionalEmailDraft(
      editedDraft,
      prospect,
      true,
      generated.subjectSuggestions[0],
    ).errors).toContain(
      'Tell the recipient that the attached website review has more detail and invite them to take a look.',
    )
  })

  it('allows an attached-review message when the matching PDF is created at send time', () => {
    const generated = generateProfessionalEmailDraft({
      prospect,
      includeReport: true,
      analysis: analysis({
        findings: [{
          id: 'color-contrast',
          audit_id: 'color-contrast',
          classification: 'verified_issue',
          title: 'Low contrast text',
          evidence: 'Text is difficult to read.',
        }],
      }),
    })

    expect(generated.qualityChecks).toContain(
      'The matching website review PDF will be attached when the email is sent.',
    )
    expect(validateProfessionalEmailDraft(
      generated,
      prospect,
      true,
      generated.subjectSuggestions[0],
    ).errors).not.toContain(
      'The email says a website report is attached, but no matching review is available to include.',
    )
    expect(validateProfessionalEmailDraft(
      generated,
      prospect,
      false,
      generated.subjectSuggestions[0],
    ).errors).toContain(
      'The email says a website report is attached, but no matching review is available to include.',
    )
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
