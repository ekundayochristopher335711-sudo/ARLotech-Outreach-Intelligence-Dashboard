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

export function VisualReviewPanel({ audit }: { audit?: ScreenshotReview | null }) {
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
            Screenshots for manual review
          </h3>
          <Badge variant="default">Website review tools</Badge>
          <span className="text-xs text-slate-500">{statusLabel}</span>
        </div>
        <p className="mt-1 text-xs text-slate-500">
          These initial-load screenshots are not automatically checked for visual defects. Menus, forms, and other controls were not tested.
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
