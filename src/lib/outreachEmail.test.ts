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

  it('turns the AmigoDev loading opportunity into plain-language outreach', () => {
    const audit = analysis()
    const preview = createOutreachPreview(prospect(), audit)
    expect(getOutreachSuitability(audit)).toBe('Good Opportunity')
    expect(preview.selected_finding?.id).toBe('unused-javascript')
    expect(preview.body).toMatch(/extra website features may slow down taps and clicks/i)
    expect(preview.body).toContain('especially on a phone')
    expect(preview.body).toContain('Our website review of AmigoDev')
    expect(preview.body).toContain('a possible point of friction for visitors')
    expect(preview.body).not.toMatch(/23 KiB|50 ms|PageSpeed|Lighthouse|JavaScript|score/i)
    expect(preview.subject).toBe('A website idea for AmigoDev: faster page loading')
    expect(preview.internal_note).toContain('Extra website features may slow down taps and clicks')
    expect(preview.body).toContain('Arlotech Digital Solutions')
    expect(preview.body).toContain('not pitching a costly, full website redesign')
    expect(preview.body).toContain('attached a short website review')
    expect(preview.body).toContain('take a look')
    expect(preview.body).not.toMatch(/\b(?:AI|Gemini|weighted technical)\b/i)
    expect(preview.body).not.toMatch(/\b(I|me|my)\b/i)
    expect(preview.has_website_report).toBe(true)
    expect(preview.body.split('?')).toHaveLength(2)
    expect(preview.body.trim().split(/\s+/).length).toBeGreaterThanOrEqual(90)
    expect(preview.body.trim().split(/\s+/).length).toBeLessThanOrEqual(150)
    expect(preview.internal_note).toContain('Extra website features may slow down taps and clicks')
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
    expect(preview.body).toMatch(/some text may be difficult for visitors to read/i)
    expect(preview.body).not.toMatch(/2\.1:1|#777|#fff/i)
    expect(() => validateOutreachPreview(preview, prospect(), audit)).not.toThrow()
  })

  it('rewrites technical list-structure findings in plain customer language', () => {
    const audit = analysis({
      findings: [{
        id: 'list',
        source: 'html_inspection',
        classification: 'verified_issue',
        verified: true,
        title: 'Lists do not contain only <li> elements and script supporting elements (<script> and <template>).',
        evidence: 'The list has invalid markup.',
        explanation: 'Screen readers have a specific way of announcing lists. Ensuring proper list structure aids screen reader output. https://dequeuniversity.com/rules/axe/4.14/list',
        category: 'accessibility',
        priority: 'medium',
      }],
      ai_analysis: { audit_completeness: { status: 'complete' }, optimization_opportunities: [] },
    })
    const preview = createOutreachPreview(prospect(), audit)

    expect(preview.body).toMatch(/service details may be harder for some visitors to follow/i)
    expect(preview.body).toContain('visitors may have a harder time scanning the page')
    expect(preview.body).not.toMatch(/<li>|<script>|<template>|screen reader|dequeuniversity|axe\/4\.14|invalid markup/i)
    expect(() => validateOutreachPreview(preview, prospect(), audit)).not.toThrow()
  })

  it('blocks external accessibility references if they are added to an edited preview', () => {
    const audit = analysis({
      findings: [{
        id: 'link-in-text-block',
        source: 'lighthouse',
        classification: 'verified_issue',
        verified: true,
        title: 'Links are not distinguishable without color',
        evidence: 'A link in a paragraph is only differentiated by color.',
        explanation: 'https://dequeuniversity.com/rules/axe/4.14/link-in-text-block',
        category: 'accessibility',
        priority: 'medium',
      }],
      ai_analysis: { audit_completeness: { status: 'complete' }, optimization_opportunities: [] },
    })
    const original = createOutreachPreview(prospect(), audit)
    expect(original.body.toLowerCase()).toContain('some links may be difficult to spot within the text')
    expect(original.body).not.toContain('dequeuniversity')
    const edited = {
      ...original,
      body: `${original.body}\n\nLearn how to make links distinguishable: https://dequeuniversity.com/rules/axe/4.14/link-in-text-block`,
    }

    expect(() => validateOutreachPreview(edited, prospect(), audit)).toThrow('The edited email no longer matches the audit evidence or ArloTech company voice.')
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

  it('does not select a Good-rated metric as an outreach problem', () => {
    const audit = analysis({
      findings: [{
        id: 'lh-speed-index',
        audit_id: 'speed-index',
        source: 'lighthouse',
        classification: 'verified_issue',
        title: 'Speed Index',
        evidence: '2.7 s',
        display_value: '2.7 s',
      }],
      ai_analysis: { audit_completeness: { status: 'complete' }, optimization_opportunities: [] },
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
    expect(() => validateOutreachPreview({
      ...preview,
      body: preview.body.replace(/extra website features may slow down taps and clicks/i, 'a 23 KiB JavaScript issue'),
    }, prospect(), audit)).toThrow('contains technical language')
    expect(() => validateOutreachPreview({
      ...preview,
      body: preview.body.replace('Our website review of AmigoDev', "I reviewed AmigoDev"),
    }, prospect(), audit))
      .toThrow('company voice')
    expect(() => validateOutreachPreview({ ...preview, subject: 'A quick hello, AmigoDev' }, prospect(), audit))
      .toThrow('company voice')
  })

  it('requires a matching website analysis before creating website outreach', () => {
    expect(() => createOutreachPreview(prospect())).toThrow('A completed audit for this exact website is required')
  })
})
