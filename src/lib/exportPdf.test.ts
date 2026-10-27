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

    expect(report).toContain('Average Lighthouse category score')
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
})
