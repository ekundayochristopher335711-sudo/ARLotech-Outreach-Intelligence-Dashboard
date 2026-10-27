import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Check, Mail, Pencil, Plus, Send, Trash2, X } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { Textarea } from '@/components/ui/Textarea'
import { getCurrentUserId, supabase } from '@/lib/supabase'
import { createWebsiteAnalysisPdfBase64 } from '@/lib/exportPdf'
import { createOutreachPreview, hasMatchingWebsiteAnalysis, type OutreachPreview } from '@/lib/outreachEmail'
import type { Campaign, EmailDraft, Prospect, WebsiteAnalysis } from '@/types'

const MAX_OUTREACH_BATCH_SIZE = 10

type OutreachProspect = Pick<
  Prospect,
  'id' | 'business_name' | 'contact_name' | 'email' | 'website' | 'business_category' | 'do_not_contact'
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
  const [prospectId, setProspectId] = useState('')
  const [selectedOutreachIds, setSelectedOutreachIds] = useState<string[]>([])
  const [outreachPreviews, setOutreachPreviews] = useState<OutreachPreview[]>([])
  const [outreachBatchId, setOutreachBatchId] = useState('')
  const [complianceConfirmed, setComplianceConfirmed] = useState(false)
  const [outreachResults, setOutreachResults] = useState<OutreachSendResult[]>([])

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
        .select('id, business_name')
        .eq('user_id', userId)
        .order('business_name')
      if (error) throw error
      return data as Pick<Prospect, 'id' | 'business_name'>[]
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
        .select('id, business_name, contact_name, email, website, business_category, do_not_contact')
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

  const { data: previouslySentRows = [], error: sentHistoryError } = useQuery<
    Array<{ prospect_id: string | null; recipient_email: string | null }>
  >({
    queryKey: ['/email-messages', 'outreach-sent'],
    queryFn: async () => {
      const userId = await getCurrentUserId()
      const { data, error } = await supabase
        .from('email_messages')
        .select('prospect_id, recipient_email')
        .eq('user_id', userId)
        .eq('direction', 'outbound')
        .eq('status', 'sent')
      if (error) throw error
      return data
    },
  })

  const outreachProspectRows = outreachProspects as OutreachProspect[]
  const outreachAnalysisRows = outreachAnalyses as WebsiteAnalysis[]
  const suppressedEmailRows = suppressedRows as Array<{ normalized_email: string }>
  const previouslySentProspectRows = previouslySentRows as Array<{ prospect_id: string | null }>
  const sentRecipientRows = previouslySentRows as Array<{
    prospect_id: string | null
    recipient_email: string | null
  }>
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

  const getOutreachBlockReason = (prospect: OutreachProspect) => {
    if (!prospect.email?.trim()) return 'No email address'
    if (prospect.do_not_contact) return 'Do not contact'
    if (suppressedEmails.has(prospect.email.trim().toLowerCase())) return 'On suppression list'
    if (alreadyEmailedProspects.has(prospect.id)) return 'Already emailed'
    if (alreadyEmailedAddresses.has(prospect.email.trim().toLowerCase())) return 'Email address already contacted'
    if (
      prospect.website &&
      !hasMatchingWebsiteAnalysis(prospect, analysisByProspect.get(prospect.id))
    ) return 'Analyze website first'
    return null
  }

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
    setOutreachPreviews(
      selectedProspects.map((prospect: OutreachProspect) =>
        createOutreachPreview(prospect, analysisByProspect.get(prospect.id)),
      ),
    )
    setOutreachResults([])
    setOutreachBatchId(crypto.randomUUID())
    setComplianceConfirmed(false)
  }

  const sendOutreachMutation = useMutation({
    mutationFn: async () => {
      const emailPayload = outreachPreviews.map((preview: OutreachPreview) => {
        const prospect = outreachProspectRows.find((item: OutreachProspect) => item.id === preview.prospect_id)
        if (!prospect) throw new Error('A selected prospect is no longer available.')
        const analysis = analysisByProspect.get(prospect.id)
        const safeFilename = prospect.business_name
          .replace(/[^a-z0-9-]/gi, '-')
          .replace(/^-+|-+$/g, '')
          .slice(0, 60)
          .toLowerCase() || 'prospect'
        return {
          prospect_id: prospect.id,
          subject: preview.subject,
          body: preview.body,
          ...(preview.has_website_report && analysis
            ? {
                attachment: {
                  filename: `website-review-${safeFilename}.pdf`,
                  content: createWebsiteAnalysisPdfBase64(analysis),
                },
              }
            : {}),
        }
      })
      const functionClient = supabase as typeof supabase & {
        functions: {
          invoke: (
            name: string,
            options: { body: unknown },
          ) => Promise<{ data: unknown; error: Error | null }>
        }
      }
      const { data, error } = await functionClient.functions.invoke('send-outreach', {
        body: { batchId: outreachBatchId, emails: emailPayload, complianceConfirmed },
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
    mutationFn: async () => {
      const emailAddress = manualRecipient.trim().toLowerCase()
      if (!emailAddress || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailAddress)) {
        throw new Error('Enter a valid recipient email address.')
      }
      if (!manualSubject.trim() || !manualBody.trim()) {
        throw new Error('Enter both a subject and an email message.')
      }
      if (suppressedEmails.has(emailAddress)) throw new Error('This address is on your suppression list.')
      if (alreadyEmailedAddresses.has(emailAddress)) {
        throw new Error('This address has already received an email from this account.')
      }

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

  if (isLoading) {
    return <Card className="p-6"><div className="h-40 animate-pulse rounded bg-slate-200" /></Card>
  }

  if (error) {
    return <p className="py-12 text-center text-sm text-red-600">Could not load email drafts: {error.message}</p>
  }

  const campaignOptions = (campaigns || []) as Pick<Campaign, 'id' | 'name'>[]
  const prospectOptions = (prospects || []) as Pick<Prospect, 'id' | 'business_name'>[]
  const draftRows = (drafts || []) as EmailDraft[]

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">Email Drafts</h1>
          <p className="mt-1 text-sm text-slate-500">Create drafts and prepare personalized, reviewed outreach batches.</p>
        </div>
        <Button onClick={() => { closeForm(); setShowForm(true) }}>
          <Plus className="h-4 w-4" /> New Draft
        </Button>
      </div>

      <Card className="space-y-4 p-4 sm:p-6">
        <div>
          <h2 className="text-lg font-semibold text-slate-800">Write a one-off email</h2>
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
        {manualRecipient.trim() && (suppressedEmails.has(manualRecipient.trim().toLowerCase()) ||
          alreadyEmailedAddresses.has(manualRecipient.trim().toLowerCase())) && (
          <p className="text-sm text-red-700">
            {suppressedEmails.has(manualRecipient.trim().toLowerCase())
              ? 'This address is on your suppression list and cannot be contacted.'
              : 'An email has already been sent to this address from your account.'}
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
        <div className="flex justify-end">
          <Button
            onClick={() => manualSendMutation.mutate()}
            disabled={
              manualSendMutation.isPending ||
              !manualRecipient.trim() ||
              !manualSubject.trim() ||
              !manualBody.trim() ||
              !manualComplianceConfirmed ||
              !!suppressionError ||
              !!sentHistoryError ||
              suppressedEmails.has(manualRecipient.trim().toLowerCase()) ||
              alreadyEmailedAddresses.has(manualRecipient.trim().toLowerCase()) ||
              manualRecipientDoNotContact
            }
          >
            <Send className="h-4 w-4" />
            {manualSendMutation.isPending ? 'Sending...' : 'Send email'}
          </Button>
        </div>
      </Card>

      <Card className="space-y-5 p-4 sm:p-6">
        <div>
          <h2 className="text-lg font-semibold text-slate-800">Personalized outreach batch</h2>
          <p className="mt-1 text-sm text-slate-500">
            Select up to {MAX_OUTREACH_BATCH_SIZE} prospects. Each person gets a separate email, not a shared group message.
            Website prospects must have a completed audit; its report is attached. Prospects without a website get a separate introduction.
          </p>
        </div>

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
                    <span className="block break-words text-sm font-medium text-slate-800">{prospect.business_name}</span>
                    <span className="block break-all text-xs text-slate-500">{prospect.email || 'No email address'}</span>
                    <span className="mt-1 block text-xs text-slate-500">
                      {blockReason
                        ? blockReason
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
              <h3 className="font-semibold text-slate-800">Review each message before sending</h3>
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
                      {preview.has_website_report && (
                        <p className="mt-1 text-xs text-green-700">A personalized website report will be attached.</p>
                      )}
                    </div>
                  </div>
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
              Small reviewed batches help reduce risk but cannot guarantee delivery to the inbox. Recipients already emailed,
              marked Do Not Contact, or on your suppression list are excluded.
            </p>
            <div className="flex justify-end">
              <Button
                onClick={() => {
                  if (outreachPreviews.some((preview) => !preview.subject.trim() || !preview.body.trim())) {
                    toast.error('Every message needs a subject and body.')
                    return
                  }
                  if (window.confirm(`Send these ${outreachPreviews.length} individual emails now?`)) {
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
            <h3 className="font-semibold text-slate-800">Batch results</h3>
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
