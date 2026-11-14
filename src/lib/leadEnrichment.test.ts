import { beforeEach, describe, expect, it, vi } from 'vitest'

const { analyzeWebsiteMock, refreshProspectContactsMock, invokeMock, fromMock, updateMock, eqMock } = vi.hoisted(() => ({
  analyzeWebsiteMock: vi.fn(),
  refreshProspectContactsMock: vi.fn(),
  invokeMock: vi.fn(),
  fromMock: vi.fn(),
  updateMock: vi.fn(),
  eqMock: vi.fn(),
}))

vi.mock('@/lib/websiteAnalysis', () => ({
  analyzeWebsite: analyzeWebsiteMock,
  extractContent: vi.fn(),
  refreshProspectContactsFromWebsite: refreshProspectContactsMock,
}))

vi.mock('@/lib/supabase', () => ({
  supabase: { functions: { invoke: invokeMock }, from: fromMock },
  getCurrentUserId: vi.fn().mockResolvedValue('user-1'),
}))

import { enrichAndAnalyzeProspect, enrichProspectContacts } from './leadEnrichment'
import { type Prospect } from '@/types'

describe('enrichAndAnalyzeProspect', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    refreshProspectContactsMock.mockResolvedValue(undefined)
    fromMock.mockReturnValue({ update: updateMock })
    updateMock.mockReturnValue({ eq: eqMock })
    eqMock.mockReturnValue({ eq: eqMock })
    analyzeWebsiteMock.mockResolvedValue({
      overallScore: 82,
      record: { findings: [], positive_observations: [] },
      content: { contacts: { emails: [], phones: [] } },
      contentExtractionError: 'site request failed',
    })
    invokeMock.mockResolvedValue({ data: {} })
  })

  it('overwrites saved email and phone with contact details found during re-analysis', async () => {
    const prospect: Prospect = {
      id: 'prospect-1',
      user_id: 'user-1',
      business_name: 'Example Business',
      business_name_verified: false,
      contact_name: '',
      email: 'old@example.com',
      website: 'https://example.com',
      normalized_domain: 'example.com',
      business_category: null,
      city: null,
      country: null,
      phone: '+1 555 0100',
      linkedin_url: null,
      notes: null,
      source: 'manual',
      status: 'New',
      do_not_contact: false,
      last_contacted_at: null,
      created_at: '',
      updated_at: '',
    }

    await expect(enrichProspectContacts(prospect, {
      contacts: { emails: ['not an email', 'new@example.com'], phones: ['+1 555 0199'] },
      location: { city: 'Lagos', country: 'Nigeria' },
    })).resolves.toEqual({
      email: 'new@example.com',
      phone: '+1 555 0199',
      city: 'Lagos',
      country: 'Nigeria',
    })
    expect(refreshProspectContactsMock).toHaveBeenCalledWith(
      'prospect-1',
      'user-1',
      { emails: ['not an email', 'new@example.com'], phones: ['+1 555 0199'] },
      { city: 'Lagos', country: 'Nigeria' },
    )
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
    expect(result.error).toContain('Website content extraction failed: site request failed')
  })

  it('never saves an outreach draft automatically during website analysis', async () => {
    const prospect: Prospect = {
      id: 'prospect-1',
      user_id: 'user-1',
      business_name: 'Example Business',
      business_name_verified: false,
      contact_name: '',
      email: 'contact@example.com',
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
    analyzeWebsiteMock.mockResolvedValue({
      overallScore: 82,
      record: { findings: [], positive_observations: [] },
      content: { contacts: { emails: [], phones: [] } },
      contentExtractionError: null,
    })

    const result = await enrichAndAnalyzeProspect(prospect)

    expect(analyzeWebsiteMock).toHaveBeenCalledWith(prospect.website, prospect.id, true)
    expect(result.analysis_completed).toBe(true)
    expect(result.draft_created).toBe(false)
    expect(result.draft_reason).toBe('Drafts are only saved manually from Email Drafts.')
    expect(fromMock).not.toHaveBeenCalled()
  })

  it('can skip the optional visual review during bulk re-analysis', async () => {
    const prospect: Prospect = {
      id: 'prospect-1',
      user_id: 'user-1',
      business_name: 'Example Business',
      business_name_verified: false,
      contact_name: '',
      email: 'contact@example.com',
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
    analyzeWebsiteMock.mockResolvedValue({
      overallScore: 82,
      record: { findings: [], positive_observations: [] },
      content: { contacts: { emails: [], phones: [] } },
      contentExtractionError: null,
    })

    await enrichAndAnalyzeProspect(prospect, { includeVisualReview: false })

    expect(analyzeWebsiteMock).toHaveBeenCalledWith(prospect.website, prospect.id, false)
  })
})
