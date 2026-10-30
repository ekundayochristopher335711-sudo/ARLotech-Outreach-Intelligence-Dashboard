import { supabase, getCurrentUserId } from '@/lib/supabase'
import { analyzeWebsite, extractContent, type ExtractedContent } from '@/lib/websiteAnalysis'
import { createOutreachPreview, getOutreachSuitability } from '@/lib/outreachEmail'
import { type Prospect } from '@/types'

export interface EnrichmentResult {
  prospect_id: string
  business_name: string
  website: string | null
  contact_email: string | null
  contact_phone: string | null
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
    analysis_provider: 'pagespeed+gemini',
    analyzed_at: new Date().toISOString(),
    findings: [],
    positive_observations: [],
  })
  if (error) throw error
}

export async function enrichProspectContacts(
  prospect: Prospect,
  extractedContent?: ExtractedContent,
): Promise<{ email: string | null; phone: string | null }> {
  let email = prospect.email
  let phone = prospect.phone
  if (!prospect.website) return { email, phone }
  const content = extractedContent ?? await extractContent(prospect.website)
  const contacts = content.contacts
  const emails = contacts?.emails ?? []
  const phones = contacts?.phones ?? []
  if (!email && emails.length) email = emails[0]
  if (!phone && phones.length) phone = phones[0]
  if (email !== prospect.email || phone !== prospect.phone) {
    const userId = await getCurrentUserId()
    const { error } = await supabase
      .from('prospects')
      .update({ email, phone })
      .eq('id', prospect.id)
      .eq('user_id', userId)
    if (error) throw error
  }
  return { email, phone }
}

export async function enrichAndAnalyzeProspect(prospect: Prospect): Promise<EnrichmentResult> {
  const result: EnrichmentResult = {
    prospect_id: prospect.id,
    business_name: prospect.business_name,
    website: prospect.website,
    contact_email: prospect.email,
    contact_phone: prospect.phone,
    analysis_score: null,
    draft_created: false,
  }

  if (!prospect.website) {
    result.error = 'No website to analyze'
    return result
  }

  try {
    const analysis = await analyzeWebsite(prospect.website, prospect.id, true)
    result.analysis_completed = true
    result.analysis_score = analysis.overallScore
    if (analysis.contentExtractionError) {
      result.error = `Contact lookup failed: ${analysis.contentExtractionError}; Website content extraction failed: ${analysis.contentExtractionError}`
    } else {
      try {
        const contacts = await enrichProspectContacts(prospect, analysis.content)
        result.contact_email = contacts.email
        result.contact_phone = contacts.phone
      } catch (err) {
        result.error = `Contact lookup failed: ${err instanceof Error ? err.message : 'Unknown error'}`
      }
    }

    if (analysis.contentExtractionError) {
      result.draft_reason = 'Draft withheld because website extraction failed and the audit is incomplete.'
    } else {
      const suitability = getOutreachSuitability(analysis.record)
      if (suitability === 'No Opportunity') {
        result.draft_reason = 'Draft withheld because no meaningful improvement opportunity was verified.'
      } else if (suitability === 'Incomplete Audit') {
        result.draft_reason = 'Draft withheld because the audit is incomplete.'
      } else {
        const draft = createOutreachPreview(prospect, analysis.record)
        const userId = await getCurrentUserId()
        const { error: draftError } = await supabase.from('email_drafts').insert({
          user_id: userId,
          prospect_id: prospect.id,
          subject: draft.subject,
          body: draft.body,
          template_type: 'outreach',
          generation_source: 'audit',
          status: 'draft',
        })
        if (draftError) throw draftError
        result.draft_created = true
      }
    }
  } catch (err) {
    const analysisError = err instanceof Error ? err.message : 'Enrichment failed'
    result.error = result.error ? `${result.error}; ${analysisError}` : analysisError
  }

  return result
}
