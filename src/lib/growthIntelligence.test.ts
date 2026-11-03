import { describe, expect, it } from 'vitest'
import { assessEmailQuality, recommendNextOutreachAction, scoreProspectOpportunity } from './growthIntelligence'

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
  it('recognizes pricing intent in an inbound reply', () => {
    expect(recommendNextOutreachAction({ status: 'Replied', latestInbound: 'How much does it cost?' }).action).toContain('pricing')
  })
  it('blocks an email with a suppressed recipient', () => {
    const result = assessEmailQuality({ subject: 'Hello', body: 'A reasonable message?', recipient: 'a@example.com', doNotContact: true })
    expect(result.readyForReview).toBe(false)
    expect(result.errors).toContain('Recipient not suppressed')
  })
})
