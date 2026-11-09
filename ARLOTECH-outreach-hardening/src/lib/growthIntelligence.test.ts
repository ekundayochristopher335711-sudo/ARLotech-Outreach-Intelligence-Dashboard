import { describe, expect, it } from 'vitest'
import { assessEmailQuality, recommendCampaignPause, recommendNextOutreachAction, scoreProspectOpportunity } from './growthIntelligence'

describe('growth intelligence', () => {
  it('suppresses prospects that must not be contacted', () => {
    expect(scoreProspectOpportunity({ business_name: 'A', status: 'Won' }).eligible).toBe(false)
  })
  it('prioritizes a no-website prospect with a contact email', () => {
    const result = scoreProspectOpportunity({ business_name: 'A', status: 'New', email: 'a@example.com' })
    expect(result.score).toBeGreaterThan(60)
    expect(result.recommendation).toContain('website')
  })
  it('stops follow-up after a meeting is booked', () => {
    expect(recommendNextOutreachAction({ status: 'Meeting Booked' }).safeToDraft).toBe(false)
  })
  it('stops follow-up on natural-language opt-outs and negative replies', () => {
    for (const latestInbound of ['Please stop emailing me.', 'I am not interested, thanks.', 'Please remove me from this list.']) {
      expect(recommendNextOutreachAction({ status: 'Replied', latestInbound }).action).toBe('Stop outreach')
    }
  })
  it('pauses recommendations after provider bounce, complaint, or suppression signals', () => {
    expect(recommendNextOutreachAction({ status: 'Contacted', bounced: true }).safeToDraft).toBe(false)
    expect(recommendNextOutreachAction({ status: 'Contacted', complained: true }).safeToDraft).toBe(false)
    expect(recommendNextOutreachAction({ status: 'Contacted', suppressed: true }).action).toBe('Pause and investigate')
  })
  it('recognizes pricing intent in an inbound reply', () => {
    expect(recommendNextOutreachAction({ status: 'Replied', latestInbound: 'How much does it cost?' }).action).toContain('pricing')
  })
  it('blocks an email with a suppressed recipient', () => {
    const result = assessEmailQuality({ subject: 'Hello', body: 'A reasonable message?', recipient: 'a@example.com', doNotContact: true })
    expect(result.readyForReview).toBe(false)
    expect(result.errors).toContain('Recipient not suppressed')
  })
  it('requires a minimum sample and counts each incident message once for campaign pause recommendations', () => {
    expect(recommendCampaignPause({
      sentMessageIds: ['a', 'b', 'c'],
      bouncedMessageIds: ['a'],
      complainedMessageIds: [],
      thresholdPercent: 5,
    })).toBeNull()
    expect(recommendCampaignPause({
      sentMessageIds: Array.from({ length: 10 }, (_, index) => String(index)),
      bouncedMessageIds: ['0'],
      complainedMessageIds: ['0', '1'],
      thresholdPercent: 20,
    })).toEqual({ sends: 10, incidents: 2, rate: 20 })
    expect(recommendCampaignPause({
      sentMessageIds: Array.from({ length: 10 }, (_, index) => String(index)),
      bouncedMessageIds: ['outside-batch'],
      complainedMessageIds: [],
      thresholdPercent: 5,
    })).toBeNull()
  })
})
