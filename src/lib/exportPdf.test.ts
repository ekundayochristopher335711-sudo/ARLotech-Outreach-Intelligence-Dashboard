import { describe, expect, it } from 'vitest'
import { createWebsiteAnalysisPdfBase64 } from './exportPdf'

function pdfText(base64: string) {
  return [...atob(base64).matchAll(/\(((?:\\.|[^\\)])*)\)\s*Tj/g)]
    .map(([, text]) => text.replace(/\\([\\()])/g, '$1'))
    .join('\n')
}

describe('website audit PDF', () => {
  it('includes all unique measured observations and only verified recipient names', () => {
    const findings = Array.from({ length: 9 }, (_, index) => ({
      id: `ps-audit-${index}`,
      source: 'lighthouse',
      title: `Measured finding ${index + 1}`,
      audit_id: `audit-${index}`,
      category: 'performance',
      lighthouse_score_pct: 50,
      affected_resources: [],
    }))
    const report = pdfText(createWebsiteAnalysisPdfBase64({
      website_url: 'https://example.com',
      analyzed_at: '2026-10-27T12:00:00.000Z',
      category_scores: { performance: 90, seo: 80 },
      overall_score: 85,
      findings,
      ai_analysis: {
        visual_audit: {
          status: 'completed',
          pages: [{
            page_url: 'https://example.com/services',
            page_label: 'Services',
            viewport: 'mobile',
            image_path: 'user-id/analysis-id/1-mobile.jpg',
          }],
          observations: [{
            page_url: 'https://example.com/services',
            viewport: 'mobile',
            title: 'Heading clipped on mobile',
            evidence: 'The final word in the heading is cut off at the right edge.',
            severity: 'medium',
            confidence: 0.88,
            recommended_fix: 'Check the heading container width at this viewport.',
          }],
        },
      },
      prospect: { business_name: 'Unverified CRM Name', business_name_verified: false },
    }))

    expect(report).toContain('Weighted technical health')
    expect(report).toContain('A weighted technical health score is unavailable')
    expect(report).toContain('VERIFIED OBSERVATIONS (9)')
    expect(report).toContain('Prepared for: example.com')
    expect(report).not.toContain('Unverified CRM Name')
    expect(report).toContain('9. Measured finding 9')
    expect(report).toContain('VISUAL REVIEW TO VALIDATE (1 OBSERVATIONS)')
    expect(report).toContain('Heading clipped on mobile')
    expect(report).toContain('interactive states were not tested')
  })

  it('uses a business name as the recipient only when explicitly verified', () => {
    const report = pdfText(createWebsiteAnalysisPdfBase64({
      website_url: 'https://example.com',
      category_scores: {},
      findings: [],
    }, { businessName: 'Example Legal', verified: true }))

    expect(report).toContain('Prepared for: Example Legal')
  })

  it('includes the exact optimization opportunity and incomplete capture limitation for the attached report', () => {
    const report = pdfText(createWebsiteAnalysisPdfBase64({
      website_url: 'https://www.amigodev.com.ng',
      analyzed_at: '2026-10-30T12:00:00.000Z',
      overall_score: 100,
      category_scores: {
        performance: 100,
        seo: 100,
        accessibility: 100,
        'best-practices': 100,
      },
      findings: [],
      positive_observations: [],
      ai_analysis: {
        audit_completeness: {
          status: 'partial',
          completeness_percent: 75,
          inspected_viewport_count: 3,
          requested_viewport_count: 4,
          limitations: ['One screenshot failed because the audit Edge Function returned BOOT_ERROR.'],
        },
        optimization_opportunities: [{
          id: 'unused-javascript',
          source: 'lighthouse',
          classification: 'optimization_opportunity',
          title: 'Reduce unused JavaScript',
          evidence: '23 KiB estimated savings',
          display_value: '23 KiB savings',
          opportunity_bytes: 23 * 1024,
          opportunity_ms: 50,
          affected_resources: ['https://www.amigodev.com.ng/app.js'],
        }],
        visual_audit: {
          status: 'partial',
          discovered_page_count: 2,
          pages: [{
            page_url: 'https://www.amigodev.com.ng/services',
            page_label: 'Services',
            viewport: 'mobile',
            image_path: null,
            inspection_status: 'failed',
            error: 'The audit Edge Function returned BOOT_ERROR.',
          }],
          observations: [],
        },
      },
    }))

    expect(report).toContain('Reduce unused JavaScript')
    expect(report).toContain('23 KiB savings')
    expect(report).toContain('50 ms')
    expect(report).toContain('not confirmed defects')
    expect(report).toContain('BOOT_ERROR')
    expect(report).toContain('100 / 100')
  })
})
