import { describe, expect, it } from 'vitest'
import {
  createOutreachPreview,
  getOutreachSuitability,
  hasMatchingWebsiteAnalysis,
  selectOutreachFinding,
  validateOutreachPreview,
} from './outreachEmail'

function prospect(website: string | null = 'https://www.amigodev.com.ng') {
  return {
    id: 'prospect-1',
    business_name: 'AmigoDev',
    contact_name: '',
    website,
    business_category: 'Technology',
  }
}

function analysis(overrides: Record<string, unknown> = {}) {
  return {
    id: 'analysis-1',
    website_url: 'https://amigodev.com.ng',
    overall_score: 100,
    category_scores: {
      performance: 100,
      seo: 100,
      accessibility: 100,
      'best-practices': 100,
    },
    findings: [
      {
        id: 'lcp',
        source: 'lighthouse',
        classification: 'verified_issue',
        verified: true,
        title: 'Largest Contentful Paint',
        evidence: '0.7 seconds',
        priority: 'high',
        severity: 'high',
      },
    ],
    ai_analysis: {
      audit_completeness: { status: 'complete' },
      optimization_opportunities: [
        {
          id: 'unused-javascript',
          source: 'lighthouse',
          classification: 'optimization_opportunity',
          title: 'Reduce unused JavaScript',
          evidence: '23 KiB estimated savings',
          display_value: '23 KiB savings',
          opportunity_bytes: 23 * 1024,
          opportunity_ms: 50,
          affected_resources: ['https://amigodev.com.ng/app.js'],
          recommended_fix: 'Review the affected script.',
        },
      ],
    },
    ...overrides,
  } as unknown as Parameters<typeof getOutreachSuitability>[0]
}

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

  it('prioritizes verified problems over the first array item and does not flag excellent LCP', () => {
    const record = analysis({
      findings: [
        {
          id: 'lcp',
          source: 'lighthouse',
          classification: 'verified_issue',
          verified: true,
          title: 'Largest Contentful Paint',
          evidence: '0.7 seconds',
          severity: 'high',
        },
        {
          id: 'a11y',
          source: 'lighthouse',
          classification: 'verified_issue',
          verified: true,
          title: 'Low contrast text',
          evidence: 'Contrast ratio 2.1:1 for #777 on #fff.',
          severity: 'high',
          priority: 'high',
        },
      ],
      ai_analysis: { audit_completeness: { status: 'complete' }, optimization_opportunities: [] },
    })
    expect(selectOutreachFinding(record)?.id).toBe('a11y')
  })

  it('treats the AmigoDev unused-JavaScript measurement as a modest opportunity', () => {
    const audit = analysis()
    const preview = createOutreachPreview(prospect(), audit)
    expect(getOutreachSuitability(audit)).toBe('Good Opportunity')
    expect(preview.selected_finding?.id).toBe('unused-javascript')
    expect(preview.body).toContain('23 KiB')
    expect(preview.body).toContain('50 ms (0.05 seconds) in Google\'s test')
    expect(preview.body).toContain('23 KiB (about 24 KB)')
    expect(preview.subject).toBe('A website idea for AmigoDev: faster page loading')
    expect(preview.internal_note).toContain('Some JavaScript may not be needed when the page first loads')
    expect(preview.body).toContain('Arlotech Digital Solutions')
    expect(preview.body).toContain('We recommend')
    expect(preview.body).not.toMatch(/\b(?:AI|Gemini|weighted technical)\b/i)
    expect(preview.body).not.toMatch(/\b(I|me|my)\b/i)
    expect(preview.has_website_report).toBe(true)
    expect(preview.body.split('?')).toHaveLength(2)
    expect(preview.body.trim().split(/\s+/).length).toBeGreaterThanOrEqual(90)
    expect(preview.body.trim().split(/\s+/).length).toBeLessThanOrEqual(150)
    expect(preview.internal_note).toContain('Some JavaScript may not be needed when the page first loads')
    expect(() => validateOutreachPreview(preview, prospect(), audit)).not.toThrow()
  })

  it('creates a subject that reflects the selected website finding', () => {
    const audit = analysis({
      findings: [{
        id: 'contrast',
        source: 'lighthouse',
        classification: 'verified_issue',
        verified: true,
        title: 'Low contrast text',
        evidence: 'Some text has a contrast ratio of 2.1:1.',
        priority: 'high',
      }],
      ai_analysis: { audit_completeness: { status: 'complete' }, optimization_opportunities: [] },
    })
    const preview = createOutreachPreview(prospect(), audit)
    expect(preview.subject).toBe('A website idea for AmigoDev: easier-to-read text')
    expect(preview.body).toContain('Low contrast')
    expect(() => validateOutreachPreview(preview, prospect(), audit)).not.toThrow()
  })

  it('withholds outreach when only positive results or diagnostics exist', () => {
    const audit = analysis({
      findings: [],
      ai_analysis: {
        audit_completeness: { status: 'complete' },
        diagnostics: [{
          id: 'dependency-tree',
          classification: 'diagnostic',
          title: 'Network dependency tree',
          evidence: 'Diagnostic information only.',
        }],
        optimization_opportunities: [],
      },
    })
    expect(getOutreachSuitability(audit)).toBe('No Opportunity')
    expect(() => createOutreachPreview(prospect(), audit)).toThrow('Outreach was withheld')
  })

  it('withholds outreach if the audit is incomplete and has no verified opportunity', () => {
    const audit = analysis({
      category_scores: { performance: 100, seo: null, accessibility: 100, 'best-practices': 100 },
      findings: [],
      ai_analysis: { audit_completeness: { status: 'partial' }, optimization_opportunities: [] },
    })
    expect(getOutreachSuitability(audit)).toBe('Incomplete Audit')
    expect(() => createOutreachPreview(prospect(), audit)).toThrow('audit is incomplete')
  })

  it('uses ArloTech company voice for website-free introductions', () => {
    const lead = prospect(null)
    const preview = createOutreachPreview(lead)
    expect(preview.has_website_report).toBe(false)
    expect(preview.body).toContain('Hi there,')
    expect(preview.body).toContain('Arlotech Digital Solutions')
    expect(preview.body).not.toMatch(/\b(I|me|my)\b/i)
    expect(preview.body).not.toContain('attached')
    expect(() => validateOutreachPreview(preview, lead)).not.toThrow()
  })

  it('rejects stale previews and edits that remove the evidence or company signature', () => {
    const audit = analysis()
    const preview = createOutreachPreview(prospect(), audit)
    expect(() => validateOutreachPreview(preview, prospect(), { ...audit, id: 'analysis-2' })).toThrow('audit changed')
    expect(() => validateOutreachPreview({ ...preview, body: preview.body.replace('23 KiB', '23 MB') }, prospect(), audit))
      .toThrow('omits or changes evidence')
    expect(() => validateOutreachPreview({ ...preview, body: preview.body.replace('We reviewed', 'I reviewed') }, prospect(), audit))
      .toThrow('company voice')
    expect(() => validateOutreachPreview({ ...preview, subject: 'A quick hello, AmigoDev' }, prospect(), audit))
      .toThrow('company voice')
  })

  it('requires a matching website analysis before creating website outreach', () => {
    expect(() => createOutreachPreview(prospect())).toThrow('A completed audit for this exact website is required')
  })
})
