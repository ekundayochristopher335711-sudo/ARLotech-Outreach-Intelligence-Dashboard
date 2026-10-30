import type { ExtractedContent, PageSpeedResult } from '@/lib/websiteAnalysis'

export const LIGHTHOUSE_CATEGORY_WEIGHTS = {
  performance: 0.3,
  seo: 0.25,
  accessibility: 0.25,
  'best-practices': 0.2,
} as const

export type LighthouseCategory = keyof typeof LIGHTHOUSE_CATEGORY_WEIGHTS
export type FindingClassification =
  | 'verified_issue'
  | 'optimization_opportunity'
  | 'diagnostic'

export interface PageInspectionResult {
  page_url: string
  viewport: 'desktop' | 'mobile'
  status: 'completed' | 'failed'
}

export interface VisualScreenshotReference {
  page_url: string
  viewport: 'desktop' | 'mobile'
}

export interface SanitizedVisualObservation extends VisualScreenshotReference {
  title: string
  evidence: string
  severity: 'high' | 'medium' | 'low'
  confidence: number
  recommended_fix?: string
}

const NON_ACTIONABLE_DISPLAY_MODES = new Set([
  'informative',
  'manual',
  'notApplicable',
  'error',
])

export function scoreToPercent(score: unknown): number | null {
  if (typeof score !== 'number' || !Number.isFinite(score) || score < 0 || score > 1) return null
  return Math.round(score * 100)
}

export function extractCategoryScores(pagespeed: PageSpeedResult): Record<LighthouseCategory, number | null> {
  const categories = pagespeed.lighthouseResult.categories
  return {
    performance: scoreToPercent(categories.performance?.score),
    seo: scoreToPercent(categories.seo?.score),
    accessibility: scoreToPercent(categories.accessibility?.score),
    'best-practices': scoreToPercent(categories['best-practices']?.score),
  }
}

export function calculateTechnicalHealthScore(
  categories: Record<LighthouseCategory, number | null>,
): number | null {
  const values = Object.entries(LIGHTHOUSE_CATEGORY_WEIGHTS) as Array<[LighthouseCategory, number]>
  if (values.some(([category]) => {
    const score = categories[category]
    return typeof score !== 'number' || !Number.isFinite(score) || score < 0 || score > 100
  })) return null

  const weightedScore = values.reduce(
    (total, [category, weight]) => total + (categories[category] ?? 0) * weight,
    0,
  )
  return Math.round(weightedScore)
}

export function summarizePageInspectionCoverage(
  discoveredPageUrls: string[],
  inspections: PageInspectionResult[],
  viewportsPerPage = 2,
) {
  const requestedViewportCount = discoveredPageUrls.length * viewportsPerPage
  const discoveredPages = new Set(discoveredPageUrls)
  const completedViewportKeys = new Set(
    inspections
      .filter((inspection) => inspection.status === 'completed' && discoveredPages.has(inspection.page_url))
      .map((inspection) => `${inspection.page_url}|${inspection.viewport}`),
  )
  const inspectedViewportCount = Math.min(completedViewportKeys.size, requestedViewportCount)
  const pageStatuses = discoveredPageUrls.map((pageUrl) => {
    const completed = new Set(
      inspections
        .filter((inspection) => inspection.page_url === pageUrl && inspection.status === 'completed')
        .map((inspection) => inspection.viewport),
    ).size
    return completed >= viewportsPerPage ? 'complete' : completed > 0 ? 'partial' : 'failed'
  })

  return {
    discovered_page_count: discoveredPageUrls.length,
    requested_viewport_count: requestedViewportCount,
    inspected_viewport_count: inspectedViewportCount,
    failed_viewport_count: Math.max(0, requestedViewportCount - inspectedViewportCount),
    fully_inspected_page_count: pageStatuses.filter((status) => status === 'complete').length,
    partially_inspected_page_count: pageStatuses.filter((status) => status === 'partial').length,
    failed_page_count: pageStatuses.filter((status) => status === 'failed').length,
    completeness_percent: requestedViewportCount
      ? Math.round((inspectedViewportCount / requestedViewportCount) * 100)
      : 0,
  }
}

export function sanitizePlainText(value: unknown, maxLength: number): string {
  return typeof value === 'string' ? value.trim().slice(0, maxLength) : ''
}

export function sanitizeRecommendationList(value: unknown, limit = 8): string[] {
  if (!Array.isArray(value)) return []
  return value
    .filter((item): item is string => typeof item === 'string' && !!item.trim())
    .slice(0, limit)
    .map((item) => item.trim().slice(0, 600))
}

