import { describe, expect, it } from 'vitest'
import { formatSenderAddress, hasActionableWebsiteFinding, resolveReplyToAddress } from './eligibility'

describe('website outreach eligibility', () => {
  it('uses the configured reply address and falls back to the sender mailbox', () => {
    expect(resolveReplyToAddress('replies@example.com', 'Arlotech <outreach@example.com>'))
      .toBe('replies@example.com')
    expect(resolveReplyToAddress(null, 'Arlotech <outreach@example.com>'))
      .toBe('outreach@example.com')
    expect(resolveReplyToAddress('not-an-email', 'Arlotech <outreach@example.com>')).toBeNull()
  })

  describe('formatSenderAddress', () => {
    it('uses the profile name with the configured mailbox', () => {
      expect(formatSenderAddress('Chris Example', 'Arlotech <outreach@example.com>'))
        .toBe('"Chris Example" <outreach@example.com>')
    })

    it('preserves the configured sender when no profile name is available', () => {
      expect(formatSenderAddress('', 'Arlotech <outreach@example.com>'))
        .toBe('Arlotech <outreach@example.com>')
    })

    it('quotes sender names safely and rejects an invalid configured mailbox', () => {
      expect(formatSenderAddress('Chris "Ace"', 'outreach@example.com'))
        .toBe('"Chris \\"Ace\\"" <outreach@example.com>')
      expect(() => formatSenderAddress('Chris', 'invalid')).toThrow('configured sender email address is invalid')
    })
  })

  it('withholds sending when an audit has no confirmed findings', () => {
    expect(hasActionableWebsiteFinding({ findings: [], analysis_details: {} })).toBe(false)
    expect(hasActionableWebsiteFinding({
      findings: [{ title: 'Network dependency tree', classification: 'diagnostic', evidence: 'Diagnostic only.' }],
    })).toBe(false)
  })

  it('allows a verified finding with evidence', () => {
    expect(hasActionableWebsiteFinding({
      findings: [{
        source: 'html_inspection',
        classification: 'verified_issue',
        title: 'Text may be hard to read',
        evidence: 'The inspected text is difficult to read.',
      }],
    })).toBe(true)
  })

  it('does not treat a good measured result as a reason to contact a prospect', () => {
    expect(hasActionableWebsiteFinding({
      findings: [{
        id: 'largest-contentful-paint',
        source: 'lighthouse',
        classification: 'verified_issue',
        title: 'Largest Contentful Paint',
        evidence: '0.7 seconds',
      }],
    })).toBe(false)
  })

  it('allows a useful evidence-backed improvement opportunity', () => {
    expect(hasActionableWebsiteFinding({
      findings: [],
      analysis_details: {
        optimization_opportunities: [{
          classification: 'optimization_opportunity',
          title: 'Images may take too long to load',
          evidence: 'The audit identified an image-loading opportunity.',
        }],
      },
    })).toBe(true)
  })

  it('ignores an optimization item without evidence', () => {
    expect(hasActionableWebsiteFinding({
      findings: [],
      analysis_details: {
        optimization_opportunities: [{
          classification: 'optimization_opportunity',
          title: 'Images may take too long to load',
        }],
      },
    })).toBe(false)
  })
})
