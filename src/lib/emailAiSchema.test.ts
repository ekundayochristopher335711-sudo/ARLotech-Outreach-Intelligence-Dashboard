import { describe, expect, it } from 'vitest'
import { AI_EMAIL_APPROACHES, isAiEmailResponse } from './emailAiSchema'

const validResponse = {
  analysis_id: 'analysis-id',
  email_type: 'audit-based',
  prospect: {
    business_name: 'Sample business',
    website: 'https://example.com',
    industry: 'Retail',
  },
  sender: {
    name: 'Account owner',
    business: 'ARLOTECH Digital Solutions',
    email: 'owner@example.com',
  },
  subject_suggestions: ['A note about your homepage', 'An idea for your services page', 'Website feedback'],
  body: 'Hello,\n\nI noticed an item in the saved website audit. Would a brief conversation be useful?',
  referenced_observation_ids: ['finding-1'],
  referenced_observations: ['Main action: The audit recorded an unclear contact link.'],
  referenced_context_page_ids: ['context-page-1'],
  referenced_context_pages: [{
    id: 'context-page-1',
    source_label: 'Services',
    source_url: 'https://example.com/services',
    title: 'Services',
  }],
  recommended_call_to_action: 'Would a brief conversation be useful?',
  personalization_confidence: 'high',
}

describe('AI email response contract', () => {
  it('exposes all six supported approaches', () => {
    expect(AI_EMAIL_APPROACHES).toEqual([
      'professional',
      'friendly',
      'audit_based',
      'value_first',
      'short',
      'website_redesign',
    ])
  })

  it('accepts a complete response with three subject suggestions and matching evidence', () => {
    expect(isAiEmailResponse(validResponse)).toBe(true)
    expect(isAiEmailResponse({ ...validResponse, assistant_message: 'The draft is now more concise.' })).toBe(true)
  })

  it('rejects missing subjects, mismatched evidence, and oversized output', () => {
    expect(isAiEmailResponse({ ...validResponse, subject_suggestions: ['Only one'] })).toBe(false)
    expect(isAiEmailResponse({ ...validResponse, referenced_observations: [] })).toBe(false)
    expect(isAiEmailResponse({ ...validResponse, body: 'x'.repeat(12_001) })).toBe(false)
    expect(isAiEmailResponse({ ...validResponse, referenced_context_pages: [] })).toBe(false)
    expect(isAiEmailResponse({
      ...validResponse,
      referenced_context_pages: [{ ...validResponse.referenced_context_pages[0], source_url: 'javascript:alert(1)' }],
    })).toBe(false)
    expect(isAiEmailResponse({ ...validResponse, assistant_message: 'x'.repeat(301) })).toBe(false)
  })
})
