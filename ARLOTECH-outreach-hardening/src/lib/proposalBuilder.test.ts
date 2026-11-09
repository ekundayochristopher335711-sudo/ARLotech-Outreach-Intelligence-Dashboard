import { describe, expect, it } from 'vitest'
import { validateProposalDraft, type ProposalDraftInput } from './proposalBuilder'

const validDraft: ProposalDraftInput = {
  prospectName: 'Example Business',
  senderBusinessName: 'Arlotech',
  senderName: 'Alex Example',
  senderEmail: 'alex@example.com',
  senderAddress: '',
  senderWebsite: '',
  service: 'Website improvements',
  currency: 'GBP',
  price: '1250.00',
  timeline: 'Three weeks after kickoff',
  scope: 'Responsive website updates',
  milestones: 'Design, implementation, review',
  paymentTerms: '50% deposit, balance on completion',
  exclusions: 'Hosting',
  assumptions: 'Client provides copy',
  validUntil: '2026-12-01',
  acceptance: 'Acceptance requires written confirmation.',
  detailsConfirmed: true,
}

describe('proposal draft validation', () => {
  it('accepts a complete, explicitly confirmed proposal', () => {
    expect(validateProposalDraft(validDraft, new Date('2026-11-02T12:00:00Z')).valid).toBe(true)
  })

  it('requires explicit operator confirmation and valid commercial fields', () => {
    const result = validateProposalDraft({ ...validDraft, price: '£1,250', currency: 'Pounds', detailsConfirmed: false })
    expect(result.valid).toBe(false)
    expect(result.errors).toContain('Price must be a positive numeric amount without a currency symbol.')
    expect(result.errors).toContain('Currency must be a three-letter ISO code such as GBP, USD, or NGN.')
    expect(result.errors).toContain('Confirm that every proposal detail has been reviewed and approved.')
  })

  it('rejects expired and malformed validity dates', () => {
    expect(validateProposalDraft({ ...validDraft, validUntil: '2026-11-01' }, new Date('2026-11-02T12:00:00Z')).valid).toBe(false)
    expect(validateProposalDraft({ ...validDraft, validUntil: 'not-a-date' }, new Date('2026-11-02T12:00:00Z')).valid).toBe(false)
  })
})