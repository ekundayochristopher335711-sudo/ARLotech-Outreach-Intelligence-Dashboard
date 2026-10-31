import { describe, expect, it } from 'vitest'
import { createWebsiteAnalysisPdfBase64 } from './exportPdf'

function pdfText(base64: string) {
  return [...atob(base64).matchAll(/\(((?:\\.|[^\\)])*)\)\s*Tj/g)]
    .map(([, text]) => text.replace(/\\([\\()])/g, '$1'))
    .join('\n')
}

function pdfPages(base64: string) {
  const pdf = atob(base64)
  const objects = new Map(
    [...pdf.matchAll(/(\d+)\s+0\s+obj([\s\S]*?)endobj/g)]
      .map(([, id, body]) => [id, body]),
  )
  const pageObjects = [...pdf.matchAll(/\d+\s+0\s+obj([\s\S]*?)endobj/g)]
    .map(([, body]) => body)
    .filter((body) => /\/Type\s*\/Page\b/.test(body))

  return pageObjects.map((page) => {
    const contentId = page.match(/\/Contents\s+(\d+)\s+0\s+R/)?.[1]
    const stream = contentId ? objects.get(contentId) : ''
    const content = stream?.match(/stream\r?\n([\s\S]*?)\r?\nendstream/)?.[1] || ''
    return [...content.matchAll(/\(((?:\\.|[^\\)])*)\)\s*Tj/g)]
      .map(([, text]) => text.replace(/\\([\\()])/g, '$1'))
      .join('\n')
  })
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
            why_it_matters: 'Visitors may not see the complete heading.',
            severity: 'medium',
            confidence: 0.88,
            recommended_fix: 'Check the heading container width at this viewport.',
          }],
        },
      },
      prospect: { business_name: 'Unverified CRM Name', business_name_verified: false },
    }))

    expect(report).toContain('Overall website score')
    expect(report).toContain('Our overall website score is unavailable')
    expect(report).toContain('WHAT WE FOUND (9 MEASURED OBSERVATIONS)')
    expect(report).toContain('Prepared for: example.com')
    expect(report).not.toContain('Unverified CRM Name')
    expect(report).toContain('9. Measured finding 9')
    expect(report).toContain('VISUAL REVIEW TO VALIDATE (1 OBSERVATIONS)')
    expect(report).toContain('Heading clipped on mobile')
    expect(report).toContain('Why it may matter: Visitors may not see the complete heading')
    expect(report).toContain('tool-assisted observations')
    expect(report).not.toMatch(/\bAI\b|Gemini/)
    expect(report).toContain('We did not test menus, forms, or other controls')
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

    expect(report).toContain('Some JavaScript may not be needed when the page first loads')
    expect(report).toContain('23 KiB savings')
    expect(report).toContain('50 ms')
    expect(report).toContain('not confirmed defects')
    expect(report).toContain('BOOT_ERROR')
    expect(report).toContain('100 / 100')
  })

  it('keeps the Double C Plumbing classifications consistent and summarizes Good results on the final page', () => {
    const base64 = createWebsiteAnalysisPdfBase64({
      website_url: 'https://doublecplumbing.example',
      analyzed_at: '2026-10-31T12:00:00.000Z',
      category_scores: {
        performance: 50,
        seo: 91,
        accessibility: 93,
        'best-practices': 96,
      },
      findings: [
        {
          id: 'lh-speed-index',
          audit_id: 'speed-index',
          source: 'lighthouse',
          classification: 'verified_issue',
          title: 'Speed Index',
          evidence: '2.7 s',
          display_value: '2.7 s',
          recommended_fix: 'Review how the page content appears while loading.',
        },
        {
          id: 'lh-largest-contentful-paint',
          audit_id: 'largest-contentful-paint',
          source: 'lighthouse',
          classification: 'verified_issue',
          title: 'Largest Contentful Paint',
          evidence: '2.7 s',
          display_value: '2.7 s',
          assessment_rating: 'Needs Improvement',
          recommended_fix: 'Review the main content and the resources needed to display it.',
        },
        {
          id: 'lh-total-blocking-time',
          audit_id: 'total-blocking-time',
          source: 'lighthouse',
          classification: 'verified_issue',
          title: 'Total Blocking Time',
          evidence: '1,040 ms',
          display_value: '1,040 ms',
          assessment_rating: 'Poor',
          recommended_fix: 'Review the scripts and page work identified by Lighthouse.',
        },
      ],
      positive_observations: [
        { id: 'positive-metric-speed-index', title: 'Speed Index — Good', evidence: 'PageSpeed measured 2.7 s (Good).' },
        { id: 'positive-score-seo', title: 'SEO — Good', evidence: 'PageSpeed Insights measured 91/100.' },
        { id: 'positive-score-accessibility', title: 'Accessibility — Good', evidence: 'PageSpeed Insights measured 93/100.' },
        { id: 'positive-score-best-practices', title: 'Best Practices — Good', evidence: 'PageSpeed Insights measured 96/100.' },
      ],
      prospect: { business_name: 'Double C Plumbing', business_name_verified: true },
    })
    const pages = pdfPages(base64)
    const fullReport = pdfText(base64)
    const finalPage = pages.at(-1) || ''
    const mainProblemPages = pages.slice(0, -1)

    expect(pages.length).toBeGreaterThan(1)
    expect(pages.every((page) => page.includes('ARLOTECH'))).toBe(true)
    expect(pages.map((page) => page.includes('REPORT - CONTINUED')))
      .toEqual([false, ...Array(pages.length - 1).fill(true)])
    expect(fullReport).toContain('performance 50')
    expect(fullReport).toContain('50 / 100 · Needs Improvement')
    expect(fullReport).toContain('91 / 100 · Good')
    expect(fullReport).toContain('93 / 100 · Good')
    expect(fullReport).toContain('96 / 100 · Good')
    expect(mainProblemPages.join('\n')).toContain('Largest Contentful Paint')
    expect(mainProblemPages.join('\n')).toContain('Needs Improvement')
    expect(mainProblemPages.join('\n')).toContain('Total Blocking Time')
    expect(mainProblemPages.join('\n')).toContain('Poor')
    expect(mainProblemPages.join('\n')).toContain('We recommend reviewing the main content and the resources needed to display it.')
    expect(mainProblemPages.join('\n')).toContain('We recommend reviewing the scripts and page work identified by Lighthouse')
    expect(mainProblemPages.join('\n')).not.toContain('Speed Index')
    expect(finalPage).toContain('WHAT IS WORKING WELL')
    expect(finalPage).toContain('Speed Index: 2.7 s')
    expect(finalPage).toContain('SEO: 91 / 100')
    expect(finalPage).toContain('Accessibility: 93 / 100')
    expect(finalPage).toContain('Best Practices: 96 / 100')
    expect(finalPage.match(/Good/g)).toHaveLength(4)
    expect(finalPage).toContain('NEXT STEPS')
  })
})
