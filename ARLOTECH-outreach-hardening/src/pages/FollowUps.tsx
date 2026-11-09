import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { format } from 'date-fns'
import { CalendarClock, Plus } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { getCurrentUserId, supabase } from '@/lib/supabase'
import type { Campaign, FollowUpSequence, Prospect } from '@/types'

export function FollowUpsPage() {
  const queryClient = useQueryClient()
  const [showForm, setShowForm] = useState(false)
  const [prospectId, setProspectId] = useState('')
  const [campaignId, setCampaignId] = useState('')
  const [nextActionAt, setNextActionAt] = useState('')

  const { data: sequences = [], isLoading, error } = useQuery({
    queryKey: ['/follow-ups'],
    queryFn: async () => {
      const userId = await getCurrentUserId()
      const { data, error } = await supabase
        .from('follow_up_sequences')
        .select('*')
        .eq('user_id', userId)
        .order('next_action_at', { ascending: true, nullsFirst: false })
      if (error) throw error
      return data as FollowUpSequence[]
    },
  })

  const { data: prospects = [], error: prospectsError } = useQuery({
    queryKey: ['/prospects', 'follow-up-options'],
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

  const { data: campaigns = [], error: campaignsError } = useQuery({
    queryKey: ['/campaigns', 'follow-up-options'],
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

  const createMutation = useMutation({
    mutationFn: async () => {
      if (!prospectId && !campaignId) throw new Error('Select a prospect or campaign')
      if (!nextActionAt) throw new Error('Choose a follow-up date and time')
      const userId = await getCurrentUserId()
      const { error } = await supabase.from('follow_up_sequences').insert({
        user_id: userId,
        prospect_id: prospectId || null,
        campaign_id: campaignId || null,
        next_action_at: new Date(nextActionAt).toISOString(),
        timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC',
        current_step: 0,
        status: 'Active',
      })
      if (error) throw error
    },
    onSuccess: () => {
      toast.success('Follow-up scheduled')
      setShowForm(false)
      setProspectId('')
      setCampaignId('')
      setNextActionAt('')
      queryClient.invalidateQueries({ queryKey: ['/follow-ups'] })
    },
    onError: (err: Error) => toast.error(err.message || 'Could not schedule follow-up'),
  })

  const updateStatusMutation = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: string }) => {
      const userId = await getCurrentUserId()
      const { error } = await supabase
        .from('follow_up_sequences')
        .update({ status })
        .eq('id', id)
        .eq('user_id', userId)
      if (error) throw error
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['/follow-ups'] }),
    onError: (err: Error) => toast.error(err.message || 'Could not update follow-up'),
  })

  if (isLoading) {
    return <Card className="p-6"><div className="h-40 animate-pulse rounded bg-slate-200" /></Card>
  }

  if (error) {
    return <p className="py-12 text-center text-sm text-red-600">Could not load follow-ups: {error.message}</p>
  }

  const sequenceRows = (sequences || []) as FollowUpSequence[]
  const prospectOptions = (prospects || []) as Pick<Prospect, 'id' | 'business_name'>[]
  const campaignOptions = (campaigns || []) as Pick<Campaign, 'id' | 'name'>[]
  const active = sequenceRows.filter((sequence) => sequence.status === 'Active')
  const prospectNames = new Map<string, string>(prospectOptions.map((prospect) => [prospect.id, prospect.business_name]))
  const campaignNames = new Map<string, string>(campaignOptions.map((campaign) => [campaign.id, campaign.name]))

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">{localStorage.getItem('arlotech-login-mode') === 'blacksite' ? 'EXTRACTION QUEUE' : 'Follow-ups'}</h1>
          <p className="mt-1 text-sm text-slate-500">Schedule reminders and manage follow-up statuses. This does not send email automatically.</p>
        </div>
        <Button onClick={() => setShowForm((visible) => !visible)}>
          <Plus className="h-4 w-4" /> Schedule Follow-up
        </Button>
      </div>

      {(prospectsError || campaignsError) && (
        <p className="text-sm text-red-600">
          Could not load {prospectsError && campaignsError ? 'prospect and campaign options' : prospectsError ? 'prospect options' : 'campaign options'}.
          {prospectsError instanceof Error ? ` ${prospectsError.message}` : ''}
          {campaignsError instanceof Error ? ` ${campaignsError.message}` : ''}
        </p>
      )}

      {showForm && (
        <Card className="space-y-4 p-6">
          <h2 className="text-lg font-semibold text-slate-800">{localStorage.getItem('arlotech-login-mode') === 'blacksite' ? 'QUEUE CONTACT RECOVERY' : 'Schedule a follow-up reminder'}</h2>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1">
              <label htmlFor="followup-prospect" className="block text-sm font-medium text-slate-700">Prospect</label>
              <select id="followup-prospect" value={prospectId} onChange={(event) => setProspectId(event.target.value)} className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm">
                <option value="">Choose a prospect</option>
                {prospectOptions.map((prospect) => <option key={prospect.id} value={prospect.id}>{prospect.business_name}</option>)}
              </select>
            </div>
            <div className="space-y-1">
              <label htmlFor="followup-campaign" className="block text-sm font-medium text-slate-700">Campaign (optional)</label>
              <select id="followup-campaign" value={campaignId} onChange={(event) => setCampaignId(event.target.value)} className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm">
                <option value="">No campaign</option>
                {campaignOptions.map((campaign) => <option key={campaign.id} value={campaign.id}>{campaign.name}</option>)}
              </select>
            </div>
            <div className="space-y-1 sm:col-span-2">
              <label htmlFor="followup-date" className="block text-sm font-medium text-slate-700">Reminder date and time</label>
              <input id="followup-date" type="datetime-local" value={nextActionAt} onChange={(event) => setNextActionAt(event.target.value)} className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" />
            </div>
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setShowForm(false)}>Cancel</Button>
            <Button onClick={() => createMutation.mutate()} disabled={createMutation.isPending || (!prospectId && !campaignId) || !nextActionAt}>
              {createMutation.isPending ? 'Scheduling...' : 'Save Reminder'}
            </Button>
          </div>
        </Card>
      )}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Card className="p-5"><p className="text-2xl font-bold text-slate-800">{active.length}</p><p className="text-sm text-slate-500">Active</p></Card>
        <Card className="p-5"><p className="text-2xl font-bold text-slate-800">{sequenceRows.length}</p><p className="text-sm text-slate-500">Total</p></Card>
      </div>

      <Card className="p-5">
        <h2 className="mb-3 text-lg font-semibold text-slate-800">{localStorage.getItem('arlotech-login-mode') === 'blacksite' ? 'ACTIVE EXTRACTION QUEUE' : 'Scheduled Follow-ups'}</h2>
        {sequenceRows.length === 0 ? (
          <p className="py-8 text-center text-sm text-slate-500">No follow-ups yet. Schedule a reminder to see it here.</p>
        ) : (
          <div className="space-y-2">
            {sequenceRows.map((sequence) => {
              const isActive = sequence.status === 'Active'
              return (
                <div key={sequence.id} className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-slate-200 p-3">
                  <div className="flex min-w-0 items-center gap-3">
                    <CalendarClock className="h-5 w-5 shrink-0 text-arlotech" />
                    <div className="min-w-0">
                      <p className="font-medium text-slate-800">
                        {sequence.prospect_id ? prospectNames.get(sequence.prospect_id) || 'Prospect' : 'Campaign follow-up'}
                      </p>
                      <p className="text-xs text-slate-500">
                        {sequence.campaign_id ? campaignNames.get(sequence.campaign_id) || 'Campaign' : 'No campaign'}
                        {sequence.next_action_at
                          ? ` · ${format(new Date(sequence.next_action_at), 'MMM d, yyyy h:mm a')}`
                          : ' · No date set'}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${isActive ? 'bg-green-100 text-green-700' : 'bg-slate-100 text-slate-600'}`}>
                      {sequence.status}
                    </span>
                    <select
                      aria-label={`Update follow-up status for ${sequence.prospect_id ? prospectNames.get(sequence.prospect_id) || 'prospect' : 'campaign'}`}
                      value={sequence.status}
                      onChange={(event) => updateStatusMutation.mutate({ id: sequence.id, status: event.target.value })}
                      disabled={updateStatusMutation.isPending}
                      className="rounded-lg border border-slate-200 px-2 py-1 text-xs"
                    >
                      <option>Active</option>
                      <option>Paused</option>
                      <option>Completed</option>
                    </select>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </Card>
    </div>
  )
}
