import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}
const MAX_BATCH_SIZE = 10
const MAX_DAILY_SENDS = 50
const MAX_ATTACHMENT_BASE64_LENGTH = 700_000
const MAX_BATCH_ATTACHMENT_LENGTH = 4_500_000
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

interface OutreachAttachment {
  filename: string
  content: string
}

interface OutreachEmail {
  prospect_id: string
  subject: string
  body: string
  attachment?: OutreachAttachment
}

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}

function websiteHost(website: string) {
  const normalized = /^https?:\/\//i.test(website) ? website : `https://${website}`
  return new URL(normalized).hostname.replace(/^www\./i, '').toLowerCase()
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (req.method !== 'POST') return jsonResponse({ error: 'Method not allowed.' }, 405)

  try {
    const authorization = req.headers.get('Authorization')
    const token = authorization?.match(/^Bearer\s+(.+)$/i)?.[1]
    if (!token) return jsonResponse({ error: 'Sign in before sending outreach.' }, 401)

    const supabaseUrl = Deno.env.get('SUPABASE_URL')
    const supabaseKey = Deno.env.get('SUPABASE_ANON_KEY') ?? Deno.env.get('SUPABASE_PUBLISHABLE_KEY')
    const resendApiKey = Deno.env.get('RESEND_API_KEY')
    const fromEmail = Deno.env.get('RESEND_FROM_EMAIL')
    const postalAddress = Deno.env.get('OUTREACH_POSTAL_ADDRESS')
    if (!supabaseUrl || !supabaseKey) throw new Error('Supabase function authentication is not configured.')
    if (!resendApiKey || !fromEmail) {
      throw new Error('Set RESEND_API_KEY and RESEND_FROM_EMAIL as Supabase function secrets before sending.')
    }
    if (!postalAddress?.trim()) {
      throw new Error('Set OUTREACH_POSTAL_ADDRESS as a Supabase function secret before sending commercial outreach.')
    }

    const supabase = createClient(supabaseUrl, supabaseKey)
    const { data: userData, error: authError } = await supabase.auth.getUser(token)
    if (authError || !userData.user) return jsonResponse({ error: 'Your session is invalid or expired.' }, 401)
    const userId = userData.user.id

    const body = await req.json()
    const emails = body?.emails as OutreachEmail[] | undefined
    const batchId = body?.batchId
    if (body?.complianceConfirmed !== true) {
      return jsonResponse({ error: 'Confirm that you reviewed the recipients and have a lawful basis to contact them.' }, 400)
    }
    if (!Array.isArray(emails) || emails.length === 0 || emails.length > MAX_BATCH_SIZE) {
      return jsonResponse({ error: `Choose between 1 and ${MAX_BATCH_SIZE} prospects per batch.` }, 400)
    }
    if (typeof batchId !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(batchId)) {
      return jsonResponse({ error: 'The send batch identifier is invalid. Prepare the preview again.' }, 400)
    }
    if (new Set(emails.map((email) => email?.prospect_id)).size !== emails.length) {
      return jsonResponse({ error: 'A prospect can only appear once in a batch.' }, 400)
    }
    let attachmentPayloadSize = 0
    for (const email of emails) {
      if (
        !email ||
        typeof email.prospect_id !== 'string' ||
        !email.prospect_id ||
        typeof email.subject !== 'string' ||
        !email.subject.trim() ||
        email.subject.length > 200 ||
        typeof email.body !== 'string' ||
        !email.body.trim() ||
        email.body.length > 12_000
      ) {
        return jsonResponse({ error: 'Every email must include a valid prospect, subject, and message.' }, 400)
      }
      if (email.attachment !== undefined) {
        if (
          typeof email.attachment.filename !== 'string' ||
          !/^[a-z0-9][a-z0-9._-]{0,100}\.pdf$/i.test(email.attachment.filename) ||
          typeof email.attachment.content !== 'string' ||
          !/^[A-Za-z0-9+/]+={0,2}$/.test(email.attachment.content) ||
          email.attachment.content.length > MAX_ATTACHMENT_BASE64_LENGTH
        ) {
          return jsonResponse({ error: 'A website report attachment is invalid or too large.' }, 400)
        }
        attachmentPayloadSize += email.attachment.content.length
      }
    }
    if (attachmentPayloadSize > MAX_BATCH_ATTACHMENT_LENGTH) {
      return jsonResponse({ error: 'The combined report attachments are too large. Send a smaller batch.' }, 413)
    }

    const prospectIds = emails.map((email) => email.prospect_id)
    const { data: prospects, error: prospectError } = await supabase
      .from('prospects')
      .select('id, user_id, business_name, email, website, do_not_contact, status')
      .eq('user_id', userId)
      .in('id', prospectIds)
    if (prospectError) throw prospectError

    const { data: sentMessages, error: sentError } = await supabase
      .from('email_messages')
      .select('prospect_id')
      .eq('user_id', userId)
      .eq('direction', 'outbound')
      .eq('status', 'sent')
      .in('prospect_id', prospectIds)
    if (sentError) throw sentError
    const sentProspectIds = new Set((sentMessages ?? []).map((message) => message.prospect_id))

    const normalizedEmails = (prospects ?? [])
      .map((prospect) => prospect.email?.trim().toLowerCase())
      .filter((email): email is string => !!email)
    const { data: suppressedRows, error: suppressionError } = normalizedEmails.length
      ? await supabase
          .from('suppression_list')
          .select('normalized_email')
          .eq('user_id', userId)
          .in('normalized_email', normalizedEmails)
      : { data: [], error: null }
    if (suppressionError) throw suppressionError
    const suppressedEmails = new Set((suppressedRows ?? []).map((row) => row.normalized_email.toLowerCase()))

    const websiteProspectIds = (prospects ?? []).filter((prospect) => !!prospect.website).map((prospect) => prospect.id)
    const { data: analyses, error: analysisError } = websiteProspectIds.length
      ? await supabase
          .from('website_analyses')
          .select('prospect_id, website_url')
          .eq('user_id', userId)
          .eq('analysis_status', 'completed')
          .in('prospect_id', websiteProspectIds)
      : { data: [], error: null }
    if (analysisError) throw analysisError
    const analysesByProspect = new Map<string, string[]>()
    for (const analysis of analyses ?? []) {
      if (analysis.prospect_id && analysis.website_url) {
        const websites = analysesByProspect.get(analysis.prospect_id) ?? []
        websites.push(analysis.website_url)
        analysesByProspect.set(analysis.prospect_id, websites)
      }
    }

    const { count: dailySendCount, error: dailyCountError } = await supabase
      .from('email_messages')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', userId)
      .eq('direction', 'outbound')
      .eq('status', 'sent')
      .gte('sent_at', new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString())
    if (dailyCountError) throw dailyCountError
    if ((dailySendCount ?? 0) + emails.length > MAX_DAILY_SENDS) {
      return jsonResponse(
        { error: `This account is limited to ${MAX_DAILY_SENDS} outreach emails per rolling 24 hours.` },
        429,
      )
    }

    const results: Array<{
      prospect_id: string
      business_name: string
      status: 'sent' | 'skipped' | 'failed'
      error?: string
      tracking_error?: string
    }> = []
    const prospectById = new Map((prospects ?? []).map((prospect) => [prospect.id, prospect]))

    for (const [index, email] of emails.entries()) {
      const prospect = prospectById.get(email.prospect_id)
      const result = {
        prospect_id: email.prospect_id,
        business_name: prospect?.business_name ?? 'Unknown prospect',
        status: 'skipped' as 'sent' | 'skipped' | 'failed',
      }
      if (!prospect) {
        results.push({ ...result, error: 'Prospect not found or not owned by this account.' })
        continue
      }
      if (prospect.do_not_contact) {
        results.push({ ...result, error: 'This prospect is marked Do Not Contact.' })
        continue
      }
      const recipient = prospect.email?.trim().toLowerCase()
      if (!recipient || !EMAIL_PATTERN.test(recipient)) {
        results.push({ ...result, error: 'Prospect has no valid email address.' })
        continue
      }
      if (suppressedEmails.has(recipient)) {
        results.push({ ...result, error: 'This email is on the suppression list.' })
        continue
      }
      if (sentProspectIds.has(prospect.id)) {
        results.push({ ...result, error: 'An outbound email has already been recorded for this prospect.' })
        continue
      }
      const websiteAudits = analysesByProspect.get(prospect.id) ?? []
      const hasCurrentWebsiteAudit = prospect.website
        ? websiteAudits.some((auditedWebsite) => {
            try {
              return websiteHost(prospect.website) === websiteHost(auditedWebsite)
            } catch {
              return false
            }
          })
        : false
      if (prospect.website && !hasCurrentWebsiteAudit) {
        results.push({ ...result, error: 'Complete a website audit before sending this website-specific email.' })
        continue
      }
      if ((!!prospect.website) !== (!!email.attachment)) {
        results.push({
          ...result,
          error: prospect.website
            ? 'A website audit PDF is required for this prospect.'
            : 'A website report cannot be attached to a no-website introduction.',
        })
        continue
      }

      const resendResponse = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${resendApiKey}`,
          'Content-Type': 'application/json',
          'Idempotency-Key': `${userId}-${batchId}-${prospect.id}`,
        },
        body: JSON.stringify({
          from: fromEmail,
          to: [recipient],
          subject: email.subject.trim(),
          text: `${email.body.trim()}\n\n---\nIf you do not want further outreach, reply to this email and let me know.\n\n${postalAddress.trim()}`,
          ...(email.attachment
            ? {
                attachments: [
                  {
                    filename: email.attachment.filename,
                    content: email.attachment.content,
                  },
                ],
              }
            : {}),
        }),
      })
      const resendBody = await resendResponse.json().catch(() => ({}))
      if (!resendResponse.ok || typeof resendBody?.id !== 'string') {
        const detail =
          typeof resendBody?.message === 'string'
            ? resendBody.message
            : `Resend rejected the message (${resendResponse.status}).`
        results.push({ ...result, status: 'failed', error: detail })
        continue
      }

      const sentAt = new Date().toISOString()
      const { error: messageError } = await supabase.from('email_messages').insert({
        user_id: userId,
        prospect_id: prospect.id,
        provider: 'resend',
        provider_message_id: resendBody.id,
        direction: 'outbound',
        subject: email.subject.trim(),
        body: email.body.trim(),
        status: 'sent',
        sent_at: sentAt,
      })
      const trackingErrors: string[] = []
      if (messageError) trackingErrors.push(`message history: ${messageError.message}`)

      const { error: prospectUpdateError } = await supabase
        .from('prospects')
        .update({
          last_contacted_at: sentAt,
          ...(prospect.status === 'New' ? { status: 'Contacted' } : {}),
        })
        .eq('id', prospect.id)
        .eq('user_id', userId)
      if (prospectUpdateError) trackingErrors.push(`prospect status: ${prospectUpdateError.message}`)

      const { error: activityError } = await supabase.from('activity_logs').insert({
        user_id: userId,
        prospect_id: prospect.id,
        event_type: 'email_sent',
        description: `Outreach email sent to ${recipient} via Resend.`,
        metadata: { provider_message_id: resendBody.id },
      })
      if (activityError) trackingErrors.push(`activity log: ${activityError.message}`)

      sentProspectIds.add(prospect.id)
      results.push({
        ...result,
        status: 'sent',
        ...(trackingErrors.length ? { tracking_error: trackingErrors.join('; ') } : {}),
      })
      if (index < emails.length - 1) await new Promise((resolve) => setTimeout(resolve, 600))
    }

    return jsonResponse({ results })
  } catch (error) {
    return jsonResponse(
      { error: error instanceof Error ? error.message : 'The outreach batch could not be processed.' },
      500,
    )
  }
})
