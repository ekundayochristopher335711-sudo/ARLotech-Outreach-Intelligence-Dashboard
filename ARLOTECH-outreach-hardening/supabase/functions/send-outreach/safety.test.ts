import { describe, expect, it } from 'vitest'
import { duplicateRecipients, isCampaignSendableStatus, isTerminalProspectStatus } from './safety'

describe('server-side outreach status suppression', () => {
  it.each(['Do Not Contact', 'Not Interested', 'Won', 'Lost', 'Unsubscribed', 'Opted Out', 'Hard Bounced', 'complained'])('%s blocks outreach', (status) => {
    expect(isTerminalProspectStatus(status)).toBe(true)
  })

  it.each(['New', 'Contacted', 'Interested', 'Meeting Booked'])('%s remains eligible for operator review', (status) => {
    expect(isTerminalProspectStatus(status)).toBe(false)
  })

  it('detects duplicate recipient addresses case-insensitively', () => {
    expect(duplicateRecipients([' User@example.com ', 'user@example.com', 'other@example.com']))
      .toEqual(['user@example.com'])
  })

  it('only treats explicitly active campaigns as sendable', () => {
    expect(isCampaignSendableStatus('Active')).toBe(true)
    expect(isCampaignSendableStatus('Paused')).toBe(false)
    expect(isCampaignSendableStatus('Completed')).toBe(false)
    expect(isCampaignSendableStatus(null)).toBe(false)
  })
})