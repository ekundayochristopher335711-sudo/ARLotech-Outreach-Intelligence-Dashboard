import { useMemo, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { ArrowUpRight, BadgeCheck, Download, Gauge, MailCheck, ShieldAlert, Sparkles, Target, FileText } from 'lucide-react'
import { toast } from 'sonner'
import jsPDF from 'jspdf'
import { Card } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { getCurrentUserId, supabase } from '@/lib/supabase'
import { recommendCampaignPause, recommendNextOutreachAction, scoreProspectOpportunity } from '@/lib/growthIntelligence'
import { validateProposalDraft } from '@/lib/proposalBuilder'
import { hasMatchingWebsiteAnalysis } from '@/lib/outreachEmail'

type ProspectRow = { id: string; business_name: string; email: string | null; website: string | null; business_category: string | null; status: string; do_not_contact: boolean; created_at: string }
type AuditRow = { prospect_id: string | null; website_url: string; overall_score: number | null; performance_score: number | null; seo_score: number | null; accessibility_score: number | null; best_practices_score: number | null; created_at?: string | null; analyzed_at?: string | null }
type MessageRow = { id: string; campaign_id: string | null; direction: string; status: string; sent_at: string | null; received_at: string | null; prospect_id: string | null; body: string | null }
type ProviderEventRow = { email_message_id: string | null; event_type: string; occurred_at: string }
type CampaignRow = { id: string; name: string; status: string }
type GrowthCenterData = {
  prospects: ProspectRow[]
  audits: AuditRow[]
  messages: MessageRow[]
  sequences: Array<{ id: string; prospect_id: string | null; status: string; next_action_at: string | null }>
  providerEvents: ProviderEventRow[]
  providerEventsError: string | null
  campaigns: CampaignRow[]
  asOf: number
}

export function GrowthCenterPage() {
  const queryClient = useQueryClient()
  const [pauseThreshold, setPauseThreshold] = useState(5)
  const [proposalProspect, setProposalProspect] = useState('')
  const [proposalSenderBusinessName, setProposalSenderBusinessName] = useState('')
  const [proposalSenderName, setProposalSenderName] = useState('')
  const [proposalSenderEmail, setProposalSenderEmail] = useState('')
  const [proposalSenderAddress, setProposalSenderAddress] = useState('')
  const [proposalSenderWebsite, setProposalSenderWebsite] = useState('')
  const [proposalService, setProposalService] = useState('Website design and development')
  const [proposalCurrency, setProposalCurrency] = useState('')
  const [proposalPrice, setProposalPrice] = useState('')
  const [proposalTimeline, setProposalTimeline] = useState('')
  const [proposalScope, setProposalScope] = useState('Responsive website design and development\nMobile-friendly layouts\nContact form and WhatsApp integration\nBasic on-page SEO setup\nLaunch support')
  const [proposalExclusions, setProposalExclusions] = useState('Paid third-party subscriptions, domain renewals and hosting fees unless explicitly included.')
  const [proposalMilestones, setProposalMilestones] = useState('Discovery and requirements\nDesign approval\nDevelopment and review\nTesting and handover')
  const [proposalPaymentTerms, setProposalPaymentTerms] = useState('To be agreed in writing before project commencement.')
  const [proposalValidity, setProposalValidity] = useState('')
  const [proposalAssumptions, setProposalAssumptions] = useState('Client will provide required content, brand assets and timely feedback.')
  const [proposalAcceptance, setProposalAcceptance] = useState('')
  const [proposalConfirmationFingerprint, setProposalConfirmationFingerprint] = useState('')
  const [proposalPreviewFingerprint, setProposalPreviewFingerprint] = useState('')
  const { data: queryData, isLoading, error } = useQuery<GrowthCenterData>({
    queryKey: ['growth-center'],
    queryFn: async () => {
      const userId = await getCurrentUserId()
      const [prospects, audits, messages, sequences, providerEvents, campaigns] = await Promise.all([
        supabase.from('prospects').select('id,business_name,email,website,business_category,status,do_not_contact,created_at').eq('user_id', userId),
        supabase.from('website_analyses').select('prospect_id,website_url,overall_score,performance_score,seo_score,accessibility_score,best_practices_score,created_at,analyzed_at').eq('user_id', userId).eq('analysis_status', 'completed'),
        supabase.from('email_messages').select('id,campaign_id,direction,status,sent_at,received_at,prospect_id,body').eq('user_id', userId),
        supabase.from('follow_up_sequences').select('id,prospect_id,status,next_action_at').eq('user_id', userId),
        supabase.from('email_provider_events').select('email_message_id,event_type,occurred_at').eq('user_id', userId),
        supabase.from('campaigns').select('id,name,status').eq('user_id', userId),
      ])
      for (const result of [prospects, audits, messages, sequences, campaigns]) if (result.error) throw result.error
      return {
        prospects: (prospects.data || []) as ProspectRow[],
        audits: (audits.data || []) as AuditRow[],
        messages: (messages.data || []) as MessageRow[],
        sequences: (sequences.data || []) as GrowthCenterData['sequences'],
        providerEvents: (providerEvents.data || []) as ProviderEventRow[],
        providerEventsError: providerEvents.error?.message ?? null,
        campaigns: (campaigns.data || []) as CampaignRow[],
        asOf: Date.now(),
      }
    },
  })
  const data = queryData as GrowthCenterData | undefined
  const messageRows = data?.messages ?? []
  const providerEventRows = data?.providerEvents ?? []
  const recentWindowStart = (data?.asOf ?? 0) - 7 * 24 * 60 * 60 * 1000
  const auditByProspect = useMemo(() => new Map([...((data?.audits || []).filter(audit => audit.prospect_id))].sort((left, right) => new Date(left.analyzed_at || left.created_at || 0).getTime() - new Date(right.analyzed_at || right.created_at || 0).getTime()).map(audit => [audit.prospect_id as string, audit])), [data?.audits])
  const ranked = useMemo(() => (data?.prospects || []).map(prospect => {
    const latestAudit = auditByProspect.get(prospect.id)
    const matchingAudit = latestAudit && hasMatchingWebsiteAnalysis(prospect, latestAudit) ? latestAudit : undefined
    return { prospect, ...scoreProspectOpportunity(prospect, matchingAudit) }
  }).filter(item => item.eligible).sort((left, right) => right.score - left.score), [data?.prospects, auditByProspect])
  const sent = messageRows.filter(message => message.direction === 'outbound' && !!message.sent_at).length
  const replies = messageRows.filter(message => message.direction === 'inbound').length
  const acceptedEvents = providerEventRows.filter(event => event.event_type === 'email.sent').length
  const deliveredEvents = providerEventRows.filter(event => event.event_type === 'email.delivered').length
  const bouncedEvents = providerEventRows.filter(event => event.event_type === 'email.bounced').length
  const complainedEvents = providerEventRows.filter(event => event.event_type === 'email.complained').length
  const failedEvents = providerEventRows.filter(event => ['email.failed', 'email.suppressed'].includes(event.event_type)).length
  const suppressionEvents = providerEventRows.filter(event => event.event_type === 'suppression.added').length
  const replyRate = sent ? Math.round((replies / sent) * 100) : 0
  const won = (data?.prospects || []).filter(p => p.status === 'Won').length
  const pipelineStages = ['New', 'Ready for Outreach', 'Contacted', 'Replied', 'Interested', 'Meeting Booked', 'Won'].map(status => ({ status, count: (data?.prospects || []).filter(p => p.status === status).length }))
  const meetings = (data?.prospects || []).filter(p => p.status === 'Meeting Booked').length
  const interested = (data?.prospects || []).filter(p => p.status === 'Interested').length
  const due = (data?.sequences || []).filter(sequence => sequence.status === 'Active' && sequence.next_action_at && Date.parse(sequence.next_action_at) <= (data?.asOf ?? 0)).length
  const linkedProspects = (data?.prospects || []).filter(p => (data?.messages || []).some(m => m.prospect_id === p.id && m.direction === 'outbound'))
  const repliedProspects = linkedProspects.filter(p => (data?.messages || []).some(m => m.prospect_id === p.id && (m.direction === 'inbound' || m.status.toLowerCase() === 'replied')))
  const latestMessageFor = (id: string, direction: string) => messageRows.filter(message => message.prospect_id === id && message.direction === direction).sort((left, right) => new Date(right.received_at || right.sent_at || 0).getTime() - new Date(left.received_at || left.sent_at || 0).getTime())[0]
  const followUpRecommendations = (data?.prospects || []).map(prospect => {
    const inbound = latestMessageFor(prospect.id, 'inbound')
    const outbound = latestMessageFor(prospect.id, 'outbound')
    return {
      prospect,
      ...recommendNextOutreachAction({
        status: prospect.status,
        do_not_contact: prospect.do_not_contact,
        latestInbound: inbound?.body,
        latestOutboundAt: outbound?.sent_at,
        bounced: outbound?.status === 'bounced',
        complained: outbound?.status === 'complained',
        suppressed: outbound?.status === 'suppressed',
        failed: outbound?.status === 'failed',
      }),
    }
  }).filter(item => item.safeToDraft || item.action === 'Stop outreach' || item.action === 'Pause and investigate').slice(0, 8)
  const pauseRecommendations = (data?.campaigns ?? []).filter(campaign => campaign.status.toLowerCase() === 'active').flatMap(campaign => {
    const recentSends = messageRows.filter(message => message.campaign_id === campaign.id && message.direction === 'outbound' && message.sent_at && new Date(message.sent_at).getTime() >= recentWindowStart)
    const recentMessageIds = new Set(recentSends.map(message => message.id))
    const recentIncidents = providerEventRows.filter(event =>
      event.email_message_id && recentMessageIds.has(event.email_message_id) &&
      ['email.bounced', 'email.complained'].includes(event.event_type) &&
      new Date(event.occurred_at).getTime() >= recentWindowStart,
    )
    const recommendation = recommendCampaignPause({
      sentMessageIds: [...recentMessageIds],
      bouncedMessageIds: recentIncidents.filter(event => event.event_type === 'email.bounced').flatMap(event => event.email_message_id ? [event.email_message_id] : []),
      complainedMessageIds: recentIncidents.filter(event => event.event_type === 'email.complained').flatMap(event => event.email_message_id ? [event.email_message_id] : []),
      thresholdPercent: pauseThreshold,
    })
    return recommendation ? [{ campaign, ...recommendation }] : []
  })

  const pauseCampaign = async (campaign: CampaignRow) => {
    if (!window.confirm(`Pause ${campaign.name}? This only pauses the campaign; it does not resume automatically.`)) return
    try {
      const userId = await getCurrentUserId()
      const { error: pauseError } = await supabase.from('campaigns').update({ status: 'Paused' }).eq('id', campaign.id).eq('user_id', userId)
      if (pauseError) throw pauseError
      toast.success(`${campaign.name} paused`)
      await queryClient.invalidateQueries({ queryKey: ['growth-center'] })
    } catch (pauseError) {
      toast.error(pauseError instanceof Error ? pauseError.message : 'Could not pause campaign.')
    }
  }

  const selectedProposalProspect = data?.prospects.find(prospect => prospect.id === proposalProspect)
  const proposalFields = {
    prospectName: selectedProposalProspect?.business_name ?? '',
    prospectEmail: selectedProposalProspect?.email ?? '',
    senderBusinessName: proposalSenderBusinessName,
    senderName: proposalSenderName,
    senderEmail: proposalSenderEmail,
    senderAddress: proposalSenderAddress,
    senderWebsite: proposalSenderWebsite,
    service: proposalService,
    currency: proposalCurrency,
    price: proposalPrice,
    timeline: proposalTimeline,
    scope: proposalScope,
    milestones: proposalMilestones,
    paymentTerms: proposalPaymentTerms,
    exclusions: proposalExclusions,
    assumptions: proposalAssumptions,
    validUntil: proposalValidity,
    acceptance: proposalAcceptance,
  }
  const proposalFingerprint = JSON.stringify(proposalFields)
  const proposalConfirmed = proposalConfirmationFingerprint === proposalFingerprint
  const proposalHasPreview = proposalPreviewFingerprint === proposalFingerprint
  const proposalValidation = validateProposalDraft({ ...proposalFields, detailsConfirmed: proposalConfirmed })

  const exportProposal = () => {
    if (!proposalValidation.valid || !proposalHasPreview || !selectedProposalProspect) {
      toast.error(proposalValidation.errors[0] || 'Preview the current proposal before exporting it.')
      return
    }
    const pdf = new jsPDF()
    const navy = [8, 25, 53] as [number, number, number]
    const bottom = 274
    let y = 48
    const addHeader = () => {
      pdf.setFillColor(...navy)
      pdf.rect(0, 0, 210, 34, 'F')
      pdf.setTextColor(255, 255, 255)
      pdf.setFont('helvetica', 'bold')
      pdf.setFontSize(15)
      pdf.text(pdf.splitTextToSize(proposalSenderBusinessName.trim(), 170).slice(0, 2), 16, 15)
      pdf.setFont('helvetica', 'normal')
      pdf.setFontSize(8)
      pdf.text('PROJECT PROPOSAL', 16, 28)
    }
    const addSection = (title: string, value: string) => {
      const lines = pdf.splitTextToSize(value.trim(), 176)
      if (y + 15 > bottom) {
        pdf.addPage()
        addHeader()
        y = 48
      }
      pdf.setTextColor(...navy)
      pdf.setFont('helvetica', 'bold')
      pdf.setFontSize(10)
      pdf.text(title, 16, y)
      y += 6
      pdf.setTextColor(45, 55, 65)
      pdf.setFont('helvetica', 'normal')
      pdf.setFontSize(9)
      for (const line of lines) {
        if (y > bottom) {
          pdf.addPage()
          addHeader()
          y = 48
        }
        pdf.text(line, 16, y)
        y += 5
      }
      y += 5
    }

    addHeader()
    addSection('Prepared for', `${selectedProposalProspect.business_name}${proposalFields.prospectEmail ? `\n${proposalFields.prospectEmail}` : ''}`)
    addSection('Prepared by', [proposalSenderName, proposalSenderBusinessName, proposalSenderEmail, proposalSenderAddress, proposalSenderWebsite].filter(Boolean).join('\n'))
    addSection('Proposed service', proposalService)
    addSection('Scope and deliverables', proposalScope)
    addSection('Confirmed timeline', proposalTimeline)
    addSection('Proposed investment', `${proposalCurrency.toUpperCase()} ${proposalPrice}`)
    addSection('Project milestones', proposalMilestones)
    addSection('Payment terms', proposalPaymentTerms)
    addSection('Exclusions', proposalExclusions)
    addSection('Assumptions', proposalAssumptions)
    addSection('Valid through', proposalValidity)
    addSection('Acceptance', proposalAcceptance)
    const pages = pdf.getNumberOfPages()
    for (let page = 1; page <= pages; page += 1) {
      pdf.setPage(page)
      pdf.setFontSize(8)
      pdf.setTextColor(120, 130, 140)
      pdf.text(`${proposalSenderBusinessName}  |  ${page}/${pages}`, 16, 286, { maxWidth: 178 })
    }
    pdf.save(`Proposal-${selectedProposalProspect.business_name.replace(/[^a-z0-9]+/gi, '-')}.pdf`)
  }

  if (isLoading) return <div className="space-y-4"><div className="h-8 w-48 animate-pulse rounded bg-slate-200"/><div className="h-40 animate-pulse rounded bg-slate-100"/></div>
  if (error) return <p className="py-10 text-sm text-red-600">Could not load Growth Center: {(error as Error).message}</p>

  return <div className="space-y-6">
    <div><div className="flex items-center gap-2"><Sparkles className="h-5 w-5 text-amber-500"/><h1 className="text-2xl font-bold text-slate-800">Growth Center</h1></div><p className="mt-1 text-sm text-slate-500">Turn prospect research and outreach activity into a clearer client-acquisition workflow.</p></div>
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
      {[{label:'Interested prospects',value:interested,icon:Target},{label:'Meetings booked',value:meetings,icon:BadgeCheck},{label:'Clients won',value:won,icon:ArrowUpRight},{label:'Reply rate',value:`${replyRate}%`,icon:MailCheck}].map(item=><Card key={item.label} className="p-5"><div className="flex items-center justify-between"><div><p className="text-2xl font-bold text-slate-800">{item.value}</p><p className="mt-1 text-sm text-slate-500">{item.label}</p></div><item.icon className="h-5 w-5 text-slate-400"/></div></Card>)}
    </div>
    <Card className="p-5"><div className="mb-4"><h2 className="font-semibold text-slate-800">Client acquisition pipeline</h2><p className="text-xs text-slate-500">Prospect counts by current CRM status; stages are not assumed to be unique conversion cohorts.</p></div><div className="grid grid-cols-2 gap-3 sm:grid-cols-4 xl:grid-cols-7">{pipelineStages.map(stage=><div key={stage.status} className="rounded-lg bg-slate-50 p-3"><p className="text-2xl font-bold text-slate-800">{stage.count}</p><p className="mt-1 text-xs text-slate-500">{stage.status}</p></div>)}</div></Card>
    <div className="grid gap-4 sm:grid-cols-3">
      {[{ label: 'Prospects with outbound email', value: linkedProspects.length }, { label: 'Prospects with recorded reply', value: repliedProspects.length }, { label: 'Prospect reply conversion', value: `${linkedProspects.length ? Math.round(repliedProspects.length / linkedProspects.length * 100) : 0}%` }].map(item => <Card key={item.label} className="p-4"><p className="text-xl font-bold text-slate-800">{item.value}</p><p className="mt-1 text-xs text-slate-500">{item.label}</p><p className="mt-1 text-[11px] text-slate-400">Based only on messages linked to prospects.</p></Card>)}
    </div>
    <Card className="p-5"><div className="mb-4"><h2 className="font-semibold text-slate-800">Follow-up intelligence</h2><p className="text-xs text-slate-500">Recommendations from linked message history and CRM status. Nothing is sent automatically.</p></div><div className="grid gap-3 md:grid-cols-2">{followUpRecommendations.map(({ prospect, action, reason, safeToDraft }) => <div key={prospect.id} className="rounded-lg border border-slate-100 p-3"><div className="flex items-center justify-between gap-2"><p className="text-sm font-semibold text-slate-800">{prospect.business_name}</p><span className={`rounded-full px-2 py-1 text-[11px] ${safeToDraft ? 'bg-amber-50 text-amber-800' : 'bg-slate-100 text-slate-600'}`}>{action}</span></div><p className="mt-1 text-xs text-slate-500">{reason}</p></div>)}{followUpRecommendations.length === 0 && <p className="text-sm text-slate-500">No follow-up recommendations from the available linked history.</p>}</div></Card>
    <div className="grid gap-5 xl:grid-cols-2">
      <Card className="p-5"><div className="mb-4 flex items-center gap-2"><Gauge className="h-5 w-5 text-amber-500"/><div><h2 className="font-semibold text-slate-800">Smart prospect priority</h2><p className="text-xs text-slate-500">Rule-based ranking from your saved prospect and audit data.</p></div></div>
        <div className="space-y-3">{ranked.slice(0,8).map(({prospect,score,factors,recommendation})=><div key={prospect.id} className="rounded-lg border border-slate-100 p-3"><div className="flex items-center justify-between gap-3"><div className="min-w-0"><p className="truncate text-sm font-semibold text-slate-800">{prospect.business_name}</p><p className="mt-1 text-xs text-slate-500">{recommendation}</p><p className="mt-1 text-[11px] text-slate-400">{factors.join(' · ')}</p></div><span className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-bold ${score>=75?'bg-green-100 text-green-700':score>=55?'bg-amber-100 text-amber-700':'bg-slate-100 text-slate-600'}`}>{score}/100</span></div></div>)}{ranked.length===0&&<p className="text-sm text-slate-500">Add prospects to see prioritized opportunities.</p>}</div>
        <p className="mt-3 text-xs text-slate-400">Priority is a heuristic, not a prediction of purchase intent. Review each prospect before contacting them.</p>
      </Card>
      <Card className="p-5">
        <div className="mb-4 flex items-center gap-2"><ShieldAlert className="h-5 w-5 text-amber-500"/><div><h2 className="font-semibold text-slate-800">Deliverability & sending safety</h2><p className="text-xs text-slate-500">Counts below come from Resend events received by this workspace.</p></div></div>
        <div className="space-y-3 text-sm">
          {[
            ['Successful send requests', sent],
            ['Resend accepted events', acceptedEvents],
            ['Delivered to recipient mail servers', deliveredEvents],
            ['Permanent bounces', bouncedEvents],
            ['Spam complaints', complainedEvents],
            ['Failed or provider-suppressed events', failedEvents],
            ['Provider suppression additions', suppressionEvents],
            ['Inbound replies recorded', replies],
            ['Follow-ups currently due', due],
          ].map(([label, value]) => <div key={label} className="flex items-start justify-between gap-3 border-b border-slate-100 pb-3"><span className="text-slate-600">{label}</span><strong>{value}</strong></div>)}
          {data?.providerEventsError && <p className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900">Provider event data is unavailable. Apply the Resend events migration and configure the signed webhook before relying on delivery or suppression counts.</p>}
          <div className="rounded-lg bg-amber-50 p-3 text-amber-900"><p className="font-semibold">SPF / DKIM / DMARC: Unknown</p><p className="mt-1 text-xs leading-5">No authoritative DNS checker is configured. Provider message events do not verify DNS or sender reputation.</p></div>
          <div className="space-y-3 rounded-lg border border-slate-200 p-3">
            <label className="flex items-center justify-between gap-3 text-xs text-slate-700"><span>Pause recommendation threshold (%)</span><input aria-label="Campaign pause threshold percent" type="number" min="0" max="100" step="0.1" value={pauseThreshold} onChange={(event) => setPauseThreshold(Math.max(0, Math.min(100, Number(event.target.value))))} className="w-24 rounded-md border border-slate-300 px-2 py-1 text-right"/></label>
            <p className="text-xs leading-5 text-slate-500">Seven-day bounce and complaint events divided by linked campaign sends. Recommendations require at least 10 sends. Nothing pauses automatically.</p>
            {pauseRecommendations.map(({ campaign, sends, incidents, rate }) => <div key={campaign.id} className="flex flex-wrap items-center justify-between gap-3 rounded-md bg-rose-50 p-3 text-rose-900"><p className="min-w-0 text-xs"><strong>Pause review: {campaign.name}</strong><br/>{incidents} bounce/complaint events across {sends} sends ({rate.toFixed(1)}%).</p><Button variant="secondary" size="sm" onClick={() => void pauseCampaign(campaign)}>Pause campaign</Button></div>)}
            {pauseRecommendations.length === 0 && <p className="text-xs text-slate-500">No campaign pause recommendation from the available seven-day provider events.</p>}
          </div>
          <div className="rounded-lg bg-slate-50 p-3 text-xs leading-5 text-slate-600">A successful API response is not proof of delivery. DNS, inbox placement, and sender reputation are not inferred. Suppressed addresses and do-not-contact records are checked again by the server before sending.</div>
        </div>
      </Card>
    </div>
    <Card className="p-5"><div className="mb-4 flex items-center gap-2"><FileText className="h-5 w-5 text-arlotech"/><div><h2 className="font-semibold text-slate-800">Proposal & quotation builder</h2><p className="text-xs text-slate-500">Create a client-specific PDF proposal using confirmed details. Nothing is sent automatically.</p></div></div>
      <div className="mb-4 grid gap-4 border-b border-slate-200 pb-4 md:grid-cols-2">
        <label className="block text-sm"><span className="mb-1 block font-medium text-slate-700">Proposing business name</span><input value={proposalSenderBusinessName} onChange={event => setProposalSenderBusinessName(event.target.value)} className="w-full rounded-md border border-slate-300 px-3 py-2"/></label>
        <label className="block text-sm"><span className="mb-1 block font-medium text-slate-700">Proposal contact name</span><input value={proposalSenderName} onChange={event => setProposalSenderName(event.target.value)} className="w-full rounded-md border border-slate-300 px-3 py-2"/></label>
        <label className="block text-sm"><span className="mb-1 block font-medium text-slate-700">Proposal contact email</span><input type="email" value={proposalSenderEmail} onChange={event => setProposalSenderEmail(event.target.value)} className="w-full rounded-md border border-slate-300 px-3 py-2"/></label>
        <label className="block text-sm"><span className="mb-1 block font-medium text-slate-700">Currency code</span><input value={proposalCurrency} maxLength={3} onChange={event => setProposalCurrency(event.target.value.toUpperCase())} placeholder="GBP, USD, NGN" className="w-full rounded-md border border-slate-300 px-3 py-2"/></label>
        <label className="block text-sm"><span className="mb-1 block font-medium text-slate-700">Business address (optional)</span><input value={proposalSenderAddress} onChange={event => setProposalSenderAddress(event.target.value)} className="w-full rounded-md border border-slate-300 px-3 py-2"/></label>
        <label className="block text-sm"><span className="mb-1 block font-medium text-slate-700">Business website (optional)</span><input value={proposalSenderWebsite} onChange={event => setProposalSenderWebsite(event.target.value)} className="w-full rounded-md border border-slate-300 px-3 py-2"/></label>
        <p className="text-xs text-slate-500 md:col-span-2">Enter the validity date in the proposal details below using YYYY-MM-DD. Enter the price as a number and select its currency code here.</p>
        <label className="block text-sm md:col-span-2"><span className="mb-1 block font-medium text-slate-700">Acceptance block</span><textarea rows={3} value={proposalAcceptance} onChange={event => setProposalAcceptance(event.target.value)} className="w-full rounded-md border border-slate-300 px-3 py-2"/></label>
      </div>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <label className="flex items-start gap-2 text-sm text-slate-700"><input type="checkbox" checked={proposalConfirmed} onChange={event => setProposalConfirmationFingerprint(event.target.checked ? proposalFingerprint : '')} className="mt-1 h-4 w-4 accent-arlotech"/><span>I confirmed the recipient, sender details, scope, price, currency, timeline, payment, exclusions, validity and acceptance terms.</span></label>
        <Button variant="secondary" onClick={() => setProposalPreviewFingerprint(proposalFingerprint)}>Preview proposal</Button>
      </div>
      {proposalHasPreview && <div className="mb-4 space-y-3 rounded-md border border-slate-200 bg-slate-50 p-4" aria-label="Proposal preview">
        <div><h3 className="font-semibold text-slate-800">{proposalSenderBusinessName || 'Proposing business'}</h3><p className="text-xs text-slate-500">{[proposalSenderName, proposalSenderEmail, proposalSenderAddress, proposalSenderWebsite].filter(Boolean).join(' · ')}</p></div>
        <div><p className="text-sm font-semibold text-slate-800">Website Project Proposal for {selectedProposalProspect?.business_name || 'Select a prospect'}</p>{proposalFields.prospectEmail && <p className="text-xs text-slate-500">{proposalFields.prospectEmail}</p>}</div>
        <div className="grid gap-3 text-sm sm:grid-cols-2"><p><strong>Service</strong><br/>{proposalService || 'Not entered'}</p><p><strong>Investment</strong><br/>{proposalCurrency || 'Currency missing'} {proposalPrice || 'Amount missing'}</p><p><strong>Timeline</strong><br/>{proposalTimeline || 'Not entered'}</p><p><strong>Valid through</strong><br/>{proposalValidity || 'Not entered'}</p></div>
        {([['Scope and deliverables', proposalScope], ['Milestones', proposalMilestones], ['Payment terms', proposalPaymentTerms], ['Exclusions', proposalExclusions], ['Assumptions', proposalAssumptions], ['Acceptance', proposalAcceptance]] as const).map(([label, value]) => <div key={label}><p className="text-xs font-semibold uppercase text-slate-500">{label}</p><p className="whitespace-pre-wrap text-sm text-slate-700">{value || 'Not entered'}</p></div>)}
        {proposalValidation.errors.length > 0 && <ul className="list-inside list-disc text-xs text-red-700" role="alert">{proposalValidation.errors.map(message => <li key={message}>{message}</li>)}</ul>}
      </div>}
      <div className="grid gap-4 md:grid-cols-2"><label className="block text-sm"><span className="mb-1 block font-medium text-slate-700">Prospect</span><select value={proposalProspect} onChange={e=>setProposalProspect(e.target.value)} className="w-full rounded-md border border-slate-300 bg-white px-3 py-2"><option value="">Select a prospect</option>{(data?.prospects||[]).filter(p=>!p.do_not_contact).map(p=><option key={p.id} value={p.id}>{p.business_name}</option>)}</select></label><label className="block text-sm"><span className="mb-1 block font-medium text-slate-700">Service</span><input value={proposalService} onChange={e=>setProposalService(e.target.value)} className="w-full rounded-md border border-slate-300 px-3 py-2"/></label><label className="block text-sm"><span className="mb-1 block font-medium text-slate-700">Proposed price (confirmed amount)</span><input value={proposalPrice} onChange={e=>setProposalPrice(e.target.value)} placeholder="e.g. £250 or ₦350,000" className="w-full rounded-md border border-slate-300 px-3 py-2"/></label><label className="block text-sm"><span className="mb-1 block font-medium text-slate-700">Estimated timeline</span><input value={proposalTimeline} onChange={e=>setProposalTimeline(e.target.value)} placeholder="e.g. 2–3 weeks after kickoff" className="w-full rounded-md border border-slate-300 px-3 py-2"/></label><label className="block text-sm md:col-span-2"><span className="mb-1 block font-medium text-slate-700">Scope and deliverables</span><textarea rows={5} value={proposalScope} onChange={e=>setProposalScope(e.target.value)} className="w-full rounded-md border border-slate-300 px-3 py-2"/></label><label className="block text-sm"><span className="mb-1 block font-medium text-slate-700">Milestones</span><textarea rows={3} value={proposalMilestones} onChange={e=>setProposalMilestones(e.target.value)} className="w-full rounded-md border border-slate-300 px-3 py-2"/></label><label className="block text-sm"><span className="mb-1 block font-medium text-slate-700">Payment terms</span><textarea rows={3} value={proposalPaymentTerms} onChange={e=>setProposalPaymentTerms(e.target.value)} className="w-full rounded-md border border-slate-300 px-3 py-2"/></label><label className="block text-sm"><span className="mb-1 block font-medium text-slate-700">Exclusions</span><textarea rows={3} value={proposalExclusions} onChange={e=>setProposalExclusions(e.target.value)} className="w-full rounded-md border border-slate-300 px-3 py-2"/></label><label className="block text-sm"><span className="mb-1 block font-medium text-slate-700">Assumptions</span><textarea rows={3} value={proposalAssumptions} onChange={e=>setProposalAssumptions(e.target.value)} className="w-full rounded-md border border-slate-300 px-3 py-2"/></label><label className="block text-sm"><span className="mb-1 block font-medium text-slate-700">Proposal validity</span><input value={proposalValidity} onChange={e=>setProposalValidity(e.target.value)} className="w-full rounded-md border border-slate-300 px-3 py-2"/></label></div>
      <div className="mt-4 flex flex-wrap items-center justify-between gap-3"><p className="text-xs text-slate-400">Proposal terms stay local to this session and require current preview and operator confirmation.</p><Button onClick={exportProposal} disabled={!proposalValidation.valid||!proposalHasPreview}><Download className="mr-2 h-4 w-4"/>Export proposal PDF</Button></div>
    </Card>
  </div>
}
