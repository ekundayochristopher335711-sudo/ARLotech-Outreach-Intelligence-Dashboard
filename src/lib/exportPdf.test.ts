import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import { createWebsiteAnalysisPdfBase64 } from './exportPdf'
import { ARLOTECH_FAVICON_FILE, ARLOTECH_LOGO_FILE, getBrandAssetUrl } from './brandAssets'

const arlotechLogo = readFileSync(new URL('../../public/overall logo.png', import.meta.url))

beforeEach(() => {
  vi.stubGlobal('fetch', vi.fn(async () => {
    return new Response(arlotechLogo, {
      headers: { 'Content-Type': 'image/png' },
    })
  }))
})

afterEach(() => vi.unstubAllGlobals())

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
  it('keeps the summary and detailed issues distinct without repeating customer explanations', async () => {
    const findings = [
      ['largest-contentful-paint', 'Largest Contentful Paint'],
      ['render-blocking-resources', 'Render-blocking resources'],
      ['unused-css-rules', 'Unused CSS'],
      ['unused-css-duplicate', 'Unused CSS on another page'],
      ['unused-javascript', 'Unused JavaScript'],
    ].map(([auditId, title]) => ({
      id: `ps-${auditId}`,
      audit_id: auditId,
      source: 'lighthouse',
      title,
      category: 'performance',
      priority: 'high',
      lighthouse_score_pct: 40,
      affected_resources: [],
    }))
    const pages = pdfPages(await createWebsiteAnalysisPdfBase64({
      website_url: 'https://example.com',
      category_scores: { performance: 40 },
      findings,
    }))
    const summaryTitles = pages[0].match(/\d+\.\s+[^\n]+/g) ?? []
    const issueDescriptions = pages[1].match(/Why it matters to your customers: [^\n]+/g) ?? []

    expect(pages).toHaveLength(3)
    expect(pages[0]).toContain('Top customer friction points (3)')
    expect(pages[1]).toContain('PRIORITY CUSTOMER ISSUES (3)')
    expect(summaryTitles).toHaveLength(3)
    expect(new Set(summaryTitles.map((title) => title.toLowerCase())).size).toBe(3)
    expect(issueDescriptions).toHaveLength(3)
    expect(new Set(issueDescriptions.map((description) => description.toLowerCase())).size).toBe(3)
  })

  it('creates a three-page, plain-English report with the same three issues in its summary and detail', async () => {
    const findings = Array.from({ length: 9 }, (_, index) => ({
      id: `ps-audit-${index}`,
      source: 'lighthouse',
      title: [
        'Largest Contentful Paint',
        'Total Blocking Time',
        'Cumulative Layout Shift',
        ...Array.from({ length: 6 }, (_value, findingIndex) => `Unrecognized internal check ${findingIndex + 1}`),
      ][index],
      audit_id: [
        'largest-contentful-paint',
        'total-blocking-time',
        'cumulative-layout-shift',
        ...Array.from({ length: 6 }, (_value, findingIndex) => `internal-check-${findingIndex + 1}`),
      ][index],
      category: 'performance',
      lighthouse_score_pct: 50,
      priority: index < 3 ? 'high' : 'low',
      affected_resources: [],
    }))
    const base64 = await createWebsiteAnalysisPdfBase64({
      website_url: 'https://example.com',
      analyzed_at: '2026-10-27T12:00:00.000Z',
      category_scores: { performance: 90, seo: 90, accessibility: 90, 'best-practices': 90 },
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
    })
    const report = pdfText(base64)
    const pages = pdfPages(base64)

    expect(pages).toHaveLength(3)
    expect(report).toContain('Website health score')
    expect(report).toContain('Top customer friction points (3)')
    expect(report).toContain('PRIORITY CUSTOMER ISSUES (3)')
    expect(report).toContain('Prepared for: example.com')
    expect(report).not.toContain('Unverified CRM Name')
    expect(report).toContain('The main page content takes too long to appear')
    expect(report).toContain('The page may take too long to respond')
    expect(report).toContain('Page content may move while it loads')
    expect(report).not.toContain('Unrecognized internal check')
    expect(report).not.toMatch(/\bLighthouse\b|\bPageSpeed\b|\bKiB\b|\bDOM\b|\bARIA\b|\bTBT\b|\bFCP\b|\bLCP\b/)
    expect(report).not.toContain('user-id/analysis-id')
    expect(report).toContain('book a 10-minute website review call')
  })

  it('uses the verified recipient name and official Arlotech logo in the PDF header', async () => {
    const reportBase64 = await createWebsiteAnalysisPdfBase64({
      website_url: 'https://example.com',
      category_scores: {},
      findings: [],
    }, { businessName: 'Example Legal', verified: true })
    const report = pdfText(reportBase64)

    expect(report).toContain('Prepared for: Example Legal')
    expect(report).toContain('ARLOTECH DIGITAL SOLUTIONS')
    expect(atob(reportBase64)).toContain('/Subtype /Image')
    expect(fetch).toHaveBeenCalledWith(getBrandAssetUrl(ARLOTECH_LOGO_FILE))
    expect(pdfPages(await createWebsiteAnalysisPdfBase64({
      website_url: 'https://example.com',
      category_scores: {},
      findings: [],
    }, { businessName: 'Example Legal', verified: true }))).toHaveLength(3)
  })

  it('uses one brand logo in PDFs regardless of the active workspace appearance', async () => {
    await createWebsiteAnalysisPdfBase64({
      website_url: 'https://example.com',
      category_scores: {},
      findings: [],
    })

    expect(fetch).toHaveBeenCalledWith(getBrandAssetUrl(ARLOTECH_LOGO_FILE))
    expect(getBrandAssetUrl(ARLOTECH_FAVICON_FILE)).toContain('favicon-32x32.png')
  })

  it('omits technical diagnostics and unverified savings rather than making contradictory claims', async () => {
    const base64 = await createWebsiteAnalysisPdfBase64({
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
    })
    const report = pdfText(base64)

    expect(pdfPages(base64)).toHaveLength(3)
    expect(atob(base64)).toContain('/Subtype /Image')
    expect(report).toContain('100 / 100')
    expect(report).not.toContain('23 KiB')
    expect(report).not.toContain('50 ms')
    expect(report).not.toContain('BOOT_ERROR')
    expect(report).not.toMatch(/\bLighthouse\b|\bPageSpeed\b|\bJavaScript\b/)
    expect(report).toContain('No confirmed customer friction points')
    expect(report).toContain('The issues in this review are opportunities')
  })

  it('shows only the highest-priority customer issues and ends with a direct business-focused call to action', async () => {
    const base64 = await createWebsiteAnalysisPdfBase64({
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
    const executivePage = pages[0] || ''
    const issuePage = pages[1] || ''
    const finalPage = pages[2] || ''

    expect(pages).toHaveLength(3)
    expect(pages.every((page) => page.includes('ARLOTECH'))).toBe(true)
    expect(executivePage).toContain('Top customer friction points (2)')
    expect(issuePage).toContain('PRIORITY CUSTOMER ISSUES (2)')
    expect(issuePage).toContain('The main page content takes too long to appear')
    expect(issuePage).toContain('The page may take too long to respond')
    expect(issuePage).not.toContain('Speed Index')
    expect(issuePage).not.toContain('Affected file or page address')
    expect(finalPage).toContain('PROTECT YOUR REPUTATION')
    expect(finalPage).toContain('Reply to the email')
    expect(finalPage).toContain('book a 10-minute website review call')
    expect(fullReport).not.toMatch(/\bLighthouse\b|\bPageSpeed\b|\bLargest Contentful Paint\b|\bTotal Blocking Time\b/)
    expect(fullReport).not.toContain('A practical improvement plan')
  })

  it('keeps an empty or incomplete assessment within three pages', async () => {
    const base64 = await createWebsiteAnalysisPdfBase64({
      website_url: 'https://example.com',
      analyzed_at: '2026-11-02T10:00:00.000Z',
      category_scores: { performance: 72 },
      overall_score: 100,
      findings: [],
      positive_observations: [],
      ai_analysis: {},
    })
    const report = pdfText(base64)
    const pages = pdfPages(base64)
    expect(report).toContain('YOUR WEBSITE AT A GLANCE')
    expect(report).toContain('Top customer friction points (0)')
    expect(report).toContain('We could not calculate a reliable overall score')
    expect(report).not.toContain('100 / 100')
    expect(pages).toHaveLength(3)
  })

})
