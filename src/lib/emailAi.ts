import { supabase } from '@/lib/supabase'
import type { FollowUpStage, GeneratedEmailDraft, OutreachTone } from '@/lib/emailDraftGenerator'
import { isAiEmailResponse, type AiEmailApproach, type AiEmailContextReference } from '@/lib/emailAiSchema'
export { AI_EMAIL_APPROACHES } from '@/lib/emailAiSchema'
export type { AiEmailApproach, AiEmailContextReference } from '@/lib/emailAiSchema'
export type AiEmailRewriteAction =
  | 'shorten'
  | 'formal'
  | 'friendly'
  | 'persuasive'
  | 'change_cta'
  | 'rewrite_selection'
  | 'custom'

export interface AiEmailDraftResult extends GeneratedEmailDraft {
  approach: AiEmailApproach
  emailType: string
  personalizationConfidence: 'high' | 'medium' | 'low'
  recommendedCallToAction: string
  assistantMessage?: string
  websiteContextUsed: AiEmailContextReference[]
  analysisId: string | null
  prospect: {
    businessName: string
    website: string
    industry: string
  }
  sender: {
    name: string
    business: string
    email: string
  }
}

async function getFunctionErrorMessage(error: Error, fallback: string) {
  if (!('context' in error) || !(error.context instanceof Response)) return error.message || fallback
  const payload = await error.context.clone().json().catch(() => null)
  return payload && typeof payload === 'object' && 'error' in payload && typeof payload.error === 'string'
    ? payload.error
    : error.message || fallback
}

export async function generateAiOutreachDraft(input: {
  prospectId: string
  approach: AiEmailApproach
  tone: OutreachTone
  length: 'short' | 'standard' | 'detailed'
  senderContext?: string
  followUpStage?: FollowUpStage
  includeReport?: boolean
}) {
  const { data, error } = await supabase.functions.invoke<unknown>('generate-outreach-draft', {
    body: {
      action: 'generate',
      prospect_id: input.prospectId,
      approach: input.approach,
      tone: input.tone,
      length: input.length,
      sender_context: input.senderContext?.slice(0, 600) ?? '',
      follow_up_stage: input.followUpStage ?? 'none',
      include_report: input.includeReport ?? false,
    },
  })

  if (error) {
    throw new Error(await getFunctionErrorMessage(error, 'AI email generation failed.'))
  }
  if (!isAiEmailResponse(data)) {
    throw new Error('The AI email function returned an invalid draft.')
  }

  const observationsUsed = data.referenced_observations.map((observation) => observation.trim())
  if (observationsUsed.some((id) => !id)) {
    throw new Error('The AI email referenced an invalid website observation.')
  }
  return {
    approach: input.approach,
    emailType: data.email_type,
    subjectSuggestions: data.subject_suggestions.map((subject) => subject.trim()),
    body: data.body.trim(),
    personalization: [],
    observationsUsed,
    qualityChecks: [
      input.includeReport
        ? 'AI draft uses saved prospect and website context plus matching website-review observations where relevant.'
        : 'AI draft uses saved prospect and website context; no matching website-review findings were available.',
      input.includeReport ? 'A matching website review PDF is referenced for attachment.' : 'No report attachment is referenced.',
    ],
    includesReportReference: input.includeReport ?? false,
    wordCount: data.body.trim().split(/\s+/).filter(Boolean).length,
    personalizationConfidence: data.personalization_confidence,
    recommendedCallToAction: data.recommended_call_to_action.trim(),
    websiteContextUsed: data.referenced_context_pages,
    analysisId: data.analysis_id,
    prospect: {
      businessName: data.prospect.business_name,
      website: data.prospect.website,
      industry: data.prospect.industry,
    },
    sender: data.sender,
  } satisfies AiEmailDraftResult
}

export async function rewriteAiOutreachDraft(input: {
  prospectId: string
  approach: AiEmailApproach
  action: AiEmailRewriteAction
  body: string
  selectedText?: string
  customInstruction?: string
  conversation?: Array<{ role: 'user' | 'assistant'; content: string }>
  includeReport?: boolean
}) {
  if (!input.body.trim() || input.body.length > 12_000) {
    throw new Error('The current email body is empty or exceeds the supported length.')
  }
  if (input.action === 'rewrite_selection' && !input.selectedText?.trim()) {
    throw new Error('Select text in the email body before rewriting it.')
  }
  if (input.action === 'custom' && !input.customInstruction?.trim()) {
    throw new Error('Enter an instruction for the AI draft assistant.')
  }
  if (input.customInstruction && input.customInstruction.length > 1000) {
    throw new Error('The AI draft instruction exceeds the 1,000-character limit.')
  }

  const { data, error } = await supabase.functions.invoke<unknown>('generate-outreach-draft', {
    body: {
      action: 'rewrite',
      prospect_id: input.prospectId,
      approach: input.approach,
      rewrite_action: input.action,
      current_body: input.body,
      selected_text: input.selectedText?.slice(0, 2000) ?? '',
      custom_instruction: input.customInstruction?.slice(0, 1000) ?? '',
      chat_history: input.conversation?.slice(-10).map((message) => ({
        role: message.role,
        content: message.content.slice(0, 1000),
      })) ?? [],
      include_report: input.includeReport ?? false,
    },
  })

  if (error) {
    throw new Error(await getFunctionErrorMessage(error, 'Could not rewrite this email.'))
  }
  if (!isAiEmailResponse(data)) throw new Error('The AI email function returned an invalid rewrite.')
  if (input.action === 'custom' && !data.assistant_message?.trim()) {
    throw new Error('The AI draft assistant returned no response.')
  }
  return {
    ...input,
    body: data.body.trim(),
    subjectSuggestions: data.subject_suggestions.map((subject) => subject.trim()),
    observationsUsed: data.referenced_observations.map((observation) => observation.trim()),
    websiteContextUsed: data.referenced_context_pages,
    personalizationConfidence: data.personalization_confidence,
    recommendedCallToAction: data.recommended_call_to_action.trim(),
    assistantMessage: data.assistant_message?.trim(),
    analysisId: data.analysis_id,
    sender: data.sender,
  }
}

export async function regenerateAiSubjectSuggestions(input: {
  prospectId: string
  approach: AiEmailApproach
  body: string
}) {
  if (!input.body.trim() || input.body.length > 12_000) {
    throw new Error('The current email body is empty or exceeds the supported length.')
  }
  const { data, error } = await supabase.functions.invoke<unknown>('generate-outreach-draft', {
    body: {
      action: 'subjects',
      prospect_id: input.prospectId,
      approach: input.approach,
      current_body: input.body,
    },
  })
  if (error) {
    throw new Error(await getFunctionErrorMessage(error, 'Could not generate new subject lines.'))
  }
  if (!isAiEmailResponse(data)) throw new Error('The AI email function returned invalid subject suggestions.')
  return data.subject_suggestions.map((subject) => subject.trim())
}
