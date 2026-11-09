import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Check, Copy, Mail, Pencil, Plus, Send, Sparkles, Trash2, X } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { Textarea } from '@/components/ui/Textarea'
import { getCurrentUserId, supabase } from '@/lib/supabase'
import { createWebsiteAnalysisPdfBase64 } from '@/lib/exportPdf'
import {
  createOutreachPreview,
  getOutreachSuitability,
  hasMatchingWebsiteAnalysis,
  validateOutreachPreview,
  type OutreachPreview,
} from '@/lib/outreachEmail'
import {
  generateFollowUpDraft,
  generateProfessionalEmailDraft,
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
import { assessEmailQuality, isSuppressedProspectStatus, recommendNextOutreachAction } from '@/lib/growthIntelligence'

const MAX_OUTREACH_BATCH_SIZE = 10
const SIGNATURE_STORAGE_KEY = 'arlotech-email-signature'

const strategyLabels: Record<OutreachStrategy, string> = {
  general_review: 'General website review',
  technical_improvement: 'Technical improvement',
  website_redesign: 'Website redesign',
  business_growth: 'Business growth',
  personal_consultancy: 'Personal consultancy',
  cold_outreach: 'Cold introduction',
  no_website: 'Business without a website',
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
  no_website: 'For businesses with no website recorded. The wording stays cautious because a listing may be incomplete.',
  seo_performance: 'Discuss measured search and performance results, or offer a review when no audit exists.',
  interested_response: 'Reply after a prospect has expressed interest. Confirm the actual conversation before sending.',
  pricing_response: 'Answer a pricing question without inventing a price. Add your confirmed offer details below.',
  meeting_request: 'Turn an interested conversation into a short discovery call without inventing availability.',
}

function readSignature(): OutreachSignature {
  const saved = localStorage.getItem(SIGNATURE_STORAGE_KEY)
  if (!saved) {
    return {
      businessName: 'Arlotech Digital Solutions',
      senderName: '',
      jobTitle: '',
      website: '',
      email: '',
      phone: '',
      socialLinks: '',
    }
  }
  try {
    const parsed = JSON.parse(saved) as Partial<OutreachSignature>
    return {
      businessName: parsed.businessName || 'Arlotech Digital Solutions',
      senderName: parsed.senderName || '',
      jobTitle: parsed.jobTitle || '',
      website: parsed.website || '',
      email: parsed.email || '',
      phone: parsed.phone || '',
      socialLinks: parsed.socialLinks || '',
    }
  } catch {
    return {
      businessName: 'Arlotech Digital Solutions',
      senderName: '',
      jobTitle: '',
      website: '',
      email: '',
      phone: '',
      socialLinks: '',
    }
  }
}

type OutreachProspect = Pick<
  Prospect,
  'id' | 'business_name' | 'business_name_verified' | 'contact_name' | 'email' | 'website' | 'business_category' | 'do_not_contact'
  | 'city' | 'status'
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

interface SentOutreachContext {
  id: string
  direction: string
  status: string
  prospect_id: string | null
  recipient_email: string | null
  subject: string
  body: string
  created_at: string | null
  sent_at?: string | null
  received_at?: string | null
  recent_for_resend_check?: boolean
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

async function imageBlobToDataUrl(blob: Blob): Promise<string> {
  const bitmap = await createImageBitmap(blob)
  try {
    const canvas = document.createElement('canvas')
    canvas.width = bitmap.width
    canvas.height = bitmap.height
    const context = canvas.getContext('2d')
    if (!context) throw new Error('Could not prepare screenshot for the PDF.')
    context.drawImage(bitmap, 0, 0)
    return canvas.toDataURL('image/jpeg', 0.86)
  } finally {
    bitmap.close()
  }
}

async function createAuditPdfAttachment(
  analysis: WebsiteAnalysis,
  prospect: OutreachProspect,
) {
  const visualAudit = (analysis.ai_analysis as Record<string, any> | null)?.visual_audit
  const pages = Array.isArray(visualAudit?.pages) ? visualAudit.pages : []
  const screenshotImages: Record<string, string> = {}
  await Promise.all(pages.filter((page: any) => typeof page.image_path === 'string').map(async (page: any) => {
    try {
      const { data, error } = await supabase.storage
        .from('website-audit-screenshots')
        .createSignedUrl(page.image_path, 300)
      if (error || !data?.signedUrl) return
      const response = await fetch(data.signedUrl)
      if (!response.ok) return
      screenshotImages[page.image_path] = await imageBlobToDataUrl(await response.blob())
    } catch {
      // The PDF remains useful without a screenshot if storage access is unavailable.
    }
  }))
  return createWebsiteAnalysisPdfBase64(analysis, {
    businessName: prospect.business_name,
    verified: prospect.business_name_verified,
  }, screenshotImages)
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

export function EmailDraftsPage() {
  const queryClient = useQueryClient()
  const [showForm, setShowForm] = useState(false)
  const [editingDraft, setEditingDraft] = useState<EmailDraft | null>(null)
  const [subject, setSubject] = useState('')
  const [body, setBody] = useState('')
  const [manualRecipient, setManualRecipient] = useState('')
  const [manualSubject, setManualSubject] = useState('')
  const [manualBody, setManualBody] = useState('')
  const [manualComplianceConfirmed, setManualComplianceConfirmed] = useState(false)
  const [manualSendResult, setManualSendResult] = useState<OutreachSendResult | null>(null)
  const [campaignId, setCampaignId] = useState('')
  const [outreachCampaignId, setOutreachCampaignId] = useState('')
  const [prospectId, setProspectId] = useState('')
  const [selectedOutreachIds, setSelectedOutreachIds] = useState<string[]>([])
  const [outreachPreviews, setOutreachPreviews] = useState<OutreachPreview[]>([])
  const [outreachBatchId, setOutreachBatchId] = useState('')
  const [complianceConfirmed, setComplianceConfirmed] = useState(false)
  const [outreachResults, setOutreachResults] = useState<OutreachSendResult[]>([])
  const [generatorProspectId, setGeneratorProspectId] = useState('')
  const [generatorCampaignId, setGeneratorCampaignId] = useState('')
  const [generatorStrategy, setGeneratorStrategy] = useState<OutreachStrategy>('general_review')
  const [generatorTone, setGeneratorTone] = useState<OutreachTone>('professional')
  const [generatorLength, setGeneratorLength] = useState<OutreachLength>('standard')
  const [senderContext, setSenderContext] = useState('')
  const [includeReportReference, setIncludeReportReference] = useState(false)
  const [followUpStage, setFollowUpStage] = useState<FollowUpStage>('none')
  const [followUpMessageId, setFollowUpMessageId] = useState('')
  const [generatedDraft, setGeneratedDraft] = useState<GeneratedEmailDraft | null>(null)
  const [generatedSubject, setGeneratedSubject] = useState('')
  const [generatedBody, setGeneratedBody] = useState('')
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
        .select('id, name, status')
        .eq('user_id', userId)
        .order('name')
      if (error) throw error
      return data as Pick<Campaign, 'id' | 'name' | 'status'>[]
    },
  })

  const { data: prospects = [], error: prospectsError } = useQuery({
    queryKey: ['/prospects', 'draft-options'],
    queryFn: async () => {
      const userId = await getCurrentUserId()
      const { data, error } = await supabase
        .from('prospects')
        .select('id, business_name')
        .eq('user_id', userId)
        .order('business_name')
      if (error) throw error
      return data as Pick<Prospect, 'id' | 'business_name'>[]
    },
  })

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
        .select('id, business_name, business_name_verified, contact_name, email, website, business_category, do_not_contact, city, status')
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

  const { data: suppressedRows = [], error: suppressionError } = useQuery<Array<{ normalized_email: string }>>({
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

  const { data: previouslySentRows = [], error: sentHistoryError } = useQuery<SentOutreachContext[]>({
    queryKey: ['/email-messages', 'outreach-sent'],
    queryFn: async () => {
      const userId = await getCurrentUserId()
      const { data, error } = await supabase
        .from('email_messages')
        .select('id, direction, status, prospect_id, recipient_email, subject, body, created_at, sent_at, received_at')
        .eq('user_id', userId)
      if (error) throw error
      const recentCutoff = Date.now() - 30 * 24 * 60 * 60 * 1000
      return (data as SentOutreachContext[]).map((message) => ({
        ...message,
        recent_for_resend_check: !!message.sent_at && Date.parse(message.sent_at) >= recentCutoff,
      }))
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
  const outreachAnalysisRows = outreachAnalyses as WebsiteAnalysis[]
  const suppressedEmailRows = suppressedRows as Array<{ normalized_email: string }>
  const sentEmailRows = previouslySentRows as SentOutreachContext[]
  const outboundHistoryRows = sentEmailRows.filter((row) => row.direction === 'outbound' && !!row.sent_at)
  const inboundHistoryRows = sentEmailRows.filter((row) => row.direction === 'inbound')
  const previouslySentProspectRows = outboundHistoryRows
  const sentRecipientRows = outboundHistoryRows
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
      (prospect.do_not_contact || isSuppressedProspectStatus(prospect.status)) &&
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
  const originalFollowUpMessage = outboundHistoryRows.find((message) => message.id === followUpMessageId)
  const latestFollowUpMessage = selectedGeneratorProspect
    ? outboundHistoryRows.filter((message) => message.prospect_id === selectedGeneratorProspect.id).sort((left, right) =>
        new Date(right.sent_at || right.created_at || 0).getTime() - new Date(left.sent_at || left.created_at || 0).getTime(),
      )[0]
    : undefined
  const selectedInboundReply = selectedGeneratorProspect
    ? inboundHistoryRows.filter((message) => message.prospect_id === selectedGeneratorProspect.id).sort((left, right) =>
        new Date(right.received_at || right.created_at || 0).getTime() - new Date(left.received_at || left.created_at || 0).getTime(),
      )[0]
    : undefined
  const followUpDecision = selectedGeneratorProspect
    ? recommendNextOutreachAction({
        status: selectedGeneratorProspect.status,
        do_not_contact: selectedGeneratorProspect.do_not_contact,
        latestInbound: selectedInboundReply?.body,
        latestOutboundAt: latestFollowUpMessage?.sent_at,
        bounced: latestFollowUpMessage?.status === 'bounced',
        complained: latestFollowUpMessage?.status === 'complained',
        suppressed: latestFollowUpMessage?.status === 'suppressed',
        failed: latestFollowUpMessage?.status === 'failed',
      })
    : null
  const followUpBlockReason = followUpStage === 'none' || !selectedGeneratorProspect
    ? null
    : selectedGeneratorProspect.do_not_contact || isSuppressedProspectStatus(selectedGeneratorProspect.status)
      ? 'This prospect is suppressed or in a terminal status.'
      : selectedInboundReply
        ? `A reply is recorded. ${followUpDecision?.reason || 'Prepare a personal response rather than a staged follow-up.'}`
        : followUpDecision && !followUpDecision.safeToDraft
          ? `${followUpDecision.action}: ${followUpDecision.reason}`
          : null
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
  const selectedManualProspect = outreachProspectRows.find((prospect) => prospect.id === prospectId)
  const draftQuality = assessEmailQuality({
    subject,
    body,
    businessName: selectedManualProspect?.business_name,
    recipient: selectedManualProspect?.email || manualRecipient,
    doNotContact: selectedManualProspect?.do_not_contact || manualRecipientDoNotContact,
    duplicateRecently: Boolean((selectedManualProspect?.email || manualRecipient) && sentRecipientRows.some(row =>
      row.recipient_email?.toLowerCase() === (selectedManualProspect?.email || manualRecipient).toLowerCase() &&
      row.recent_for_resend_check,
    )),
  })

  const getOutreachBlockReason = (prospect: OutreachProspect) => {
    if (!prospect.email?.trim()) return 'No email address'
    if (prospect.do_not_contact || isSuppressedProspectStatus(prospect.status)) return 'Do not contact or terminal status'
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

  const hasPreviousSend = (prospect: OutreachProspect) =>
    alreadyEmailedProspects.has(prospect.id) ||
    (!!prospect.email && alreadyEmailedAddresses.has(prospect.email.trim().toLowerCase()))

  const prepareOutreachPreviews = () => {
    const selectedProspects = outreachProspectRows.filter((prospect: OutreachProspect) =>
      selectedOutreachIds.includes(prospect.id),
    )
    if (selectedProspects.length === 0) {
      toast.error('Select at least one eligible prospect.')
      return
    }
    if (selectedProspects.length > MAX_OUTREACH_BATCH_SIZE) {
      toast.error(`Send up to ${MAX_OUTREACH_BATCH_SIZE} prospects per batch.`)
      return
    }
    const blockedProspects = selectedProspects.filter(getOutreachBlockReason)
    if (blockedProspects.length > 0) {
      toast.error('Remove ineligible prospects before preparing the batch.')
      return
    }
    try {
      const previews = selectedProspects.map((prospect: OutreachProspect) =>
        createOutreachPreview(prospect, analysisByProspect.get(prospect.id)),
      )
      setOutreachPreviews(previews)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not prepare outreach previews.')
      return
    }
    setOutreachResults([])
    setOutreachBatchId(crypto.randomUUID())
    setComplianceConfirmed(false)
  }

  const sendOutreachMutation = useMutation({
    mutationFn: async (resendConfirmed: boolean) => {
      const emailPayload = await Promise.all(outreachPreviews.map(async (preview: OutreachPreview) => {
        const prospect = outreachProspectRows.find((item: OutreachProspect) => item.id === preview.prospect_id)
        if (!prospect) throw new Error('A selected prospect is no longer available.')
        const analysis = analysisByProspect.get(prospect.id)
        validateOutreachPreview(preview, prospect, analysis)
        const safeFilename = prospect.business_name
          .replace(/[^a-z0-9-]/gi, '-')
          .replace(/^-+|-+$/g, '')
          .slice(0, 60)
          .toLowerCase() || 'prospect'
        const attachmentContent = preview.has_website_report && analysis
          ? await createAuditPdfAttachment(analysis, prospect)
          : null
        return {
          prospect_id: prospect.id,
          campaign_id: outreachCampaignId || null,
          subject: preview.subject,
          body: preview.body,
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
      const { data, error } = await functionClient.functions.invoke('send-outreach', {
        body: { batchId: outreachBatchId, emails: emailPayload, complianceConfirmed, resendConfirmed },
      })
      if (error) throw new Error(await getOutreachFunctionError(error))
      if (!isSendOutreachResponse(data)) {
        const message = data && typeof data === 'object' && 'error' in data && typeof data.error === 'string'
          ? data.error
          : 'The send function returned an invalid response.'
        throw new Error(message)
      }
      return data
    },
    onSuccess: async (data: SendOutreachResponse) => {
      setOutreachResults(data.results)
      const sentCount = data.results.filter((result: OutreachSendResult) => result.status === 'sent').length
      const failedCount = data.results.length - sentCount
      if (failedCount > 0) toast.error(`Sent ${sentCount}; ${failedCount} were skipped or failed.`)
      else toast.success(`Sent ${sentCount} personalized email${sentCount === 1 ? '' : 's'}.`)
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['/email-messages'] }),
        queryClient.invalidateQueries({ queryKey: ['/prospects'] }),
        queryClient.invalidateQueries({ queryKey: ['/dashboard/metrics'] }),
      ])
      setSelectedOutreachIds([])
      setOutreachPreviews([])
      setOutreachBatchId('')
      setComplianceConfirmed(false)
    },
    onError: (error: Error) => toast.error(error.message || 'Could not send outreach batch.'),
  })

  const manualSendMutation = useMutation({
    mutationFn: async (resendConfirmed: boolean) => {
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
      const { data, error } = await functionClient.functions.invoke('send-outreach', {
        body: {
          batchId: crypto.randomUUID(),
          manualEmail: {
            recipient_email: emailAddress,
            subject: manualSubject.trim(),
            body: manualBody.trim(),
          },
          complianceConfirmed: true,
          resendConfirmed,
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

  const saveMutation = useMutation({
    mutationFn: async () => {
      const userId = await getCurrentUserId()
      const values = {
        subject: subject.trim(),
        body: body.trim(),
        campaign_id: campaignId || null,
        prospect_id: prospectId || null,
      }
      const result = editingDraft
        ? await supabase.from('email_drafts').update(values).eq('id', editingDraft.id).eq('user_id', userId)
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

  const saveGeneratedMutation = useMutation({
    mutationFn: async () => {
      if (!generatedSubject.trim() || !generatedBody.trim()) {
        throw new Error('Add a subject and message before saving.')
      }
      if (generatedValidation?.errors.length) {
        throw new Error(generatedValidation.errors.join(' '))
      }
      const userId = await getCurrentUserId()
      const { error } = await supabase.from('email_drafts').insert({
        subject: generatedSubject.trim(),
        body: generatedBody.trim(),
        campaign_id: generatorCampaignId || null,
        prospect_id: generatorProspectId || null,
        template_type: followUpStage === 'none' ? generatorStrategy : `follow_up_${followUpStage}`,
        generation_source: 'website_review_tools',
        user_id: userId,
        status: 'draft',
      })
      if (error) throw error
    },
    onSuccess: () => {
      toast.success('Generated email saved as a draft')
      queryClient.invalidateQueries({ queryKey: ['/email-drafts'] })
    },
    onError: (err: Error) => toast.error(err.message || 'Could not save generated draft'),
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

  const closeForm = () => {
    setShowForm(false)
    setEditingDraft(null)
    setSubject('')
    setBody('')
    setCampaignId('')
    setProspectId('')
  }

  const openEditForm = (draft: EmailDraft) => {
    setEditingDraft(draft)
    setSubject(draft.subject)
    setBody(draft.body)
    setCampaignId(draft.campaign_id || '')
    setProspectId(draft.prospect_id || '')
    setShowForm(true)
  }

  const generateDraft = () => {
    if (!selectedGeneratorProspect) {
      toast.error('Select a prospect before generating an email.')
      return
    }
    if (followUpBlockReason) {
      toast.error(followUpBlockReason)
      return
    }
    if (followUpStage !== 'none' && !originalFollowUpMessage) {
      toast.error('Select an email that was previously sent to provide follow-up context.')
      return
    }
    try {
      const result = followUpStage !== 'none' && originalFollowUpMessage
        ? generateFollowUpDraft(originalFollowUpMessage, selectedGeneratorProspect, followUpStage, effectiveSignature)
        : generateProfessionalEmailDraft({
            prospect: selectedGeneratorProspect,
            analysis: matchingGeneratorAnalysis,
            strategy: generatorStrategy,
            tone: generatorTone,
            length: generatorLength,
            includeReport: includeReportReference,
            signature: effectiveSignature,
            senderContext,
          })
      setGeneratedDraft(result)
      setGeneratedSubject(result.subjectSuggestions[0] || '')
      setGeneratedBody(result.body)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not generate an email draft.')
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
    setShowForm(true)
  }

  if (isLoading) {
    return <Card className="p-6"><div className="h-40 animate-pulse rounded bg-slate-200" /></Card>
  }

  if (error) {
    return <p className="py-12 text-center text-sm text-red-600">Could not load email drafts: {error.message}</p>
  }

  const campaignOptions = (campaigns || []) as Pick<Campaign, 'id' | 'name' | 'status'>[]
  const prospectOptions = (prospects || []) as Pick<Prospect, 'id' | 'business_name'>[]
  const draftRows = (drafts || []) as EmailDraft[]

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">{localStorage.getItem('arlotech-login-mode') === 'blacksite' ? 'PAYLOAD ASSEMBLY' : 'Email Drafts'}</h1>
          <p className="mt-1 text-sm text-slate-500">Create drafts and prepare personalized, reviewed outreach batches.</p>
        </div>
        <Button onClick={() => { closeForm(); setShowForm(true) }}>
          <Plus className="h-4 w-4" /> New Draft
        </Button>
      </div>

      <Card className="space-y-5 p-4 sm:p-6">
        <div>
          <h2 className="text-lg font-semibold text-slate-800">Personalized email workspace</h2>
          <p className="mt-1 text-sm text-slate-500">
            Build a client-ready draft from the prospect details and existing website review. The writing tools do not invent missing findings or promise business results.
          </p>
        </div>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <label className="block space-y-1">
            <span className="text-sm font-medium text-slate-700">Prospect</span>
            <select
              value={generatorProspectId}
              onChange={(event) => {
                setGeneratorProspectId(event.target.value)
                setGeneratedDraft(null)
                setFollowUpMessageId('')
                setIncludeReportReference(false)
              }}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
            >
              <option value="">Select a prospect</option>
              {outreachProspectRows.map((prospect) => (
                <option key={prospect.id} value={prospect.id}>{prospect.business_name}</option>
              ))}
            </select>
          </label>
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
            <span className="text-sm font-medium text-slate-700">Campaign (optional)</span>
            <select
              value={generatorCampaignId}
              onChange={(event) => setGeneratorCampaignId(event.target.value)}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
            >
              <option value="">No campaign</option>
              {campaignOptions.map((campaign) => <option key={campaign.id} value={campaign.id}>{campaign.name}</option>)}
            </select>
          </label>
          <label className="block space-y-1">
            <span className="text-sm font-medium text-slate-700">Follow-up</span>
            <select
              value={followUpStage}
              onChange={(event) => {
                setFollowUpStage(event.target.value as FollowUpStage)
                setFollowUpMessageId('')
              }}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
            >
              <option value="none">New outreach</option>
              <option value="first">First follow-up</option>
              <option value="second">Second follow-up</option>
              <option value="final">Final follow-up</option>
            </select>
          </label>
          {followUpStage !== 'none' && (
            <label className="block space-y-1">
              <span className="text-sm font-medium text-slate-700">Previously sent email</span>
              <select
                  value={followUpMessageId}
                  onChange={(event) => setFollowUpMessageId(event.target.value)}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
              >
                  <option value="">Select a sent email</option>
                  {sentEmailRows
                    .filter((message) => message.direction === 'outbound' && message.prospect_id === generatorProspectId)
                    .map((message) => (
                      <option key={message.id} value={message.id}>
                        {message.subject} {message.created_at ? `(${new Date(message.created_at).toLocaleDateString()})` : ''}
                      </option>
                    ))}
                </select>
            </label>
          )}
        </div>

        <label className="block space-y-1">
          <span className="text-sm font-medium text-slate-700">Extra context or offer details (optional)</span>
          <textarea
            value={senderContext}
            onChange={(event) => setSenderContext(event.target.value)}
            rows={2}
            maxLength={600}
            placeholder="Add a confirmed price, offer, project detail, reply context, or meeting availability. Leave blank if not applicable."
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
          />
          <span className="text-xs text-slate-500">Only include details you can stand behind. The drafter will not invent prices, timelines, or guarantees.</span>
        </label>

        <div className="flex flex-wrap items-center gap-x-6 gap-y-3">
          <label className="flex items-start gap-2 text-sm text-slate-700">
            <input
              type="checkbox"
              checked={includeReportReference}
              disabled={!matchingGeneratorAnalysis || !selectedGeneratorProspect?.website}
              onChange={(event) => setIncludeReportReference(event.target.checked)}
              className="mt-1 h-4 w-4 accent-arlotech"
            />
            <span>
              Mention the existing website review
              {matchingGeneratorAnalysis ? ' (available to share; not attached to this saved draft)' : ' (no matching review available)'}
            </span>
          </label>
          {selectedGeneratorProspect?.business_category && (
            <p className="text-xs text-slate-500">Industry context: {selectedGeneratorProspect.business_category}</p>
          )}
        </div>

        <details className="rounded-lg border border-slate-200 p-3">
          <summary className="cursor-pointer text-sm font-medium text-slate-700">Email signature</summary>
          <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {([
              ['businessName', 'Business name'],
              ['senderName', 'Sender name'],
              ['jobTitle', 'Job title'],
              ['website', 'Website'],
              ['email', 'Business email'],
              ['phone', 'Telephone'],
              ['socialLinks', 'Social links (optional)'],
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
        {emailProfileError && (
          <p className="text-xs text-amber-800" role="status">
            Account signature details could not be loaded. You can enter them manually.
          </p>
        )}

        <div className="flex justify-end">
          <Button onClick={generateDraft} disabled={!generatorProspectId || (followUpStage !== 'none' && (!followUpMessageId || !!followUpBlockReason))}>
            <Sparkles className="h-4 w-4" /> {generatedDraft ? 'Regenerate email' : 'Generate email'}
          </Button>
        </div>
        {followUpBlockReason && followUpStage !== 'none' && <p className="text-sm text-amber-800" role="status">{followUpBlockReason}</p>}

        {generatedDraft && (
          <div className="space-y-4 border-t border-slate-200 pt-4">
            <div className="grid gap-4 lg:grid-cols-[minmax(0,2fr)_minmax(16rem,1fr)]">
              <div className="space-y-4">
                <div>
                  <p className="mb-2 text-sm font-medium text-slate-700">Subject suggestions (select one, or edit below)</p>
                  <div className="flex flex-wrap gap-2">
                    {generatedDraft.subjectSuggestions.map((suggestion) => (
                      <button
                        key={suggestion}
                        type="button"
                        onClick={() => setGeneratedSubject(suggestion)}
                        className={`rounded-full border px-3 py-1.5 text-xs ${
                          generatedSubject === suggestion
                            ? 'border-arlotech bg-arlotech/10 font-semibold text-arlotech'
                            : 'border-slate-300 text-slate-600 hover:bg-slate-50'
                        }`}
                      >
                        {suggestion}
                      </button>
                    ))}
                  </div>
                </div>
                <label className="block space-y-1">
                  <span className="text-sm font-medium text-slate-700">Subject</span>
                  <input
                    value={generatedSubject}
                    onChange={(event) => setGeneratedSubject(event.target.value)}
                    maxLength={200}
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                  />
                </label>
                <label className="block space-y-1">
                  <span className="text-sm font-medium text-slate-700">Email body</span>
                  <textarea
                    value={generatedBody}
                    onChange={(event) => setGeneratedBody(event.target.value)}
                    rows={12}
                    maxLength={12000}
                    className="w-full resize-y rounded-lg border border-slate-300 px-3 py-2 text-sm leading-6"
                  />
                </label>
                <p className="text-xs text-slate-500">Current length: {generatedBody.trim().split(/\s+/).filter(Boolean).length} words. Review all claims and recipient details before sending.</p>
                <div className="flex flex-wrap gap-2">
                  {([
                    ['shorten', 'Shorten'],
                    ['expand', 'Expand'],
                    ['conversational', 'More conversational'],
                    ['professional', 'More professional'],
                    ['improve_cta', 'Improve CTA'],
                  ] as const).map(([action, label]) => (
                    <Button
                      key={action}
                      variant="secondary"
                      size="sm"
                      onClick={() => setGeneratedBody((current) => rewriteProfessionalEmail(current, action as RewriteAction))}
                    >
                      {label}
                    </Button>
                  ))}
                </div>
                <div className="flex flex-wrap justify-end gap-2">
                  <Button variant="secondary" onClick={copyGeneratedDraft}><Copy className="h-4 w-4" /> Copy email</Button>
                  <Button onClick={() => saveGeneratedMutation.mutate()} disabled={saveGeneratedMutation.isPending || !generatedSubject.trim() || !generatedBody.trim() || !!generatedValidation?.errors.length}>
                    {saveGeneratedMutation.isPending ? 'Saving...' : 'Save draft'}
                  </Button>
                </div>
              </div>
              <aside className="space-y-4 rounded-lg bg-slate-50 p-4">
                <div>
                  <h3 className="text-sm font-semibold text-slate-700">Personalization used</h3>
                  <ul className="mt-2 list-disc space-y-1 pl-5 text-xs text-slate-600">
                    {generatedDraft.personalization.map((item) => <li key={item}>{item}</li>)}
                  </ul>
                </div>
                <div>
                  <h3 className="text-sm font-semibold text-slate-700">Website observations referenced</h3>
                  {generatedDraft.observationsUsed.length ? (
                    <ul className="mt-2 list-disc space-y-1 pl-5 text-xs text-slate-600">
                      {generatedDraft.observationsUsed.map((item) => <li key={item}>{item}</li>)}
                    </ul>
                  ) : <p className="mt-2 text-xs text-slate-500">No finding was available or needed for this approach.</p>}
                </div>
                <div>
                  <h3 className="text-sm font-semibold text-slate-700">Draft checks</h3>
                  <ul className="mt-2 list-disc space-y-1 pl-5 text-xs text-slate-600">
                    {generatedDraft.qualityChecks.map((item) => <li key={item}>{item}</li>)}
                  </ul>
                  {!!generatedValidation?.errors.length && (
                    <ul role="alert" className="mt-2 list-disc space-y-1 pl-5 text-xs text-red-700">
                      {generatedValidation.errors.map((item) => <li key={item}>{item}</li>)}
                    </ul>
                  )}
                  {!!generatedValidation?.warnings.length && (
                    <ul className="mt-2 list-disc space-y-1 pl-5 text-xs text-amber-800">
                      {generatedValidation.warnings.map((item) => <li key={item}>{item}</li>)}
                    </ul>
                  )}
                </div>
              </aside>
            </div>
          </div>
        )}
      </Card>

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
          The sender adds the configured postal address and an opt-out instruction to the end of the email.
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
              manualSendMutation.mutate(true)
            }}
          >
            <Send className="h-4 w-4" />
            {manualSendMutation.isPending ? 'Sending...' : 'Send email'}
          </Button>
        </div>
      </Card>

      <Card className="space-y-5 p-4 sm:p-6">
        <div>
          <h2 className="text-lg font-semibold text-slate-800">{localStorage.getItem('arlotech-login-mode') === 'blacksite' ? 'BATCH TRANSMISSION ASSEMBLY' : 'Personalized outreach batch'}</h2>
          <p className="mt-1 text-sm text-slate-500">
            Select up to {MAX_OUTREACH_BATCH_SIZE} prospects. Each person gets a separate email, not a shared group message.
            Website prospects must have a completed audit; its report is attached. Prospects without a website get a separate introduction.
          </p>
        </div>
        <label className="block max-w-xl space-y-1">
          <span className="text-sm font-medium text-slate-700">Campaign (optional)</span>
          <select value={outreachCampaignId} onChange={(event) => setOutreachCampaignId(event.target.value)} className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm">
            <option value="">No campaign attribution</option>
            {campaignOptions.filter((campaign) => campaign.status.toLowerCase() === 'active').map((campaign) => <option key={campaign.id} value={campaign.id}>{campaign.name}</option>)}
          </select>
          <span className="block text-xs text-slate-500">Only active campaigns are available. Pausing a campaign blocks new sends.</span>
        </label>

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
            {outreachProspectRows.map((prospect: OutreachProspect) => {
              const blockReason = getOutreachBlockReason(prospect)
              const selected = selectedOutreachIds.includes(prospect.id)
              return (
                <label
                  key={prospect.id}
                  className={`flex min-w-0 items-start gap-3 rounded-lg p-3 ${
                    blockReason ? 'bg-slate-50 text-slate-400' : 'cursor-pointer hover:bg-slate-50'
                  }`}
                >
                  <input
                    type="checkbox"
                    className="mt-1 h-4 w-4 shrink-0 accent-arlotech"
                    checked={selected}
                    disabled={!!blockReason || !!suppressionError || !!sentHistoryError}
                    onChange={() => {
                      setOutreachPreviews([])
                      setOutreachResults([])
                      setSelectedOutreachIds((current) => {
                        if (current.includes(prospect.id)) return current.filter((id) => id !== prospect.id)
                        if (current.length >= MAX_OUTREACH_BATCH_SIZE) {
                          toast.error(`Select up to ${MAX_OUTREACH_BATCH_SIZE} prospects per batch.`)
                          return current
                        }
                        return [...current, prospect.id]
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
                      {blockReason
                        ? blockReason
                        : hasPreviousSend(prospect)
                          ? 'Review before sending again'
                        : prospect.website
                          ? 'Website audit attached'
                          : 'No-website introduction'}
                    </span>
                  </span>
                </label>
              )
            })}
            {outreachProspects.length === 0 && (
              <p className="p-4 text-center text-sm text-slate-500">Add prospects to prepare an outreach batch.</p>
            )}
          </div>
        )}

        <div className="flex flex-col-reverse gap-3 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-xs text-slate-500">{selectedOutreachIds.length} / {MAX_OUTREACH_BATCH_SIZE} selected</p>
          <Button
            variant="secondary"
            onClick={prepareOutreachPreviews}
            disabled={
              selectedOutreachIds.length === 0 ||
              outreachProspectsLoading ||
              outreachAnalysesLoading ||
              !!outreachProspectsError ||
              !!outreachAnalysesError ||
              !!suppressionError ||
              !!sentHistoryError
            }
          >
            <Mail className="h-4 w-4" /> Preview personalized emails
          </Button>
        </div>

        {outreachPreviews.length > 0 && (
          <div className="space-y-4 border-t border-slate-200 pt-4">
            <div>
              <h3 className="font-semibold text-slate-800">{localStorage.getItem('arlotech-login-mode') === 'blacksite' ? 'REVIEW PAYLOADS BEFORE DEPLOYMENT' : 'Review each message before sending'}</h3>
              <p className="mt-1 text-xs text-slate-500">
                Messages use recorded website findings. Review names, claims, and recipients; deliverability cannot be guaranteed.
              </p>
            </div>
            {outreachPreviews.map((preview: OutreachPreview) => {
              const prospect = outreachProspectRows.find((item: OutreachProspect) => item.id === preview.prospect_id)
              if (!prospect) return null
              return (
                <article key={preview.prospect_id} className="space-y-3 rounded-lg border border-slate-200 p-3 sm:p-4">
                  <div className="flex min-w-0 items-start gap-2">
                    <Mail className="mt-0.5 h-4 w-4 shrink-0 text-arlotech" />
                    <div className="min-w-0">
                      <p className="break-words text-sm font-medium text-slate-800">{prospect.business_name}</p>
                      <p className="break-all text-xs text-slate-500">{prospect.email}</p>
                      {hasPreviousSend(prospect) && (
                        <p className="mt-1 inline-block rounded-full border border-amber-300 bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-900">
                          Previously contacted — resend confirmation required
                        </p>
                      )}
                      {preview.has_website_report && (
                        <p className="mt-1 text-xs text-green-700">A personalized website report will be attached.</p>
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
                      onChange={(event) =>
                        setOutreachPreviews((current) =>
                          current.map((item) =>
                            item.prospect_id === preview.prospect_id
                              ? { ...item, subject: event.target.value }
                              : item,
                          ),
                        )
                      }
                      className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-arlotech focus:outline-none focus:ring-2 focus:ring-arlotech/20"
                    />
                  </label>
                  <label className="block space-y-1">
                    <span className="text-xs font-medium text-slate-600">Message</span>
                    <textarea
                      value={preview.body}
                      onChange={(event) =>
                        setOutreachPreviews((current) =>
                          current.map((item) =>
                            item.prospect_id === preview.prospect_id
                              ? { ...item, body: event.target.value }
                              : item,
                          ),
                        )
                      }
                      rows={8}
                      className="w-full resize-y rounded-lg border border-slate-300 px-3 py-2 text-sm leading-6 focus:border-arlotech focus:outline-none focus:ring-2 focus:ring-arlotech/20"
                    />
                  </label>
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
                    sendOutreachMutation.mutate(true)
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
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1">
              <label htmlFor="draft-campaign" className="block text-sm font-medium text-slate-700">Campaign (optional)</label>
              <select id="draft-campaign" value={campaignId} onChange={(event) => setCampaignId(event.target.value)} className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm">
                <option value="">No campaign</option>
                {campaignOptions.map((campaign) => <option key={campaign.id} value={campaign.id}>{campaign.name}</option>)}
              </select>
            </div>
            <div className="space-y-1">
              <label htmlFor="draft-prospect" className="block text-sm font-medium text-slate-700">Prospect (optional)</label>
              <select id="draft-prospect" value={prospectId} onChange={(event) => setProspectId(event.target.value)} className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm">
                <option value="">No prospect</option>
                {prospectOptions.map((prospect) => <option key={prospect.id} value={prospect.id}>{prospect.business_name}</option>)}
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

      <div className="space-y-3">
        {draftRows.map((draft) => (
          <Card key={draft.id} className="p-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0 flex-1">
                <p className="font-medium text-slate-800">{draft.subject}</p>
                <p className="mt-1 whitespace-pre-wrap text-sm text-slate-500 line-clamp-3">{draft.body}</p>
                <p className="mt-2 text-xs text-slate-400">
                  {draft.status} · Updated {new Date(draft.updated_at).toLocaleDateString()}
                </p>
              </div>
              <div className="flex gap-2">
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
        ))}
        {draftRows.length === 0 && (
          <Card className="p-6 text-center text-sm text-slate-500">No drafts yet. Create a draft to get started.</Card>
        )}
      </div>
    </div>
  )
}
