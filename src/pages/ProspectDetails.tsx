import { useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Card } from '@/components/ui/Card'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { getCurrentUserId, supabase } from '@/lib/supabase'
import { toast } from 'sonner'
import { type Prospect, type WebsiteAnalysis } from '@/types'
import { analyzeWebsite } from '@/lib/websiteAnalysis'
import { ensureWebsiteProspect } from '@/lib/websiteProspects'
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
  RotateCw,
  Loader2,
} from 'lucide-react'

function asRecord(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null
}

function asRecordArray(value: unknown): Record<string, unknown>[] {
  return Array.isArray(value) ? value.map(asRecord).filter((item): item is Record<string, unknown> => !!item) : []
}

function asString(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value : null
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

  const { data: websiteAnalyses = [], isLoading: analysesLoading, error: analysesError } = useQuery<WebsiteAnalysis[]>({
    queryKey: ['/prospect', id, 'website-analyses'],
    queryFn: async () => {
      const userId = await getCurrentUserId()
      const pageSize = 500
      const allAnalyses: WebsiteAnalysis[] = []
      for (let from = 0; ; from += pageSize) {
        const { data, error } = await supabase
          .from('website_analyses')
          .select('id, user_id, prospect_id, website_url, overall_score, performance_score, accessibility_score, seo_score, best_practices_score, category_scores, findings, positive_observations, ai_analysis, analysis_status, error_message, analysis_provider, analyzed_at, created_at, updated_at')
          .eq('user_id', userId)
          .eq('prospect_id', id)
          .order('analyzed_at', { ascending: false, nullsFirst: false })
          .order('id', { ascending: false })
          .range(from, from + pageSize - 1)
        if (error) throw error
        allAnalyses.push(...data as WebsiteAnalysis[])
        if (data.length < pageSize) break
      }
      return allAnalyses
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

  const reanalyzeMutation = useMutation({
    mutationFn: async () => {
      if (!prospect.website) throw new Error('Add a website to this prospect before analyzing it.')
      await ensureWebsiteProspect(prospect.website, prospect.id)
      return analyzeWebsite(prospect.website, prospect.id, true)
    },
    onSuccess: (result: Awaited<ReturnType<typeof analyzeWebsite>>) => {
      toast.success('Website analysis refreshed')
      if (result.contactUpdateError) {
        toast.warning(`Website analysis completed, but prospect contact details could not be updated: ${result.contactUpdateError}`)
      }
      void queryClient.invalidateQueries({ queryKey: ['/website-analyses'] })
      void queryClient.invalidateQueries({ queryKey: ['/prospect', id] })
      void queryClient.invalidateQueries({ queryKey: ['/prospects'] })
    },
    onError: (error: Error) => toast.error(error.message || 'Website analysis failed'),
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
    <div className="min-w-0 space-y-6">
      <div className="flex min-w-0 flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex min-w-0 items-center gap-3 sm:gap-4">
          <button type="button" onClick={() => navigate('/prospects')} className="p-2 text-slate-500 hover:text-slate-700">
            <ArrowLeft className="h-5 w-5" />
          </button>
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-arlotech text-white text-lg font-bold">
            {prospect.business_name.charAt(0)}
          </div>
          <div className="min-w-0">
            <h1 className="break-words text-2xl font-bold text-slate-800">{prospect.business_name}</h1>
            <p className="break-words text-sm text-slate-500">{prospect.contact_name}</p>
          </div>
        </div>
        <div className="flex w-full flex-wrap gap-2 sm:w-auto sm:shrink-0">
          {prospect.website && (
            <Button
              variant="secondary"
              onClick={() => reanalyzeMutation.mutate()}
              disabled={reanalyzeMutation.isPending}
              className="min-h-11"
            >
              {reanalyzeMutation.isPending
                ? <Loader2 className="h-4 w-4 animate-spin" />
                : <RotateCw className="h-4 w-4" />}
              {reanalyzeMutation.isPending ? 'Analyzing...' : 'Re-analyze website'}
            </Button>
          )}
          <Button variant="secondary" onClick={startEdit} className="min-h-11">
            <Edit className="h-4 w-4" /> Edit
          </Button>
          <Button variant="secondary" onClick={() => deleteMutation.mutate()} disabled={deleteMutation.isPending} className="min-h-11">
            <Trash2 className="h-4 w-4" /> {deleteMutation.isPending ? 'Deleting...' : 'Delete'}
          </Button>
        </div>
      </div>

      {editing && (
        <Card className="p-6 space-y-4">
          <h2 className="text-lg font-semibold text-slate-800">Edit Prospect</h2>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            {(['business_name', 'contact_name', 'email', 'website', 'business_category', 'phone', 'city', 'country', 'linkedin_url'] as const).map((field) => (
              <div key={field} className="space-y-1">
                <label htmlFor={`prospect-${field}`} className="block text-sm font-medium text-slate-700 capitalize">{field.replace(/_/g, ' ')}</label>
                <input
                  id={`prospect-${field}`}
                  value={String(form[field] ?? '')}
                  onChange={(e) => setForm((f) => ({ ...f, [field]: e.target.value }))}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-arlotech focus:outline-none focus:ring-2 focus:ring-arlotech/20"
                />
              </div>
            ))}
          </div>
          <label className="flex items-start gap-2 rounded-lg border border-slate-200 p-3 text-sm text-slate-700">
            <input
              type="checkbox"
              checked={form.business_name_verified ?? prospect.business_name_verified}
              onChange={(event) => setForm((current) => ({ ...current, business_name_verified: event.target.checked }))}
              className="mt-1 h-4 w-4 shrink-0 accent-arlotech"
            />
            <span>
              <span className="block font-medium">Business name verified</span>
              <span className="block text-xs text-slate-500">Check this only after confirming the public business name from a reliable source.</span>
            </span>
          </label>
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
      <div className="grid min-w-0 grid-cols-1 gap-3 sm:grid-cols-2 sm:gap-4 lg:grid-cols-3">
        <Card className="p-4">
          <h3 className="text-sm font-semibold text-slate-700 mb-2">Contact</h3>
          <div className="space-y-2 text-sm">
            <p className="flex min-w-0 items-start gap-2 text-slate-600">
              <Mail className="mt-0.5 h-4 w-4 shrink-0 text-slate-400" />
              <span className="min-w-0 break-all">{prospect.email || 'Not provided'}</span>
            </p>
            <p className="flex min-w-0 items-start gap-2 text-slate-600">
              <Phone className="mt-0.5 h-4 w-4 shrink-0 text-slate-400" />
              {prospect.phone ? (
                <span className="flex min-w-0 flex-wrap items-center gap-2">
                  <a href={`tel:${prospect.phone}`} className="break-all text-arlotech hover:underline">{prospect.phone}</a>
                  <a href={`https://wa.me/${prospect.phone.replace(/[^0-9]/g, '')}`} target="_blank" rel="noopener noreferrer" className="rounded border border-slate-200 px-2 py-1 text-xs text-slate-600 hover:bg-slate-100">WhatsApp</a>
                  <button type="button" onClick={() => navigator.clipboard?.writeText(prospect.phone ?? '')} className="rounded border border-slate-200 px-2 py-1 text-xs text-slate-600 hover:bg-slate-100">Copy</button>
                </span>
              ) : <span>Not provided</span>}
            </p>
          </div>
        </Card>

        <Card className="p-4">
          <h3 className="text-sm font-semibold text-slate-700 mb-2">Business Info</h3>
          <div className="space-y-2 text-sm">
            <p className="flex min-w-0 items-start gap-2 text-slate-600">
              <Globe className="mt-0.5 h-4 w-4 shrink-0 text-slate-400" />
              <span className="min-w-0 break-all">{prospect.website || 'Not provided'}</span>
            </p>
            <p className="flex min-w-0 items-start gap-2 text-slate-600">
              <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-slate-400" />
              <span className="min-w-0 break-words">{prospect.city || 'Not provided'}</span>
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

      <section aria-labelledby="prospect-website-analyses-heading" className="space-y-3">
        <div>
          <h2 id="prospect-website-analyses-heading" className="text-lg font-semibold text-slate-800">Website analysis history</h2>
          <p className="mt-1 text-sm text-slate-500">All saved website reviews linked to this prospect.</p>
        </div>
        {analysesError && (
          <p role="alert" className="text-sm text-red-600">
            Could not load website analyses: {analysesError instanceof Error ? analysesError.message : 'Unknown error'}
          </p>
        )}
        {analysesLoading ? (
          <Card className="p-5"><div className="h-16 animate-pulse rounded bg-slate-200" /></Card>
        ) : websiteAnalyses.length === 0 ? (
          <Card className="p-5">
            <p className="text-sm text-slate-500">
              {prospect.website ? 'No saved website analysis is linked to this prospect yet.' : 'Add a website to this prospect to start a website analysis.'}
            </p>
          </Card>
        ) : (
          websiteAnalyses.map((analysis: WebsiteAnalysis, index: number) => {
            const aiAnalysis = asRecord(analysis.ai_analysis)
            const summary = asString(aiAnalysis?.summary)
            const categoryScores = asRecord(analysis.category_scores)
            const recommendations = Array.isArray(aiAnalysis?.recommendations)
              ? aiAnalysis.recommendations.filter((item): item is string => typeof item === 'string')
              : []
            const opportunities = asRecordArray(aiAnalysis?.optimization_opportunities)
            const visualAudit = asRecord(aiAnalysis?.visual_audit)
            const visualObservations = asRecordArray(visualAudit?.observations)

            return (
              <details key={analysis.id} open={index === 0} className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
                <summary className="cursor-pointer list-none rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-arlotech">
                  <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                    <div className="min-w-0">
                      <p className="break-all font-medium text-slate-800">{analysis.website_url}</p>
                      <p className="mt-1 text-xs text-slate-500">
                        {analysis.analyzed_at
                          ? `Analyzed ${format(new Date(analysis.analyzed_at), 'MMM d, yyyy HH:mm')}`
                          : 'Analysis date unavailable'}
                        {analysis.analysis_provider ? ` · ${analysis.analysis_provider}` : ''}
                      </p>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge variant={analysis.analysis_status === 'completed' ? 'success' : 'default'}>{analysis.analysis_status}</Badge>
                      {analysis.overall_score !== null && (
                        <span className="text-sm font-semibold text-slate-700">Overall {analysis.overall_score}/100</span>
                      )}
                    </div>
                  </div>
                </summary>
                <div className="mt-4 space-y-4 border-t border-slate-100 pt-4">
                  {analysis.error_message && <p className="text-sm text-red-600">{analysis.error_message}</p>}
                  {categoryScores && (
                    <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                      {(['performance', 'seo', 'accessibility', 'best-practices'] as const).map((category) => (
                        <div key={category} className="rounded-lg border border-slate-200 p-3">
                          <p className="text-xs capitalize text-slate-500">{category.replace('-', ' ')}</p>
                          <p className="mt-1 font-semibold text-slate-800">
                            {String(categoryScores[category] ?? 'Unavailable')}
                          </p>
                        </div>
                      ))}
                    </div>
                  )}
                  {summary && (
                    <div>
                      <h3 className="text-sm font-semibold text-slate-700">Assessment</h3>
                      <p className="mt-1 whitespace-pre-wrap text-sm text-slate-600">{summary}</p>
                    </div>
                  )}
                  <div>
                    <h3 className="text-sm font-semibold text-slate-700">Findings ({analysis.findings.length})</h3>
                    {analysis.findings.length ? (
                      <ul className="mt-2 space-y-2">
                        {analysis.findings.map((finding: WebsiteAnalysis['findings'][number], findingIndex: number) => (
                          <li key={finding.id || findingIndex} className="rounded-lg border border-slate-200 p-3">
                            <p className="text-sm font-medium text-slate-800">{finding.title}</p>
                            {finding.evidence && <p className="mt-1 text-xs text-slate-600"><strong>Evidence:</strong> {finding.evidence}</p>}
                            {finding.explanation && <p className="mt-1 text-xs text-slate-600"><strong>Why it matters:</strong> {finding.explanation}</p>}
                            {finding.recommended_fix && <p className="mt-1 text-xs text-slate-700"><strong>Recommended fix:</strong> {finding.recommended_fix}</p>}
                          </li>
                        ))}
                      </ul>
                    ) : <p className="mt-1 text-sm text-slate-500">No findings recorded.</p>}
                  </div>
                  {opportunities.length > 0 && (
                    <div>
                      <h3 className="text-sm font-semibold text-slate-700">Potential improvements to review</h3>
                      <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-slate-600">
                        {opportunities.map((item, itemIndex) => (
                          <li key={String(item.id ?? itemIndex)}>
                            {[asString(item.title), asString(item.evidence)].filter(Boolean).join(' — ')}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                  {recommendations.length > 0 && (
                    <div>
                      <h3 className="text-sm font-semibold text-slate-700">Recommendations</h3>
                      <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-slate-600">
                        {recommendations.map((recommendation, itemIndex) => <li key={itemIndex}>{recommendation}</li>)}
                      </ul>
                    </div>
                  )}
                  {visualObservations.length > 0 && (
                    <div>
                      <h3 className="text-sm font-semibold text-slate-700">Visual observations</h3>
                      <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-slate-600">
                        {visualObservations.map((item: Record<string, unknown>, itemIndex: number) => (
                          <li key={String(item.id ?? itemIndex)}>
                            {[asString(item.title), asString(item.evidence)].filter(Boolean).join(' — ')}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                  {analysis.positive_observations.length > 0 && (
                    <div>
                      <h3 className="text-sm font-semibold text-slate-700">What is working well</h3>
                      <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-slate-600">
                        {analysis.positive_observations.map((observation: WebsiteAnalysis['positive_observations'][number], itemIndex: number) => (
                          <li key={observation.id || itemIndex}>
                            {[observation.title, observation.evidence].filter(Boolean).join(' — ')}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              </details>
            )
          })
        )}
      </section>

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
