export const MAX_VISUAL_REVIEW_PAGES = 4
export const MAX_VISUAL_SCREENSHOT_BYTES = 750_000

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
  error?: string
}

export interface VisualObservation {
  page_url: string
  viewport: 'desktop' | 'mobile'
  title: string
  evidence: string
  severity: 'high' | 'medium' | 'low'
  confidence: number
  recommended_fix?: string
}

export interface VisualAudit {
  status: 'completed' | 'partial' | 'unavailable'
  pages: StoredVisualPage[]
  observations: VisualObservation[]
  discovered_page_count?: number
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
