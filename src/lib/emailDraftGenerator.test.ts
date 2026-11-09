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
    expect(result.body).toContain('The review highlighted that some text may be difficult for visitors to read.')
    expect(result.body).not.toMatch(/Website review snapshot|Finding:|Why it matters:/)
    expect(result.body.indexOf('Would you be open to discussing what might work best for your website?'))
      .toBeLessThan(result.body.indexOf('The attached PDF'))
    expect(result.body).not.toMatch(/94\/100|92\/100|91\/100|2\.1:1|Lighthouse|PageSpeed|score/i)
    expect(result.body).toContain("A review of AK Plumbing and Heating's website highlighted one area that may be worth a closer look.")
    expect(result.body).toContain('Arlotech Digital Solutions designs and builds new websites, and improves existing ones with focused updates.')
    expect(result.body).toContain('The attached PDF contains the website review and practical recommendations.')
    expect(result.body).not.toMatch(/it.s good to see|full redesign/i)
    expect(result.body).not.toContain("what's working well")
    const signatureStart = result.body.indexOf('\n\nKind regards,\n')
    const auditWordCount = result.body.slice(0, signatureStart).trim().split(/\s+/).length
    expect(auditWordCount).toBeGreaterThanOrEqual(70)
    expect(auditWordCount).toBeLessThanOrEqual(150)
    expect(validateProfessionalEmailDraft(
      result,
      prospect,
      true,
      result.subjectSuggestions[0],
    ).warnings).toEqual([])
    expect(result.observationsUsed).toHaveLength(1)
  })

  it('does not open with an unrelated positive observation and includes the default sender signature', () => {
    const result = generateProfessionalEmailDraft({
      prospect,
      includeReport: true,
      analysis: analysis({
        positive_observations: [{
          id: 'positive-contact',
          title: 'The business phone number is easy to find',
          evidence: 'A phone number is visible in the page header.',
          potential_benefit: 'Visitors can quickly see a contact option.',
          priority: 'low',
        }],
        findings: [{
          classification: 'verified_issue',
          title: 'Low contrast text',
          evidence: 'Some text is difficult to read.',
        }],
      }),
    })

    expect(result.body).toContain("A review of AK Plumbing and Heating's website highlighted one area that may be worth a closer look.")
    expect(result.body).not.toContain('business phone number is easy to find')
    expect(result.body).toContain('Ekundayo Christopher')
    expect(result.body).toContain('Lead Web Developer')
    expect(result.body).toContain('arlotech.com.ng')
    expect(result.body).toContain('info@arlotech.com.ng')
    expect(result.body).not.toContain('+2348166419332')
    expect(result.body).toContain('Lagos, Nigeria')
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
    expect(result.body).toContain('A longer wait can frustrate someone looking for help')
    expect(result.body).toContain('people looking for plumbing or heating support')
    expect(result.body).not.toMatch(/4\.8 s|Lighthouse|PageSpeed|LCP|score|guarantee|increase revenue/i)
  })

  it('personalizes image-description findings to the prospect category without inventing image details', () => {
    const result = generateProfessionalEmailDraft({
      prospect,
      includeReport: true,
      analysis: analysis({
        findings: [{
          id: 'image-alt',
          audit_id: 'image-alt',
          source: 'html_inspection',
          classification: 'observed_issue',
          title: 'Some images are missing alternative text',
          evidence: 'Some images have no text descriptions.',
        }],
      }),
    })

    expect(result.body).toContain('For a plumbing and heating business, descriptions on relevant installation or project photos')
    expect(result.body).toContain('people looking for plumbing or heating support')
    expect(result.body).not.toMatch(/boiler|specific installation|your image shows/i)
    expect(result.body).toContain('The attached PDF contains the website review and practical recommendations.')
    expect(validateProfessionalEmailDraft(
      result,
      prospect,
      true,
      result.subjectSuggestions[0],
    ).errors).toEqual([])
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

    expect(result.body).toMatch(/details may be harder for some visitors to follow/i)
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
    expect(result.body).toContain('Clear wording can make it easier to find information or reach your team.')
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

  it('omits external audit references from unrecognized AK Plumbing accessibility findings', () => {
    const result = generateProfessionalEmailDraft({
      prospect,
      analysis: analysis({
        findings: [{
          id: 'focus-visibility-check',
          category: 'accessibility',
          classification: 'verified_issue',
          title: 'Keyboard focus visibility',
          evidence: 'Focus is difficult to see on some controls.',
          explanation: 'Keyboard focus should remain visible to visitors. https://dequeuniversity.com/rules/axe/4.14/focus-visible',
          priority: 'medium',
        }],
      }),
    })

    expect(result.body.toLowerCase()).toContain('keyboard focus visibility')
    expect(result.body).not.toMatch(/dequeuniversity|axe\/4\.14|focus-visible/i)
    expect(validateProfessionalEmailDraft(
      result,
      prospect,
      true,
      result.subjectSuggestions[0],
    ).errors).toEqual([])
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
    expect(result.body).toContain('designs and builds new websites, and improves existing ones with focused updates')
    expect(result.body).not.toContain('In the saved mobile screenshot')
    expect(result.observationsUsed).toHaveLength(1)
  })

  it('creates a useful introduction when no analysis exists without inventing findings or an attachment', () => {
    const result = generateProfessionalEmailDraft({ prospect, includeReport: true })

    expect(result.body).toContain('We have not reviewed the site in enough detail')
    expect(result.body).toContain('plumbing and heating businesses')
    expect(result.body).toContain('We would be glad to discuss your website goals and any updates you may be considering.')
    expect(result.body).not.toMatch(/attached|PageSpeed|Lighthouse|score|broken|defect|4\.8 s/i)
    expect(result.includesReportReference).toBe(false)
    expect(result.observationsUsed).toEqual([])
  })

  it.each([
    'general_review',
    'technical_improvement',
    'website_redesign',
    'business_growth',
    'personal_consultancy',
    'cold_outreach',
    'seo_performance',
    'interested_response',
    'pricing_response',
    'meeting_request',
  ] as const)('includes the business name and validates the %s email type', (strategy) => {
    const result = generateProfessionalEmailDraft({
      prospect,
      strategy,
      analysis: analysis({
        findings: [{
          source: 'lighthouse',
          classification: 'verified_issue',
          title: 'Low contrast text',
          evidence: 'Some text is difficult to read.',
        }],
      }),
    })

    expect(result.body).toContain('AK Plumbing and Heating')
    expect(validateProfessionalEmailDraft(
      result,
      prospect,
      false,
      result.subjectSuggestions[0],
    ).errors).toEqual([])
  })

  it('generates and validates an email when contact, category, location, and audit data are missing', () => {
    const incompleteProspect = {
      ...prospect,
      business_name: '',
      contact_name: '',
      website: 'https://example.com',
      business_category: null,
      city: null,
    }
    const result = generateProfessionalEmailDraft({
      prospect: incompleteProspect,
      includeReport: true,
    })

    expect(result.body).toContain('Hi there,')
    expect(result.body).toContain('your business')
    expect(result.body).not.toMatch(/attached|plumbing|heating|4\.8 s|Lighthouse/i)
    expect(result.includesReportReference).toBe(false)
    expect(validateProfessionalEmailDraft(
      result,
      incompleteProspect,
      false,
      result.subjectSuggestions[0],
    ).errors).toEqual([])
  })

  it('does not require a finding to generate an email from a completed review', () => {
    const result = generateProfessionalEmailDraft({
      prospect,
      analysis: analysis({ findings: [] }),
      includeReport: true,
    })

    expect(result.body).toContain('The review did not identify a clear issue worth calling out')
    expect(result.body).toContain('The attached PDF contains the website review and practical recommendations.')
    expect(validateProfessionalEmailDraft(
      result,
      prospect,
      true,
      result.subjectSuggestions[0],
    ).errors).toEqual([])
  })

  it('uses generic wording without a category and requires a website link', () => {
    const uncategorizedProspect = {
      ...prospect,
      business_name: 'Acme Group',
      business_category: null,
    }
    const websiteDraft = generateProfessionalEmailDraft({
      prospect: uncategorizedProspect,
      analysis: analysis({
        findings: [{
          source: 'lighthouse',
          classification: 'verified_issue',
          title: 'Low contrast text',
          evidence: 'Some text has low contrast.',
        }],
      }),
    })

    expect(() => generateProfessionalEmailDraft({
      prospect: { ...uncategorizedProspect, website: null },
    })).toThrow('Add a website link')
    expect(websiteDraft.body).toContain('designs and builds new websites, and improves existing ones with focused updates')
    expect(websiteDraft.body).not.toMatch(/plumbing|heating|electrician|contractor/i)
  })

  it('allows an audit based email without a business category', () => {
    const uncategorizedProspect = { ...prospect, business_category: null }
    const draft = generateProfessionalEmailDraft({
      prospect: uncategorizedProspect,
      includeReport: true,
      analysis: analysis({
        findings: [{
          source: 'lighthouse',
          classification: 'verified_issue',
          title: 'Low contrast text',
          evidence: 'Some text is difficult to read.',
        }],
      }),
    })
    const validation = validateProfessionalEmailDraft(
      draft,
      uncategorizedProspect,
      true,
      draft.subjectSuggestions[0],
    )

    expect(draft.body).toContain('designs and builds new websites, and improves existing ones with focused updates')
    expect(validation.errors).toEqual([])
  })

  it('removes hyphens from generated email copy while preserving hyphens in contact links', () => {
    const result = generateProfessionalEmailDraft({
      prospect: { ...prospect, business_name: 'North-Star Cafe', business_category: 'Food-Service' },
      analysis: analysis({
        findings: [{
          source: 'lighthouse',
          classification: 'verified_issue',
          title: 'Low contrast text',
          evidence: 'Some text is difficult to read.',
        }],
      }),
      signature: {
        email: 'hello@north-star.example',
        website: 'north-star.example',
      },
    })
    const copyWithoutContactLinks = `${result.subjectSuggestions.join('\n')}\n${result.body}`
      .replace('hello@north-star.example', '')
      .replace('north-star.example', '')

    expect(copyWithoutContactLinks).not.toContain('-')
    expect(result.body).toContain('hello@north-star.example')
    expect(result.body).toContain('north-star.example')
    expect(validateProfessionalEmailDraft(
      result,
      { ...prospect, business_name: 'North-Star Cafe', business_category: 'Food-Service' },
      true,
      result.subjectSuggestions[0],
    ).errors).toEqual([])
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
    expect(result.body).toContain('designs and builds new websites, and improves existing ones with focused updates')
  })

  it('builds a contextual follow-up without claiming a previous conversation happened', () => {
    const result = generateFollowUpDraft(
      { subject: 'A quick website observation for AK Plumbing and Heating', body: 'Original draft context.' },
      prospect,
      'first',
    )

    expect(result.subjectSuggestions[0]).toContain('Re:')
    expect(result.body.toLowerCase()).toContain('our earlier note')
    expect(result.body).toContain('AK Plumbing and Heating')
    expect(result.body).not.toMatch(/will not follow up|not relevant/i)
    expect(result.body).toContain('?')
    expect(result.body).not.toMatch(/as discussed|following our conversation|you told me/i)
    expect(validateProfessionalEmailDraft(
      result,
      prospect,
      false,
      result.subjectSuggestions[0],
    ).errors).toEqual([])
  })

  it('mentions the attached website review in follow-ups when one will be included', () => {
    const result = generateFollowUpDraft(
      { subject: 'A quick website observation for AK Plumbing and Heating', body: 'Original draft context.' },
      prospect,
      'first',
      undefined,
      true,
    )

    expect(result.body).toContain('The website review PDF is attached again')
    expect(result.body).toContain('findings and practical recommendations')
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
  it('blocks draft generation when the prospect has no website link', () => {
    expect(() => generateProfessionalEmailDraft({
      prospect: { ...prospect, website: '' },
    })).toThrow('Add a website link')
    expect(() => generateFollowUpDraft(
      { subject: 'A website note', body: 'Earlier message' },
      { ...prospect, website: null },
      'first',
    )).toThrow('Add a website link')
  })

  it('creates a short first-contact introduction without inventing audit findings', () => {
    const result = generateProfessionalEmailDraft({ prospect, strategy: 'cold_outreach' })
    expect(result.body).toContain('briefly introduce Arlotech Digital Solutions')
    expect(result.body).toContain('couple of ideas for your online presence')
    expect(result.body).not.toContain('focused change may address this issue')
    expect(result.body).toContain('designs and builds new websites, and improves existing ones with focused updates')
    expect(result.body).not.toContain('share a couple of ideas based on your goals')
    expect(result.body).not.toMatch(/If this is not relevant|will not follow up/i)
    expect(result.observationsUsed).toEqual([])
  })

  it('blocks customer-facing drafts that include jargon or omit the low-pressure close', () => {
    const draft = generateProfessionalEmailDraft({ prospect })
    const invalid = {
      ...draft,
      body: draft.body.replace('We came across', 'Lighthouse measured the page at 4.8 s. We came across'),
    }

    const result = validateProfessionalEmailDraft(invalid, prospect, false, draft.subjectSuggestions[0])

    expect(result.errors).not.toContain('Add a clear opt-out so the recipient can stop further contact.')
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
      body: generated.body.replace(/The attached PDF[^\n]*/, ''),
    }

    expect(validateProfessionalEmailDraft(
      editedDraft,
      prospect,
      true,
      generated.subjectSuggestions[0],
    ).errors).toContain(
      'Describe the attached review accurately and mention its findings and recommendations.',
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
    expect(result.body).toContain('Would you be available for a 15 minute conversation?')
    expect(result.body).not.toMatch(/Tuesday at|tomorrow at|2:00 PM/i)
  })
})
