import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { format } from 'date-fns'
import { CalendarClock, CheckCircle2, Circle, FileText, Handshake, Plus, StickyNote, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { getCurrentUserId, supabase } from '@/lib/supabase'
import type { Prospect } from '@/types'

const stages = ['New', 'Researching', 'Ready for Outreach', 'Drafted', 'Contacted', 'Follow-up Due', 'Replied', 'Interested', 'Meeting Booked', 'Won', 'Lost', 'Not Interested', 'Do Not Contact']
const taskStatuses = ['Todo', 'In Progress', 'Done', 'Blocked']
const priorities = ['Low', 'Medium', 'High', 'Critical']
const proposalStatuses = ['Draft', 'Sent', 'Accepted', 'Declined', 'Expired']
type Task = { id: string; title: string; description: string | null; priority: string; status: string; due_at: string | null }
type Note = { id: string; content: string; created_at: string | null }
type Proposal = { id: string; title: string; scope_summary: string | null; amount: number | null; currency: string; status: string; sent_at: string | null; follow_up_at: string | null; document_url: string | null; notes: string | null; created_at: string }
const dateLabel = (value: string | null) => value ? format(new Date(value), 'MMM d, yyyy · h:mm a') : 'No date set'
const safeHttpUrl = (value: string | null) => {
  if (!value) return null
  try { const parsed = new URL(value); return parsed.protocol === 'https:' || parsed.protocol === 'http:' ? parsed.href : null } catch { return null }
}

export function ProspectRelationshipWorkspace({ prospect }: { prospect: Prospect }) {
  const client = useQueryClient()
  const [note, setNote] = useState('')
  const [taskTitle, setTaskTitle] = useState('')
  const [taskDescription, setTaskDescription] = useState('')
  const [taskDue, setTaskDue] = useState('')
  const [priority, setPriority] = useState('Medium')
  const [proposalOpen, setProposalOpen] = useState(false)
  const [proposalTitle, setProposalTitle] = useState('Website redesign proposal')
  const [scope, setScope] = useState('')
  const [amount, setAmount] = useState('')
  const [currency, setCurrency] = useState('NGN')
  const [followUp, setFollowUp] = useState('')
  const [documentUrl, setDocumentUrl] = useState('')
  const [proposalNotes, setProposalNotes] = useState('')
  const refresh = () => {
    void client.invalidateQueries({ queryKey: ['prospect-crm', prospect.id] })
    void client.invalidateQueries({ queryKey: ['/prospect', prospect.id] })
    void client.invalidateQueries({ queryKey: ['/prospect', prospect.id, 'engagement-timeline'] })
  }
  const tasksQuery = useQuery<Task[]>({ queryKey: ['prospect-crm', prospect.id, 'tasks'], queryFn: async () => {
    const uid = await getCurrentUserId()
    const { data, error } = await supabase.from('tasks').select('id,title,description,priority,status,due_at').eq('user_id', uid).eq('prospect_id', prospect.id).order('due_at', { ascending: true, nullsFirst: false }).limit(100)
    if (error) throw error
    return data as Task[]
  } })
  const notesQuery = useQuery<Note[]>({ queryKey: ['prospect-crm', prospect.id, 'notes'], queryFn: async () => {
    const uid = await getCurrentUserId()
    const { data, error } = await supabase.from('prospect_notes').select('id,content,created_at').eq('user_id', uid).eq('prospect_id', prospect.id).order('created_at', { ascending: false }).limit(100)
    if (error) throw error
    return data as Note[]
  } })
  const proposalsQuery = useQuery<Proposal[]>({ queryKey: ['prospect-crm', prospect.id, 'proposals'], queryFn: async () => {
    const uid = await getCurrentUserId()
    const { data, error } = await supabase.from('prospect_proposals').select('*').eq('user_id', uid).eq('prospect_id', prospect.id).order('created_at', { ascending: false }).limit(50)
    if (error) throw error
    return data as Proposal[]
  } })
  const log = async (uid: string, eventType: string, description: string, metadata: Record<string, string | number | boolean | null> = {}) => {
    const { error } = await supabase.from('activity_logs').insert({ user_id: uid, prospect_id: prospect.id, event_type: eventType, description, metadata })
    if (error) console.warn('Relationship activity could not be logged:', error.message)
  }
  const stageMutation = useMutation({ mutationFn: async (status: string) => {
    const uid = await getCurrentUserId()
    const { error } = await supabase.from('prospects').update({ status, do_not_contact: status === 'Do Not Contact' ? true : prospect.do_not_contact }).eq('id', prospect.id).eq('user_id', uid)
    if (error) throw error
    await log(uid, 'pipeline_stage_changed', `Pipeline stage changed to ${status}`, { status })
  }, onSuccess: () => { toast.success('Pipeline stage updated'); refresh() }, onError: (e: Error) => toast.error(e.message) })
  const noteMutation = useMutation({ mutationFn: async () => {
    if (!note.trim()) throw new Error('Write a note before saving.')
    const uid = await getCurrentUserId()
    const { error } = await supabase.from('prospect_notes').insert({ user_id: uid, prospect_id: prospect.id, content: note.trim() })
    if (error) throw error
    await log(uid, 'relationship_note_added', 'A relationship note was added')
  }, onSuccess: () => { setNote(''); toast.success('Note saved'); refresh() }, onError: (e: Error) => toast.error(e.message) })
  const taskMutation = useMutation({ mutationFn: async () => {
    if (!taskTitle.trim()) throw new Error('Enter a task title.')
    const uid = await getCurrentUserId()
    const { error } = await supabase.from('tasks').insert({ user_id: uid, prospect_id: prospect.id, title: taskTitle.trim(), description: taskDescription.trim() || null, priority, status: 'Todo', due_at: taskDue ? new Date(taskDue).toISOString() : null })
    if (error) throw error
    await log(uid, 'follow_up_task_created', `Follow-up task created: ${taskTitle.trim()}`, { priority, due_at: taskDue ? new Date(taskDue).toISOString() : null })
  }, onSuccess: () => { setTaskTitle(''); setTaskDescription(''); setTaskDue(''); setPriority('Medium'); toast.success('Follow-up task created'); refresh() }, onError: (e: Error) => toast.error(e.message) })
  const taskUpdate = useMutation({ mutationFn: async ({ id, status }: { id: string; status: string }) => {
    const uid = await getCurrentUserId()
    const { error } = await supabase.from('tasks').update({ status, completed_at: status === 'Done' ? new Date().toISOString() : null }).eq('id', id).eq('user_id', uid).eq('prospect_id', prospect.id)
    if (error) throw error
    await log(uid, 'follow_up_task_updated', `A follow-up task was marked ${status.toLowerCase()}`, { task_id: id, status })
  }, onSuccess: () => { toast.success('Task updated'); refresh() }, onError: (e: Error) => toast.error(e.message) })
  const taskDelete = useMutation({ mutationFn: async (id: string) => {
    const uid = await getCurrentUserId()
    const { error } = await supabase.from('tasks').delete().eq('id', id).eq('user_id', uid).eq('prospect_id', prospect.id)
    if (error) throw error
    await log(uid, 'follow_up_task_deleted', 'A follow-up task was deleted', { task_id: id })
  }, onSuccess: () => { toast.success('Task deleted'); refresh() }, onError: (e: Error) => toast.error(e.message) })
  const proposalMutation = useMutation({ mutationFn: async () => {
    if (!proposalTitle.trim()) throw new Error('Enter a proposal title.')
    const parsedAmount = amount.trim() ? Number(amount) : null
    if (parsedAmount !== null && (!Number.isFinite(parsedAmount) || parsedAmount < 0)) throw new Error('Enter a valid non-negative amount.')
    const safeDocumentUrl = documentUrl.trim() ? safeHttpUrl(documentUrl.trim()) : null
    if (documentUrl.trim() && !safeDocumentUrl) throw new Error('Proposal document URL must use http or https.')
    const uid = await getCurrentUserId()
    const { data, error } = await supabase.from('prospect_proposals').insert({ user_id: uid, prospect_id: prospect.id, title: proposalTitle.trim(), scope_summary: scope.trim() || null, amount: parsedAmount, currency, status: 'Draft', follow_up_at: followUp ? new Date(followUp).toISOString() : null, document_url: safeDocumentUrl, notes: proposalNotes.trim() || null }).select('id').single()
    if (error) throw error
    await log(uid, 'proposal_created', `Proposal created: ${proposalTitle.trim()}`, { proposal_id: data.id })
  }, onSuccess: () => { setProposalOpen(false); setProposalTitle('Website redesign proposal'); setScope(''); setAmount(''); setFollowUp(''); setDocumentUrl(''); setProposalNotes(''); toast.success('Proposal record created'); refresh() }, onError: (e: Error) => toast.error(e.message) })
  const proposalUpdate = useMutation({ mutationFn: async ({ proposal, status }: { proposal: Proposal; status: string }) => {
    const uid = await getCurrentUserId()
    const { error } = await supabase.from('prospect_proposals').update({ status, sent_at: status === 'Sent' ? proposal.sent_at || new Date().toISOString() : proposal.sent_at }).eq('id', proposal.id).eq('user_id', uid).eq('prospect_id', prospect.id)
    if (error) throw error
    await log(uid, 'proposal_status_changed', `Proposal “${proposal.title}” marked ${status.toLowerCase()}`, { proposal_id: proposal.id, status })
  }, onSuccess: () => { toast.success('Proposal status updated'); refresh() }, onError: (e: Error) => toast.error(e.message) })
  const tasks: Task[] = (tasksQuery.data ?? []) as Task[]
  const proposals: Proposal[] = (proposalsQuery.data ?? []) as Proposal[]
  const notes: Note[] = (notesQuery.data ?? []) as Note[]
  const openTasks = tasks.filter((task: Task) => task.status !== 'Done')

  return <section className="space-y-5" aria-labelledby="relationship-workspace-heading">
    <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between"><div><h2 id="relationship-workspace-heading" className="text-xl font-bold text-slate-900">Relationship workspace</h2><p className="mt-1 text-sm text-slate-500">Manage next actions, prospect context, proposals, and conversion progress.</p></div><div className="flex flex-wrap gap-2"><Badge variant="info">{openTasks.length} open tasks</Badge><Badge variant="success">{proposals.filter((p: Proposal) => p.status === 'Accepted').length} accepted</Badge><Badge>{proposals.length} proposals</Badge></div></div>
    <Card className="space-y-3"><div className="flex items-center gap-2"><Handshake className="h-5 w-5 text-arlotech"/><h3 className="font-semibold text-slate-800">Pipeline stage</h3></div><div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between"><p className="text-sm text-slate-600">Keep this prospect's current relationship stage accurate.</p><select aria-label="Prospect pipeline stage" value={prospect.status} onChange={e => stageMutation.mutate(e.target.value)} disabled={stageMutation.isPending} className="min-h-10 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm sm:w-64">{stages.map(s => <option key={s}>{s}</option>)}</select></div>{prospect.do_not_contact && <p className="rounded-lg bg-amber-50 p-3 text-xs text-amber-800">This prospect is marked Do Not Contact. Changing the pipeline label does not remove outreach suppression.</p>}</Card>
    <div className="grid gap-5 xl:grid-cols-2">
      <Card className="space-y-4"><div className="flex items-center gap-2"><CalendarClock className="h-5 w-5 text-arlotech"/><div><h3 className="font-semibold text-slate-800">Follow-up tasks</h3><p className="text-xs text-slate-500">Track specific next actions and deadlines.</p></div></div><form className="space-y-2 rounded-lg bg-slate-50 p-3" onSubmit={e => { e.preventDefault(); taskMutation.mutate() }}><input value={taskTitle} onChange={e => setTaskTitle(e.target.value)} placeholder="e.g. Call to discuss proposal" maxLength={160} aria-label="Task title" className="min-h-10 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm"/><textarea value={taskDescription} onChange={e => setTaskDescription(e.target.value)} placeholder="Optional details" maxLength={1000} rows={2} aria-label="Task details" className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm"/><div className="grid grid-cols-2 gap-2"><label className="text-xs text-slate-600">Due date<input type="datetime-local" value={taskDue} onChange={e => setTaskDue(e.target.value)} className="mt-1 min-h-10 w-full rounded-lg border border-slate-300 bg-white px-2 text-sm"/></label><label className="text-xs text-slate-600">Priority<select value={priority} onChange={e => setPriority(e.target.value)} className="mt-1 min-h-10 w-full rounded-lg border border-slate-300 bg-white px-2 text-sm">{priorities.map(p => <option key={p}>{p}</option>)}</select></label></div><div className="flex justify-end"><Button type="submit" size="sm" disabled={taskMutation.isPending || !taskTitle.trim()}><Plus className="h-4 w-4"/>Add task</Button></div></form>{tasksQuery.error && <p role="alert" className="text-sm text-red-600">Could not load tasks: {(tasksQuery.error as Error).message}</p>}{tasksQuery.isLoading ? <div className="h-14 animate-pulse rounded bg-slate-100"/> : tasks.length === 0 ? <p className="text-sm text-slate-500">No tasks yet. Add a follow-up action to keep this relationship moving.</p> : <ul className="divide-y divide-slate-100">{tasks.map(task => <li key={task.id} className="flex items-start gap-3 py-3"><span className="mt-0.5">{task.status === 'Done' ? <CheckCircle2 className="h-5 w-5 text-emerald-600"/> : <Circle className="h-5 w-5 text-slate-400"/>}</span><div className="min-w-0 flex-1"><p className={`break-words text-sm font-medium ${task.status === 'Done' ? 'text-slate-400 line-through' : 'text-slate-800'}`}>{task.title}</p>{task.description && <p className="mt-1 whitespace-pre-wrap text-xs text-slate-500">{task.description}</p>}<div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-slate-500"><Badge variant={task.priority === 'High' || task.priority === 'Critical' ? 'warning' : 'default'}>{task.priority}</Badge><span>{dateLabel(task.due_at)}</span></div></div><div className="flex shrink-0 flex-col gap-1"><select aria-label={`Status for ${task.title}`} value={task.status} onChange={e => taskUpdate.mutate({ id: task.id, status: e.target.value })} className="max-w-32 rounded border border-slate-200 bg-white px-2 py-1 text-xs">{taskStatuses.map(s => <option key={s}>{s}</option>)}</select><button type="button" onClick={() => { if (window.confirm('Delete this task?')) taskDelete.mutate(task.id) }} aria-label={`Delete ${task.title}`} className="self-end p-1 text-slate-400 hover:text-red-600"><Trash2 className="h-4 w-4"/></button></div></li>)}</ul>}</Card>
      <Card className="space-y-4"><div className="flex items-center gap-2"><FileText className="h-5 w-5 text-arlotech"/><div><h3 className="font-semibold text-slate-800">Proposal tracking</h3><p className="text-xs text-slate-500">Record proposal value, delivery, and outcome.</p></div></div>{!proposalOpen ? <Button variant="secondary" className="w-full" onClick={() => setProposalOpen(true)}><Plus className="h-4 w-4"/>Add proposal</Button> : <form className="space-y-2 rounded-lg bg-slate-50 p-3" onSubmit={e => { e.preventDefault(); proposalMutation.mutate() }}><input value={proposalTitle} onChange={e => setProposalTitle(e.target.value)} maxLength={160} aria-label="Proposal title" className="min-h-10 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm"/><textarea value={scope} onChange={e => setScope(e.target.value)} maxLength={1500} rows={2} placeholder="Scope summary / deliverables" aria-label="Proposal scope" className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm"/><div className="grid grid-cols-2 gap-2"><label className="text-xs text-slate-600">Amount<input type="number" min="0" step="0.01" value={amount} onChange={e => setAmount(e.target.value)} placeholder="Optional" className="mt-1 min-h-10 w-full rounded-lg border border-slate-300 bg-white px-2 text-sm"/></label><label className="text-xs text-slate-600">Currency<select value={currency} onChange={e => setCurrency(e.target.value)} className="mt-1 min-h-10 w-full rounded-lg border border-slate-300 bg-white px-2 text-sm">{['NGN','USD','GBP','EUR'].map(c => <option key={c}>{c}</option>)}</select></label></div><label className="block text-xs text-slate-600">Follow-up date<input type="datetime-local" value={followUp} onChange={e => setFollowUp(e.target.value)} className="mt-1 min-h-10 w-full rounded-lg border border-slate-300 bg-white px-2 text-sm"/></label><input type="url" value={documentUrl} onChange={e => setDocumentUrl(e.target.value)} maxLength={1000} placeholder="Proposal document URL (optional)" aria-label="Proposal document URL" className="min-h-10 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm"/><textarea value={proposalNotes} onChange={e => setProposalNotes(e.target.value)} maxLength={1000} rows={2} placeholder="Internal notes (optional)" aria-label="Proposal notes" className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm"/><div className="flex justify-end gap-2"><Button variant="secondary" onClick={() => setProposalOpen(false)}>Cancel</Button><Button type="submit" disabled={proposalMutation.isPending || !proposalTitle.trim()}>Save proposal</Button></div></form>}{proposalsQuery.error && <p role="alert" className="text-sm text-red-600">Could not load proposals: {(proposalsQuery.error as Error).message}</p>}{proposalsQuery.isLoading ? <div className="h-14 animate-pulse rounded bg-slate-100"/> : proposals.length === 0 ? <p className="text-sm text-slate-500">No proposals recorded yet.</p> : <ul className="space-y-3">{proposals.map(p => <li key={p.id} className="rounded-lg border border-slate-200 p-3"><div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between"><div className="min-w-0"><p className="break-words text-sm font-semibold text-slate-800">{p.title}</p>{p.scope_summary && <p className="mt-1 whitespace-pre-wrap text-xs text-slate-600">{p.scope_summary}</p>}<p className="mt-2 text-sm font-semibold text-slate-900">{p.amount === null ? 'Amount not set' : `${p.currency} ${p.amount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`}</p></div><Badge variant={p.status === 'Accepted' ? 'success' : p.status === 'Declined' || p.status === 'Expired' ? 'error' : p.status === 'Sent' ? 'info' : 'default'}>{p.status}</Badge></div><div className="mt-3 flex flex-wrap items-center justify-between gap-2"><span className="text-xs text-slate-500">Created {dateLabel(p.created_at)}{p.follow_up_at ? ` · Follow up ${dateLabel(p.follow_up_at)}` : ''}</span><select aria-label={`Status for ${p.title}`} value={p.status} onChange={e => proposalUpdate.mutate({ proposal: p, status: e.target.value })} className="rounded border border-slate-200 bg-white px-2 py-1.5 text-xs">{proposalStatuses.map(s => <option key={s}>{s}</option>)}</select></div>{safeHttpUrl(p.document_url) && <a href={safeHttpUrl(p.document_url)!} target="_blank" rel="noopener noreferrer" className="mt-2 inline-block break-all text-xs text-arlotech hover:underline">Open proposal document</a>}{p.notes && <p className="mt-2 whitespace-pre-wrap text-xs text-slate-500">{p.notes}</p>}</li>)}</ul>}</Card>
    </div>
    <Card className="space-y-3"><div className="flex items-center gap-2"><StickyNote className="h-5 w-5 text-arlotech"/><div><h3 className="font-semibold text-slate-800">Relationship notes</h3><p className="text-xs text-slate-500">Save conversation takeaways, preferences, and objections.</p></div></div><form onSubmit={e => { e.preventDefault(); noteMutation.mutate() }} className="space-y-2"><textarea value={note} onChange={e => setNote(e.target.value)} maxLength={3000} rows={3} placeholder="Record a conversation summary or important detail…" aria-label="New relationship note" className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"/><div className="flex items-center justify-between"><span className="text-xs text-slate-400">{note.length}/3000</span><Button type="submit" size="sm" disabled={noteMutation.isPending || !note.trim()}><Plus className="h-4 w-4"/>Add note</Button></div></form>{notesQuery.error && <p role="alert" className="text-sm text-red-600">Could not load notes: {(notesQuery.error as Error).message}</p>}{notesQuery.isLoading ? <div className="h-12 animate-pulse rounded bg-slate-100"/> : notes.length === 0 ? <p className="text-sm text-slate-500">No relationship notes yet.</p> : <div className="space-y-2">{notes.map((n) => <article key={n.id} className="rounded-lg bg-slate-50 p-3"><p className="whitespace-pre-wrap break-words text-sm text-slate-700">{n.content}</p><p className="mt-2 text-xs text-slate-400">{dateLabel(n.created_at)}</p></article>)}</div>}</Card>
    <p className="text-xs text-slate-400">Tasks, notes, proposal records, and pipeline changes are saved against this prospect. Proposal and stage changes are also added to the engagement timeline.</p>
  </section>
}
