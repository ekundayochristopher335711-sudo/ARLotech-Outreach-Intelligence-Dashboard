import { useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Check, Copy, Mail, Paperclip, Pencil, Plus, Send, Sparkles, Trash2, X } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { Textarea } from '@/components/ui/Textarea'
import { getCurrentUserId, supabase } from '@/lib/supabase'
import { createInlineEmailLogo } from '@/lib/brandAssets'
import { createWebsiteAnalysisPdfBase64 } from '@/lib/exportPdf'
import {
  createOutreachPreview,
  getOutreachSuitability,
  hasMatchingWebsiteAnalysis,
  type OutreachPreview,
} from '@/lib/outreachEmail'
import {
  generateFollowUpDraft,
  generateProfessionalEmailDraft,
  DEFAULT_OUTREACH_SIGNATURE,
  OUTREACH_STRATEGIES,
  rewriteProfessionalEmail,
  validateProfessionalEmailDraft,
  type FollowUpStage,
  type GeneratedEmailDraft,
  type OutreachLength,
  type OutreachSignature,
  type OutreachStrategy,
  type OutreachTone,
  type RewriteAction,
} from '@/lib/emailDraftGenerator'
import type { Campaign, EmailDraft, Prospect, WebsiteAnalysis } from '@/types'
import { assessEmailQuality } from '@/lib/growthIntelligence'
import { containsEmailJargon, containsExternalAuditReference } from '@/lib/emailCopy'
import { mapWithConcurrency } from '@/lib/mapWithConcurrency'
import {
  AI_EMAIL_APPROACHES,
  generateAiOutreachDraft,
  regenerateAiSubjectSuggestions,
  rewriteAiOutreachDraft,
  type AiEmailApproach,
  type AiEmailContextReference,
  type AiEmailRewriteAction,
} from '@/lib/emailAi'

const MAX_OUTREACH_BATCH_SIZE = 50
const MAX_SEND_REQUEST_SIZE = 10
const MAX_AI_GENERATION_BATCH_SIZE = 10
const MAX_ATTACHMENT_BASE64_LENGTH = 700_000
const MAX_BATCH_ATTACHMENT_LENGTH = 4_500_000
const SIGNATURE_STORAGE_KEY = 'arlotech-email-signature'

const strategyLabels: Record<OutreachStrategy, string> = {
  general_review: 'General website review',
  technical_improvement: 'Technical improvement',
  website_redesign: 'Website redesign',
  business_growth: 'Business growth',
  personal_consultancy: 'Personal consultancy',
  cold_outreach: 'Cold introduction',
  seo_performance: 'SEO & performance improvement',
  interested_response: 'Reply to an interested prospect',
  pricing_response: 'Respond to a pricing question',
  meeting_request: 'Arrange a discovery call',
}

const strategyDescriptions: Record<OutreachStrategy, string> = {
  general_review: 'A balanced first email based on the prospect record and any saved website review.',
  technical_improvement: 'Lead with one verified technical finding and explain why it matters.',
  website_redesign: 'Use recorded visual observations; do not recommend a redesign without supporting evidence.',
  business_growth: 'Connect website usability to the customer journey without promising sales or lead increases.',
  personal_consultancy: 'A softer, discovery-led message focused on understanding the business first.',
  cold_outreach: 'A brief introduction for a business you have not contacted before.',
  seo_performance: 'Discuss measured search and performance results, or offer a review when no audit exists.',
  interested_response: 'Reply after a prospect has expressed interest. Confirm the actual conversation before sending.',
  pricing_response: 'Answer a pricing question without inventing a price. Add your confirmed offer details below.',
  meeting_request: 'Turn an interested conversation into a short discovery call without inventing availability.',
}

function readSignature(): OutreachSignature {
  try {
    const saved = localStorage.getItem(SIGNATURE_STORAGE_KEY)
    if (!saved) return { ...DEFAULT_OUTREACH_SIGNATURE }
    const parsed = JSON.parse(saved) as Partial<OutreachSignature>
    return {
      ...DEFAULT_OUTREACH_SIGNATURE,
      ...parsed,
      businessName: parsed.businessName || DEFAULT_OUTREACH_SIGNATURE.businessName,
      senderName: parsed.senderName || DEFAULT_OUTREACH_SIGNATURE.senderName,
      jobTitle: parsed.jobTitle || DEFAULT_OUTREACH_SIGNATURE.jobTitle,
      website: parsed.website || DEFAULT_OUTREACH_SIGNATURE.website,
      email: parsed.email || DEFAULT_OUTREACH_SIGNATURE.email,
      phone: parsed.phone || DEFAULT_OUTREACH_SIGNATURE.phone,
      socialLinks: parsed.socialLinks || '',
      location: parsed.location || DEFAULT_OUTREACH_SIGNATURE.location,
    }
  } catch {
    return { ...DEFAULT_OUTREACH_SIGNATURE }
  }
}

type OutreachProspect = Pick<
  Prospect,
  'id' | 'business_name' | 'business_name_verified' | 'contact_name' | 'email' | 'website' | 'business_category' | 'do_not_contact'
  | 'city'
>

interface OutreachSendResult {
  prospect_id: string | null
  recipient_email?: string
  business_name: string
  status: 'sent' | 'skipped' | 'failed'
  error?: string
  tracking_error?: string
}

interface SendOutreachResponse {
  results: OutreachSendResult[]
}

interface SendOutreachMutationResult extends SendOutreachResponse {
  omittedReports: string[]
}

interface AiDraftChatMessage {
  role: 'user' | 'assistant'
  content: string
}

interface GeneratedOutreachPreview extends OutreachPreview {
  generatedDraft: GeneratedEmailDraft
  aiApproach?: AiEmailApproach
  aiConfidence?: 'high' | 'medium' | 'low'
  aiRecommendedCallToAction?: string
  aiSenderName?: string
  aiSenderBusiness?: string
  aiSenderEmail?: string
  aiWebsiteContext?: AiEmailContextReference[]
  aiChatMessages?: AiDraftChatMessage[]
  savedDraftId?: string
}

interface SentOutreachContext {
  id: string
  prospect_id: string | null
  recipient_email: string | null
  subject: string
  body: string
  created_at: string | null
}

interface ManualSendResponse {
  result: OutreachSendResult
}

function isManualSendResponse(data: unknown): data is ManualSendResponse {
  if (!data || typeof data !== 'object' || !('result' in data)) return false
  const result = data.result
  return (
    !!result &&
    typeof result === 'object' &&
    'prospect_id' in result &&
    (typeof result.prospect_id === 'string' || result.prospect_id === null) &&
    'business_name' in result &&
    typeof result.business_name === 'string' &&
    'recipient_email' in result &&
    typeof result.recipient_email === 'string' &&
    'status' in result &&
    ['sent', 'skipped', 'failed'].includes(String(result.status))
  )
}

async function createAuditPdfAttachment(
  analysis: WebsiteAnalysis,
  prospect: OutreachProspect,
) {
  return createWebsiteAnalysisPdfBase64(analysis, {
    businessName: prospect.business_name,
    verified: prospect.business_name_verified,
    contactName: prospect.contact_name,
    email: prospect.email,
  })
}

function isSendOutreachResponse(data: unknown): data is SendOutreachResponse {
  if (!data || typeof data !== 'object' || !('results' in data) || !Array.isArray(data.results)) return false
  return data.results.every(
    (result: unknown) =>
      !!result &&
      typeof result === 'object' &&
      'prospect_id' in result &&
      (typeof result.prospect_id === 'string' || result.prospect_id === null) &&
      'business_name' in result &&
      typeof result.business_name === 'string' &&
      'status' in result &&
      ['sent', 'skipped', 'failed'].includes(String(result.status)),
  )
}

async function getOutreachFunctionError(error: unknown) {
  const fallbackMessage = error instanceof Error ? error.message : 'Could not send outreach batch.'
  if (!error || typeof error !== 'object' || !('context' in error) || !(error.context instanceof Response)) {
    return fallbackMessage
  }
  const responseBody = await error.context.clone().json().catch(() => null)
  return responseBody && typeof responseBody === 'object' && 'error' in responseBody && typeof responseBody.error === 'string'
    ? responseBody.error
    : fallbackMessage
}

function validateAiPreview(
  draft: GeneratedEmailDraft,
  prospect: OutreachProspect,
  includeReport = false,
) {
  const body = draft.body.trim()
  const errors: string[] = []
  if (draft.subjectSuggestions.length !== 3 || draft.subjectSuggestions.some((item) => !item.trim() || item.length > 200)) {
    errors.push('The AI did not return three valid subject suggestions.')
  }
  if (!body) errors.push('The AI returned an empty email.')
  if ((body.match(/\?/g) ?? []).length !== 1) errors.push('The email must end with one clear, low-pressure question.')
  if (
    /guarantee(?:d|s)?|will\s+(?:double|triple|increase)\s+(?:your\s+)?(?:revenue|sales|enquiries|leads)/i.test(body)
  ) {
    errors.push('The email makes an unsupported business-results promise.')
  }
  if (containsEmailJargon(body) || containsExternalAuditReference(body) || /https?:\/\/|www\./i.test(body)) {
    errors.push('Remove technical jargon, external audit references, or unsupported links from the email.')
  }
  const mentionsAttachment = /your website review is attached|the attached pdf|pdf.{0,30}attached|we[’']ve attached|i[’']ve attached|we have attached|please see the attached/i.test(body)
  if (mentionsAttachment && !includeReport) {
    errors.push('The email mentions an attachment that will not be sent.')
  }
  if (includeReport && !mentionsAttachment) errors.push('Tell the recipient the website review PDF is attached.')
  if (!/\bwe\b.{0,160}\b(?:design|build|develop|improve)\b.{0,100}\bwebsites?\b/i.test(body)) {
    errors.push('Explain that Arlotech designs, builds, develops, or improves websites.')
  }
  if (!/\b(?:clear(?:ly|er)?|professional(?:ly)?|easier|easy|visitors|get in touch)\b/i.test(body)) {
    errors.push('Explain a realistic benefit of the website services.')
  }
  if (!/\bfeedback\b/i.test(body) && !/\b(?:share|tell us|let us know)\b.{0,100}\b(?:goals|priorities|thoughts|views|website)\b/i.test(body)) {
    errors.push('Invite the recipient to share feedback about their website goals.')
  }
  if (/we (?:user )?tested your website|our user testing|conversion test(?:ing)? showed/i.test(body)) {
    errors.push('The email claims website testing that was not performed.')
  }
  const wordCount = body.split(/\s+/).filter(Boolean).length
  if (wordCount < 40 || wordCount > 250) errors.push('Keep the email concise (approximately 80–160 words unless context requires more).')
  return errors
}

