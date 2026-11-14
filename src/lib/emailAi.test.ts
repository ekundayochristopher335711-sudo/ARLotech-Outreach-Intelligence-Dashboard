import { beforeEach, describe, expect, it, vi } from 'vitest'
import { generateAiOutreachDraft } from './emailAi'

const mockInvoke = vi.hoisted(() => vi.fn())

vi.mock('@/lib/supabase', () => ({
  supabase: { functions: { invoke: mockInvoke } },
}))

describe('generateAiOutreachDraft', () => {
  beforeEach(() => {
    mockInvoke.mockResolvedValue({
      data: {
        analysis_id: null,
        email_type: 'professional',
        prospect: { business_name: '', website: 'https://example.com', industry: '' },
        sender: { name: 'Form Sender', business: 'Form Business', email: 'sender@example.com' },
        subject_suggestions: ['A website idea', 'A quick question', 'An improvement opportunity'],
        body: 'Hello, Would a brief conversation be useful?',
        referenced_observation_ids: [],
        referenced_observations: [],
        referenced_context_page_ids: [],
        referenced_context_pages: [],
        recommended_call_to_action: 'Would a brief conversation be useful?',
        personalization_confidence: 'low',
      },
      error: null,
    })
  })

  it('sends the entered context and sender identity with generation requests', async () => {
    await generateAiOutreachDraft({
      prospectId: 'prospect-id',
      approach: 'professional',
      tone: 'professional',
      length: 'standard',
      senderContext: 'Mention our accessibility review offer.',
      senderProfile: {
        name: 'Form Sender',
        business: 'Form Business',
        email: 'sender@example.com',
      },
    })

    expect(mockInvoke).toHaveBeenCalledWith('generate-outreach-draft', {
      body: expect.objectContaining({
        sender_context: 'Mention our accessibility review offer.',
        sender_profile: {
          name: 'Form Sender',
          business: 'Form Business',
          email: 'sender@example.com',
        },
      }),
    })
  })
})
