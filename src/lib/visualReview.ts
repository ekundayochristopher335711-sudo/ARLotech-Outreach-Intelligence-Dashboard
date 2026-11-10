export const MAX_VISUAL_REVIEW_PAGES = 5
export const MAX_VISUAL_SCREENSHOT_BYTES = 750_000

// Simple perceptual fingerprint for near-duplicate screenshot detection.
// Compares dimensions and a coarse downsampled hash of the base64 payload.
// Returns a short string that is identical for visually identical/similar images.
export function screenshotFingerprint(image: VisualScreenshot): string {
  const len = image.data.length
  const head = image.data.slice(0, 32)
  const tail = image.data.slice(-32)
  return `${image.mime_type}|${image.viewport}|${len}|${head}|${tail}`
}

// Identifies duplicate or near-identical screenshots so they are not sent to OpenAI
// more than once. Preserves the first occurrence of each unique fingerprint.
// Keeps at least one desktop and one mobile screenshot per page.
export function selectUniqueScreenshots(
  screenshots: VisualScreenshot[],
): { selected: VisualScreenshot[]; skipped: VisualScreenshot[] } {
  const seen = new Set<string>()
  const selected: VisualScreenshot[] = []
  const skipped: VisualScreenshot[] = []

  // Group by page_url so we can guarantee desktop+mobile coverage per page.
  const byPage = new Map<string, VisualScreenshot[]>()
  for (const s of screenshots) {
    const list = byPage.get(s.page_url) ?? []
    list.push(s)
    byPage.set(s.page_url, list)
  }

  for (const [, pages] of byPage) {
    // Sort desktop before mobile so desktop is preferred as the primary representative.
    pages.sort((a, b) => (a.viewport === 'desktop' ? -1 : 1) - (b.viewport === 'desktop' ? -1 : 1))
    for (const s of pages) {
      const fp = screenshotFingerprint(s)
      if (seen.has(fp)) {
        skipped.push(s)
        continue
      }
      seen.add(fp)
      selected.push(s)
    }
  }

  return { selected, skipped }
}

export interface VisualPageCandidate {
  label: string
  url: string
}

export interface VisualScreenshot {
  page_url: string
  page_label: string
  viewport: 'desktop' | 'mobile'
  mime_type: string
  data: string
}

export interface StoredVisualPage {
  page_url: string
  page_label: string
  viewport: 'desktop' | 'mobile'
  image_path: string | null
  inspection_status?: 'completed' | 'failed'
  error?: string
}

export interface VisualObservation {
  page_url: string
  viewport: 'desktop' | 'mobile'
  title: string
  evidence: string
  why_it_matters?: string
  severity: 'high' | 'medium' | 'low'
  confidence: number
  recommended_fix?: string
}

export interface VisualAudit {
  status: 'completed' | 'partial' | 'unavailable'
  pages: StoredVisualPage[]
  observations: VisualObservation[]
  discovered_page_count?: number
  requested_viewport_count?: number
  inspected_viewport_count?: number
  completeness_percent?: number
}

export function formatVisualCaptureError(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error)
  if (/FAILED_DOCUMENT_REQUEST|ERR_TIMED_OUT/i.test(message)) {
    return 'PageSpeed/Lighthouse timed out while loading this page, so this viewport screenshot could not be captured.'
  }
  return message.length > 300 ? `${message.slice(0, 297)}...` : message
}

export function selectVisualReviewPages(
  homeUrl: string,
  candidates: VisualPageCandidate[] = [],
  maxPages = MAX_VISUAL_REVIEW_PAGES,
): VisualPageCandidate[] {
  const home = new URL(homeUrl)
  const pages: VisualPageCandidate[] = [{ label: 'Homepage', url: home.href }]
  const seen = new Set([home.href])

  for (const candidate of candidates) {
    if (pages.length >= maxPages) break
    try {
      const url = new URL(candidate.url, home)
      if (
        url.origin !== home.origin ||
        !['http:', 'https:'].includes(url.protocol) ||
        url.username ||
        url.password
      ) continue
      url.hash = ''
      if (seen.has(url.href)) continue
      seen.add(url.href)
      pages.push({ label: candidate.label.trim() || url.pathname, url: url.href })
    } catch {
      continue
    }
  }

  return pages
}

export function extractPageSpeedScreenshot(
  fullPageScreenshot: unknown,
  maxBytes = MAX_VISUAL_SCREENSHOT_BYTES,
): Pick<VisualScreenshot, 'mime_type' | 'data'> | null {
  if (!fullPageScreenshot || typeof fullPageScreenshot !== 'object') return null
  const screenshot = fullPageScreenshot as {
    data?: unknown
    screenshot?: { data?: unknown }
  }
  const value = screenshot.screenshot?.data ?? screenshot.data
  if (typeof value !== 'string') return null

  const match = value.match(/^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/]+={0,2})$/i)
  if (!match || match[2].length % 4 !== 0) return null

  const byteLength = Math.floor((match[2].length * 3) / 4) - (match[2].endsWith('==') ? 2 : match[2].endsWith('=') ? 1 : 0)
  if (byteLength <= 0 || byteLength > maxBytes) return null
  return { mime_type: match[1].toLowerCase(), data: match[2] }
}
