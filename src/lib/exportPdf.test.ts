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
    const report = pages.join('\n')
    const summaryEnd = report.indexOf('CUSTOMER FRICTION POINTS (3)')
    const overview = summaryEnd < 0 ? report : report.slice(0, summaryEnd)
    const summaryTitles = report.match(/The main page content takes too long to appear|Files may delay the first view of your website|Parts of the page may take longer to look ready|Extra website features may slow down taps and clicks/g) ?? []
    const issueDescriptions = report.split('WHY THIS MAY MATTER TO CUSTOMERS').slice(1)
      .map((description) => description.trim().split('\n').slice(0, 2).join(' ').toLowerCase())

    expect(pages.length).toBeGreaterThanOrEqual(1)
    expect(pages.length).toBeLessThanOrEqual(3)
    expect(pages.length).toBeGreaterThan(1)
    expect(overview).toContain('YOUR WEBSITE AT A GLANCE')
    expect(overview).not.toContain('The main page content takes too long to appear')
    expect(report).toContain('CUSTOMER FRICTION POINTS (3)')
    expect(summaryTitles).toHaveLength(3)
    expect(new Set(summaryTitles.map((title) => title.toLowerCase())).size).toBe(3)
    expect(issueDescriptions).toHaveLength(3)
    expect(new Set(issueDescriptions.map((description) => description.toLowerCase())).size).toBe(3)
  })

  it('creates a plain-English report with an overview, unique issue explanations, and a business close', async () => {
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

    expect(pages.length).toBeGreaterThanOrEqual(1)
    expect(pages.length).toBeLessThanOrEqual(3)
    expect(report).toContain('WEBSITE HEALTH SCORE')
    expect(report).toContain('CUSTOMER FRICTION POINTS (3)')
    expect(report).not.toContain('example.com')
    expect(report).not.toContain('Website reviewed')
    expect(report).not.toContain('Prepared for')
    expect(report).not.toContain('Unverified CRM Name')
    expect(report).toContain('The main page content takes too long to appear')
    expect(report).toContain('The page may take too long to respond')
    expect(report).toContain('Page content may move while it loads')
    expect(report).not.toContain('Unrecognized internal check')
    expect(report).not.toMatch(/\bLighthouse\b|\bPageSpeed\b|\bKiB\b|\bDOM\b|\bARIA\b|\bTBT\b|\bFCP\b|\bLCP\b/)
    expect(report).not.toContain('user-id/analysis-id')
    expect(report).toContain('outreach@arlotech.com.ng')
    expect(report).toContain('arlotech.com.ng')
    expect(report).toContain('+2348166419332')
  })

  it('uses the verified recipient name and official Arlotech logo in the PDF header', async () => {
    const reportBase64 = await createWebsiteAnalysisPdfBase64({
      website_url: 'https://example.com',
      category_scores: {},
      findings: [],
    }, { businessName: 'Example Legal', verified: true })
    const report = pdfText(reportBase64)

    expect(report).not.toContain('Example Legal')
    expect(report).not.toContain('example.com')
    expect(report).not.toContain('Prepared for')
    expect(report).toContain('ARLOTECH DIGITAL SOLUTIONS')
    expect(atob(reportBase64)).toContain('/Subtype /Image')
    expect(fetch).toHaveBeenCalledWith(getBrandAssetUrl(ARLOTECH_LOGO_FILE))
    const emptyReportPages = pdfPages(await createWebsiteAnalysisPdfBase64({
      website_url: 'https://example.com',
      category_scores: {},
      findings: [],
    }, { businessName: 'Example Legal', verified: true }))
    expect(emptyReportPages).toHaveLength(1)
  })

  it('includes verified strengths and support tied to the audit category', async () => {
    const report = pdfText(await createWebsiteAnalysisPdfBase64({
      website_url: 'https://example.com',
      category_scores: { performance: 55 },
      findings: [{
        id: 'largest-contentful-paint',
        audit_id: 'largest-contentful-paint',
        source: 'lighthouse',
        classification: 'verified_issue',
        title: 'Largest Contentful Paint',
        evidence: 'Main content appeared after 4.8 seconds.',
        category: 'performance',
        priority: 'high',
      }],
      positive_observations: [{
        id: 'contact-details',
        title: 'Business contact details are easy to find',
        evidence: 'The phone number and email address are shown in the page header.',
      }],
    }))

    expect(report).toContain("WHAT'S WORKING WELL")
    expect(report).toContain('Business contact details are easy to find')
    expect(report).toContain('The phone number and email address are shown in the page header.')
    expect(report).toContain('RELEVANT ARLOTECH SUPPORT')
    expect(report).toContain('page speed and website performance improvements')
  })

  it('rewrites technical list findings as customer-focused information without exposing raw markup', async () => {
    const report = pdfText(await createWebsiteAnalysisPdfBase64({
      website_url: 'https://jbfplumbing.example',
      category_scores: { accessibility: 70 },
      findings: [{
        id: 'list',
        source: 'html_inspection',
        classification: 'verified_issue',
        title: 'Lists do not contain only <li> elements and script supporting elements (<script> and <template>).',
        evidence: 'The list has invalid markup.',
        explanation: 'Screen readers have a specific way of announcing lists. https://dequeuniversity.com/rules/axe/4.14/list',
        category: 'accessibility',
        priority: 'medium',
      }],
    }))

    expect(report).toContain('Some visitors may find this page difficult to use')
    expect(report).not.toMatch(/<li>|<script>|<template>|screen readers|dequeuniversity|axe\/4\.14|invalid markup/i)
  })

  it('does not include external accessibility rule references in the PDF', async () => {
    const report = pdfText(await createWebsiteAnalysisPdfBase64({
      website_url: 'https://example.com',
      category_scores: { accessibility: 70 },
      findings: [{
        id: 'link-in-text-block',
        source: 'lighthouse',
        classification: 'verified_issue',
        title: 'Links are not distinguishable without color',
        evidence: 'A link in a paragraph is only differentiated by color.',
        explanation: 'Learn how to make links distinguishable https://dequeuniversity.com/rules/axe/4.14/link-in-text-block',
        category: 'accessibility',
        priority: 'medium',
      }],
    }))

    expect(report).not.toMatch(/dequeuniversity|axe\/4\.14|Learn how to make links distinguishable/i)
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

    expect(pdfPages(base64).length).toBeGreaterThanOrEqual(1)
    expect(pdfPages(base64).length).toBeLessThanOrEqual(3)
    expect(atob(base64)).toContain('/Subtype /Image')
    expect(report).toContain('100 / 100')
    expect(report).not.toContain('23 KiB')
    expect(report).not.toContain('50 ms')
    expect(report).not.toContain('BOOT_ERROR')
    expect(report).not.toMatch(/\bLighthouse\b|\bPageSpeed\b|\bJavaScript\b/)
    expect(report).toContain('No confirmed customer friction points')
    expect(report).toContain('No confirmed customer friction points were identified')
    expect(report).not.toContain('These observations highlight opportunities')
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
    const fullReport = pages.join('\n')

    expect(pages.length).toBeGreaterThanOrEqual(1)
    expect(pages.length).toBeLessThanOrEqual(3)
    expect(pages.every((page) => page.includes('ARLOTECH'))).toBe(true)
    expect(fullReport).toContain('CUSTOMER FRICTION POINTS (2)')
    expect(fullReport).toContain('The main page content takes too long to appear')
    expect(fullReport).toContain('The page may take too long to respond')
    expect(fullReport).not.toContain('Speed Index')
    expect(fullReport).not.toContain('Affected file or page address')
    expect(pages.at(-1)).toContain('protect your reputation')
    expect(pages.at(-1)).toContain('Reply to the email that included this report')
    expect(pages.at(-1)).toContain('outreach@arlotech.com.ng')
    expect(pages.at(-1)).toContain('arlotech.com.ng')
    expect(pages.at(-1)).toContain('+2348166419332')
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
    expect(report).toContain('CUSTOMER FRICTION POINTS (0)')
    expect(report).toMatch(/We could not\s+calculate a reliable overall score/)
    expect(report).not.toContain('100 / 100')
    expect(report).toContain('Reply to the email that included this report')
    expect(report).toContain('outreach@arlotech.com.ng')
    expect(report).toContain('+2348166419332')
    expect(pages).toHaveLength(1)
  })

})
