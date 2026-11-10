import { useEffect, useId, useState } from 'react'
import { Badge } from '@/components/ui/Badge'
import { supabase } from '@/lib/supabase'
import type { ScreenshotReview } from '@/lib/visualReview'

interface VisualPageView {
  page_url: string
  page_label: string
  viewport: 'desktop' | 'mobile'
  image_url: string | null
  inspection_status?: 'completed' | 'failed'
  error?: string
}

export function VisualReviewPanel({ audit, visualAudit }: { audit?: ScreenshotReview | null; visualAudit?: any }) {
  const headingId = useId()
  const [loadedAudit, setLoadedAudit] = useState<{
    audit: ScreenshotReview
    pages: VisualPageView[]
    error: string | null
  } | null>(null)

  useEffect(() => {
    let active = true
    if (!audit) return () => { active = false }

    const resolveScreenshots = async () => {
      const results = await Promise.all(audit.pages.map(async (page): Promise<VisualPageView> => {
        if (!page.image_path) {
          return { ...page, image_url: null }
        }

        const { data, error: signedUrlError } = await supabase.storage
          .from('website-audit-screenshots')
          .createSignedUrl(page.image_path, 3600)
        if (signedUrlError || !data) {
          return {
            ...page,
            image_url: null,
            error: signedUrlError?.message || 'Could not create a signed screenshot URL.',
          }
        }
        return { ...page, image_url: data.signedUrl }
      }))
      if (active) setLoadedAudit({ audit, pages: results, error: null })
    }

    resolveScreenshots().catch((loadError: unknown) => {
      if (active) {
        setLoadedAudit({
          audit,
          pages: [],
          error: loadError instanceof Error ? loadError.message : 'Could not load visual screenshots.',
        })
      }
    })
    return () => { active = false }
  }, [audit])

  if (!audit) return null
  const loaded = loadedAudit?.audit === audit ? loadedAudit : null
  const pages = loaded?.pages ?? []
  const error = loaded?.error ?? null
  const isLoading = !loaded && audit.pages.some((page) => page.image_path)

  const statusLabel = audit.status === 'completed'
    ? 'Screenshots saved'
    : audit.status === 'partial'
      ? 'Partial screenshots'
      : 'Screenshots unavailable'
  const inspectionCount = audit.inspected_viewport_count
  const requestedCount = audit.requested_viewport_count

  return (
    <section className="space-y-3 rounded-lg border border-slate-200 p-4" aria-labelledby={headingId}>
      <div>
        <div className="flex flex-wrap items-center gap-2">
          <h3 id={headingId} className="text-sm font-semibold text-slate-800">
            AI visual audit & screenshots
          </h3>
          <Badge variant="default">Website review tools</Badge>
          <span className="text-xs text-slate-500">{statusLabel}</span>
        </div>
        <p className="mt-1 text-xs text-slate-500">
          Screenshots are inspected by an AI vision model. Static images cannot verify menu, form, or control functionality.
        </p>
        {typeof inspectionCount === 'number' && typeof requestedCount === 'number' && (
          <p className="mt-1 text-xs text-slate-500">
            PageSpeed checks completed: {inspectionCount}/{requestedCount}
            {typeof audit.completeness_percent === 'number' ? ` (${audit.completeness_percent}% coverage)` : ''}.
          </p>
        )}
        {audit.discovered_page_count === 1 && (
          <p className="mt-1 text-xs text-amber-700">
            We did not find links to other pages in the initial HTML. Pages added later by JavaScript may need a separate browser review.
          </p>
        )}
      </div>

      {visualAudit?.status === 'completed' || visualAudit?.status === 'partial' ? (
        <div className="space-y-3 rounded-lg bg-slate-50 p-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">AI visual score</p>
              <p className="text-3xl font-semibold text-slate-900">{visualAudit.visual_score}<span className="text-base text-slate-400">/100</span></p>
            </div>
            <Badge variant={visualAudit.status === 'completed' ? 'success' : 'warning'}>{visualAudit.status === 'completed' ? 'Analysis complete' : 'Partial analysis'}</Badge>
          </div>
          <p className="text-sm text-slate-700">{visualAudit.assessment?.summary}</p>
          <p className="text-xs text-slate-500">{visualAudit.score_explanation}</p>
          <div className="space-y-2">
            <h4 className="text-sm font-semibold text-slate-800">Visual findings ({visualAudit.findings?.length || 0})</h4>
            {(visualAudit.findings || []).map((finding: any) => (
              <details key={finding.id} className="rounded-md border border-slate-200 bg-white p-3">
                <summary className="flex cursor-pointer flex-wrap items-center gap-2 text-sm font-medium text-slate-800">
                  <span>{finding.title}</span>
                  <Badge variant={finding.severity === 'critical' || finding.severity === 'high' ? 'error' : 'default'}>{finding.severity}</Badge>
                  <Badge variant="default">{finding.device}</Badge>
                </summary>
                <div className="mt-3 space-y-2 text-sm text-slate-600">
                  <p><strong>Category:</strong> {finding.category} · {finding.page_label} · {finding.location}</p>
                  <p>{finding.observation}</p>
                  <p><strong>Evidence:</strong> {finding.evidence}</p>
                  <p><strong>Visitor impact:</strong> {finding.user_impact}</p>
                  <p><strong>Recommendation:</strong> {finding.recommendation}</p>
                  <p className="text-xs text-slate-400">Confidence: {Math.round(finding.confidence * 100)}% · {finding.finding_type === 'confirmed_issue' ? 'Confirmed visual issue' : 'Improvement opportunity'}</p>
                </div>
              </details>
            ))}
            {visualAudit.findings?.length === 0 && <p className="text-sm text-emerald-700">No significant visual issues were identified in the available screenshots.</p>}
          </div>
        </div>
      ) : visualAudit?.status === 'failed' ? (
        <p role="alert" className="text-sm text-amber-700">AI visual analysis could not be completed: {visualAudit.error}</p>
      ) : (
        <p className="text-xs text-slate-500">AI visual analysis has not been run for this audit.</p>
      )}
      {error && <p role="alert" className="text-sm text-red-600">{error}</p>}
      {isLoading && <p role="status" className="text-sm text-slate-500">Loading saved screenshots…</p>}

      {pages.length > 0 && (
        <div className="grid gap-4 sm:grid-cols-2">
          {pages.map((page) => (
            <article key={`${page.page_url}|${page.viewport}`} className="min-w-0 overflow-hidden rounded-lg border border-slate-200">
              <div className="flex items-start justify-between gap-2 p-3">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-slate-800">{page.page_label}</p>
                  <a
                    className="block truncate text-xs text-arlotech underline"
                    href={page.page_url}
                    target="_blank"
                    rel="noreferrer"
                  >
                    {page.page_url}
                  </a>
                </div>
                <Badge variant="default">{page.viewport}</Badge>
              </div>
              <p className="px-3 pb-2 text-xs text-slate-500">
                PageSpeed check: {page.inspection_status ?? 'not recorded'}
              </p>
              {page.image_url ? (
                <a href={page.image_url} target="_blank" rel="noreferrer" aria-label={`Open full ${page.viewport} screenshot of ${page.page_url}`}>
                  <img
                    src={page.image_url}
                    alt={`${page.page_label} initial-load ${page.viewport} screenshot`}
                    loading="lazy"
                    className="max-h-80 w-full bg-slate-50 object-contain"
                  />
                </a>
              ) : (
                <p className="border-t border-slate-100 p-3 text-xs text-amber-700">
                  {page.error || 'Screenshot is unavailable.'}
                </p>
              )}
            </article>
          ))}
        </div>
      )}

      {pages.length === 0 && !isLoading && !error && (
        <p className="text-sm text-slate-500">No screenshots are available for this review.</p>
      )}
    </section>
  )
}
