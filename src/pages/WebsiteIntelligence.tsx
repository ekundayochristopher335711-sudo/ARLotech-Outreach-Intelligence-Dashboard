import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Card } from '@/components/ui/Card'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { getCurrentUserId, supabase } from '@/lib/supabase'
import { analyzeWebsite } from '@/lib/websiteAnalysis'
import { exportWebsiteAnalysisPdf } from '@/lib/exportPdf'
import { toast } from 'sonner'
import { format } from 'date-fns'
import { Globe, AlertCircle, Clock, Loader2, Search, X, Download, Copy, RotateCw } from 'lucide-react'
import { useAccessibleDialog } from '@/hooks/useAccessibleDialog'
import { VisualReviewPanel } from '@/components/website-intelligence/VisualReviewPanel'
import { ensureWebsiteProspect } from '@/lib/websiteProspects'

export function WebsiteIntelligencePage() {
  const queryClient = useQueryClient()
  const [url, setUrl] = useState('')
  const [lastResult, setLastResult] = useState<any>(null)
  const [selected, setSelected] = useState<any>(null)
  const selectedDialogRef = useAccessibleDialog<HTMLDivElement>(!!selected, () => setSelected(null))

  const { data: analyses, isLoading } = useQuery({
    queryKey: ['/website-analyses'],
    queryFn: async () => {
      const userId = await getCurrentUserId()
      const { data, error } = await supabase
        .from('website_analyses')
        .select('*, prospect:prospects(business_name, business_name_verified)')
        .eq('user_id', userId)
        .order('analyzed_at', { ascending: false })
        .limit(20)
      if (error) throw error
      return data
    },
  })

  const mutation = useMutation({
    mutationFn: async (input: { url: string; prospectId?: string | null; reanalyze?: boolean }) => {
      const prospect = await ensureWebsiteProspect(input.url, input.prospectId)
      try {
        const result = await analyzeWebsite(input.url, prospect.id, true)
        return { ...result, prospectCreated: prospect.created }
      } catch (error) {
        if (prospect.created) {
          const detail = error instanceof Error ? error.message : 'Unknown analysis error.'
          throw new Error(`The prospect was added, but website analysis failed: ${detail}`)
        }
        throw error
      }
    },
    onSuccess: (result: any, input: { url: string; prospectId?: string | null; reanalyze?: boolean }) => {
      if (input.reanalyze) setSelected(result.record)
      else setUrl('')
      setLastResult(result)
      void queryClient.invalidateQueries({ queryKey: ['/website-analyses'] })
      void queryClient.invalidateQueries({ queryKey: ['/prospects'] })
      toast.success(input.reanalyze
        ? 'Website analysis refreshed'
        : result.prospectCreated
          ? 'Analysis complete and prospect added'
          : 'Analysis complete and linked to existing prospect')
    },
    onError: (err: any) => {
      toast.error(err?.message || 'Analysis failed')
    },
  })

  const handleAnalyze = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    if (!url.trim()) return
    let target = url.trim()
    if (!/^https?:\/\//i.test(target)) target = 'https://' + target
    mutation.mutate({ url: target })
  }

  const handleCopyReport = (analysis: any) => {
    navigator.clipboard.writeText(JSON.stringify(analysis, null, 2)).then(() => toast.success('Report copied'))
  }
  const handleDownloadReport = (analysis: any) => {
    exportWebsiteAnalysisPdf(analysis)
    toast.success('Report downloaded as PDF')
  }

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div className="h-8 w-48 animate-pulse rounded bg-slate-200" />
        <Card className="p-6">
          <div className="h-40 animate-pulse rounded bg-slate-200" />
        </Card>
      </div>
    )
  }
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-800">{localStorage.getItem('arlotech-login-mode') === 'blacksite' ? 'SURFACE RECON' : 'Website Intelligence'}</h1>
        <p className="text-sm text-slate-500 mt-1">AI-powered website analysis and improvement recommendations</p>
      </div>

      <Card className="p-6">
        <form onSubmit={handleAnalyze} className="flex flex-col gap-3 sm:flex-row">
          <input
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="https://example.com"
            className="flex-1"
            disabled={mutation.isPending}
          />
          <Button type="submit" disabled={mutation.isPending || !url.trim()}>
            {mutation.isPending ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Analyzing...
              </>
            ) : (
              <>
                <Search className="h-4 w-4" />
                Analyze
              </>
            )}
          </Button>
        </form>
        <p className="mt-3 text-xs text-slate-500">
          Visual review is included automatically for the homepage and up to three same-site pages.
        </p>
        <p className="mt-1 text-xs text-slate-500">
          Website analyses are linked to an existing prospect when the domain matches, or added as a new prospect with an unverified domain-based name.
        </p>
        {mutation.isError && (
          <p className="mt-3 text-sm text-red-600">
            {mutation.error instanceof Error ? mutation.error.message : 'Analysis failed'}
          </p>
        )}
        {mutation.isPending && (
          <p className="mt-3 text-xs text-slate-500">
            Running PageSpeed Insights, extracting content, and generating the report. Visual review may take longer because it checks up to four pages.
          </p>
        )}
      </Card>

      {lastResult && (
        <Card className="p-6 space-y-5">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold text-slate-800">{localStorage.getItem('arlotech-login-mode') === 'blacksite' ? 'LATEST RECON REPORTS' : 'Latest Analysis'}</h2>
            <div className="flex gap-2">
              <Button variant="secondary" size="sm" onClick={() => handleCopyReport(lastResult)}>
                <Copy className="h-4 w-4" /> Copy
              </Button>
              <Button variant="secondary" size="sm" onClick={() => handleDownloadReport(lastResult.record || lastResult)}>
                <Download className="h-4 w-4" /> Export
              </Button>
            </div>
          </div>

          {lastResult.overallScore !== undefined && (
            <div>
              <div className="flex justify-between text-sm text-slate-600 mb-1">
                <span>Weighted technical health</span>
                <span className="font-semibold">
                  {typeof lastResult.overallScore === 'number' ? `${lastResult.overallScore}/100` : 'Unavailable'}
                </span>
              </div>
              {typeof lastResult.overallScore === 'number' && (
                <div className="h-2 rounded-full bg-slate-100">
                  <div
                    className={`h-2 rounded-full ${lastResult.overallScore >= 90 ? 'bg-green-500' : lastResult.overallScore >= 70 ? 'bg-lime-500' : lastResult.overallScore >= 50 ? 'bg-amber-500' : 'bg-red-500'}`}
                    style={{ width: `${lastResult.overallScore}%` }}
                  />
                </div>
              )}
            </div>
          )}

          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {(['performance', 'seo', 'accessibility', 'best-practices'] as const).map((k) => {
              const score = lastResult.pagespeed?.lighthouseResult?.categories?.[k]?.score
              const percent = typeof score === 'number' && Number.isFinite(score) && score >= 0 && score <= 1
                ? Math.round(score * 100)
                : null
              return (
                <div key={k} className="rounded-lg border border-slate-200 p-3">
                  <p className="text-xs text-slate-500 capitalize">{k.replace(/-/g, ' ')}</p>
                  <p className="text-lg font-bold text-slate-800">{percent === null ? 'Unavailable' : percent}</p>
                </div>
              )
            })}
          </div>

          {lastResult.gemini?.parsed?.summary && (
            <div>
              <h3 className="text-sm font-semibold text-slate-700 mb-1">AI-assisted summary</h3>
              <p className="text-sm text-slate-600">{lastResult.gemini.parsed.summary}</p>
            </div>
          )}
          {lastResult.record?.ai_analysis?.score_explanation && (
            <div>
              <h3 className="text-sm font-semibold text-slate-700 mb-1">Score methodology</h3>
              <p className="text-sm text-slate-600">{lastResult.record.ai_analysis.score_explanation}</p>
            </div>
          )}
          {lastResult.record?.ai_analysis?.audit_completeness && (
            <div className="rounded-lg border border-slate-200 p-3">
              <h3 className="text-sm font-semibold text-slate-700">Audit completeness</h3>
              <p className="mt-1 text-xs text-slate-600">
                {lastResult.record.ai_analysis.audit_completeness.completeness_percent}% coverage ·
                {' '}{lastResult.record.ai_analysis.audit_completeness.inspected_viewport_count}/
                {lastResult.record.ai_analysis.audit_completeness.requested_viewport_count} PageSpeed viewports inspected.
              </p>
              {lastResult.record.ai_analysis.audit_completeness.limitations?.length > 0 && (
                <ul className="mt-2 list-disc space-y-1 pl-5 text-xs text-slate-500">
                  {lastResult.record.ai_analysis.audit_completeness.limitations.slice(0, 4).map((item: string, index: number) => (
                    <li key={index}>{item}</li>
                  ))}
                </ul>
              )}
              {lastResult.record?.ai_analysis?.error && (
                <p role="status" className="text-sm text-amber-700">
                  AI summary unavailable: {lastResult.record.ai_analysis.error}
                </p>
              )}
            </div>
          )}
          <VisualReviewPanel audit={lastResult.record?.ai_analysis?.visual_audit} />
          {lastResult.record?.findings?.length > 0 && (
            <div>
              <h3 className="text-sm font-semibold text-slate-700 mb-2">Verified findings</h3>
              <ul className="space-y-2">
                {lastResult.record.findings.map((item: any) => (
                  <li key={item.id} className="rounded-lg border border-slate-200 p-3">
                    <p className="text-sm font-medium text-slate-800">{item.title}</p>
                    <p className="mt-1 text-xs text-slate-500">{item.source === 'lighthouse' ? 'Weighted Lighthouse audit' : 'Static HTML observation'}</p>
                    {item.evidence && <p className="mt-1 text-xs text-slate-600">{item.evidence}</p>}
                  </li>
                ))}
              </ul>
            </div>
          )}
          {lastResult.record?.ai_analysis?.optimization_opportunities?.length > 0 && (
            <div>
              <h3 className="text-sm font-semibold text-slate-700 mb-2">Optimization opportunities (not scored failures)</h3>
              <ul className="list-disc space-y-1 pl-5 text-sm text-slate-600">
                {lastResult.record.ai_analysis.optimization_opportunities.map((item: any) => <li key={item.id}>{item.title}: {item.evidence}</li>)}
              </ul>
            </div>
          )}
          {lastResult.gemini?.parsed?.recommendations?.length ? (
            <div>
              <h3 className="text-sm font-semibold text-slate-700 mb-1">AI-assisted recommendations (not measured findings)</h3>
              <ul className="list-disc pl-5 text-sm text-slate-600 space-y-1">
                {lastResult.gemini.parsed.recommendations.map((r: string, i: number) => (
                  <li key={i}>{r}</li>
                ))}
              </ul>
            </div>
          ) : null}
          {lastResult.record?.positive_observations?.length ? (
            <div>
              <h3 className="text-sm font-semibold text-slate-700 mb-1">Evidence-based positive observations</h3>
              <ul className="list-disc pl-5 text-sm text-slate-600 space-y-1">
                {lastResult.record.positive_observations.map((p: any, i: number) => (
                  <li key={p.id || i}>{p.title} — {p.evidence}</li>
                ))}
              </ul>
            </div>
          ) : null}
          {lastResult.content && (
            <div className="text-xs text-slate-500">
              Extracted: {lastResult.content.wordCount} words, {lastResult.content.h1Count} H1, {lastResult.content.images.total} images ({lastResult.content.images.missingAlt} without alt attributes in inspected HTML).
              {lastResult.content.metaDescription ? ' Meta description present.' : ' No meta description.'}
            </div>
          )}
        </Card>
      )}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {analyses?.map((analysis: any) => (
          <article
            key={analysis.id}
            className="rounded-xl border border-slate-200 bg-white p-5 text-left shadow-sm transition-shadow hover:shadow-md"
          >
            <button
              type="button"
              onClick={() => setSelected(analysis)}
              aria-label={`View website analysis for ${analysis.website_url}`}
              className="w-full cursor-pointer rounded text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-arlotech"
            >
              <div className="flex items-start justify-between mb-3">
                <div className="flex items-center gap-2">
                  <Globe className="h-5 w-5 text-arlotech" />
                  <span className="text-sm font-medium text-slate-700 truncate max-w-[180px]">{analysis.website_url}</span>
                </div>
                <Badge variant="default">{analysis.analysis_status}</Badge>
              </div>

              {analysis.overall_score !== null && (
                <div className="mb-3">
                  <div className="flex justify-between text-sm text-slate-600 mb-1">
                    <span>{analysis.ai_analysis?.technical_score?.methodology ? 'Weighted technical health' : 'Stored legacy score (calculation unverified)'}</span>
                    <span>{analysis.overall_score}/100</span>
                  </div>
                  <div className="h-2 rounded-full bg-slate-100">
                    <div
                      className={`h-2 rounded-full ${(analysis.overall_score ?? 0) >= 70 ? 'bg-green-500' : (analysis.overall_score ?? 0) >= 40 ? 'bg-amber-500' : 'bg-red-500'}`}
                      style={{ width: `${(analysis.overall_score ?? 0) * 1.0}%` }}
                    />
                  </div>
                </div>
              )}
              {analysis.overall_score === null && (
                <p className="mb-3 text-xs text-amber-700">Technical score unavailable; one or more category scores were not returned.</p>
              )}

              {analysis.category_scores && (
                <div className="mb-3 grid grid-cols-2 gap-1 text-xs text-slate-500">
                  {Object.entries(analysis.category_scores).map(([k, v]) => (
                    <div key={k} className="flex justify-between">
                      <span>{k.replace(/-/g, ' ')}</span>
                      <span className="font-medium text-slate-700">{String(v ?? 'Unavailable')}</span>
                    </div>
                  ))}
                </div>
              )}

              <div className="flex items-center gap-2 text-xs text-slate-500 mb-3">
                <Clock className="h-3 w-3" />
                {analysis.analysis_provider || 'Custom'} • {format(new Date(analysis.analyzed_at), 'MMM d')}
              </div>

              <div className="flex items-center gap-2 text-xs text-slate-500">
                <AlertCircle className="h-3 w-3" />
                {analysis.findings?.length ?? 0} findings • {analysis.positive_observations?.length ?? 0} positives
              </div>
            </button>
            <Button
              variant="secondary"
              size="sm"
              className="mt-4 w-full"
              onClick={() => mutation.mutate({
                url: analysis.website_url,
                prospectId: analysis.prospect_id,
                reanalyze: true,
              })}
              disabled={mutation.isPending}
            >
              {mutation.isPending
                ? <Loader2 className="h-4 w-4 animate-spin" />
                : <RotateCw className="h-4 w-4" />}
              {mutation.isPending ? 'Analyzing website...' : 'Re-analyze website'}
            </Button>
          </article>
        )) || (
          <div className="col-span-3 text-center py-12">
            <p className="text-sm text-slate-500">No analyses yet. Enter a website URL to get started.</p>
          </div>
        )}
      </div>

      {selected && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={() => setSelected(null)}>
          <div
            ref={selectedDialogRef}
            className="max-h-[90vh] w-full max-w-3xl overflow-auto rounded-xl bg-white p-6 shadow-xl"
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
            aria-labelledby="analysis-dialog-title"
            tabIndex={-1}
          >
            <div className="flex items-center justify-between mb-4">
              <h2 id="analysis-dialog-title" className="text-lg font-semibold text-slate-800">{selected.website_url}</h2>
              <div className="flex gap-2">
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => mutation.mutate({
                    url: selected.website_url,
                    prospectId: selected.prospect_id,
                    reanalyze: true,
                  })}
                  disabled={mutation.isPending}
                >
                  {mutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <RotateCw className="h-4 w-4" />}
                  {mutation.isPending ? 'Analyzing...' : 'Re-analyze'}
                </Button>
                <Button variant="secondary" size="sm" onClick={() => handleCopyReport(selected)}><Copy className="h-4 w-4" /></Button>
                <Button variant="secondary" size="sm" onClick={() => handleDownloadReport(selected)}><Download className="h-4 w-4" /></Button>
                <button type="button" onClick={() => setSelected(null)} className="p-1 text-slate-500 hover:text-slate-700"><X className="h-5 w-5" /></button>
              </div>
            </div>

            {selected.overall_score !== null && (
              <div className="mb-4">
                <div className="flex justify-between text-sm text-slate-600 mb-1">
                  <span>{selected.ai_analysis?.technical_score?.methodology ? 'Weighted technical health' : 'Stored legacy score (calculation unverified)'}</span>
                  <span>{selected.overall_score}/100</span>
                </div>
                <div className="h-2 rounded-full bg-slate-100">
                  <div className={`h-2 rounded-full ${selected.overall_score >= 90 ? 'bg-green-500' : selected.overall_score >= 70 ? 'bg-lime-500' : selected.overall_score >= 50 ? 'bg-amber-500' : 'bg-red-500'}`} style={{ width: `${selected.overall_score}%` }} />
                </div>
              </div>
            )}
            {selected.overall_score === null && (
              <p className="mb-4 text-sm text-amber-700">Weighted technical health is unavailable because required category scores are missing.</p>
            )}

            {selected.category_scores && (
              <div className="mb-4">
                <h3 className="text-sm font-semibold text-slate-700 mb-2">Category Scores</h3>
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                  {(['performance', 'seo', 'accessibility', 'best-practices'] as const).map((k) => (
                    <div key={k} className="rounded-lg border border-slate-200 p-2 text-center">
                      <p className="text-xs text-slate-500">{k.replace(/-/g, ' ')}</p>
                      <p className="text-base font-bold text-slate-800">{String(selected.category_scores?.[k] ?? 'Unavailable')}</p>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <VisualReviewPanel audit={selected.ai_analysis?.visual_audit} />
            {selected.ai_analysis?.score_explanation && (
              <p className="mb-4 text-sm text-slate-600">{selected.ai_analysis.score_explanation}</p>
            )}
            {selected.ai_analysis?.audit_completeness && (
              <div className="mb-4 rounded-lg border border-slate-200 p-3">
                <h3 className="text-sm font-semibold text-slate-700">Audit completeness</h3>
                <p className="mt-1 text-xs text-slate-600">
                  {selected.ai_analysis.audit_completeness.completeness_percent}% coverage ·
                  {' '}{selected.ai_analysis.audit_completeness.inspected_viewport_count}/
                  {selected.ai_analysis.audit_completeness.requested_viewport_count} PageSpeed viewports inspected.
                </p>
                {selected.ai_analysis.audit_completeness.limitations?.length > 0 && (
                  <ul className="mt-2 list-disc space-y-1 pl-5 text-xs text-slate-500">
                    {selected.ai_analysis.audit_completeness.limitations.map((item: string, index: number) => <li key={index}>{item}</li>)}
                  </ul>
                )}
              </div>
            )}

            <div className="mb-4">
              <h3 className="text-sm font-semibold text-slate-700 mb-2">Findings ({selected.findings?.length ?? 0})</h3>
              <div className="max-h-64 space-y-2 overflow-auto">
                {(selected.findings || []).map((f: any, i: number) => (
                  <div key={f.id || i} className="rounded-lg border border-slate-200 p-3">
                    <div className="flex items-center justify-between">
                      <p className="text-sm font-medium text-slate-800">{f.title}</p>
                      <Badge variant="default">{f.source === 'lighthouse' ? 'Scored Lighthouse finding' : 'HTML inspection'}</Badge>
                    </div>
                    {f.evidence && <p className="mt-1 text-xs text-slate-500">{f.evidence}</p>}
                    {f.explanation && <p className="mt-1 text-xs text-slate-600">{f.explanation}</p>}
                  </div>
                ))}
                {(!selected.findings || selected.findings.length === 0) && (
                  <p className="text-xs text-slate-400">No findings recorded.</p>
                )}
              </div>
            </div>

            {selected.ai_analysis?.optimization_opportunities?.length ? (
              <div className="mb-4">
                <h3 className="text-sm font-semibold text-slate-700 mb-2">Optimization opportunities (estimated, not scored failures)</h3>
                <ul className="space-y-2">
                  {selected.ai_analysis.optimization_opportunities.map((item: any) => (
                    <li key={item.id} className="rounded-lg border border-slate-200 p-3">
                      <p className="text-sm font-medium text-slate-800">{item.title}</p>
                      <p className="mt-1 text-xs text-slate-500">{item.evidence}</p>
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
            {selected.ai_analysis?.diagnostics?.length ? (
              <div className="mb-4">
                <h3 className="text-sm font-semibold text-slate-700 mb-2">Lighthouse diagnostics (not scored failures)</h3>
                <ul className="space-y-1 text-sm text-slate-600">
                  {selected.ai_analysis.diagnostics.map((item: any) => (
                    <li key={item.id}>{item.title}: {item.evidence}</li>
                  ))}
                </ul>
              </div>
            ) : null}
            {selected.ai_analysis?.recommendations?.length ? (
              <div className="mb-4">
                <h3 className="text-sm font-semibold text-slate-700 mb-2">AI-assisted recommendations (not measured findings)</h3>
                <ul className="list-disc space-y-1 pl-5 text-sm text-slate-600">
                  {selected.ai_analysis.recommendations.map((item: string, index: number) => <li key={index}>{item}</li>)}
                </ul>
              </div>
            ) : null}

            {selected.positive_observations?.length ? (
              <div>
                <h3 className="text-sm font-semibold text-slate-700 mb-2">Evidence-based positive observations</h3>
                <ul className="list-disc pl-5 text-sm text-slate-600 space-y-1">
                  {selected.positive_observations.map((p: any, i: number) => (
                    <li key={p.id || i}>{p.title || p}{p.evidence ? ` — ${p.evidence}` : ''}</li>
                  ))}
                </ul>
              </div>
            ) : null}
          </div>
        </div>
      )}
    </div>
  )
}
