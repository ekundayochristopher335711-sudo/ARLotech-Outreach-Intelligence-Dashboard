import { useEffect, useId, useState } from 'react'
import { Badge } from '@/components/ui/Badge'
import { supabase } from '@/lib/supabase'
import type { VisualAudit } from '@/lib/visualReview'

interface VisualPageView {
  page_url: string
  page_label: string
  viewport: 'desktop' | 'mobile'
  image_url: string | null
  inspection_status?: 'completed' | 'failed'
  error?: string
}

export function VisualReviewPanel({ audit }: { audit?: VisualAudit | null }) {
  const headingId = useId()
  const [loadedAudit, setLoadedAudit] = useState<{
    audit: VisualAudit
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
            Visual review
          </h3>
          <Badge variant="default">AI-assisted</Badge>
          <span className="text-xs text-slate-500">{statusLabel}</span>
        </div>
        <p className="mt-1 text-xs text-slate-500">
          Initial-load screenshots only. Menus, forms, and other interactive states were not tested.
        </p>
        {typeof inspectionCount === 'number' && typeof requestedCount === 'number' && (
          <p className="mt-1 text-xs text-slate-500">
            Lighthouse viewports completed: {inspectionCount}/{requestedCount}
            {typeof audit.completeness_percent === 'number' ? ` (${audit.completeness_percent}% coverage)` : ''}.
          </p>
        )}
        {audit.discovered_page_count === 1 && (
          <p className="mt-1 text-xs text-amber-700">
            No additional same-site page links were found in the initial HTML. JavaScript-rendered navigation may require a browser-based crawl.
          </p>
        )}
      </div>

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
                Lighthouse: {page.inspection_status ?? 'not recorded'}
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

      {audit.observations.length > 0 ? (
        <div className="space-y-2">
          <h4 className="text-sm font-semibold text-slate-700">Visual observations to validate</h4>
          {audit.observations.map((observation, index) => (
            <article key={`${observation.page_url}|${observation.viewport}|${index}`} className="rounded-lg border border-amber-200 bg-amber-50/50 p-3">
              <div className="flex flex-wrap items-center gap-2">
                <p className="text-sm font-medium text-slate-800">{observation.title}</p>
                <Badge variant="default">{observation.severity}</Badge>
                <span className="text-xs text-slate-500">
                  {observation.viewport} · {Math.round(observation.confidence * 100)}% confidence
                </span>
              </div>
              <p className="mt-1 text-sm text-slate-600">{observation.evidence}</p>
              <p className="mt-1 text-xs text-slate-500">{observation.page_url}</p>
              {observation.recommended_fix && (
                <p className="mt-2 text-sm text-slate-700">Suggested check: {observation.recommended_fix}</p>
              )}
            </article>
          ))}
        </div>
      ) : pages.some((page) => page.image_url) ? (
        <p className="text-sm text-slate-500">
          No clear visual defects were identified in the screenshots. This does not confirm that all layouts or interactive states work correctly.
        </p>
      ) : (
        <p className="text-sm text-slate-500">
          No visual observations are available because no screenshot could be loaded. The page appearance was not assessed.
        </p>
      )}
    </section>
  )
}
