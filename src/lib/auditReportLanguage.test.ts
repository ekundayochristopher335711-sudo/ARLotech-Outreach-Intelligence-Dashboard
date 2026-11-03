import { describe, expect, it } from 'vitest'
import {
  auditFindingBusinessImpact,
  auditFindingBusinessTitle,
  auditFindingRecommendation,
  auditFindingTitle,
  auditFindingWhy,
  clientFriendlyAuditText,
} from './auditReportLanguage'

describe('client-friendly audit language', () => {
  it('gives business owners a plain-language title and customer impact', () => {
    const finding = {
      audit_id: 'largest-contentful-paint',
      title: 'Largest Contentful Paint',
      category: 'performance',
    }

    expect(auditFindingBusinessTitle(finding)).toBe('The main page content takes too long to appear')
    expect(auditFindingBusinessImpact(finding)).toContain('potential customers')
    expect(auditFindingBusinessTitle(finding)).not.toMatch(/Lighthouse|PageSpeed|LCP/i)
  })

  it('explains common Lighthouse findings without losing their technical names', () => {
    const finding = {
      audit_id: 'largest-contentful-paint',
      title: 'Largest Contentful Paint element',
      category: 'performance',
      evidence: 'Largest Contentful Paint was 4.2 s',
    }

    expect(auditFindingTitle(finding)).toContain('Largest Contentful Paint')
    expect(auditFindingTitle(finding)).toContain('LCP')
    expect(auditFindingWhy(finding)).toContain('main content')
    expect(auditFindingRecommendation(finding)).toMatch(/^We recommend/)
    expect(finding.evidence).toBe('Largest Contentful Paint was 4.2 s')
  })

  it('keeps recommendations for unknown findings tied to the measured result', () => {
    expect(auditFindingRecommendation({
      title: 'Example Lighthouse result',
      recommended_fix: 'Review the affected setting.',
    })).toBe('We recommend reviewing “Example Lighthouse result”. A practical next step is: Review the affected setting.')
  })

  it('uses the Arlotech team voice and simplifies the requested jargon', () => {
    expect(clientFriendlyAuditText(
      'I found an issue. Optimize image delivery and reduce unused JavaScript to improve crawlability.',
    )).toBe(
      'We found an issue. Make website images load faster and remove unnecessary website code that may slow down loading to make it easier for search engines to explore your website.',
    )
  })
})
