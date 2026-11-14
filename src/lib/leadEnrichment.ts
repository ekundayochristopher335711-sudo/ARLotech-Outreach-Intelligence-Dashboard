import { supabase, getCurrentUserId } from '@/lib/supabase'
import {
  analyzeWebsite,
  extractContent,
  refreshProspectContactsFromWebsite,
  type ExtractedContent,
} from '@/lib/websiteAnalysis'
import { getErrorMessage } from '@/lib/utils'
import { type Prospect } from '@/types'

export interface EnrichmentResult {
  prospect_id: string
  business_name: string
  website: string | null
  contact_email: string | null
  contact_phone: string | null
  city?: string | null
  country?: string | null
  detected_business_category?: string
  analysis_score: number | null
  analysis_completed?: boolean
  draft_created: boolean
  draft_reason?: string
  error?: string
}

export async function recordFailedWebsiteAnalysis(prospect: Prospect, errorMessage: string) {
  const userId = await getCurrentUserId()
  const { error } = await supabase.from('website_analyses').insert({
    user_id: userId,
    prospect_id: prospect.id,
    website_url: prospect.website ?? '',
    analysis_status: 'failed',
    error_message: errorMessage,
    analysis_provider: 'pagespeed',
    analyzed_at: new Date().toISOString(),
    findings: [],
    positive_observations: [],
  })
  if (error) throw error
}

export async function enrichProspectContacts(
  prospect: Prospect,
  extractedContent?: Pick<ExtractedContent, 'contacts' | 'location'>,
): Promise<{ email: string | null; phone: string | null; city: string | null; country: string | null }> {
  let email = prospect.email
  let phone = prospect.phone
  let city = prospect.city
  let country = prospect.country
  if (!prospect.website) return { email, phone, city, country }
  const content = extractedContent ?? await extractContent(prospect.website)
  const contacts = content.contacts
  const emails = contacts?.emails ?? []
  const phones = contacts?.phones ?? []
  const extractedEmail = emails.find((value) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim()))
  const extractedPhone = phones.find((value) => {
    const digits = value.replace(/\D/g, '')
    return digits.length >= 7 && digits.length <= 15
  })
  if (extractedEmail) email = extractedEmail.trim().toLowerCase()
  if (extractedPhone) phone = extractedPhone.trim()
  if (!city?.trim() && content.location?.city.trim()) city = content.location.city.trim()
  if (!country?.trim() && content.location?.country.trim()) country = content.location.country.trim()
  if (
    email !== prospect.email ||
    phone !== prospect.phone ||
    city !== prospect.city ||
    country !== prospect.country
  ) {
    const userId = await getCurrentUserId()
    await refreshProspectContactsFromWebsite(prospect.id, userId, contacts, content.location)
  }
  return { email, phone, city, country }
}

export async function enrichAndAnalyzeProspect(
  prospect: Prospect,
  {
    includeVisualReview = true,
  }: { includeVisualReview?: boolean } = {},
): Promise<EnrichmentResult> {
  const result: EnrichmentResult = {
    prospect_id: prospect.id,
    business_name: prospect.business_name,
    website: prospect.website,
    contact_email: prospect.email,
    contact_phone: prospect.phone,
    city: prospect.city,
    country: prospect.country,
    analysis_score: null,
    draft_created: false,
  }

  if (!prospect.website) {
    result.error = 'No website to analyze'
    return result
  }

  try {
    const analysis = await analyzeWebsite(prospect.website, prospect.id, includeVisualReview)
    result.analysis_completed = true
    result.analysis_score = analysis.overallScore
    result.detected_business_category = analysis.detectedBusinessCategory
    if (analysis.categoryUpdateError) {
      result.error = `Category update failed: ${analysis.categoryUpdateError}`
    }
    if (analysis.contentExtractionError) {
      result.error = [result.error, `Website content extraction failed: ${analysis.contentExtractionError}`].filter(Boolean).join('; ')
    } else {
      try {
        const contacts = await enrichProspectContacts(prospect, analysis.content)
        result.contact_email = contacts.email
        result.contact_phone = contacts.phone
        result.city = contacts.city
        result.country = contacts.country
      } catch (err) {
        result.error = [result.error, `Contact lookup failed: ${getErrorMessage(err, 'Could not save contact details.')}`]
          .filter(Boolean)
          .join('; ')
      }
    }

    result.draft_reason = 'Drafts are only saved manually from Email Drafts.'
  } catch (err) {
    const analysisError = err instanceof Error ? err.message : 'Enrichment failed'
    result.error = result.error ? `${result.error}; ${analysisError}` : analysisError
  }

  return result
}