export function sanitizeVisualObservations(
  value: unknown,
  screenshots: VisualScreenshotReference[],
): SanitizedVisualObservation[] {
  if (!Array.isArray(value)) return []
  const screenshotKeys = new Set(screenshots.map(({ page_url, viewport }) => `${page_url}|${viewport}`))

  return value.flatMap((item) => {
    if (!item || typeof item !== 'object') return []
    const observation = item as Record<string, unknown>
    const page_url = typeof observation.page_url === 'string' ? observation.page_url : ''
    const viewport = observation.viewport
    const title = sanitizePlainText(observation.title, 200)
    const evidence = sanitizePlainText(observation.evidence, 800)
    const severity = observation.severity
    const confidence = observation.confidence

    if (
      !screenshotKeys.has(`${page_url}|${viewport}`) ||
      !title ||
      !evidence ||
      !['high', 'medium', 'low'].includes(String(severity)) ||
      typeof confidence !== 'number' ||
      !Number.isFinite(confidence) ||
      confidence < 0 ||
      confidence > 1
    ) return []

    const recommendedFix = sanitizePlainText(observation.recommended_fix, 500)
    return [{
      page_url,
      viewport: viewport as 'desktop' | 'mobile',
      title,
      evidence,
      severity: severity as 'high' | 'medium' | 'low',
      confidence: Math.round(confidence * 100) / 100,
      ...(recommendedFix ? { recommended_fix: recommendedFix } : {}),
    }]
  }).slice(0, 24)
}

export function classifyLighthouseAudits(pagespeed: PageSpeedResult) {
  const { categories, audits } = pagespeed.lighthouseResult
  const categoryByAudit = new Map<string, string>()
  const scoringAuditIds = new Set<string>()

  for (const [category, details] of Object.entries(categories)) {
    for (const auditRef of details.auditRefs ?? []) {
      if (typeof auditRef?.id !== 'string') continue
      categoryByAudit.set(auditRef.id, category)
      if (typeof auditRef.weight === 'number' && auditRef.weight > 0) {
        scoringAuditIds.add(auditRef.id)
      }
    }
  }

  return Object.entries(audits).flatMap(([auditId, audit]) => {
    const score = audit.score
    if (
      typeof score !== 'number' ||
      !Number.isFinite(score) ||
      score < 0 ||
      score >= 1 ||
      NON_ACTIONABLE_DISPLAY_MODES.has(audit.scoreDisplayMode)
    ) return []

    const classification: FindingClassification = scoringAuditIds.has(auditId)
      ? 'verified_issue'
      : audit.details?.type === 'opportunity'
        ? 'optimization_opportunity'
        : 'diagnostic'
    const resources = Array.isArray(audit.details?.items)
      ? audit.details.items.flatMap((item: Record<string, unknown>) => {
          const resource = item.url ?? (item.source as Record<string, unknown> | undefined)?.url
          return typeof resource === 'string' && resource.trim() ? [resource.trim()] : []
        })
      : []

    return [{
      id: `lh-${auditId}`,
      audit_id: auditId,
      source: 'lighthouse',
      classification,
      verified: classification === 'verified_issue',
      category: categoryByAudit.get(auditId) ?? null,
      title: audit.title || auditId,
      evidence: audit.displayValue ||
        `Lighthouse reported score ${score} (${audit.scoreDisplayMode || 'scored audit'}).`,
      explanation: audit.description || '',
      recommended_fix: audit.description || 'Review the linked Lighthouse diagnostic before changing the site.',
      affected_resources: [...new Set(resources)].slice(0, 5),
      lighthouse_score_pct: scoreToPercent(score),
      opportunity_ms: typeof audit.details?.overallSavingsMs === 'number' ? audit.details.overallSavingsMs : null,
      opportunity_bytes: typeof audit.details?.overallSavingsBytes === 'number' ? audit.details.overallSavingsBytes : null,
      priority: classification === 'verified_issue'
        ? score < 0.5 ? 'high' : score < 0.9 ? 'medium' : 'low'
        : 'informational',
      severity: classification === 'verified_issue'
        ? score < 0.5 ? 'high' : score < 0.9 ? 'medium' : 'low'
        : 'informational',
      confidence: classification === 'verified_issue' ? 'high' : 'medium',
      status: 'open',
    }]
  })
}

export function buildEvidenceBasedPositiveObservations(
  content: ExtractedContent,
  categories: Record<LighthouseCategory, number | null>,
) {
  const observations: Array<{
    id: string
    title: string
    evidence: string
    source: string
    potential_benefit: string
    priority: string
  }> = []

  for (const [category, score] of Object.entries(categories) as Array<[LighthouseCategory, number | null]>) {
    if (score !== null && score >= 90) {
      observations.push({
        id: `positive-score-${category}`,
        title: `Strong Lighthouse ${category.replace('-', ' ')} result`,
        evidence: `PageSpeed Insights measured ${score}/100 for ${category.replace('-', ' ')}.`,
        source: 'lighthouse',
        potential_benefit: 'No outcome is inferred from this measurement.',
        priority: 'informational',
      })
    }
  }

  if (content.title?.trim()) {
    observations.push({
      id: 'positive-title-present',
      title: 'HTML page title is present',
      evidence: `The inspected HTML contains the title “${content.title.trim().slice(0, 160)}”.`,
      source: 'html_inspection',
      potential_benefit: 'No search or business outcome is inferred from this observation.',
      priority: 'informational',
    })
  }
  if (content.metaDescription?.trim()) {
    observations.push({
      id: 'positive-description-present',
      title: 'Meta description is present',
      evidence: `The inspected HTML contains a meta description (${content.metaDescription.trim().length} characters).`,
      source: 'html_inspection',
      potential_benefit: 'No search or business outcome is inferred from this observation.',
      priority: 'informational',
    })
  }

  return observations
}
