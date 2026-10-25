import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Card } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Textarea } from '@/components/ui/Textarea'
import { getCurrentUserId, supabase } from '@/lib/supabase'
import { toast } from 'sonner'
import { Plus, X, Download } from 'lucide-react'

export function EmailDraftsPage() {
  const queryClient = useQueryClient()
  const [showForm, setShowForm] = useState(false)
  const [subject, setSubject] = useState('')
  const [body, setBody] = useState('')

  const { data: drafts, isLoading } = useQuery({
    queryKey: ['/email-drafts'],
    queryFn: async () => {
      const userId = await getCurrentUserId()
      const { data } = await supabase
        .from('email_drafts')
        .select('*')
        .eq('user_id', userId)
        .order('created_at', { ascending: false })
      return data
    },
  })

  const createMutation = useMutation({
    mutationFn: async () => {
      const userId = await getCurrentUserId()
      const { error } = await supabase.from('email_drafts').insert({
        user_id: userId,
        subject,
        body,
        status: 'draft',
      })
      if (error) throw error
    },
    onSuccess: () => {
      toast.success('Draft created')
      setShowForm(false)
      setSubject('')
      setBody('')
      queryClient.invalidateQueries({ queryKey: ['/email-drafts'] })
    },
    onError: (err: any) => toast.error(err?.message || 'Create failed'),
  })

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">Email Drafts</h1>
          <p className="text-sm text-slate-500 mt-1">Manage and edit email templates</p>
        </div>
        <div className="flex gap-2">
          <button type="button" onClick={() => toast.info('Import coming soon')} className="rounded-lg border border-slate-200 px-3 py-1.5 text-sm text-slate-600 hover:bg-slate-50">
            <Download className="h-4 w-4" /> Import
          </button>
          <button type="button" onClick={() => setShowForm(true)} className="rounded-lg bg-arlotech px-3 py-1.5 text-sm text-white hover:bg-arlotech-muted">
            <Plus className="h-4 w-4" /> New Draft
          </button>
        </div>
      </div>

      {showForm && (
        <Card className="p-6 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold text-slate-800">New Draft</h2>
            <button type="button" onClick={() => setShowForm(false)} className="p-1 text-slate-500 hover:text-slate-700"><X className="h-5 w-5" /></button>
          </div>
          <div className="space-y-1">
            <label className="block text-sm font-medium text-slate-700">Subject</label>
            <input value={subject} onChange={(e) => setSubject(e.target.value)} className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-arlotech focus:outline-none focus:ring-2 focus:ring-arlotech/20" />
          </div>
          <div className="space-y-1">
            <label className="block text-sm font-medium text-slate-700">Body</label>
            <Textarea value={body} onChange={(value) => setBody(value)} rows={6} />
          </div>
          <div className="flex gap-2 justify-end">
            <Button variant="secondary" onClick={() => setShowForm(false)}>Cancel</Button>
            <Button onClick={() => createMutation.mutate()} disabled={createMutation.isPending || !subject.trim() || !body.trim()}>
              {createMutation.isPending ? 'Saving...' : 'Save'}
            </Button>
          </div>
        </Card>
      )}

      {isLoading ? (
        <Card className="p-6"><div className="h-40 animate-pulse rounded bg-slate-200" /></Card>
      ) : (
        <div className="space-y-3">
          {(drafts || []).map((d: any) => (
            <Card key={d.id} className="p-4">
              <p className="font-medium text-slate-800">{d.subject}</p>
              <p className="text-sm text-slate-500 mt-1 line-clamp-2">{d.body}</p>
            </Card>
          ))}
          {(!drafts || drafts.length === 0) && (
            <Card className="p-6 text-center text-sm text-slate-500">No drafts yet.</Card>
          )}
        </div>
      )}
    </div>
  )
}
