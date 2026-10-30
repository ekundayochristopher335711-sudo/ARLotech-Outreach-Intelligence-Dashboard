import { describe, expect, it } from 'vitest'
import {
  calculateTechnicalHealthScore,
  buildEvidenceBasedPositiveObservations,
  classifyLighthouseAudits,
  extractCategoryScores,
  sanitizeRecommendationList,
  sanitizeVisualObservations,
  scoreToPercent,
  summarizePageInspectionCoverage,
} from './websiteAudit'
import type { PageSpeedResult } from './websiteAnalysis'

function pagespeedFixture(): PageSpeedResult {
  return {
    id: 'https://example.com/',
    title: 'Example',
    strategy: 'desktop',
    lighthouseResult: {
      categories: {
        performance: { id: 'performance', title: 'Performance', score: 0.97, scoreDisplayMode: 'numeric', description: '', auditRefs: [{ id: 'lcp', weight: 10 }, { id: 'network-dependency-tree-insight', weight: 0 }] },
        seo: { id: 'seo', title: 'SEO', score: 0.91, scoreDisplayMode: 'numeric', description: '', auditRefs: [] },
        accessibility: { id: 'accessibility', title: 'Accessibility', score: 1, scoreDisplayMode: 'numeric', description: '', auditRefs: [] },
        'best-practices': { id: 'best-practices', title: 'Best Practices', score: 0.8, scoreDisplayMode: 'numeric', description: '', auditRefs: [] },
      },
      audits: {
        lcp: { id: 'lcp', title: 'LCP', score: 0.5, scoreDisplayMode: 'numeric', displayValue: 'LCP 0.7 s', description: 'Measured LCP', details: { type: 'table', items: [] } },
        'network-dependency-tree-insight': { id: 'network-dependency-tree-insight', title: 'Network dependency tree', score: 0, scoreDisplayMode: 'numeric', displayValue: 'Insight', description: 'Diagnostic only', details: { type: 'table', items: [] } },
        'unused-javascript': { id: 'unused-javascript', title: 'Reduce unused JavaScript', score: 0, scoreDisplayMode: 'numeric', displayValue: '23 KiB savings', description: 'Estimated savings', details: { type: 'opportunity', overallSavingsBytes: 23000, items: [{ url: 'https://example.com/app.js' }] } },
        'missing-score': { id: 'missing-score', title: 'No score', score: null, scoreDisplayMode: 'informative', details: { type: 'table', items: [] } },
      },
    },
  }
}

describe('Lighthouse evidence and score handling', () => {
  it('converts only finite Lighthouse decimals in the valid range', () => {
    expect(scoreToPercent(0.97)).toBe(97)
    expect(scoreToPercent(1)).toBe(100)
    expect(scoreToPercent(null)).toBeNull()
    expect(scoreToPercent(1.1)).toBeNull()
    expect(scoreToPercent(Number.NaN)).toBeNull()
  })

  it('keeps canonical category scores and computes the required weighted score', () => {
    const categories = extractCategoryScores(pagespeedFixture())
    expect(categories).toEqual({
      performance: 97,
      seo: 91,
      accessibility: 100,
      'best-practices': 80,
    })
    expect(calculateTechnicalHealthScore(categories)).toBe(93)
    expect(calculateTechnicalHealthScore({ ...categories, accessibility: null })).toBeNull()
    expect(calculateTechnicalHealthScore({ ...categories, performance: 101 })).toBeNull()
  })

  it('does not treat non-scoring insights or null scores as failed issues', () => {
    const findings = classifyLighthouseAudits(pagespeedFixture())
    expect(findings.map(({ audit_id, classification }) => [audit_id, classification])).toEqual([
      ['lcp', 'verified_issue'],
      ['network-dependency-tree-insight', 'diagnostic'],
      ['unused-javascript', 'optimization_opportunity'],
    ])
    expect(findings[1].verified).toBe(false)
    expect(findings[2].affected_resources).toEqual(['https://example.com/app.js'])
  })

  it('reports partial viewport coverage without hiding failed pages', () => {
    const coverage = summarizePageInspectionCoverage(
      ['https://example.com/', 'https://example.com/services'],
      [
        { page_url: 'https://example.com/', viewport: 'desktop', status: 'completed' },
        { page_url: 'https://example.com/', viewport: 'mobile', status: 'completed' },
        { page_url: 'https://example.com/services', viewport: 'desktop', status: 'completed' },
        { page_url: 'https://example.com/services', viewport: 'mobile', status: 'failed' },
      ],
    )
    expect(coverage).toMatchObject({
      discovered_page_count: 2,
      requested_viewport_count: 4,
      inspected_viewport_count: 3,
      failed_viewport_count: 1,
      fully_inspected_page_count: 1,
      partially_inspected_page_count: 1,
      failed_page_count: 0,
      completeness_percent: 75,
    })
  })

  it('sanitizes AI suggestions and ties visual observations to captured screenshots', () => {
    expect(sanitizeRecommendationList([
      '  Review the measured LCP issue  ',
      null,
      42,
      'x'.repeat(700),
    ])).toEqual(['Review the measured LCP issue', 'x'.repeat(600)])

    const screenshots = [{ page_url: 'https://example.com/', viewport: 'mobile' as const }]
    const observations = sanitizeVisualObservations([
      {
        page_url: 'https://example.com/',
        viewport: 'mobile',
        title: '  Clipped heading  ',
        evidence: 'The heading is clipped at the right edge.',
        severity: 'medium',
        confidence: 0.876,
        recommended_fix: 'Check the mobile container width.',
      },
      {
        page_url: 'https://example.com/other',
        viewport: 'mobile',
        title: 'Uncaptured page',
        evidence: 'No screenshot exists.',
        severity: 'high',
        confidence: 0.9,
      },
      {
        page_url: 'https://example.com/',
        viewport: 'mobile',
        title: 'Bad confidence',
        evidence: 'Confidence is outside the expected range.',
        severity: 'high',
        confidence: 1.2,
      },
    ], screenshots)

    expect(observations).toEqual([{
      page_url: 'https://example.com/',
      viewport: 'mobile',
      title: 'Clipped heading',
      evidence: 'The heading is clipped at the right edge.',
      severity: 'medium',
      confidence: 0.88,
      recommended_fix: 'Check the mobile container width.',
    }])
  })

  it('only emits positive observations tied to measured scores or extracted HTML', () => {
    const categories = extractCategoryScores(pagespeedFixture())
    const observations = buildEvidenceBasedPositiveObservations({
      url: 'https://example.com/',
      finalUrl: 'https://example.com/',
      status: 200,
      title: 'Example title',
      metaDescription: null,
      robots: null,
      canonical: null,
      lang: 'en',
      viewport: null,
      favicon: null,
      og: {},
      twitter: {},
      headings: {},
      wordCount: 0,
      textExcerpt: '',
      links: { total: 0, internal: 0, external: 0, externalDomains: [] },
      images: { total: 0, missingAlt: 0 },
      schema: [],
      h1Count: 0,
    }, categories)

    expect(observations.map(({ id }) => id)).toContain('positive-title-present')
    expect(observations.some(({ evidence }) => evidence === 'AI-generated')).toBe(false)
    expect(observations.every(({ evidence }) => evidence.length > 0)).toBe(true)
  })
})
