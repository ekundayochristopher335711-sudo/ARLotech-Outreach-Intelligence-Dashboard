import { beforeEach, describe, expect, it, vi } from 'vitest'

const { analyzeWebsiteMock, invokeMock } = vi.hoisted(() => ({
  analyzeWebsiteMock: vi.fn(),
  invokeMock: vi.fn(),
}))

vi.mock('@/lib/websiteAnalysis', () => ({
  analyzeWebsite: analyzeWebsiteMock,
  extractContent: vi.fn(),
}))

vi.mock('@/lib/supabase', () => ({
  supabase: { functions: { invoke: invokeMock } },
  getCurrentUserId: vi.fn(),
}))

import { enrichAndAnalyzeProspect } from './leadEnrichment'
import { type Prospect } from '@/types'

describe('enrichAndAnalyzeProspect', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    analyzeWebsiteMock.mockResolvedValue({
      overallScore: 82,
      record: { findings: [], positive_observations: [] },
      content: { contacts: { emails: [], phones: [] } },
      contentExtractionError: 'site request failed',
    })
    invokeMock.mockResolvedValue({ data: {} })
  })

  it('completes analysis when content extraction fails without repeating the failed fetch', async () => {
    const prospect: Prospect = {
      id: 'prospect-1',
      user_id: 'user-1',
      business_name: 'Example Business',
      business_name_verified: false,
      contact_name: '',
      email: null,
      website: 'https://example.com',
      normalized_domain: 'example.com',
      business_category: null,
      city: null,
      country: null,
      phone: null,
      linkedin_url: null,
      notes: null,
      source: 'manual',
      status: 'New',
      do_not_contact: false,
      last_contacted_at: null,
      created_at: '',
      updated_at: '',
    }

    const result = await enrichAndAnalyzeProspect(prospect)

    expect(analyzeWebsiteMock).toHaveBeenCalledTimes(1)
    expect(analyzeWebsiteMock).toHaveBeenCalledWith(prospect.website, prospect.id, true)
    expect(result.analysis_score).toBe(82)
    expect(result.analysis_completed).toBe(true)
    expect(result.error).toContain('Contact lookup failed: site request failed')
  })
})
