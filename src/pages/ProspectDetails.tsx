import { useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Card } from '@/components/ui/Card'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { getCurrentUserId, supabase } from '@/lib/supabase'
import { toast } from 'sonner'
import { type Prospect } from '@/types'
import { format } from 'date-fns'
import {
  Users,
  Mail,
  Globe,
  MapPin,
  Phone,
  Calendar,
  Edit,
  Trash2,
  ArrowLeft,
} from 'lucide-react'

interface ProspectDetailsProps {
  prospect?: Prospect | null
}

export function ProspectDetails() {
  const { id } = useParams()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [editing, setEditing] = useState(false)
  const [form, setForm] = useState<Partial<Prospect>>({})

  const { data: prospect, isLoading } = useQuery({
    queryKey: ['/prospect', id],
    queryFn: async () => {
      const userId = await getCurrentUserId()
      const { data, error } = await supabase
        .from('prospects')
        .select('*')
        .eq('id', id)
        .eq('user_id', userId)
        .single()
      if (error) throw error
      return data as Prospect
    },
    enabled: !!id,
  })

  const deleteMutation = useMutation({
    mutationFn: async () => {
      const userId = await getCurrentUserId()
      const { error } = await supabase
        .from('prospects')
        .delete()
        .eq('id', id)
        .eq('user_id', userId)
      if (error) throw error
    },
    onSuccess: () => {
      toast.success('Prospect deleted')
      queryClient.invalidateQueries({ queryKey: ['/prospects'] })
      navigate('/prospects')
    },
    onError: (err: any) => toast.error(err?.message || 'Delete failed'),
  })

  const updateMutation = useMutation({
    mutationFn: async () => {
      const userId = await getCurrentUserId()
      const { error } = await supabase
        .from('prospects')
        .update(form)
        .eq('id', id)
        .eq('user_id', userId)
      if (error) throw error
    },
    onSuccess: () => {
      toast.success('Prospect updated')
      setEditing(false)
      queryClient.invalidateQueries({ queryKey: ['/prospect', id] })
      queryClient.invalidateQueries({ queryKey: ['/prospects'] })
    },
    onError: (err: any) => toast.error(err?.message || 'Update failed'),
  })

  if (isLoading) {
    return <div className="text-center py-12">Loading...</div>
  }
  if (!prospect) {
    return (
      <div className="flex flex-col items-center justify-center py-16">
        <p className="text-slate-500">Prospect not found</p>
        <Button variant="secondary" onClick={() => navigate('/prospects')} className="mt-4">
          <ArrowLeft className="h-4 w-4" /> Back
        </Button>
      </div>
    )
  }

  const startEdit = () => {
    setForm({ ...prospect })
    setEditing(true)
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <button type="button" onClick={() => navigate('/prospects')} className="p-2 text-slate-500 hover:text-slate-700">
            <ArrowLeft className="h-5 w-5" />
          </button>
          <div className="flex h-12 w-12 items-center justify-center rounded-full bg-arlotech text-white text-lg font-bold">
            {prospect.business_name.charAt(0)}
          </div>
          <div>
            <h1 className="text-2xl font-bold text-slate-800">{prospect.business_name}</h1>
            <p className="text-sm text-slate-500">{prospect.contact_name}</p>
          </div>
        </div>
        <div className="flex gap-2">
          <Button variant="secondary" onClick={startEdit}>
            <Edit className="h-4 w-4" /> Edit
          </Button>
          <Button variant="secondary" onClick={() => deleteMutation.mutate()} disabled={deleteMutation.isPending}>
            <Trash2 className="h-4 w-4" /> {deleteMutation.isPending ? 'Deleting...' : 'Delete'}
          </Button>
        </div>
      </div>

      {editing && (
        <Card className="p-6 space-y-4">
          <h2 className="text-lg font-semibold text-slate-800">Edit Prospect</h2>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            {(['business_name', 'contact_name', 'email', 'website', 'business_category', 'phone', 'city', 'country', 'linkedin_url'] as (keyof Prospect)[]).map((field) => (
              <div key={field} className="space-y-1">
                <label className="block text-sm font-medium text-slate-700 capitalize">{field.replace(/_/g, ' ')}</label>
                <input
                  value={(form as any)[field] ?? ''}
                  onChange={(e) => setForm((f) => ({ ...f, [field]: e.target.value }))}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-arlotech focus:outline-none focus:ring-2 focus:ring-arlotech/20"
                />
              </div>
            ))}
          </div>
          <div className="space-y-1">
            <label className="block text-sm font-medium text-slate-700">Notes</label>
            <textarea
              value={form.notes ?? ''}
              onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
              rows={4}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-arlotech focus:outline-none focus:ring-2 focus:ring-arlotech/20"
            />
          </div>
          <label className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
            <input
              type="checkbox"
              checked={form.do_not_contact ?? false}
              onChange={(event) => setForm((current) => ({ ...current, do_not_contact: event.target.checked }))}
              className="mt-1 h-4 w-4 shrink-0 accent-arlotech"
            />
            <span>
              <span className="block font-medium">Do not contact</span>
              <span className="block text-xs">Exclude this prospect from future outreach batches.</span>
            </span>
          </label>
          <div className="flex gap-2 justify-end">
            <Button variant="secondary" onClick={() => setEditing(false)}>Cancel</Button>
            <Button onClick={() => updateMutation.mutate()} disabled={updateMutation.isPending}>
              {updateMutation.isPending ? 'Saving...' : 'Save'}
            </Button>
          </div>
        </Card>
      )}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <Card className="p-4">
          <h3 className="text-sm font-semibold text-slate-700 mb-2">Contact</h3>
          <div className="space-y-2 text-sm">
            <p className="flex items-center gap-2 text-slate-600">
              <Mail className="h-4 w-4 text-slate-400" />
              {prospect.email || 'Not provided'}
            </p>
            <p className="flex items-center gap-2 text-slate-600">
              <Phone className="h-4 w-4 text-slate-400" />
              {prospect.phone || 'Not provided'}
            </p>
          </div>
        </Card>

        <Card className="p-4">
          <h3 className="text-sm font-semibold text-slate-700 mb-2">Business Info</h3>
          <div className="space-y-2 text-sm">
            <p className="flex items-center gap-2 text-slate-600">
              <Globe className="h-4 w-4 text-slate-400" />
              {prospect.website || 'Not provided'}
            </p>
            <p className="flex items-center gap-2 text-slate-600">
              <MapPin className="h-4 w-4 text-slate-400" />
              {prospect.city || 'Not provided'}
            </p>
            <p className="flex items-center gap-2 text-slate-600">
              <Users className="h-4 w-4 text-slate-400" />
              Category: {prospect.business_category || 'General'}
            </p>
          </div>
        </Card>

        <Card className="p-4">
          <h3 className="text-sm font-semibold text-slate-700 mb-2">Status</h3>
          <div className="flex items-center gap-2">
            <Badge variant="default">{prospect.status}</Badge>
          </div>
          <div className="mt-4 text-sm text-slate-500">
            <p className="flex items-center gap-2 mb-1">
              <Calendar className="h-4 w-4 text-slate-400" />
              Created: {format(new Date(prospect.created_at), 'MMM d, yyyy')}
            </p>
            {prospect.last_contacted_at && (
              <p className="flex items-center gap-2">
                <Calendar className="h-4 w-4 text-slate-400" />
                Last contacted: {format(new Date(prospect.last_contacted_at), 'MMM d, yyyy')}
              </p>
            )}
          </div>
        </Card>
      </div>

      <Card className="p-4">
        <h3 className="text-sm font-semibold text-slate-700 mb-3">Notes</h3>
        <div className="space-y-3">
          {prospect.notes ? (
            <p className="text-sm text-slate-600">{prospect.notes}</p>
          ) : (
            <p className="text-sm text-slate-400">No notes added yet</p>
          )}
        </div>
      </Card>
    </div>
  )
}
