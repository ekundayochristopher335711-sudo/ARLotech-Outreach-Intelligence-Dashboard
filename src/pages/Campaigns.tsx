import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Card } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { getCurrentUserId, supabase } from '@/lib/supabase'
import { toast } from 'sonner'
import { type Campaign } from '@/types'
import { FileText, Plus, Trash2, X } from 'lucide-react'

export function CampaignsPage() {
  const queryClient = useQueryClient()
  const [showForm, setShowForm] = useState(false)
  const [statusFilter, setStatusFilter] = useState('All')
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [industry, setIndustry] = useState('')
  const [location, setLocation] = useState('')

  const { data: campaigns, isLoading, error } = useQuery({
    queryKey: ['/campaigns'],
    queryFn: async () => {
      const userId = await getCurrentUserId()
      const { data, error } = await supabase
        .from('campaigns')
        .select('*')
        .eq('user_id', userId)
        .order('created_at', { ascending: false })
      if (error) throw error
      return data
    },
  })

  const createMutation = useMutation({
    mutationFn: async () => {
      const userId = await getCurrentUserId()
      const { error } = await supabase.from('campaigns').insert({
        user_id: userId,
        name,
        description,
        industry,
        location,
        status: 'Draft',
      })
      if (error) throw error
    },
    onSuccess: () => {
      toast.success('Campaign created')
      setShowForm(false)
      setName('')
      setDescription('')
      setIndustry('')
      setLocation('')
      queryClient.invalidateQueries({ queryKey: ['/campaigns'] })
    },
    onError: (err: Error) => toast.error(err.message || 'Create failed'),
  })

  const updateStatusMutation = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: string }) => {
      const userId = await getCurrentUserId()
      const { error } = await supabase
        .from('campaigns')
        .update({ status })
        .eq('id', id)
        .eq('user_id', userId)
      if (error) throw error
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['/campaigns'] }),
    onError: (err: Error) => toast.error(err.message || 'Could not update campaign'),
  })

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const userId = await getCurrentUserId()
      const { error } = await supabase
        .from('campaigns')
        .delete()
        .eq('id', id)
        .eq('user_id', userId)
      if (error) throw error
    },
    onSuccess: () => {
      toast.success('Campaign deleted')
      queryClient.invalidateQueries({ queryKey: ['/campaigns'] })
    },
    onError: (err: Error) => toast.error(err.message || 'Could not delete campaign'),
  })

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div className="h-8 w-48 animate-pulse rounded bg-slate-200" />
        <Card className="p-6"><div className="h-40 animate-pulse rounded bg-slate-200" /></Card>
      </div>
    )
  }

  if (error) {
    return <p className="py-12 text-center text-sm text-red-600">Could not load campaigns: {error.message}</p>
  }

  const visibleCampaigns = ((campaigns || []) as Campaign[]).filter(
    (campaign) => statusFilter === 'All' || campaign.status === statusFilter,
  )

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">Campaigns</h1>
          <p className="text-sm text-slate-500 mt-1">Manage and track outreach campaigns</p>
        </div>
        <div className="flex gap-2">
          <select
            aria-label="Filter campaigns by status"
            value={statusFilter}
            onChange={(event) => setStatusFilter(event.target.value)}
            className="rounded-lg border border-slate-200 px-3 py-1.5 text-sm text-slate-600"
          >
            <option>All</option>
            <option>Draft</option>
            <option>Active</option>
            <option>Paused</option>
            <option>Completed</option>
          </select>
          <button type="button" onClick={() => setShowForm(true)} className="rounded-lg bg-arlotech px-3 py-1.5 text-sm text-white hover:bg-arlotech-muted">
            <Plus className="h-4 w-4" />
            New Campaign
          </button>
        </div>
      </div>

      {showForm && (
        <Card className="p-6 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold text-slate-800">New Campaign</h2>
            <button type="button" onClick={() => setShowForm(false)} className="p-1 text-slate-500 hover:text-slate-700"><X className="h-5 w-5" /></button>
          </div>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="space-y-1">
              <label className="block text-sm font-medium text-slate-700">Name</label>
              <input value={name} onChange={(e) => setName(e.target.value)} className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-arlotech focus:outline-none focus:ring-2 focus:ring-arlotech/20" />
            </div>
            <div className="space-y-1">
              <label className="block text-sm font-medium text-slate-700">Industry</label>
              <input value={industry} onChange={(e) => setIndustry(e.target.value)} className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-arlotech focus:outline-none focus:ring-2 focus:ring-arlotech/20" />
            </div>
            <div className="space-y-1">
              <label className="block text-sm font-medium text-slate-700">Location</label>
              <input value={location} onChange={(e) => setLocation(e.target.value)} className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-arlotech focus:outline-none focus:ring-2 focus:ring-arlotech/20" />
            </div>
            <div className="space-y-1 sm:col-span-2">
              <label className="block text-sm font-medium text-slate-700">Description</label>
              <input value={description} onChange={(e) => setDescription(e.target.value)} className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-arlotech focus:outline-none focus:ring-2 focus:ring-arlotech/20" />
            </div>
          </div>
          <div className="flex gap-2 justify-end">
            <Button variant="secondary" onClick={() => setShowForm(false)}>Cancel</Button>
            <Button onClick={() => createMutation.mutate()} disabled={createMutation.isPending || !name.trim()}>
              {createMutation.isPending ? 'Saving...' : 'Create'}
            </Button>
          </div>
        </Card>
      )}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {visibleCampaigns.map((c: Campaign) => (
          <Card key={c.id} className="p-5">
            <div className="flex items-start justify-between mb-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-arlotech/10 text-arlotech">
                <FileText className="h-5 w-5" />
              </div>
              <div className="flex items-center gap-2">
                <select
                  aria-label={`Status for ${c.name}`}
                  value={c.status}
                  onChange={(event) => updateStatusMutation.mutate({ id: c.id, status: event.target.value })}
                  disabled={updateStatusMutation.isPending}
                  className="rounded-full border-0 bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-600"
                >
                  <option>Draft</option>
                  <option>Active</option>
                  <option>Paused</option>
                  <option>Completed</option>
                </select>
                <button
                  type="button"
                  onClick={() => {
                    if (window.confirm(`Delete campaign "${c.name}"?`)) deleteMutation.mutate(c.id)
                  }}
                  disabled={deleteMutation.isPending}
                  aria-label={`Delete ${c.name}`}
                  className="rounded p-1 text-slate-400 hover:bg-red-50 hover:text-red-600 disabled:opacity-50"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            </div>
            <h3 className="text-lg font-semibold text-slate-800">{c.name}</h3>
            <p className="text-sm text-slate-500 mt-1">{c.description || 'No description'}</p>
            <div className="mt-4 flex items-center gap-2 text-xs text-slate-400">
              {c.industry && <span>{c.industry}</span>}
              {c.location && <>• {c.location}</>}
            </div>
          </Card>
        ))}
        {visibleCampaigns.length === 0 && (
          <Card className="p-6 text-center text-sm text-slate-500 sm:col-span-2 lg:col-span-3">
            {campaigns?.length ? 'No campaigns match this status.' : 'No campaigns yet. Create your first campaign to get started.'}
          </Card>
        )}
      </div>
    </div>
  )
}