export function EmailDraftsPage() {
  const queryClient = useQueryClient()
  const [searchParams, setSearchParams] = useSearchParams()
  const [selectedOutreachIds, setSelectedOutreachIds] = useState<string[]>(() => {
    const requestedProspectId = searchParams.get('prospectId')
    return requestedProspectId ? [requestedProspectId] : []
  })
  const [showForm, setShowForm] = useState(false)
  const [editingDraft, setEditingDraft] = useState<EmailDraft | null>(null)
  const [subject, setSubject] = useState('')
  const [body, setBody] = useState('')
  const [draftAnalysisId, setDraftAnalysisId] = useState('')
  const [manualRecipient, setManualRecipient] = useState('')
  const [manualSubject, setManualSubject] = useState('')
  const [manualBody, setManualBody] = useState('')
  const [manualComplianceConfirmed, setManualComplianceConfirmed] = useState(false)
  const [manualSendResult, setManualSendResult] = useState<OutreachSendResult | null>(null)
  const [campaignId, setCampaignId] = useState('')
  const [outreachCampaignId, setOutreachCampaignId] = useState('')
  const [prospectId, setProspectId] = useState('')
  const [outreachPreviews, setOutreachPreviews] = useState<GeneratedOutreachPreview[]>([])
  const [generatorMode, setGeneratorMode] = useState<'ai' | 'local'>('ai')
  const [aiApproach, setAiApproach] = useState<AiEmailApproach>('professional')
  const [aiGenerating, setAiGenerating] = useState(false)
  const [aiActionId, setAiActionId] = useState<string | null>(null)
  const [aiChatInputs, setAiChatInputs] = useState<Record<string, string>>({})
  const [selectedEmailRanges, setSelectedEmailRanges] = useState<Record<string, { start: number; end: number }>>({})
  const [draftSearch, setDraftSearch] = useState('')
  const [draftStatusFilter, setDraftStatusFilter] = useState('all')
  const [draftProspectFilter, setDraftProspectFilter] = useState('all')
  const [draftCampaignFilter, setDraftCampaignFilter] = useState('all')
  const [outreachBatchId, setOutreachBatchId] = useState('')
  const [complianceConfirmed, setComplianceConfirmed] = useState(false)
  const [outreachResults, setOutreachResults] = useState<OutreachSendResult[]>([])
  const [generatorProspectId, setGeneratorProspectId] = useState(() => searchParams.get('prospectId') || '')
  const [generatorStrategy, setGeneratorStrategy] = useState<OutreachStrategy>('general_review')
  const [generatorTone, setGeneratorTone] = useState<OutreachTone>('professional')
  const [generatorLength, setGeneratorLength] = useState<OutreachLength>('standard')
  const [senderContext, setSenderContext] = useState('')
  const [followUpStage, setFollowUpStage] = useState<FollowUpStage>('none')
  const [followUpMessageId, setFollowUpMessageId] = useState('')
  const [generatedDraft, setGeneratedDraft] = useState<GeneratedEmailDraft | null>(null)
  const [generatedSubject, setGeneratedSubject] = useState('')
  const [generatedBody, setGeneratedBody] = useState('')
  const [generatedComplianceConfirmed, setGeneratedComplianceConfirmed] = useState(false)
  const [generatedSendResult, setGeneratedSendResult] = useState<OutreachSendResult | null>(null)
  const [signature, setSignature] = useState<OutreachSignature>(readSignature)

  const { data: drafts, isLoading, error } = useQuery({
    queryKey: ['/email-drafts'],
    queryFn: async () => {
      const userId = await getCurrentUserId()
      const { data, error } = await supabase
        .from('email_drafts')
        .select('*')
        .eq('user_id', userId)
        .order('updated_at', { ascending: false })
      if (error) throw error
      return data as EmailDraft[]
    },
  })

  const { data: campaigns = [], error: campaignsError } = useQuery({
    queryKey: ['/campaigns', 'draft-options'],
    queryFn: async () => {
      const userId = await getCurrentUserId()
      const { data, error } = await supabase
        .from('campaigns')
        .select('id, name')
        .eq('user_id', userId)
        .order('name')
      if (error) throw error
      return data as Pick<Campaign, 'id' | 'name'>[]
    },
  })

  const { data: prospects = [], error: prospectsError } = useQuery({
    queryKey: ['/prospects', 'draft-options'],
    queryFn: async () => {
      const userId = await getCurrentUserId()
      const { data, error } = await supabase
        .from('prospects')
        .select('id, business_name, email, do_not_contact')
        .eq('user_id', userId)
        .order('business_name')
      if (error) throw error
      return data as Pick<Prospect, 'id' | 'business_name' | 'email' | 'do_not_contact'>[]
    },
  })
  const prospectOptions = (prospects as Pick<Prospect, 'id' | 'business_name' | 'email' | 'do_not_contact'>[])
    .filter((prospect) => !!prospect.email?.trim())

  const { data: emailProfile, error: emailProfileError } = useQuery({
    queryKey: ['/profile', 'email-signature'],
    queryFn: async () => {
      const userId = await getCurrentUserId()
      const { data, error } = await supabase
        .from('profiles')
        .select('full_name, email, company_name')
        .eq('id', userId)
        .maybeSingle()
      if (error) throw error
      return data
    },
  })

  const {
    data: outreachProspects = [],
    isLoading: outreachProspectsLoading,
    error: outreachProspectsError,
  } = useQuery<OutreachProspect[]>({
    queryKey: ['/prospects', 'outreach'],
    queryFn: async () => {
      const userId = await getCurrentUserId()
      const { data, error } = await supabase
        .from('prospects')
        .select('id, business_name, business_name_verified, contact_name, email, website, business_category, do_not_contact, city')
        .eq('user_id', userId)
        .order('business_name')
        .limit(500)
      if (error) throw error
      return data as OutreachProspect[]
    },
  })

  const {
    data: outreachAnalyses = [],
    isLoading: outreachAnalysesLoading,
    error: outreachAnalysesError,
  } = useQuery<WebsiteAnalysis[]>({
    queryKey: ['/website-analyses', 'outreach'],
    queryFn: async () => {
      const userId = await getCurrentUserId()
      const { data, error } = await supabase
        .from('website_analyses')
        .select('*')
        .eq('user_id', userId)
        .eq('analysis_status', 'completed')
        .not('prospect_id', 'is', null)
        .order('analyzed_at', { ascending: false, nullsFirst: false })
        .limit(500)
      if (error) throw error
      return data as WebsiteAnalysis[]
    },
  })

  const { data: suppressedRows = [], error: suppressionError, isLoading: suppressionLoading } = useQuery<Array<{ normalized_email: string }>>({
    queryKey: ['/suppression-list', 'outreach'],
    queryFn: async () => {
      const userId = await getCurrentUserId()
      const { data, error } = await supabase
        .from('suppression_list')
        .select('normalized_email')
        .eq('user_id', userId)
      if (error) throw error
      return data
    },
  })

  const { data: previouslySentRows = [], error: sentHistoryError, isLoading: sentHistoryLoading } = useQuery<SentOutreachContext[]>({
    queryKey: ['/email-messages', 'outreach-sent'],
    queryFn: async () => {
      const userId = await getCurrentUserId()
      const { data, error } = await supabase
        .from('email_messages')
        .select('id, prospect_id, recipient_email, subject, body, created_at')
        .eq('user_id', userId)
        .eq('direction', 'outbound')
        .eq('status', 'sent')
      if (error) throw error
      return data
    },
  })

  const effectiveSignature: OutreachSignature = {
    ...signature,
    businessName: signature.businessName === 'Arlotech Digital Solutions'
      ? emailProfile?.company_name || signature.businessName
      : signature.businessName,
    senderName: signature.senderName || emailProfile?.full_name || '',
    email: signature.email || emailProfile?.email || '',
  }

  const outreachProspectRows = outreachProspects as OutreachProspect[]
  const emailOutreachProspectRows = outreachProspectRows.filter((prospect) => !!prospect.website?.trim())
  const outreachAnalysisRows = outreachAnalyses as WebsiteAnalysis[]
  const suppressedEmailRows = suppressedRows as Array<{ normalized_email: string }>
  const sentEmailRows = previouslySentRows as SentOutreachContext[]
  const previouslySentProspectRows = sentEmailRows
  const sentRecipientRows = sentEmailRows
  const analysisByProspect = new Map<string, WebsiteAnalysis>()
  for (const analysis of outreachAnalysisRows) {
    if (analysis.prospect_id && !analysisByProspect.has(analysis.prospect_id)) {
      analysisByProspect.set(analysis.prospect_id, analysis)
    }
  }
  const suppressedEmails = new Set(
    suppressedEmailRows.map((row: { normalized_email: string }) => row.normalized_email.toLowerCase()),
  )
  const alreadyEmailedProspects = new Set(
    previouslySentProspectRows.flatMap((row: { prospect_id: string | null }) =>
      row.prospect_id ? [row.prospect_id] : [],
    ),
  )
  const alreadyEmailedAddresses = new Set(
    sentRecipientRows.flatMap((row) => (row.recipient_email ? [row.recipient_email.toLowerCase()] : [])),
  )
  const manualRecipientDoNotContact = outreachProspectRows.some(
    (prospect) =>
      prospect.do_not_contact &&
      prospect.email?.trim().toLowerCase() === manualRecipient.trim().toLowerCase(),
  )
  const selectedGeneratorProspect = outreachProspectRows.find((prospect) => prospect.id === generatorProspectId)
  const selectedGeneratorAnalysis = selectedGeneratorProspect
    ? analysisByProspect.get(selectedGeneratorProspect.id)
    : undefined
  const matchingGeneratorAnalysis = selectedGeneratorProspect && selectedGeneratorAnalysis &&
    hasMatchingWebsiteAnalysis(selectedGeneratorProspect, selectedGeneratorAnalysis)
    ? selectedGeneratorAnalysis
    : undefined
  const originalFollowUpMessage = sentEmailRows.find((message) => message.id === followUpMessageId)
  const generatedValidation = generatedDraft && selectedGeneratorProspect
    ? validateProfessionalEmailDraft(
        {
          ...generatedDraft,
          body: generatedBody,
          wordCount: generatedBody.trim().split(/\s+/).filter(Boolean).length,
        },
        selectedGeneratorProspect,
        !!matchingGeneratorAnalysis,
        generatedSubject,
      )
    : null
  const selectedManualProspect = prospectOptions.find((prospect) => prospect.id === prospectId)
  const draftQuality = assessEmailQuality({
    subject,
    body,
    businessName: selectedManualProspect?.business_name,
    recipient: selectedManualProspect?.email || manualRecipient,
    doNotContact: selectedManualProspect?.do_not_contact || manualRecipientDoNotContact,
    duplicateRecently: Boolean((selectedManualProspect?.email || manualRecipient) && sentRecipientRows.some(row => row.recipient_email?.toLowerCase() === (selectedManualProspect?.email || manualRecipient).toLowerCase())),
  })

  const getOutreachBlockReason = (prospect: OutreachProspect) => {
    if (!prospect.website?.trim()) return 'No website link'
    if (!prospect.email?.trim()) return 'No email address'
    if (prospect.do_not_contact) return 'Do not contact'
    if (suppressedEmails.has(prospect.email.trim().toLowerCase())) return 'On suppression list'
    if (
      prospect.website &&
      !hasMatchingWebsiteAnalysis(prospect, analysisByProspect.get(prospect.id))
    ) return 'Analyze website first'
    if (prospect.website) {
      try {
        const suitability = getOutreachSuitability(analysisByProspect.get(prospect.id)!)
        if (suitability === 'Incomplete Audit') return 'Audit incomplete — outreach unavailable'
        if (suitability === 'No Opportunity') return 'No meaningful opportunity — outreach withheld'
      } catch {
        return 'Audit incomplete — outreach unavailable'
      }
    }
    return null
  }
  const getDraftBlockReason = (prospect: OutreachProspect) =>
    prospect.website?.trim() ? null : 'No website link'

  const hasPreviousSend = (prospect: OutreachProspect) =>
    alreadyEmailedProspects.has(prospect.id) ||
    (!!prospect.email && alreadyEmailedAddresses.has(prospect.email.trim().toLowerCase()))

  const generatedSendBlockReason = selectedGeneratorProspect
    ? getOutreachBlockReason(selectedGeneratorProspect)
    : null

  const requestedProspectId = searchParams.get('prospectId')
  const requestedProspect = emailOutreachProspectRows.find((item) => item.id === requestedProspectId)
  const requestedProspectBlockReason = requestedProspectId &&
    !outreachProspectsLoading &&
    !outreachAnalysesLoading &&
    !suppressionLoading &&
    !sentHistoryLoading
    ? requestedProspect
      ? getDraftBlockReason(requestedProspect)
    : 'Prospect is not available or has no website link'
    : null
  const outreachProspectById = new Map(emailOutreachProspectRows.map((prospect) => [prospect.id, prospect]))
  const validSelectedOutreachIds = selectedOutreachIds.filter((id) => {
    const prospect = outreachProspectById.get(id)
    return !!prospect && !getDraftBlockReason(prospect)
  })

  const clearProspectPrefill = () => {
    if (!searchParams.has('prospectId')) return
    const nextSearchParams = new URLSearchParams(searchParams)
    nextSearchParams.delete('prospectId')
    setSearchParams(nextSearchParams, { replace: true })
  }

  const prepareOutreachPreviews = async () => {
    clearProspectPrefill()
    const selectedProspects = emailOutreachProspectRows.filter((prospect: OutreachProspect) =>
      validSelectedOutreachIds.includes(prospect.id),
    )
    if (selectedProspects.length === 0) {
      toast.error('Select at least one eligible prospect.')
      return
    }
    if (selectedProspects.length > MAX_OUTREACH_BATCH_SIZE) {
      toast.error(`Send up to ${MAX_OUTREACH_BATCH_SIZE} prospects per batch.`)
      return
    }
    if (generatorMode === 'ai' && selectedProspects.length > MAX_AI_GENERATION_BATCH_SIZE) {
      toast.error(`Generate AI drafts for up to ${MAX_AI_GENERATION_BATCH_SIZE} prospects at a time. The rule-based fallback can prepare up to ${MAX_OUTREACH_BATCH_SIZE}.`)
      return
    }
    const blockedProspects = selectedProspects.filter(getDraftBlockReason)
    if (blockedProspects.length > 0) {
      toast.error('Remove ineligible prospects before preparing the batch.')
      return
    }
    try {
      setAiGenerating(true)
      const outcomes = await mapWithConcurrency(selectedProspects, generatorMode === 'ai' ? 3 : 1, async (prospect) => {
        try {
        const savedAnalysis = analysisByProspect.get(prospect.id)
        const analysis = hasMatchingWebsiteAnalysis(prospect, savedAnalysis) ? savedAnalysis : undefined
        const preview: OutreachPreview = generatorMode === 'ai'
          ? {
            prospect_id: prospect.id,
            analysis_id: analysis?.id ?? null,
            subject: '',
            body: '',
            has_website_report: !!analysis,
            suitability: analysis ? getOutreachSuitability(analysis) : 'Incomplete Audit',
            internal_note: analysis
              ? 'AI draft for review. A matching website review PDF will be attached.'
              : 'No matching saved audit was available; verify all website-specific claims before use.',
          }
          : createOutreachPreview(prospect, analysis)
        let generatedDraft: GeneratedEmailDraft
        let aiConfidence: GeneratedOutreachPreview['aiConfidence']
        let aiRecommendedCallToAction: string | undefined
        let aiSenderName: string | undefined
        let aiSenderBusiness: string | undefined
        let aiSenderEmail: string | undefined
        let generatedAnalysisId = preview.analysis_id
        if (generatorMode === 'ai') {
          const previousEmail = sentEmailRows.find((message) => message.prospect_id === prospect.id)
          if (followUpStage !== 'none' && !previousEmail) {
            throw new Error(`No previously sent email is available for ${prospect.business_name}'s follow-up.`)
          }
          const result = await generateAiOutreachDraft({
            prospectId: prospect.id,
            approach: aiApproach,
            tone: generatorTone,
            length: generatorLength,
            senderContext,
            followUpStage,
            includeReport: preview.has_website_report,
          })
          if (result.prospect.website !== prospect.website) {
            throw new Error(`${prospect.business_name}: the AI response did not match the saved website URL.`)
          }
          if (
            prospect.business_name_verified &&
            result.prospect.businessName !== prospect.business_name
          ) {
            throw new Error(`${prospect.business_name}: the AI response did not match the verified business name.`)
          }
          generatedDraft = result
          aiConfidence = result.personalizationConfidence
          aiRecommendedCallToAction = result.recommendedCallToAction
          aiSenderName = result.sender.name
          aiSenderBusiness = result.sender.business
          aiSenderEmail = result.sender.email
          generatedAnalysisId = result.analysisId
          const errors = validateAiPreview(generatedDraft, prospect, preview.has_website_report)
          if (errors.length) throw new Error(`${prospect.business_name}: ${errors.join(' ')}`)
        } else if (followUpStage !== 'none') {
          const previousEmail = sentEmailRows.find((message) => message.prospect_id === prospect.id)
          if (!previousEmail) throw new Error(`No previously sent email is available for ${prospect.business_name}'s follow-up.`)
          generatedDraft = generateFollowUpDraft(previousEmail, prospect, followUpStage, effectiveSignature, !!prospect.website && !!analysis)
        } else {
          generatedDraft = generateProfessionalEmailDraft({
            prospect,
            analysis,
            strategy: generatorStrategy,
            tone: generatorTone,
            length: generatorLength,
            includeReport: !!prospect.website && !!analysis,
            signature: effectiveSignature,
            senderContext,
          })
        }
        const generatedSubject = generatedDraft.subjectSuggestions[0] || ''
        if (generatorMode === 'local') {
          const validation = validateProfessionalEmailDraft(
            generatedDraft,
            prospect,
            !!analysis && hasMatchingWebsiteAnalysis(prospect, analysis),
            generatedSubject,
          )
          if (validation.errors.length) throw new Error(`${prospect.business_name}: ${validation.errors.join(' ')}`)
        }
        if (generatedSubject.length > 200 || generatedDraft.body.length > 12_000) {
          throw new Error(`${prospect.business_name}'s generated email exceeds the sending limits. Shorten it before preparing the batch.`)
        }
        return {
          preview: {
            ...preview,
            analysis_id: generatedAnalysisId,
            subject: generatedSubject,
            body: generatedDraft.body,
            generatedDraft,
            ...(generatorMode === 'ai'
              ? { aiApproach, aiConfidence, aiRecommendedCallToAction, aiSenderName, aiSenderBusiness, aiSenderEmail }
              : {}),
          },
          error: null,
        }
        } catch (error) {
          return {
            preview: null,
            error: `${prospect.business_name}: ${error instanceof Error ? error.message : 'Email generation failed.'}`,
          }
        }
      })
      const previews = outcomes.flatMap((outcome) => outcome.preview ? [outcome.preview] : [])
      const failures = outcomes.flatMap((outcome) => outcome.error ? [outcome.error] : [])
      if (previews.length === 0) {
        toast.error(failures.join('\n') || 'No email drafts could be generated.')
        return
      }
      setOutreachPreviews(previews)
      setSelectedEmailRanges({})
      setOutreachResults([])
      setOutreachBatchId(crypto.randomUUID())
      setComplianceConfirmed(false)
      if (failures.length) {
        toast.warning(`Generated ${previews.length} drafts; ${failures.length} failed. Nothing was saved or sent.`)
        toast.error(failures.slice(0, 3).join('\n'))
      } else {
        toast.success(`Generated ${previews.length} email${previews.length === 1 ? '' : 's'} for review. Nothing was saved or sent.`)
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not generate outreach emails.')
    } finally {
      setAiGenerating(false)
    }
  }

  const rewriteAiPreview = async (preview: GeneratedOutreachPreview, action: AiEmailRewriteAction) => {
    const selection = selectedEmailRanges[preview.prospect_id]
    const selectedText = selection
      ? preview.body.slice(selection.start, selection.end)
      : ''
    if (action === 'rewrite_selection' && !selectedText.trim()) {
      toast.error('Select a paragraph or sentence in the email body first.')
      return
    }
    if (action === 'rewrite_selection') {
      const signatureStart = preview.body.lastIndexOf('\n\nKind regards,\n')
      if (signatureStart >= 0 && selection && selection.end > signatureStart) {
        toast.error('The configured sender signature cannot be rewritten.')
        return
      }
    }
    if (!preview.aiApproach) return
    setAiActionId(preview.prospect_id)
    try {
      const result = await rewriteAiOutreachDraft({
        prospectId: preview.prospect_id,
        approach: preview.aiApproach,
        action,
        body: preview.body,
        selectedText,
        includeReport: preview.has_website_report,
      })
      const nextBody = action === 'rewrite_selection' && selection
        ? `${preview.body.slice(0, selection.start)}${result.body}${preview.body.slice(selection.end)}`
        : result.body
      setOutreachPreviews((current) => current.map((item) => {
        if (item.prospect_id !== preview.prospect_id) return item
        return {
          ...item,
          body: nextBody,
          aiRecommendedCallToAction: result.recommendedCallToAction,
          aiWebsiteContext: result.websiteContextUsed,
          generatedDraft: {
            ...item.generatedDraft,
            body: nextBody,
            subjectSuggestions: result.subjectSuggestions,
            observationsUsed: result.observationsUsed,
            wordCount: nextBody.split(/\s+/).filter(Boolean).length,
          },
        }
      }))
      setComplianceConfirmed(false)
      toast.success('Email revised. Review the updated draft before sending.')
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not rewrite this email.')
    } finally {
      setAiActionId(null)
    }
  }

  const customizeAiPreview = async (preview: GeneratedOutreachPreview) => {
    const instruction = (aiChatInputs[preview.prospect_id] || '').trim()
    if (!instruction) {
      toast.error('Enter an instruction for the AI draft assistant.')
      return
    }
    if (!preview.aiApproach) return
    setAiActionId(preview.prospect_id)
    try {
      const result = await rewriteAiOutreachDraft({
        prospectId: preview.prospect_id,
        approach: preview.aiApproach,
        action: 'custom',
        body: preview.body,
        customInstruction: instruction,
        conversation: preview.aiChatMessages,
        includeReport: preview.has_website_report,
      })
      const prospect = outreachProspectRows.find((item) => item.id === preview.prospect_id)
      if (!prospect) throw new Error('This prospect is no longer available.')
      const generatedDraft = {
        ...preview.generatedDraft,
        body: result.body,
        includesReportReference: preview.has_website_report,
        subjectSuggestions: result.subjectSuggestions,
        observationsUsed: result.observationsUsed,
        wordCount: result.body.split(/\s+/).filter(Boolean).length,
      }
      const errors = validateAiPreview(generatedDraft, prospect, preview.has_website_report)
      if (errors.length) throw new Error(errors.join(' '))
      setOutreachPreviews((current) => current.map((item) => item.prospect_id === preview.prospect_id
        ? {
          ...item,
          body: result.body,
          generatedDraft,
          aiRecommendedCallToAction: result.recommendedCallToAction,
          aiChatMessages: [
            ...(item.aiChatMessages || []),
            { role: 'user' as const, content: instruction },
            { role: 'assistant' as const, content: result.assistantMessage || 'The draft has been updated. Review the revised message above.' },
          ].slice(-10),
        }
        : item))
      setAiChatInputs((current) => ({ ...current, [preview.prospect_id]: '' }))
      setComplianceConfirmed(false)
      toast.success('The AI updated the draft. Review it before sending.')
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'The AI could not update this draft.')
    } finally {
      setAiActionId(null)
    }
  }

  const generateAnotherAiVersion = async (preview: GeneratedOutreachPreview) => {
    if (!preview.aiApproach) return
    if (!window.confirm('Replace this preview with a newly generated version? Your current edits will be replaced.')) return
    setAiActionId(preview.prospect_id)
    try {
      const result = await generateAiOutreachDraft({
        prospectId: preview.prospect_id,
        approach: preview.aiApproach,
        tone: generatorTone,
        length: generatorLength,
        senderContext,
        followUpStage,
        includeReport: preview.has_website_report,
      })
      const prospect = outreachProspectRows.find((item) => item.id === preview.prospect_id)
      if (!prospect) throw new Error('This prospect is no longer available.')
      if (result.prospect.website !== prospect.website) throw new Error('The AI response website did not match the saved prospect.')
      if (prospect.business_name_verified && result.prospect.businessName !== prospect.business_name) {
        throw new Error('The AI response business name did not match the verified prospect record.')
      }
      const errors = validateAiPreview(result, prospect, preview.has_website_report)
      if (errors.length) throw new Error(errors.join(' '))
      setOutreachPreviews((current) => current.map((item) => item.prospect_id === preview.prospect_id
        ? {
          ...item,
          analysis_id: result.analysisId,
          subject: result.subjectSuggestions[0] || '',
          body: result.body,
          generatedDraft: result,
          aiConfidence: result.personalizationConfidence,
          aiRecommendedCallToAction: result.recommendedCallToAction,
          aiWebsiteContext: result.websiteContextUsed,
          aiSenderName: result.sender.name,
          aiSenderBusiness: result.sender.business,
          aiSenderEmail: result.sender.email,
          savedDraftId: undefined,
        }
        : item))
      setComplianceConfirmed(false)
      toast.success('A new version is ready for review.')
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not generate another version.')
    } finally {
      setAiActionId(null)
    }
  }

  const regenerateAiSubjects = async (preview: GeneratedOutreachPreview) => {
    if (!preview.aiApproach) return
    setAiActionId(preview.prospect_id)
    try {
      const subjectSuggestions = await regenerateAiSubjectSuggestions({
        prospectId: preview.prospect_id,
        approach: preview.aiApproach,
        body: preview.body,
      })
      setOutreachPreviews((current) => current.map((item) => item.prospect_id === preview.prospect_id
        ? { ...item, generatedDraft: { ...item.generatedDraft, subjectSuggestions } }
        : item))
      toast.success('Three new subject suggestions are ready. Choose one to replace the current subject.')
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not generate new subject lines.')
    } finally {
      setAiActionId(null)
    }
  }

  const sendOutreachMutation = useMutation({
    mutationFn: async () => {
      const alreadySentIds = new Set(
        outreachResults.filter((result) => result.status === 'sent' && result.prospect_id)
          .flatMap((result) => result.prospect_id ? [result.prospect_id] : []),
      )
      const pendingPreviews = outreachPreviews.filter((preview) => !alreadySentIds.has(preview.prospect_id))
      if (!pendingPreviews.length) throw new Error('There are no unsent emails remaining in this batch.')

      const omittedReports: string[] = []
      const emailPayload = await Promise.all(pendingPreviews.map(async (preview) => {
        const prospect = outreachProspectRows.find((item: OutreachProspect) => item.id === preview.prospect_id)
        if (!prospect) throw new Error('A selected prospect is no longer available.')
        const blockReason = getOutreachBlockReason(prospect)
        if (blockReason) throw new Error(`${prospect.business_name}: ${blockReason}.`)
        const analysis = analysisByProspect.get(prospect.id)
        const matchingPreviewAnalysis = !!analysis &&
          analysis.id === preview.analysis_id &&
          hasMatchingWebsiteAnalysis(prospect, analysis)
        if (preview.has_website_report && analysis && !matchingPreviewAnalysis) {
          throw new Error(`${prospect.business_name}'s website audit changed. Regenerate the email before sending.`)
        }
        const safeFilename = prospect.business_name
          .replace(/[^a-z0-9-]/gi, '-')
          .replace(/^-+|-+$/g, '')
          .slice(0, 60)
          .toLowerCase() || 'prospect'
        let attachmentContent: string | null = null
        if (preview.has_website_report) {
          if (!matchingPreviewAnalysis || !analysis) {
            omittedReports.push(`${prospect.business_name}: matching website review is unavailable`)
          } else {
            try {
              attachmentContent = await createAuditPdfAttachment(analysis, prospect)
              if (attachmentContent.length > MAX_ATTACHMENT_BASE64_LENGTH) {
                attachmentContent = null
                omittedReports.push(`${prospect.business_name}: PDF exceeds the 525 KB attachment limit`)
              }
            } catch (error) {
              const reason = error instanceof Error ? error.message : 'PDF generation failed'
              omittedReports.push(`${prospect.business_name}: ${reason}`)
            }
          }
        }
        const reportOmitted = preview.has_website_report && !attachmentContent
        const body = reportOmitted
          ? preview.body
              .split(/\r?\n/)
              .filter((line) => !/(?:your website review is attached|the attached pdf contains|we[’']ve attached|i[’']ve attached|we have attached|please see the attached)/i.test(line))
              .join('\n')
              .replace(/\n{3,}/g, '\n\n')
          : preview.body
        const generatedDraft = {
          ...preview.generatedDraft,
          body,
          includesReportReference: reportOmitted ? false : preview.generatedDraft.includesReportReference,
          wordCount: body.trim().split(/\s+/).filter(Boolean).length,
        }
        if (preview.aiApproach) {
          const validationErrors = validateAiPreview(generatedDraft, prospect, preview.has_website_report)
          if (validationErrors.length) throw new Error(`${prospect.business_name}: ${validationErrors.join(' ')}`)
        } else {
          const validation = validateProfessionalEmailDraft(
            generatedDraft,
            prospect,
            !!analysis && hasMatchingWebsiteAnalysis(prospect, analysis),
            preview.subject,
          )
          if (validation.errors.length) throw new Error(`${prospect.business_name}: ${validation.errors.join(' ')}`)
        }
        if (!preview.subject.trim() || preview.subject.length > 200 || !body.trim() || body.length > 12_000) {
          throw new Error(`${prospect.business_name}'s email has an empty or over-limit subject or message.`)
        }
        return {
          prospect_id: prospect.id,
          subject: preview.subject,
          body,
          ...(attachmentContent
            ? {
                attachment: {
                  filename: `website-review-${safeFilename}.pdf`,
                  content: attachmentContent,
                },
              }
            : {}),
        }
      }))
      const functionClient = supabase as typeof supabase & {
        functions: {
          invoke: (
            name: string,
            options: { body: unknown },
          ) => Promise<{ data: unknown; error: Error | null }>
        }
      }
      const resultById = new Map(outreachResults.map((result) => [result.prospect_id, result]))
      const batches: typeof emailPayload[] = []
      let currentBatch: typeof emailPayload = []
      let currentAttachmentLength = 0
      for (const email of emailPayload) {
        const attachmentLength = email.attachment?.content.length ?? 0
        if (
          currentBatch.length >= MAX_SEND_REQUEST_SIZE ||
          currentAttachmentLength + attachmentLength > MAX_BATCH_ATTACHMENT_LENGTH
        ) {
          batches.push(currentBatch)
          currentBatch = []
          currentAttachmentLength = 0
        }
        currentBatch.push(email)
        currentAttachmentLength += attachmentLength
      }
      if (currentBatch.length) batches.push(currentBatch)

      const inlineLogo = await createInlineEmailLogo()
      const batchSenderName = pendingPreviews[0]?.aiApproach
        ? pendingPreviews[0].aiSenderName || ''
        : effectiveSignature.senderName
      for (const batch of batches) {
        const { data, error } = await functionClient.functions.invoke('send-outreach', {
          body: { batchId: outreachBatchId, emails: batch, complianceConfirmed, inlineLogo, senderName: batchSenderName },
        })
        if (error) throw new Error(await getOutreachFunctionError(error))
        if (!isSendOutreachResponse(data)) {
          const message = data && typeof data === 'object' && 'error' in data && typeof data.error === 'string'
            ? data.error
            : 'The send function returned an invalid response.'
          throw new Error(message)
        }
        for (const result of data.results) resultById.set(result.prospect_id, result)
        const currentResults = Array.from(resultById.values())
        setOutreachResults(currentResults)
        if (data.results.length !== batch.length) {
          throw new Error('The send function did not return a result for every recipient in this batch. Review the results before retrying.')
        }
      }
      return { results: Array.from(resultById.values()), omittedReports }
    },
    onSuccess: async (data: SendOutreachMutationResult) => {
      setOutreachResults(data.results)
      const sentCount = data.results.filter((result: OutreachSendResult) => result.status === 'sent').length
      const failedCount = data.results.length - sentCount
      if (failedCount > 0) toast.error(`Sent ${sentCount}; ${failedCount} were skipped or failed.`)
      else toast.success(`Sent ${sentCount} personalized email${sentCount === 1 ? '' : 's'}.`)
      const sentDrafts = outreachPreviews.filter((preview) =>
        preview.savedDraftId &&
        data.results.some((result) => result.prospect_id === preview.prospect_id && result.status === 'sent'),
      )
      for (const preview of sentDrafts) {
        if (!preview.savedDraftId) continue
        try {
          const userId = await getCurrentUserId()
          const { error: statusError } = await supabase.from('email_drafts')
            .update({
              status: 'sent',
              subject: preview.subject.trim(),
              body: preview.body.trim(),
            })
            .eq('id', preview.savedDraftId)
            .eq('user_id', userId)
          if (statusError) {
            const prospect = outreachProspectRows.find((item) => item.id === preview.prospect_id)
            toast.error(`Email sent to ${prospect?.business_name || 'prospect'}, but its saved draft status could not be updated: ${statusError.message}`)
          }
        } catch (statusError) {
          const message = statusError instanceof Error ? statusError.message : 'Account access failed.'
          toast.error(`Email sent to ${preview.prospect_id}, but its saved draft status could not be updated: ${message}`)
        }
      }
      if (data.omittedReports.length > 0) {
        toast.warning(`Website PDFs were omitted for these email attempts: ${data.omittedReports.join('; ')}.`)
      }
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['/email-messages'] }),
        queryClient.invalidateQueries({ queryKey: ['/prospects'] }),
        queryClient.invalidateQueries({ queryKey: ['/email-drafts'] }),
        queryClient.invalidateQueries({ queryKey: ['/dashboard/metrics'] }),
      ])
      const unsentPreviews = outreachPreviews.filter((preview) =>
        !data.results.some((result) => result.prospect_id === preview.prospect_id && result.status === 'sent'),
      )
      setSelectedOutreachIds(unsentPreviews.map(({ prospect_id }) => prospect_id))
      setOutreachPreviews(unsentPreviews)
      setOutreachBatchId(unsentPreviews.length ? crypto.randomUUID() : '')
      setComplianceConfirmed(false)
    },
    onError: (error: Error) => toast.error(error.message || 'Could not send outreach batch.'),
  })

  const manualSendMutation = useMutation({
    mutationFn: async () => {
      const emailAddress = manualRecipient.trim().toLowerCase()
      if (!emailAddress || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailAddress)) {
        throw new Error('Enter a valid recipient email address.')
      }
      if (!manualSubject.trim() || !manualBody.trim()) {
        throw new Error('Enter both a subject and an email message.')
      }
      if (suppressedEmails.has(emailAddress)) throw new Error('This address is on your suppression list.')
      const functionClient = supabase as typeof supabase & {
        functions: {
          invoke: (
            name: string,
            options: { body: unknown },
          ) => Promise<{ data: unknown; error: Error | null }>
        }
      }
      const inlineLogo = await createInlineEmailLogo()
      const { data, error } = await functionClient.functions.invoke('send-outreach', {
        body: {
          batchId: crypto.randomUUID(),
          manualEmail: {
            recipient_email: emailAddress,
            subject: manualSubject.trim(),
            body: manualBody.trim(),
          },
          complianceConfirmed: true,
          inlineLogo,
          senderName: effectiveSignature.senderName,
        },
      })
      if (error) throw new Error(await getOutreachFunctionError(error))
      if (!isManualSendResponse(data)) {
        throw new Error('The send function returned an invalid response.')
      }
      return data.result
    },
    onSuccess: async (result: OutreachSendResult) => {
      setManualSendResult(result)
      if (result.status === 'sent') {
        toast.success(`Email sent to ${result.recipient_email}.`)
        setManualRecipient('')
        setManualSubject('')
        setManualBody('')
        setManualComplianceConfirmed(false)
      } else {
        toast.error(result.error || 'The email was not sent.')
      }
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['/email-messages'] }),
        queryClient.invalidateQueries({ queryKey: ['/email-messages', 'outreach-sent'] }),
        queryClient.invalidateQueries({ queryKey: ['/dashboard/metrics'] }),
      ])
    },
    onError: (error: Error) => toast.error(error.message || 'Could not send this email.'),
  })

  const generatedSendMutation = useMutation({
    mutationFn: async () => {
      if (!selectedGeneratorProspect) throw new Error('Select a prospect before sending.')
      if (!generatedSubject.trim() || !generatedBody.trim()) {
        throw new Error('Add a subject and message before sending.')
      }
      if (generatedValidation?.errors.length) {
        throw new Error(generatedValidation.errors.join(' '))
      }
      if (!generatedComplianceConfirmed) {
        throw new Error('Confirm that you reviewed the recipient and have a lawful basis to contact them.')
      }
      if (generatedSendBlockReason) throw new Error(generatedSendBlockReason)
      if (followUpStage !== 'none' && !originalFollowUpMessage) {
        throw new Error('Select the previously sent email before sending this follow-up.')
      }

      const attachmentContent = selectedGeneratorProspect.website && matchingGeneratorAnalysis
        ? await createAuditPdfAttachment(matchingGeneratorAnalysis, selectedGeneratorProspect)
        : null
      if (attachmentContent && attachmentContent.length > MAX_ATTACHMENT_BASE64_LENGTH) {
        throw new Error('The website PDF is over the 525 KB attachment limit. Download the report and send it separately.')
      }
      const safeFilename = selectedGeneratorProspect.business_name
        .replace(/[^a-z0-9-]/gi, '-')
        .replace(/^-+|-+$/g, '')
        .slice(0, 60)
        .toLowerCase() || 'prospect'
      const functionClient = supabase as typeof supabase & {
        functions: {
          invoke: (
            name: string,
            options: { body: unknown },
          ) => Promise<{ data: unknown; error: Error | null }>
        }
      }
      const inlineLogo = await createInlineEmailLogo()
      const { data, error } = await functionClient.functions.invoke('send-outreach', {
        body: {
          batchId: crypto.randomUUID(),
          complianceConfirmed: generatedComplianceConfirmed,
          inlineLogo,
          senderName: effectiveSignature.senderName,
          emails: [{
            prospect_id: selectedGeneratorProspect.id,
            subject: generatedSubject.trim(),
            body: generatedBody.trim(),
            ...(attachmentContent
              ? {
                  attachment: {
                    filename: `website-review-${safeFilename}.pdf`,
                    content: attachmentContent,
                  },
                }
              : {}),
          }],
        },
      })
      if (error) throw new Error(await getOutreachFunctionError(error))
      if (!isSendOutreachResponse(data) || data.results.length !== 1) {
        const message = data && typeof data === 'object' && 'error' in data && typeof data.error === 'string'
          ? data.error
          : 'The send function returned an invalid response.'
        throw new Error(message)
      }
      const result = data.results[0]
      if (!result) throw new Error('The send function returned no result for this email.')
      return result
    },
    onSuccess: async (result: OutreachSendResult) => {
      setGeneratedSendResult(result)
      if (result.status === 'sent') {
        toast.success(`Email sent to ${result.recipient_email || selectedGeneratorProspect?.email}.`)
      } else {
        toast.error(result.error || 'The email was not sent.')
      }
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['/email-messages'] }),
        queryClient.invalidateQueries({ queryKey: ['/email-messages', 'outreach-sent'] }),
        queryClient.invalidateQueries({ queryKey: ['/prospects'] }),
        queryClient.invalidateQueries({ queryKey: ['/dashboard/metrics'] }),
      ])
    },
    onError: (error: Error) => toast.error(error.message || 'Could not send this email.'),
  })

  const saveMutation = useMutation({
    mutationFn: async () => {
      const userId = await getCurrentUserId()
      const values = {
        subject: subject.trim(),
        body: body.trim(),
        campaign_id: campaignId || null,
        prospect_id: prospectId || null,
        website_analysis_id: draftAnalysisId || null,
      }
      const result = editingDraft
        ? await supabase.from('email_drafts')
          .update({ ...values, status: 'draft', approved_at: null })
          .eq('id', editingDraft.id)
          .eq('user_id', userId)
        : await supabase.from('email_drafts').insert({ ...values, user_id: userId, status: 'draft' })
      if (result.error) throw result.error
    },
    onSuccess: () => {
      toast.success(editingDraft ? 'Draft updated' : 'Draft created')
      closeForm()
      queryClient.invalidateQueries({ queryKey: ['/email-drafts'] })
    },
    onError: (err: Error) => toast.error(err.message || 'Could not save draft'),
  })

  const deleteMutation = useMutation({
    mutationFn: async (draft: EmailDraft) => {
      const userId = await getCurrentUserId()
      const { error } = await supabase
        .from('email_drafts')
        .delete()
        .eq('id', draft.id)
        .eq('user_id', userId)
      if (error) throw error
    },
    onSuccess: () => {
      toast.success('Draft deleted')
      queryClient.invalidateQueries({ queryKey: ['/email-drafts'] })
    },
    onError: (err: Error) => toast.error(err.message || 'Could not delete draft'),
  })

  const savePreviewDraftMutation = useMutation({
    mutationFn: async (preview: GeneratedOutreachPreview) => {
      if (preview.aiApproach) {
        const prospect = outreachProspectRows.find((item) => item.id === preview.prospect_id)
        if (!prospect) throw new Error('This prospect is no longer available.')
        if (!preview.subject.trim() || preview.subject.length > 200) {
          throw new Error('Choose a non-empty subject within the 200-character limit before saving.')
        }
        const validationErrors = validateAiPreview({
          ...preview.generatedDraft,
          body: preview.body,
        }, prospect, preview.has_website_report)
        if (validationErrors.length) throw new Error(validationErrors.join(' '))
      }
      const userId = await getCurrentUserId()
      const values = {
        subject: preview.subject.trim(),
        body: preview.body.trim(),
        prospect_id: preview.prospect_id,
        campaign_id: outreachCampaignId || null,
        website_analysis_id: preview.analysis_id,
        template_type: preview.aiApproach || generatorStrategy,
        generation_source: preview.aiApproach ? 'ai' : 'rules',
        status: 'draft',
        approved_at: null,
      }
      const result = preview.savedDraftId
        ? await supabase.from('email_drafts')
          .update(values)
          .eq('id', preview.savedDraftId)
          .eq('user_id', userId)
          .select('id')
          .single()
        : await supabase.from('email_drafts')
          .insert({ ...values, user_id: userId })
          .select('id')
          .single()
      if (result.error) throw result.error
      return { prospectId: preview.prospect_id, draftId: result.data.id, updated: !!preview.savedDraftId }
    },
    onSuccess: async (result: { prospectId: string; draftId: string; updated: boolean }) => {
      const { prospectId, draftId, updated } = result
      setOutreachPreviews((current) => current.map((preview) =>
        preview.prospect_id === prospectId ? { ...preview, savedDraftId: draftId } : preview,
      ))
      await queryClient.invalidateQueries({ queryKey: ['/email-drafts'] })
      toast.success(updated ? 'Saved draft changes.' : 'Saved as a review-only draft.')
    },
    onError: (saveError: Error) => toast.error(saveError.message || 'Could not save this email draft.'),
  })

  const updateDraftStatusMutation = useMutation({
    mutationFn: async ({ draft, status }: { draft: EmailDraft; status: 'draft' | 'ready_for_review' | 'approved' }) => {
      const userId = await getCurrentUserId()
      const { error } = await supabase.from('email_drafts')
        .update({
          status,
          approved_at: status === 'approved' ? new Date().toISOString() : null,
        })
        .eq('id', draft.id)
        .eq('user_id', userId)
      if (error) throw error
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['/email-drafts'] }),
    onError: (statusError: Error) => toast.error(statusError.message || 'Could not update draft status.'),
  })

  const closeForm = () => {
    setShowForm(false)
    setEditingDraft(null)
    setSubject('')
    setBody('')
    setCampaignId('')
    setProspectId('')
    setDraftAnalysisId('')
  }

  const openEditForm = (draft: EmailDraft) => {
    setEditingDraft(draft)
    setSubject(draft.subject)
    setBody(draft.body)
    setCampaignId(draft.campaign_id || '')
    setProspectId(draft.prospect_id || '')
    setDraftAnalysisId(draft.website_analysis_id || '')
    setShowForm(true)
  }

  const generateDraft = () => {
    if (!selectedGeneratorProspect) {
      toast.error('Select a prospect before generating an email.')
      return
    }
    const missingFollowUpContext = followUpStage !== 'none' && !originalFollowUpMessage
    try {
      const result = followUpStage !== 'none' && originalFollowUpMessage
        ? generateFollowUpDraft(
            originalFollowUpMessage,
            selectedGeneratorProspect,
            followUpStage,
            effectiveSignature,
            !!selectedGeneratorProspect.website && !!matchingGeneratorAnalysis,
          )
        : generateProfessionalEmailDraft({
            prospect: selectedGeneratorProspect,
            analysis: matchingGeneratorAnalysis,
            strategy: generatorStrategy,
            tone: generatorTone,
            length: generatorLength,
            includeReport: !!selectedGeneratorProspect.website && !!matchingGeneratorAnalysis,
            signature: effectiveSignature,
            senderContext,
          })
      setGeneratedDraft(missingFollowUpContext
          ? {
            ...result,
            qualityChecks: [
              ...result.qualityChecks,
              'No previously sent email was available, so this was written as a new outreach email instead.',
            ],
          }
          : result)
      setGeneratedSubject(result.subjectSuggestions[0] || '')
      setGeneratedBody(result.body)
      setGeneratedComplianceConfirmed(false)
      setGeneratedSendResult(null)
      if (missingFollowUpContext) {
        setFollowUpStage('none')
        setFollowUpMessageId('')
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not generate an email.')
    }
  }

  const copyGeneratedDraft = async () => {
    try {
      await navigator.clipboard.writeText(`Subject: ${generatedSubject}\n\n${generatedBody}`)
      toast.success('Email copied')
    } catch (error) {
      toast.error(error instanceof Error ? `Could not copy email: ${error.message}` : 'Could not copy email.')
    }
  }

  const saveSignature = () => {
    try {
      localStorage.setItem(SIGNATURE_STORAGE_KEY, JSON.stringify(effectiveSignature))
      toast.success('Email signature saved on this device')
    } catch (error) {
      toast.error(error instanceof Error ? `Could not save signature: ${error.message}` : 'Could not save signature.')
    }
  }

  const updateSignature = (key: keyof OutreachSignature, value: string) => {
    setSignature((current) => ({ ...current, [key]: value }))
  }

  const duplicateDraft = (draft: EmailDraft) => {
    setEditingDraft(null)
    setSubject(draft.subject)
    setBody(draft.body)
    setCampaignId(draft.campaign_id || '')
    setProspectId(draft.prospect_id || '')
    setDraftAnalysisId(draft.website_analysis_id || '')
    setShowForm(true)
  }

  if (isLoading) {
    return <Card className="p-6"><div className="h-40 animate-pulse rounded bg-slate-200" /></Card>
  }

  if (error) {
    return <p className="py-12 text-center text-sm text-red-600">Could not load email drafts: {error.message}</p>
  }

  const campaignOptions = (campaigns || []) as Pick<Campaign, 'id' | 'name'>[]
  const draftRows = (drafts || []) as EmailDraft[]
  const draftAnalysisOptions = outreachAnalysisRows.filter((analysis) =>
    analysis.prospect_id === prospectId &&
    (prospectId ? hasMatchingWebsiteAnalysis(
      outreachProspectRows.find((prospect) => prospect.id === prospectId) || { website: null },
      analysis,
    ) : false),
  )
  const filteredDraftRows = draftRows.filter((draft) => {
    const prospect = outreachProspectRows.find((item) => item.id === draft.prospect_id)
    const matchesSearch = !draftSearch.trim() ||
      `${draft.subject} ${draft.body} ${prospect?.business_name || ''}`.toLowerCase().includes(draftSearch.trim().toLowerCase())
    return matchesSearch &&
      (draftStatusFilter === 'all' || draft.status === draftStatusFilter) &&
      (draftProspectFilter === 'all' || draft.prospect_id === draftProspectFilter) &&
      (draftCampaignFilter === 'all' || draft.campaign_id === draftCampaignFilter)
  })

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">{localStorage.getItem('arlotech-login-mode') === 'blacksite' ? 'PAYLOAD ASSEMBLY' : 'Email Drafts'}</h1>
          <p className="mt-1 text-sm text-slate-500">Create drafts and prepare generic, reviewed outreach batches.</p>
        </div>
        <Button onClick={() => { closeForm(); setShowForm(true) }}>
          <Plus className="h-4 w-4" /> New Draft
        </Button>
      </div>

      <Card className="space-y-4 p-4 sm:p-6">
        <div>
          <h2 className="text-lg font-semibold text-slate-800">{localStorage.getItem('arlotech-login-mode') === 'blacksite' ? 'ASSEMBLE SINGLE TRANSMISSION' : 'Write a one-off email'}</h2>
          <p className="mt-1 text-sm text-slate-500">
            Enter any recipient and write your own message. It is sent through the same authenticated Resend function and recorded in your email history.
          </p>
        </div>
        {(suppressionError || sentHistoryError) && (
          <p className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700" role="alert">
            Manual sending is disabled until suppression and send history can be checked.
          </p>
        )}
        <label className="block space-y-1">
          <span className="text-sm font-medium text-slate-700">To</span>
          <input
            type="email"
            autoComplete="email"
            value={manualRecipient}
            onChange={(event) => {
              setManualRecipient(event.target.value)
              setManualSendResult(null)
            }}
            placeholder="recipient@example.com"
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-arlotech focus:outline-none focus:ring-2 focus:ring-arlotech/20"
          />
        </label>
        {manualRecipient.trim() && suppressedEmails.has(manualRecipient.trim().toLowerCase()) && (
          <p className="text-sm text-red-700">
            This address is on your suppression list and cannot be contacted.
          </p>
        )}
        {manualRecipient.trim() && manualRecipientDoNotContact && (
          <p className="text-sm text-red-700">This address belongs to a prospect marked Do Not Contact.</p>
        )}
        <label className="block space-y-1">
          <span className="text-sm font-medium text-slate-700">Subject</span>
          <input
            value={manualSubject}
            maxLength={200}
            onChange={(event) => setManualSubject(event.target.value)}
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-arlotech focus:outline-none focus:ring-2 focus:ring-arlotech/20"
          />
        </label>
        <label className="block space-y-1">
          <span className="text-sm font-medium text-slate-700">Message</span>
          <textarea
            value={manualBody}
            maxLength={12000}
            rows={7}
            onChange={(event) => setManualBody(event.target.value)}
            className="w-full resize-y rounded-lg border border-slate-300 px-3 py-2 text-sm leading-6 focus:border-arlotech focus:outline-none focus:ring-2 focus:ring-arlotech/20"
          />
        </label>
        <p className="text-xs text-slate-500">
          Sent outreach includes your configured postal address and a working unsubscribe link.
        </p>
        <label className="flex items-start gap-2 text-sm text-slate-600">
          <input
            type="checkbox"
            checked={manualComplianceConfirmed}
            onChange={(event) => setManualComplianceConfirmed(event.target.checked)}
            className="mt-1 h-4 w-4 shrink-0 accent-arlotech"
          />
          <span>I reviewed this recipient and have a lawful basis to contact them.</span>
        </label>
        {manualSendResult && (
          <p
            className={`rounded-lg p-3 text-sm ${
              manualSendResult.status === 'sent'
                ? 'bg-green-50 text-green-800'
                : 'bg-red-50 text-red-700'
            }`}
            role="status"
          >
            {manualSendResult.status === 'sent'
              ? `Sent to ${manualSendResult.recipient_email}.${manualSendResult.tracking_error ? ` History warning: ${manualSendResult.tracking_error}` : ''}`
              : manualSendResult.error || 'The email was not sent.'}
          </p>
        )}
        {manualRecipient.trim() && alreadyEmailedAddresses.has(manualRecipient.trim().toLowerCase()) && (
          <p className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm font-medium text-amber-900">
            Previously contacted: this address has received an email from your account. You can resend, but please review the message carefully.
          </p>
        )}
        <div className="flex justify-end">
          <Button
            disabled={
              manualSendMutation.isPending ||
              !manualRecipient.trim() ||
              !manualSubject.trim() ||
              !manualBody.trim() ||
              !manualComplianceConfirmed ||
              !!suppressionError ||
              !!sentHistoryError ||
              suppressedEmails.has(manualRecipient.trim().toLowerCase()) ||
              manualRecipientDoNotContact
            }
            onClick={() => {
              const normalizedRecipient = manualRecipient.trim().toLowerCase()
              if (alreadyEmailedAddresses.has(normalizedRecipient)) {
                const confirmed = window.confirm(
                  `You have emailed ${normalizedRecipient} before. Do you want to send this email again?`,
                )
                if (!confirmed) return
              }
              manualSendMutation.mutate()
            }}
          >
            <Send className="h-4 w-4" />
            {manualSendMutation.isPending ? 'Sending...' : 'Send email'}
          </Button>
        </div>
      </Card>

      <Card className="space-y-5 p-4 sm:p-6">
        <div>
          <h2 className="text-lg font-semibold text-slate-800">{localStorage.getItem('arlotech-login-mode') === 'blacksite' ? 'BATCH TRANSMISSION ASSEMBLY' : 'Outreach batch drafts'}</h2>
          <p className="mt-1 text-sm text-slate-500">
            Generate generic, non-personalized AI drafts, review or edit each one, and save it when ready. Generation never sends email. AI batches are limited to {MAX_AI_GENERATION_BATCH_SIZE} and 40 AI requests per rolling 24 hours; sending is processed in batches of {MAX_SEND_REQUEST_SIZE}, up to 50 per rolling 24 hours.
            A website link is required to associate a draft with a prospect. AI copy does not use recipient or audit details. Sending still requires an eligible recipient and a matching audit with actionable evidence.
          </p>
        </div>

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <label className="block space-y-1">
            <span className="text-sm font-medium text-slate-700">Generator</span>
            <select
              value={generatorMode}
              onChange={(event) => setGeneratorMode(event.target.value as 'ai' | 'local')}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
            >
              <option value="ai">AI generic outreach (recommended)</option>
              <option value="local">Rule-based fallback</option>
            </select>
            <span className="block text-xs text-slate-500">The fallback is manual selection only; AI failures are never silently replaced.</span>
          </label>
          {generatorMode === 'ai' ? (
            <label className="block space-y-1">
              <span className="text-sm font-medium text-slate-700">AI email approach</span>
              <select
                value={aiApproach}
                onChange={(event) => setAiApproach(event.target.value as AiEmailApproach)}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
              >
                {AI_EMAIL_APPROACHES.map((approach) => (
                  <option key={approach} value={approach}>
                    {{
                      professional: 'Professional',
                      friendly: 'Friendly',
                      audit_based: 'Website services',
                      value_first: 'Value-first',
                      short: 'Short',
                      website_redesign: 'Website redesign',
                    }[approach]}
                  </option>
                ))}
              </select>
            </label>
          ) : (
          <label className="block space-y-1">
            <span className="text-sm font-medium text-slate-700">Message type</span>
            <select
              value={generatorStrategy}
              onChange={(event) => setGeneratorStrategy(event.target.value as OutreachStrategy)}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
            >
              {OUTREACH_STRATEGIES.map((strategy) => (
                <option key={strategy} value={strategy}>{strategyLabels[strategy]}</option>
              ))}
            </select>
            <span className="block text-xs leading-5 text-slate-500">{strategyDescriptions[generatorStrategy]}</span>
          </label>
          )}
          <label className="block space-y-1">
            <span className="text-sm font-medium text-slate-700">Tone</span>
            <select
              value={generatorTone}
              onChange={(event) => setGeneratorTone(event.target.value as OutreachTone)}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
            >
              <option value="professional">Professional</option>
              <option value="friendly">Friendly</option>
              <option value="conversational">Conversational</option>
              <option value="consultative">Consultative</option>
              <option value="direct">Direct</option>
              <option value="premium">Premium corporate</option>
            </select>
          </label>
          <label className="block space-y-1">
            <span className="text-sm font-medium text-slate-700">Length</span>
            <select
              value={generatorLength}
              onChange={(event) => setGeneratorLength(event.target.value as OutreachLength)}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
            >
              <option value="short">Short</option>
              <option value="standard">Standard</option>
              <option value="detailed">Detailed</option>
            </select>
          </label>
          <label className="block space-y-1">
            <span className="text-sm font-medium text-slate-700">Follow-up</span>
            <select
              value={followUpStage}
              onChange={(event) => setFollowUpStage(event.target.value as FollowUpStage)}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
            >
              <option value="none">New outreach</option>
              <option value="first">First follow-up</option>
              <option value="second">Second follow-up</option>
              <option value="final">Final follow-up</option>
            </select>
            <span className="block text-xs text-slate-500">Follow-ups use the most recently sent email for each selected prospect.</span>
          </label>
          <label className="block space-y-1">
            <span className="text-sm font-medium text-slate-700">Campaign for saved drafts (optional)</span>
            <select
              value={outreachCampaignId}
              onChange={(event) => setOutreachCampaignId(event.target.value)}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
            >
              <option value="">No campaign</option>
              {campaignOptions.map((campaign) => <option key={campaign.id} value={campaign.id}>{campaign.name}</option>)}
            </select>
          </label>
        </div>
        <label className="block space-y-1">
          <span className="text-sm font-medium text-slate-700">Extra context or offer details (optional)</span>
          <textarea
            value={senderContext}
            onChange={(event) => setSenderContext(event.target.value)}
            rows={2}
            maxLength={600}
            placeholder="Add confirmed prices, offer details, or other relevant context."
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
          />
          <span className="text-xs text-slate-500">Only include details you can verify. The generator will not invent prices, timelines, or guarantees.</span>
        </label>
        <details className="rounded-lg border border-slate-200 p-3">
          <summary className="cursor-pointer text-sm font-medium text-slate-700">Email signature</summary>
          <p className="mt-2 text-xs text-slate-500">
            AI-generated signatures use your account profile name, email, and company. Profile email is not invented; update the profile if a detail is missing.
          </p>
          <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {([
              ['businessName', 'Business name'],
              ['senderName', 'Sender name'],
              ['jobTitle', 'Job title'],
              ['website', 'Website'],
              ['email', 'Business email'],
              ['phone', 'Telephone'],
              ['socialLinks', 'Social links (optional)'],
              ['location', 'Location'],
            ] as const).map(([key, label]) => (
              <label key={key} className="block space-y-1">
                <span className="text-xs font-medium text-slate-600">{label}</span>
                <input
                  value={effectiveSignature[key]}
                  onChange={(event) => updateSignature(key, event.target.value)}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                />
              </label>
            ))}
            <div className="sm:col-span-2 lg:col-span-3">
              <Button variant="secondary" size="sm" onClick={saveSignature}>Save signature on this device</Button>
            </div>
          </div>
        </details>

        {(outreachProspectsError || outreachAnalysesError || suppressionError || sentHistoryError) && (
          <p className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700" role="alert">
            Could not load outreach eligibility data. Sending is disabled until those records can be checked.
            {[outreachProspectsError, outreachAnalysesError, suppressionError, sentHistoryError]
              .filter((queryError): queryError is Error => queryError instanceof Error)
              .map((queryError) => queryError.message)
              .join(' ')}
          </p>
        )}

        {outreachProspectsLoading || outreachAnalysesLoading ? (
          <div className="h-24 animate-pulse rounded-lg bg-slate-100" />
        ) : (
          <div className="max-h-80 space-y-2 overflow-y-auto rounded-lg border border-slate-200 p-2">
            {emailOutreachProspectRows.map((prospect: OutreachProspect) => {
              const draftBlockReason = getDraftBlockReason(prospect)
              const sendBlockReason = getOutreachBlockReason(prospect)
              const selected = validSelectedOutreachIds.includes(prospect.id)
              return (
                <label
                  key={prospect.id}
                  className={`flex min-w-0 items-start gap-3 rounded-lg p-3 ${
                    draftBlockReason ? 'bg-slate-50 text-slate-400' : 'cursor-pointer hover:bg-slate-50'
                  }`}
                >
                  <input
                    type="checkbox"
                    className="mt-1 h-4 w-4 shrink-0 accent-arlotech"
                    checked={selected}
                    disabled={!!draftBlockReason}
                    onChange={() => {
                      clearProspectPrefill()
                      setOutreachPreviews([])
                      setOutreachResults([])
                      setSelectedOutreachIds((current) => {
                        const eligibleCurrent = current.filter((id) => {
                          const currentProspect = outreachProspectById.get(id)
                          return !!currentProspect && !getDraftBlockReason(currentProspect)
                        })
                        if (eligibleCurrent.includes(prospect.id)) return eligibleCurrent.filter((id) => id !== prospect.id)
                        if (eligibleCurrent.length >= MAX_OUTREACH_BATCH_SIZE) {
                          toast.error(`Select up to ${MAX_OUTREACH_BATCH_SIZE} prospects per batch.`)
                          return eligibleCurrent
                        }
                        return [...eligibleCurrent, prospect.id]
                      })
                    }}
                    aria-label={`Select ${prospect.business_name} for outreach`}
                  />
                  <span className="min-w-0 flex-1">
                    <span className="flex flex-wrap items-center gap-2 break-words text-sm font-medium text-slate-800">
                      {prospect.business_name}
                      {hasPreviousSend(prospect) && (
                        <span className="rounded-full border border-amber-300 bg-amber-100 px-2 py-0.5 text-[11px] font-semibold text-amber-900">
                          Previously contacted
                        </span>
                      )}
                    </span>
                    <span className="block break-all text-xs text-slate-500">{prospect.email || 'No email address'}</span>
                    <span className="mt-1 block text-xs text-slate-500">
                      {draftBlockReason
                        ? draftBlockReason
                        : sendBlockReason
                          ? `Draft can be created, but sending is blocked: ${sendBlockReason}`
                        : hasPreviousSend(prospect)
                          ? 'Review before sending again'
                          : 'Website link recorded'}
                    </span>
                  </span>
                </label>
              )
            })}
            {requestedProspectBlockReason && (
              <p role="alert" className="p-3 text-sm text-amber-700">
                Suggested prospect was not selected: {requestedProspectBlockReason}.
              </p>
            )}
            {emailOutreachProspectRows.length === 0 && (
              <p className="p-4 text-center text-sm text-slate-500">Add prospects with website links to prepare email drafts.</p>
            )}
          </div>
        )}

        <div className="flex flex-col-reverse gap-3 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-xs text-slate-500">{validSelectedOutreachIds.length} / {MAX_OUTREACH_BATCH_SIZE} selected</p>
          <Button
            variant="secondary"
            onClick={prepareOutreachPreviews}
            disabled={
              aiGenerating ||
              validSelectedOutreachIds.length === 0 ||
              outreachProspectsLoading ||
              !!outreachProspectsError
            }
          >
            <Sparkles className="h-4 w-4" /> {aiGenerating ? 'Generating drafts…' : 'Generate personalized emails'}
          </Button>
        </div>

        {outreachPreviews.length > 0 && (
          <div className="space-y-4 border-t border-slate-200 pt-4">
            <div>
              <h3 className="font-semibold text-slate-800">{localStorage.getItem('arlotech-login-mode') === 'blacksite' ? 'REVIEW PAYLOADS BEFORE DEPLOYMENT' : 'Review each generated email before sending'}</h3>
              <p className="mt-1 text-xs text-slate-500">
                These are unsent previews. Edits remain here until you save them as drafts or leave. Review recipient details and every claim; generation does not send anything.
              </p>
            </div>
            {outreachPreviews.map((preview: GeneratedOutreachPreview) => {
              const prospect = outreachProspectRows.find((item: OutreachProspect) => item.id === preview.prospect_id)
              if (!prospect) return null
              return (
                <article key={preview.prospect_id} className="space-y-3 rounded-lg border border-slate-200 p-3 sm:p-4">
                  <div className="flex min-w-0 items-start gap-2">
                    <Mail className="mt-0.5 h-4 w-4 shrink-0 text-arlotech" />
                    <div className="min-w-0">
                      <p className="break-words text-sm font-medium text-slate-800">{prospect.business_name}</p>
                      <p className="break-all text-xs text-slate-500">{prospect.email}</p>
                      {preview.aiApproach && (
                        <p className="mt-1 text-xs text-slate-600">
                          Generic AI outreach · {{
                            professional: 'professional',
                            friendly: 'friendly',
                            audit_based: 'website services',
                            value_first: 'value-first',
                            short: 'short',
                            website_redesign: 'website redesign',
                          }[preview.aiApproach]} style
                        </p>
                      )}
                      {preview.aiApproach && (
                        <p className="mt-1 break-words text-xs text-slate-600">
                          Sender identity: {preview.aiSenderName || 'No profile name set'} · {preview.aiSenderBusiness || 'ARLOTECH Digital Solutions'}
                          {preview.aiSenderEmail ? ` · ${preview.aiSenderEmail}` : ' · No profile email available'}
                        </p>
                      )}
                      {hasPreviousSend(prospect) && (
                        <p className="mt-1 inline-block rounded-full border border-amber-300 bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-900">
                          Previously contacted — resend confirmation required
                        </p>
                      )}
                      {preview.has_website_report && (
                        <p className="mt-1 text-xs text-green-700">The matching website review PDF will be attached.</p>
                      )}
                      {preview.has_website_report && (
                        <p className="mt-1 text-xs font-medium text-slate-600">
                          Suitability: {preview.suitability} · Finding: {preview.selected_finding?.title}
                        </p>
                      )}
                    </div>
                  </div>
                  {preview.internal_note && (
                    <p className="rounded bg-slate-50 p-2 text-xs text-slate-600">
                      Internal note (not sent): {preview.internal_note}
                    </p>
                  )}
                  <label className="block space-y-1">
                    <span className="text-xs font-medium text-slate-600">Subject</span>
                    <input
                      value={preview.subject}
                      maxLength={200}
                      onChange={(event) => {
                        setComplianceConfirmed(false)
                        setOutreachPreviews((current) =>
                          current.map((item) =>
                            item.prospect_id === preview.prospect_id
                              ? { ...item, subject: event.target.value }
                              : item,
                          ),
                        )
                      }}
                      className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-arlotech focus:outline-none focus:ring-2 focus:ring-arlotech/20"
                    />
                  </label>
                  {preview.aiApproach && (
                    <div className="space-y-2">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-xs font-medium text-slate-600">Subject suggestions:</span>
                        {preview.generatedDraft.subjectSuggestions.map((suggestion, index) => (
                          <button
                            key={`${preview.prospect_id}-subject-${index}`}
                            type="button"
                            onClick={() => {
                              setComplianceConfirmed(false)
                              setOutreachPreviews((current) => current.map((item) =>
                                item.prospect_id === preview.prospect_id ? { ...item, subject: suggestion } : item,
                              ))
                            }}
                            className="rounded-full border border-slate-300 px-2 py-1 text-left text-xs text-slate-700 hover:border-arlotech"
                          >
                            {suggestion}
                          </button>
                        ))}
                        <Button
                          variant="secondary"
                          size="sm"
                          onClick={() => regenerateAiSubjects(preview)}
                          disabled={aiActionId === preview.prospect_id}
                        >
                          {aiActionId === preview.prospect_id ? 'Working…' : 'Regenerate subjects'}
                        </Button>
                      </div>
                      {preview.generatedDraft.observationsUsed.length > 0 && (
                        <p className="text-xs text-slate-600">
                          Audit evidence used: {preview.generatedDraft.observationsUsed.join(' · ')}
                        </p>
                      )}
                      {!!preview.aiWebsiteContext?.length && (
                        <div className="text-xs text-slate-600">
                          Website context used:{' '}
                          {preview.aiWebsiteContext.map((page, index) => (
                            <span key={page.id}>
                              {index > 0 ? ' · ' : ''}
                              <a
                                href={page.source_url}
                                target="_blank"
                                rel="noreferrer"
                                className="text-arlotech underline underline-offset-2"
                                title={page.title || page.source_url}
                              >
                                {page.source_label}
                              </a>
                            </span>
                          ))}
                        </div>
                      )}
                      {preview.aiRecommendedCallToAction && (
                        <p className="text-xs text-slate-600">
                          Suggested call to action: {preview.aiRecommendedCallToAction}
                        </p>
                      )}
                    </div>
                  )}
                  <label className="block space-y-1">
                    <span className="text-xs font-medium text-slate-600">Message</span>
                    <textarea
                      value={preview.body}
                      maxLength={12000}
                      disabled={aiActionId === preview.prospect_id}
                      onSelect={(event) => {
                        const { selectionStart, selectionEnd } = event.currentTarget
                        setSelectedEmailRanges((current) => ({
                          ...current,
                          [preview.prospect_id]: { start: selectionStart, end: selectionEnd },
                        }))
                      }}
                      onChange={(event) => {
                        setComplianceConfirmed(false)
                        setOutreachPreviews((current) =>
                          current.map((item) =>
                            item.prospect_id === preview.prospect_id
                              ? {
                                ...item,
                                body: event.target.value,
                                generatedDraft: {
                                  ...item.generatedDraft,
                                  body: event.target.value,
                                  wordCount: event.target.value.trim().split(/\s+/).filter(Boolean).length,
                                },
                              }
                              : item,
                          ),
                        )
                      }}
                      rows={8}
                      className="w-full resize-y rounded-lg border border-slate-300 px-3 py-2 text-sm leading-6 focus:border-arlotech focus:outline-none focus:ring-2 focus:ring-arlotech/20 disabled:bg-slate-50"
                    />
                  </label>
                  {preview.aiApproach && (
                    <>
                      <div className="flex flex-wrap gap-2">
                        {([
                          ['shorten', 'Make shorter'],
                          ['formal', 'More formal'],
                          ['friendly', 'Friendlier'],
                          ['persuasive', 'More persuasive'],
                          ['change_cta', 'Change call to action'],
                          ['rewrite_selection', 'Rewrite selected text'],
                        ] as const).map(([action, label]) => (
                          <Button
                            key={action}
                            variant="secondary"
                            size="sm"
                            onClick={() => rewriteAiPreview(preview, action)}
                            disabled={aiActionId === preview.prospect_id}
                          >
                            {label}
                          </Button>
                        ))}
                        <Button
                          variant="secondary"
                          size="sm"
                          onClick={() => generateAnotherAiVersion(preview)}
                          disabled={aiActionId === preview.prospect_id}
                        >
                          Generate another version
                        </Button>
                      </div>
                      <div className="space-y-3 rounded-lg border border-slate-200 bg-slate-50 p-3">
                        <div>
                          <h4 className="text-sm font-semibold text-slate-800">Chat with AI to edit this draft</h4>
                          <p className="mt-1 text-xs text-slate-500">
                            Ask for changes in plain language. The AI keeps the generic, “we” voice and only mentions a PDF when one is available to attach.
                          </p>
                        </div>
                        {!!preview.aiChatMessages?.length && (
                          <div className="max-h-48 space-y-2 overflow-y-auto" role="log" aria-live="polite">
                            {preview.aiChatMessages.map((message, index) => (
                              <div
                                key={`${preview.prospect_id}-chat-${index}`}
                                className={`max-w-[90%] rounded-lg px-3 py-2 text-sm ${
                                  message.role === 'user'
                                    ? 'ml-auto bg-arlotech text-white'
                                    : 'bg-white text-slate-700 ring-1 ring-slate-200'
                                }`}
                              >
                                <span className="mb-1 block text-[10px] font-semibold uppercase tracking-wide opacity-75">
                                  {message.role === 'user' ? 'You' : 'AI draft assistant'}
                                </span>
                                {message.content}
                              </div>
                            ))}
                          </div>
                        )}
                        <label className="block space-y-1">
                          <span className="text-xs font-medium text-slate-700">Your instruction</span>
                          <textarea
                            value={aiChatInputs[preview.prospect_id] || ''}
                            maxLength={1000}
                            rows={2}
                            disabled={aiActionId === preview.prospect_id}
                            onChange={(event) => setAiChatInputs((current) => ({
                              ...current,
                              [preview.prospect_id]: event.target.value,
                            }))}
                            placeholder="For example: Make the value proposition more practical and soften the final question."
                            className="w-full resize-y rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm focus:border-arlotech focus:outline-none focus:ring-2 focus:ring-arlotech/20 disabled:bg-slate-100"
                          />
                        </label>
                        <div className="flex items-center justify-between gap-3">
                          <span className="text-xs text-slate-500">
                            {(aiChatInputs[preview.prospect_id] || '').length}/1000
                          </span>
                          <Button
                            variant="secondary"
                            size="sm"
                            onClick={() => customizeAiPreview(preview)}
                            disabled={aiActionId === preview.prospect_id || !(aiChatInputs[preview.prospect_id] || '').trim()}
                          >
                            <Send className="h-3.5 w-3.5" />
                            {aiActionId === preview.prospect_id ? 'Updating…' : 'Ask AI to update'}
                          </Button>
                        </div>
                      </div>
                    </>
                  )}
                  <div className="flex flex-wrap justify-end gap-2">
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={async () => {
                        try {
                          await navigator.clipboard.writeText(`Subject: ${preview.subject}\n\n${preview.body}`)
                          toast.success('Email copied.')
                        } catch (copyError) {
                          toast.error(copyError instanceof Error ? `Could not copy email: ${copyError.message}` : 'Could not copy email.')
                        }
                      }}
                    >
                      <Copy className="h-3.5 w-3.5" /> Copy
                    </Button>
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={() => savePreviewDraftMutation.mutate(preview)}
                      disabled={savePreviewDraftMutation.isPending || !preview.subject.trim() || !preview.body.trim()}
                    >
                      {savePreviewDraftMutation.isPending
                        ? 'Saving…'
                        : preview.savedDraftId ? 'Save draft changes' : 'Save as draft'}
                    </Button>
                  </div>
                </article>
              )
            })}

            <label className="flex items-start gap-2 text-sm text-slate-700">
              <input
                type="checkbox"
                checked={complianceConfirmed}
                onChange={(event) => setComplianceConfirmed(event.target.checked)}
                className="mt-1 h-4 w-4 shrink-0 accent-arlotech"
              />
              <span>
                I reviewed these messages and confirm I have a lawful basis to contact each recipient, will identify my business,
                and will honour any opt-out request.
              </span>
            </label>
            <p className="text-xs text-amber-800">
              Small reviewed batches help reduce risk but cannot guarantee delivery to the inbox. Previously contacted recipients are labeled and require confirmation. Do Not Contact and suppressed recipients remain excluded.
            </p>
            <div className="flex justify-end">
              <Button
                onClick={() => {
                  if (outreachPreviews.some((preview) => !preview.subject.trim() || !preview.body.trim())) {
                    toast.error('Every message needs a subject and body.')
                    return
                  }
                  const previouslyContacted = outreachPreviews.flatMap((preview) => {
                    const prospect = outreachProspectRows.find((item) => item.id === preview.prospect_id)
                    return prospect && hasPreviousSend(prospect) ? [`${prospect.business_name} (${prospect.email})`] : []
                  })
                  const warning = previouslyContacted.length
                    ? `\n\nPreviously contacted:\n${previouslyContacted.join('\n')}\n\nDo you want to resend to these recipients?`
                    : ''
                  if (window.confirm(`Send these ${outreachPreviews.length} individual emails now?${warning}`)) {
                    sendOutreachMutation.mutate()
                  }
                }}
                disabled={
                  !complianceConfirmed ||
                  sendOutreachMutation.isPending ||
                  !!outreachProspectsError ||
                  !!outreachAnalysesError ||
                  !!suppressionError ||
                  !!sentHistoryError
                }
              >
                {sendOutreachMutation.isPending ? (
                  <>Sending…</>
                ) : (
                  <>
                    <Send className="h-4 w-4" /> Send {outreachPreviews.length} individual emails
                  </>
                )}
              </Button>
            </div>
          </div>
        )}

        {outreachResults.length > 0 && (
          <div className="space-y-2 border-t border-slate-200 pt-4" role="status">
            <h3 className="font-semibold text-slate-800">{localStorage.getItem('arlotech-login-mode') === 'blacksite' ? 'DEPLOYMENT RESULTS' : 'Batch results'}</h3>
            {outreachResults.map((result) => (
              <p key={result.prospect_id} className="flex items-start gap-2 text-sm">
                {result.status === 'sent' ? (
                  <Check className="mt-0.5 h-4 w-4 shrink-0 text-green-600" />
                ) : (
                  <X className="mt-0.5 h-4 w-4 shrink-0 text-red-600" />
                )}
                <span className="break-words">
                  <strong>{result.business_name}:</strong>{' '}
                  {result.status === 'sent' ? 'Sent' : `${result.status} — ${result.error || 'Unknown error'}`}
                  {result.tracking_error ? ` (sent, but tracking needs attention: ${result.tracking_error})` : ''}
                </span>
              </p>
            ))}
          </div>
        )}
      </Card>

      {showForm && (
        <Card className="space-y-4 p-6">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold text-slate-800">{editingDraft ? 'Edit Draft' : 'New Draft'}</h2>
            <button type="button" onClick={closeForm} aria-label="Close draft form" className="p-1 text-slate-500 hover:text-slate-700">
              <X className="h-5 w-5" />
            </button>
          </div>
          {(campaignsError || prospectsError) && (
            <p className="text-sm text-red-600">
              Could not load {campaignsError && prospectsError ? 'campaign and prospect options' : campaignsError ? 'campaign options' : 'prospect options'}.
              {campaignsError instanceof Error ? ` ${campaignsError.message}` : ''}
              {prospectsError instanceof Error ? ` ${prospectsError.message}` : ''}
            </p>
          )}
          <div className="space-y-1">
            <label htmlFor="draft-subject" className="block text-sm font-medium text-slate-700">Subject</label>
            <input id="draft-subject" value={subject} onChange={(event) => setSubject(event.target.value)} className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-arlotech focus:outline-none focus:ring-2 focus:ring-arlotech/20" />
          </div>
          <Textarea label="Body" value={body} onChange={setBody} rows={6} />
          <div className="rounded-lg border border-slate-200 bg-slate-50 p-3"><div className="flex items-center justify-between"><p className="text-sm font-semibold text-slate-800">Email quality check</p><span className="text-sm font-bold text-slate-700">{draftQuality.score}/100</span></div><div className="mt-2 h-2 overflow-hidden rounded-full bg-slate-200"><div className="h-full rounded-full bg-arlotech" style={{ width: `${draftQuality.score}%` }} /></div><div className="mt-2 grid gap-1 sm:grid-cols-2">{draftQuality.checks.map(check => <p key={check.label} className={`text-xs ${check.pass ? 'text-emerald-700' : check.severity === 'error' ? 'text-red-700' : 'text-amber-700'}`}>{check.pass ? '✓' : '•'} {check.label === 'No recent duplicate' ? 'No previous send to this address' : check.label}</p>)}</div><p className="mt-2 text-[11px] text-slate-500">Advisory checks only. Review the recipient, conversation history, consent and claims before sending.</p></div>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <div className="space-y-1">
              <label htmlFor="draft-campaign" className="block text-sm font-medium text-slate-700">Campaign (optional)</label>
              <select id="draft-campaign" value={campaignId} onChange={(event) => setCampaignId(event.target.value)} className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm">
                <option value="">No campaign</option>
                {campaignOptions.map((campaign) => <option key={campaign.id} value={campaign.id}>{campaign.name}</option>)}
              </select>
            </div>
            <div className="space-y-1">
              <label htmlFor="draft-prospect" className="block text-sm font-medium text-slate-700">Prospect (optional)</label>
              <select id="draft-prospect" value={prospectId} onChange={(event) => {
                setProspectId(event.target.value)
                setDraftAnalysisId('')
              }} className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm">
                <option value="">No prospect</option>
                {prospectOptions.map((prospect) => <option key={prospect.id} value={prospect.id}>{prospect.business_name}</option>)}
              </select>
            </div>
            <div className="space-y-1">
              <label htmlFor="draft-analysis" className="block text-sm font-medium text-slate-700">Website audit (optional)</label>
              <select id="draft-analysis" value={draftAnalysisId} onChange={(event) => setDraftAnalysisId(event.target.value)} className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" disabled={!prospectId}>
                <option value="">No linked audit</option>
                {draftAnalysisOptions.map((analysis) => (
                  <option key={analysis.id} value={analysis.id}>
                    {analysis.website_url} · {analysis.analyzed_at ? new Date(analysis.analyzed_at).toLocaleDateString() : 'Date unavailable'}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={closeForm}>Cancel</Button>
            <Button onClick={() => saveMutation.mutate()} disabled={saveMutation.isPending || !subject.trim() || !body.trim()}>
              {saveMutation.isPending ? 'Saving...' : 'Save Draft'}
            </Button>
          </div>
        </Card>
      )}

      <Card className="grid gap-3 p-4 sm:grid-cols-2 lg:grid-cols-4">
        <label className="space-y-1">
          <span className="text-xs font-medium text-slate-600">Search drafts</span>
          <input
            type="search"
            value={draftSearch}
            onChange={(event) => setDraftSearch(event.target.value)}
            placeholder="Subject, message, or prospect"
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
          />
        </label>
        <label className="space-y-1">
          <span className="text-xs font-medium text-slate-600">Status</span>
          <select value={draftStatusFilter} onChange={(event) => setDraftStatusFilter(event.target.value)} className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm">
            <option value="all">All statuses</option>
            <option value="draft">Draft</option>
            <option value="ready_for_review">Ready for Review</option>
            <option value="approved">Approved</option>
            <option value="sent">Sent</option>
          </select>
        </label>
        <label className="space-y-1">
          <span className="text-xs font-medium text-slate-600">Prospect</span>
          <select value={draftProspectFilter} onChange={(event) => setDraftProspectFilter(event.target.value)} className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm">
            <option value="all">All prospects</option>
            {outreachProspectRows.map((prospect) => <option key={prospect.id} value={prospect.id}>{prospect.business_name}</option>)}
          </select>
        </label>
        <label className="space-y-1">
          <span className="text-xs font-medium text-slate-600">Campaign</span>
          <select value={draftCampaignFilter} onChange={(event) => setDraftCampaignFilter(event.target.value)} className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm">
            <option value="all">All campaigns</option>
            <option value="">No campaign</option>
            {campaignOptions.map((campaign) => <option key={campaign.id} value={campaign.id}>{campaign.name}</option>)}
          </select>
        </label>
      </Card>

      <div className="space-y-3">
        {filteredDraftRows.map((draft) => {
          const draftProspect = outreachProspectRows.find((prospect) => prospect.id === draft.prospect_id)
          const draftCampaign = campaignOptions.find((campaign) => campaign.id === draft.campaign_id)
          const draftAnalysis = outreachAnalysisRows.find((analysis) => analysis.id === draft.website_analysis_id)
          return (
          <Card key={draft.id} className="p-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0 flex-1">
                <p className="font-medium text-slate-800">{draft.subject}</p>
                <p className="mt-1 whitespace-pre-wrap text-sm text-slate-500 line-clamp-3">{draft.body}</p>
                <p className="mt-2 text-xs text-slate-400">
                  {draft.status.replaceAll('_', ' ')} · Created {draft.created_at ? new Date(draft.created_at).toLocaleDateString() : 'date unavailable'}
                  {draft.updated_at ? ` · Updated ${new Date(draft.updated_at).toLocaleDateString()}` : ''}
                </p>
                <p className="mt-1 break-words text-xs text-slate-500">
                  {draftProspect ? `Prospect: ${draftProspect.business_name}` : 'No prospect linked'}
                  {draftCampaign ? ` · Campaign: ${draftCampaign.name}` : ''}
                  {draft.website_analysis_id ? ` · Audit: ${draftAnalysis?.website_url || 'linked audit'}` : ''}
                </p>
              </div>
              <div className="flex gap-2">
                <select
                  aria-label={`Status for ${draft.subject}`}
                  value={draft.status}
                  onChange={(event) => {
                    if (event.target.value === 'sent') return
                    updateDraftStatusMutation.mutate({
                      draft,
                      status: event.target.value as 'draft' | 'ready_for_review' | 'approved',
                    })
                  }}
                  className="rounded-lg border border-slate-300 px-2 py-1 text-xs"
                  disabled={updateDraftStatusMutation.isPending || draft.status === 'sent'}
                >
                  <option value="draft">Draft</option>
                  <option value="ready_for_review">Ready for Review</option>
                  <option value="approved">Approved</option>
                  {draft.status === 'sent' && <option value="sent">Sent</option>}
                </select>
                <Button variant="secondary" size="sm" onClick={() => openEditForm(draft)}>
                  <Pencil className="h-3.5 w-3.5" /> Edit
                </Button>
                <Button variant="secondary" size="sm" onClick={() => duplicateDraft(draft)}>
                  <Copy className="h-3.5 w-3.5" /> Duplicate
                </Button>
                <Button
                  variant="danger"
                  size="sm"
                  disabled={deleteMutation.isPending}
                  onClick={() => {
                    if (window.confirm(`Delete draft "${draft.subject}"?`)) deleteMutation.mutate(draft)
                  }}
                >
                  <Trash2 className="h-3.5 w-3.5" /> Delete
                </Button>
              </div>
            </div>
          </Card>
          )
        })}
        {draftRows.length === 0 && (
          <Card className="p-6 text-center text-sm text-slate-500">No drafts yet. Create a draft to get started.</Card>
        )}
        {draftRows.length > 0 && filteredDraftRows.length === 0 && (
          <Card className="p-6 text-center text-sm text-slate-500">No drafts match the selected search and filters.</Card>
        )}
      </div>
    </div>
  )
}
