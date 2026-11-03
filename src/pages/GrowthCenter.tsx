import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { ArrowUpRight, BadgeCheck, Download, Gauge, MailCheck, ShieldAlert, Sparkles, Target, FileText } from 'lucide-react'
import jsPDF from 'jspdf'
import { Card } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { getCurrentUserId, supabase } from '@/lib/supabase'
import { recommendNextOutreachAction, scoreProspectOpportunity } from '@/lib/growthIntelligence'
import { loadArlotechLogoDataUrl } from '@/lib/brandAssets'
import { toast } from 'sonner'

type ProspectRow = { id: string; business_name: string; email: string | null; website: string | null; business_category: string | null; status: string; do_not_contact: boolean; created_at: string }
type AuditRow = { prospect_id: string | null; overall_score: number | null; performance_score: number | null; seo_score: number | null; accessibility_score: number | null; best_practices_score: number | null; created_at?: string | null }
type MessageRow = { direction: string; status: string; sent_at: string | null; received_at: string | null; prospect_id: string | null; body: string | null }

export function GrowthCenterPage() {
  const [proposalProspect, setProposalProspect] = useState('')
  const [proposalService, setProposalService] = useState('Website design and development')
  const [proposalPrice, setProposalPrice] = useState('')
  const [proposalTimeline, setProposalTimeline] = useState('')
  const [proposalScope, setProposalScope] = useState('Responsive website design and development\nMobile-friendly layouts\nContact form and WhatsApp integration\nBasic on-page SEO setup\nLaunch support')
  const [proposalExclusions, setProposalExclusions] = useState('Paid third-party subscriptions, domain renewals and hosting fees unless explicitly included.')
  const [proposalMilestones, setProposalMilestones] = useState('Discovery and requirements\nDesign approval\nDevelopment and review\nTesting and handover')
  const [proposalPaymentTerms, setProposalPaymentTerms] = useState('To be agreed in writing before project commencement.')
  const [proposalValidity, setProposalValidity] = useState('14 days')
  const [proposalAssumptions, setProposalAssumptions] = useState('Client will provide required content, brand assets and timely feedback.')
  const { data: queryData, isLoading, error } = useQuery({
    queryKey: ['growth-center'],
    queryFn: async () => {
      const userId = await getCurrentUserId()
      const [prospects, audits, messages, sequences] = await Promise.all([
        supabase.from('prospects').select('id,business_name,email,website,business_category,status,do_not_contact,created_at').eq('user_id', userId),
        supabase.from('website_analyses').select('prospect_id,overall_score,performance_score,seo_score,accessibility_score,best_practices_score,created_at').eq('user_id', userId).eq('analysis_status', 'completed'),
        supabase.from('email_messages').select('direction,status,sent_at,received_at,prospect_id,body').eq('user_id', userId),
        supabase.from('follow_up_sequences').select('id,prospect_id,status,next_action_at').eq('user_id', userId),
      ])
      for (const result of [prospects, audits, messages, sequences]) if (result.error) throw result.error
      return {
        prospects: (prospects.data || []) as ProspectRow[],
        audits: (audits.data || []) as AuditRow[],
        messages: (messages.data || []) as MessageRow[],
        sequences: sequences.data || [],
        asOf: Date.now(),
      }
    },
  })
  const data = queryData as {
    prospects: ProspectRow[]
    audits: AuditRow[]
    messages: MessageRow[]
    sequences: Array<{ id: string; prospect_id: string | null; status: string; next_action_at: string | null }>
    asOf: number
  } | undefined
  const auditByProspect = useMemo(() => new Map([...((data?.audits || []).filter(a => a.prospect_id))].sort((a,b) => new Date(a.created_at || 0).getTime() - new Date(b.created_at || 0).getTime()).map(a => [a.prospect_id as string, a])), [data?.audits])
  const ranked = useMemo(() => (data?.prospects || []).map(prospect => ({ prospect, ...scoreProspectOpportunity(prospect, auditByProspect.get(prospect.id)) })).filter(x => x.eligible).sort((a,b) => b.score - a.score), [data?.prospects, auditByProspect])
  const sent = (data?.messages || []).filter(m => m.direction === 'outbound' && m.status === 'sent').length
  const replies = (data?.messages || []).filter(m => m.direction === 'inbound' || m.status === 'replied').length
  const replyRate = sent ? Math.round((replies / sent) * 100) : 0
  const won = (data?.prospects || []).filter(p => p.status === 'Won').length
  const pipelineStages = ['New', 'Ready for Outreach', 'Contacted', 'Replied', 'Interested', 'Meeting Booked', 'Won'].map(status => ({ status, count: (data?.prospects || []).filter(p => p.status === status).length }))
  const failedSends = (data?.messages || []).filter(m => ['failed', 'bounced', 'undelivered'].includes(m.status.toLowerCase())).length
  const meetings = (data?.prospects || []).filter(p => p.status === 'Meeting Booked').length
  const interested = (data?.prospects || []).filter(p => p.status === 'Interested').length
  const due = (data?.sequences || []).filter((s: {status: string; next_action_at: string | null}) => s.status === 'Active' && s.next_action_at && Date.parse(s.next_action_at) <= (data?.asOf ?? 0)).length
  const linkedProspects = (data?.prospects || []).filter(p => (data?.messages || []).some(m => m.prospect_id === p.id && m.direction === 'outbound'))
  const repliedProspects = linkedProspects.filter(p => (data?.messages || []).some(m => m.prospect_id === p.id && (m.direction === 'inbound' || m.status.toLowerCase() === 'replied')))
  const latestMessageFor = (id: string, direction: string) => (data?.messages || []).filter(m => m.prospect_id === id && m.direction === direction).sort((a,b) => new Date(b.received_at || b.sent_at || 0).getTime() - new Date(a.received_at || a.sent_at || 0).getTime())[0]
  const followUpRecommendations = (data?.prospects || []).map(prospect => { const inbound = latestMessageFor(prospect.id, 'inbound'); const outbound = latestMessageFor(prospect.id, 'outbound'); return { prospect, ...recommendNextOutreachAction({ status: prospect.status, do_not_contact: prospect.do_not_contact, latestInbound: inbound?.body, latestOutboundAt: outbound?.sent_at }) } }).filter(item => item.safeToDraft || item.action === 'Stop outreach' || item.action === 'Pause and investigate').slice(0, 8)

  const exportProposal = async () => {
    const prospect = data?.prospects.find(p => p.id === proposalProspect)
    if (!prospect || !proposalPrice.trim() || !proposalTimeline.trim()) return
    let logo: string
    try {
      logo = await loadArlotechLogoDataUrl()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not load the Arlotech logo for this PDF.')
      return
    }

    const pdf = new jsPDF()
    const navy = [8, 25, 53] as [number, number, number]
    pdf.setFillColor(...navy); pdf.rect(0, 0, 210, 42, 'F')
    pdf.addImage(logo, 'PNG', 14, 5, 32, 32)
    pdf.setTextColor(255, 255, 255); pdf.setFont('helvetica', 'bold'); pdf.setFontSize(16); pdf.text('ARLOTECH DIGITAL SOLUTIONS', 52, 18)
    pdf.setFont('helvetica', 'normal'); pdf.setFontSize(9); pdf.text('PROJECT PROPOSAL', 52, 28)
    pdf.setTextColor(25, 35, 50); pdf.setFont('helvetica', 'bold'); pdf.setFontSize(20); pdf.text('Website Project Proposal', 16, 61)
    pdf.setFont('helvetica', 'normal'); pdf.setFontSize(10); pdf.text(`Prepared for: ${prospect.business_name}`, 16, 72)
    if (prospect.email) pdf.text(`Contact: ${prospect.email}`, 16, 79)
    pdf.setFont('helvetica', 'bold'); pdf.setFontSize(12); pdf.text('Proposed service', 16, 96)
    pdf.setFont('helvetica', 'normal'); pdf.setFontSize(10); pdf.text(proposalService, 16, 104)
    pdf.setFont('helvetica', 'bold'); pdf.text('Scope of work', 16, 119)
    pdf.setFont('helvetica', 'normal'); const lines = pdf.splitTextToSize(proposalScope, 175); pdf.text(lines, 16, 127)
    let y = 127 + lines.length * 6 + 10
    if (y > 240) { pdf.addPage(); y = 25 }
    pdf.setFont('helvetica', 'bold'); pdf.text('Estimated timeline', 16, y); pdf.setFont('helvetica', 'normal'); pdf.text(proposalTimeline, 16, y + 7)
    pdf.setFont('helvetica', 'bold'); pdf.text('Proposed investment', 16, y + 21); pdf.setFont('helvetica', 'normal'); pdf.text(proposalPrice, 16, y + 28)
    let sectionY = Math.max(y + 38, 170)
    for (const [title, value] of [['Project milestones', proposalMilestones], ['Payment terms', proposalPaymentTerms], ['Exclusions', proposalExclusions], ['Assumptions', proposalAssumptions], ['Validity', proposalValidity], ['Acceptance', 'By accepting this proposal, both parties agree to confirm the final scope, price, schedule and terms in a separate written agreement.']]) {
      if (sectionY > 250) { pdf.addPage(); sectionY = 24 }
      pdf.setFont('helvetica', 'bold'); pdf.setFontSize(11); pdf.setTextColor(8, 25, 53); pdf.text(title, 16, sectionY)
      pdf.setFont('helvetica', 'normal'); pdf.setFontSize(9); pdf.setTextColor(45, 55, 65)
      const wrapped = pdf.splitTextToSize(value, 175)
      sectionY += 7
      for (const line of wrapped) { if (sectionY > 270) { pdf.addPage(); sectionY = 24 }; pdf.text(line, 16, sectionY); sectionY += 5 }
      sectionY += 8
    }
    const pages = pdf.getNumberOfPages()
    for (let page = 1; page <= pages; page++) { pdf.setPage(page); pdf.setFontSize(8); pdf.setTextColor(120, 130, 140); pdf.text(`Arlotech Digital Solutions  •  ${page}/${pages}`, 16, 286) }
    pdf.save(`Arlotech-Proposal-${prospect.business_name.replace(/[^a-z0-9]+/gi, '-')}.pdf`)
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
      <Card className="p-5"><div className="mb-4 flex items-center gap-2"><ShieldAlert className="h-5 w-5 text-amber-500"/><div><h2 className="font-semibold text-slate-800">Deliverability & sending safety</h2><p className="text-xs text-slate-500">Operational checks based on records currently available in this workspace.</p></div></div>
        <div className="space-y-3 text-sm"><div className="flex items-start justify-between gap-3 border-b border-slate-100 pb-3"><span className="text-slate-600">Sent messages recorded</span><strong>{sent}</strong></div><div className="flex items-start justify-between gap-3 border-b border-slate-100 pb-3"><span className="text-slate-600">Replies recorded</span><strong>{replies}</strong></div><div className="flex items-start justify-between gap-3 border-b border-slate-100 pb-3"><span className="text-slate-600">Failed / bounced messages recorded</span><strong>{failedSends}</strong></div><div className="flex items-start justify-between gap-3 border-b border-slate-100 pb-3"><span className="text-slate-600">Follow-ups currently due</span><strong>{due}</strong></div><div className="rounded-lg bg-amber-50 p-3 text-amber-900"><p className="font-semibold">SPF / DKIM / DMARC: Unknown</p><p className="mt-1 text-xs leading-5">No authoritative DNS or mailbox reputation integration is configured in this build. These checks remain Unknown until a trusted server-side verifier or provider event confirms them.</p></div><div className="rounded-lg bg-slate-50 p-3 text-xs leading-5 text-slate-600">Safety practice: suppress unsubscribes and do-not-contact records, verify recipient addresses, start with small batches, and pause sending if hard bounces or complaints rise. Provider acceptance is not inbox delivery. Opens are not treated as reliable intent signals.</div></div>
      </Card>
    </div>
    <Card className="p-5"><div className="mb-4 flex items-center gap-2"><FileText className="h-5 w-5 text-arlotech"/><div><h2 className="font-semibold text-slate-800">Proposal & quotation builder</h2><p className="text-xs text-slate-500">Create a client-specific PDF proposal using confirmed details. Nothing is sent automatically.</p></div></div>
      <div className="grid gap-4 md:grid-cols-2"><label className="block text-sm"><span className="mb-1 block font-medium text-slate-700">Prospect</span><select value={proposalProspect} onChange={e=>setProposalProspect(e.target.value)} className="w-full rounded-md border border-slate-300 bg-white px-3 py-2"><option value="">Select a prospect</option>{(data?.prospects||[]).filter(p=>!p.do_not_contact).map(p=><option key={p.id} value={p.id}>{p.business_name}</option>)}</select></label><label className="block text-sm"><span className="mb-1 block font-medium text-slate-700">Service</span><input value={proposalService} onChange={e=>setProposalService(e.target.value)} className="w-full rounded-md border border-slate-300 px-3 py-2"/></label><label className="block text-sm"><span className="mb-1 block font-medium text-slate-700">Proposed price (confirmed amount)</span><input value={proposalPrice} onChange={e=>setProposalPrice(e.target.value)} placeholder="e.g. £250 or ₦350,000" className="w-full rounded-md border border-slate-300 px-3 py-2"/></label><label className="block text-sm"><span className="mb-1 block font-medium text-slate-700">Estimated timeline</span><input value={proposalTimeline} onChange={e=>setProposalTimeline(e.target.value)} placeholder="e.g. 2–3 weeks after kickoff" className="w-full rounded-md border border-slate-300 px-3 py-2"/></label><label className="block text-sm md:col-span-2"><span className="mb-1 block font-medium text-slate-700">Scope and deliverables</span><textarea rows={5} value={proposalScope} onChange={e=>setProposalScope(e.target.value)} className="w-full rounded-md border border-slate-300 px-3 py-2"/></label><label className="block text-sm"><span className="mb-1 block font-medium text-slate-700">Milestones</span><textarea rows={3} value={proposalMilestones} onChange={e=>setProposalMilestones(e.target.value)} className="w-full rounded-md border border-slate-300 px-3 py-2"/></label><label className="block text-sm"><span className="mb-1 block font-medium text-slate-700">Payment terms</span><textarea rows={3} value={proposalPaymentTerms} onChange={e=>setProposalPaymentTerms(e.target.value)} className="w-full rounded-md border border-slate-300 px-3 py-2"/></label><label className="block text-sm"><span className="mb-1 block font-medium text-slate-700">Exclusions</span><textarea rows={3} value={proposalExclusions} onChange={e=>setProposalExclusions(e.target.value)} className="w-full rounded-md border border-slate-300 px-3 py-2"/></label><label className="block text-sm"><span className="mb-1 block font-medium text-slate-700">Assumptions</span><textarea rows={3} value={proposalAssumptions} onChange={e=>setProposalAssumptions(e.target.value)} className="w-full rounded-md border border-slate-300 px-3 py-2"/></label><label className="block text-sm"><span className="mb-1 block font-medium text-slate-700">Proposal validity</span><input value={proposalValidity} onChange={e=>setProposalValidity(e.target.value)} className="w-full rounded-md border border-slate-300 px-3 py-2"/></label></div>
      <div className="mt-4 flex flex-wrap items-center justify-between gap-3"><p className="text-xs text-slate-400">Review pricing, scope, payment terms and legal terms before sharing. This first version intentionally avoids inventing terms.</p><Button onClick={exportProposal} disabled={!proposalProspect||!proposalPrice.trim()||!proposalTimeline.trim()||!proposalScope.trim()}><Download className="mr-2 h-4 w-4"/>Export proposal PDF</Button></div>
    </Card>
  </div>
}
