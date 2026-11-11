import type { ExtractedContent, PageSpeedResult } from '@/lib/websiteAnalysis'

export const LIGHTHOUSE_CATEGORY_WEIGHTS = {
  performance: 0.3,
  seo: 0.25,
  accessibility: 0.25,
  'best-practices': 0.2,
} as const

export const UNIFIED_WEBSITE_SCORE_VERSION = 'unified-v1'

export const UNIFIED_WEBSITE_SCORE_WEIGHTS = {
  visual_design: 0.4,
  performance: 0.18,
  seo: 0.15,
  accessibility: 0.15,
  'best-practices': 0.12,
} as const

export type UnifiedWebsiteScoreCategory = keyof typeof UNIFIED_WEBSITE_SCORE_WEIGHTS
export type LighthouseCategory = keyof typeof LIGHTHOUSE_CATEGORY_WEIGHTS
export type UnifiedWebsiteScoreCategories = Record<UnifiedWebsiteScoreCategory, number | null>
export type FindingClassification =
  | 'verified_issue'
  | 'optimization_opportunity'
  | 'diagnostic'
  | 'positive_observation'

export type AssessmentRating = 'Good' | 'Needs Improvement' | 'Poor'
export type WebsiteScoreInterpretation =
  | 'Excellent'
  | 'Very Good'
  | 'Good'
  | 'Fair'
  | 'Needs Improvement'
  | 'Poor'

export interface UnifiedWebsiteScore {
  version: typeof UNIFIED_WEBSITE_SCORE_VERSION
  score: number | null
  unrounded_score: number | null
  provisional: boolean
  interpretation: WebsiteScoreInterpretation | null
  available_categories: UnifiedWebsiteScoreCategory[]
  unavailable_categories: UnifiedWebsiteScoreCategory[]
  breakdown: Record<UnifiedWebsiteScoreCategory, {
    score: number | null
    configured_weight_percent: number
    applied_weight_percent: number
    weighted_contribution: number | null
  }>
}

const CATEGORY_SCORE_THRESHOLDS = {
  good: 90,
  needsImprovement: 50,
} as const

const LIGHTHOUSE_METRIC_THRESHOLDS: Record<string, {
  title: string
  goodMaximumMs: number
  poorMinimumMs: number
}> = {
  'largest-contentful-paint': {
    title: 'Largest Contentful Paint',
    goodMaximumMs: 2500,
    poorMinimumMs: 4000,
  },
  'speed-index': {
    title: 'Speed Index',
    goodMaximumMs: 3400,
    poorMinimumMs: 5800,
  },
  'total-blocking-time': {
    title: 'Total Blocking Time',
    goodMaximumMs: 200,
    poorMinimumMs: 600,
  },
  'first-contentful-paint': {
    title: 'First Contentful Paint',
    goodMaximumMs: 1800,
    poorMinimumMs: 3000,
  },
}

export interface PageInspectionResult {
  page_url: string
  viewport: 'desktop' | 'mobile'
  status: 'completed' | 'failed'
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

export function rateCategoryScore(score: unknown): AssessmentRating | null {
  if (typeof score !== 'number' || !Number.isFinite(score) || score < 0 || score > 100) return null
  if (score >= CATEGORY_SCORE_THRESHOLDS.good) return 'Good'
  if (score >= CATEGORY_SCORE_THRESHOLDS.needsImprovement) return 'Needs Improvement'
  return 'Poor'
}

export function lighthouseCategoryLabel(category: string) {
  if (category.toLowerCase() === 'seo') return 'SEO'
  return category
    .replace(/-/g, ' ')
    .replace(/\b\w/g, (letter) => letter.toUpperCase())
}

function metricKey(identifier: string) {
  const normalized = identifier.toLowerCase().replace(/^lh-/, '')
  if (/largest-contentful-paint|\blcp\b/.test(normalized)) return 'largest-contentful-paint'
  if (/speed-index|\bspeed index\b/.test(normalized)) return 'speed-index'
  if (/total-blocking-time|\btbt\b/.test(normalized)) return 'total-blocking-time'
  if (/first-contentful-paint|\bfcp\b/.test(normalized)) return 'first-contentful-paint'
  return null
}

function metricMilliseconds(audit: {
  numericValue?: unknown
  numericUnit?: unknown
  displayValue?: unknown
}) {
  if (typeof audit.numericValue === 'number' && Number.isFinite(audit.numericValue) && audit.numericValue >= 0) {
    return audit.numericUnit === 'second' ? audit.numericValue * 1000 : audit.numericValue
  }
  if (typeof audit.displayValue !== 'string') return null
  const match = audit.displayValue.match(/([\d,]+(?:\.\d+)?)\s*(ms|milliseconds?|s|seconds?)\b/i)
  if (!match) return null
  const value = Number(match[1].replace(/,/g, ''))
  if (!Number.isFinite(value)) return null
  return /^s|second/i.test(match[2]) ? value * 1000 : value
}

export function assessLighthouseMetric(
  identifier: string,
  audit: { numericValue?: unknown; numericUnit?: unknown; displayValue?: unknown },
) {
  const key = metricKey(identifier)
  const thresholds = key ? LIGHTHOUSE_METRIC_THRESHOLDS[key] : null
  const valueMs = thresholds ? metricMilliseconds(audit) : null
  if (!thresholds || valueMs === null) return null

  const rating: AssessmentRating = valueMs <= thresholds.goodMaximumMs
    ? 'Good'
    : valueMs >= thresholds.poorMinimumMs
      ? 'Poor'
      : 'Needs Improvement'
  const displayValue = typeof audit.displayValue === 'string' && audit.displayValue.trim()
    ? audit.displayValue.trim()
    : `${Number.isInteger(valueMs) ? valueMs : valueMs.toFixed(1)} ms`

  return { title: thresholds.title, valueMs, displayValue, rating }
}

export function rateLighthouseFinding(finding: {
  id?: string | null
  audit_id?: string | null
  title?: string | null
  evidence?: string | null
  display_value?: string | null
  assessment_rating?: string | null
}) {
  if (
    finding.assessment_rating === 'Good' ||
    finding.assessment_rating === 'Needs Improvement' ||
    finding.assessment_rating === 'Poor'
  ) return finding.assessment_rating

  return assessLighthouseMetric(
    finding.audit_id || finding.id || finding.title || '',
    { displayValue: finding.display_value || finding.evidence },
  )?.rating ?? null
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

export function interpretWebsiteScore(score: number): WebsiteScoreInterpretation {
  if (score >= 90) return 'Excellent'
  if (score >= 80) return 'Very Good'
  if (score >= 70) return 'Good'
  if (score >= 60) return 'Fair'
  if (score >= 40) return 'Needs Improvement'
  return 'Poor'
}

export function calculateUnifiedWebsiteScore(
  categories: UnifiedWebsiteScoreCategories,
): UnifiedWebsiteScore {
  const entries = Object.entries(UNIFIED_WEBSITE_SCORE_WEIGHTS) as Array<
    [UnifiedWebsiteScoreCategory, number]
  >
  const validScore = (score: unknown): score is number =>
    typeof score === 'number' && Number.isFinite(score) && score >= 0 && score <= 100
  const availableCategories = entries
    .filter(([category]) => validScore(categories[category]))
    .map(([category]) => category)
  const unavailableCategories = entries
    .filter(([category]) => !validScore(categories[category]))
    .map(([category]) => category)
  const availableWeight = entries.reduce(
    (total, [category, weight]) => total + (validScore(categories[category]) ? weight : 0),
    0,
  )

  const breakdown = Object.fromEntries(entries.map(([category, configuredWeight]) => {
    const score = validScore(categories[category]) ? categories[category] : null
    const appliedWeight = score === null || availableWeight === 0
      ? 0
      : configuredWeight / availableWeight
    return [category, {
      score,
      configured_weight_percent: configuredWeight * 100,
      applied_weight_percent: appliedWeight * 100,
      weighted_contribution: score === null ? null : score * appliedWeight,
    }]
  })) as UnifiedWebsiteScore['breakdown']

  const unroundedScore = availableWeight === 0
    ? null
    : entries.reduce((total, [category]) => {
        const detail = breakdown[category]
        return total + (detail.weighted_contribution ?? 0)
      }, 0)
  const score = unroundedScore === null ? null : Math.round(unroundedScore)

  return {
    version: UNIFIED_WEBSITE_SCORE_VERSION,
    score,
    unrounded_score: unroundedScore === null ? null : Number(unroundedScore.toFixed(2)),
    provisional: unavailableCategories.length > 0,
    interpretation: score === null ? null : interpretWebsiteScore(score),
    available_categories: availableCategories,
    unavailable_categories: unavailableCategories,
    breakdown,
  }
}

export function unifiedScoreCategories(
  lighthouseCategories: Partial<Record<LighthouseCategory, unknown>> | null | undefined,
  visualScore: unknown,
): UnifiedWebsiteScoreCategories {
  const categoryScore = (value: unknown) =>
    typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= 100
      ? value
      : null

  return {
    visual_design: categoryScore(visualScore),
    performance: categoryScore(lighthouseCategories?.performance),
    seo: categoryScore(lighthouseCategories?.seo),
    accessibility: categoryScore(lighthouseCategories?.accessibility),
    'best-practices': categoryScore(lighthouseCategories?.['best-practices']),
  }
}

export function explainUnifiedWebsiteScore(score: UnifiedWebsiteScore) {
  if (score.score === null) {
    return `A unified website score is unavailable because none of the five scoring categories returned a valid score. Unavailable: ${score.unavailable_categories.join(', ')}.`
  }
  const unavailable = score.unavailable_categories.length
    ? ` Unavailable categories: ${score.unavailable_categories.join(', ')}.`
    : ''
  const provisional = score.provisional
    ? ' This provisional score proportionally normalizes the weights of the available categories.'
    : ''
  return `Unified website score: ${score.score}/100 (${score.interpretation}). Weights: visual design 40%, performance 18%, SEO 15%, accessibility 15%, and best practices 12%.${provisional}${unavailable}`
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
    const metricAssessment = assessLighthouseMetric(auditId, audit)
    if (
      typeof score !== 'number' ||
      !Number.isFinite(score) ||
      score < 0 ||
      (score >= 1 && metricAssessment?.rating !== 'Good') ||
      NON_ACTIONABLE_DISPLAY_MODES.has(audit.scoreDisplayMode)
    ) return []

    const classification: FindingClassification = metricAssessment?.rating === 'Good'
      ? 'positive_observation'
      : metricAssessment
        ? 'verified_issue'
        : scoringAuditIds.has(auditId)
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
      ...(metricAssessment ? { assessment_rating: metricAssessment.rating } : {}),
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
  metricFindings: Array<{
    audit_id?: string
    title?: string
    evidence?: string
    assessment_rating?: AssessmentRating
    classification?: FindingClassification
  }> = [],
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
    if (rateCategoryScore(score) === 'Good') {
      observations.push({
        id: `positive-score-${category}`,
        title: `${lighthouseCategoryLabel(category)} — Good`,
        evidence: `PageSpeed Insights measured ${score}/100.`,
        source: 'lighthouse',
        potential_benefit: 'No outcome is inferred from this measurement.',
        priority: 'informational',
      })
    }
  }

  for (const finding of metricFindings) {
    if (finding.classification !== 'positive_observation' || finding.assessment_rating !== 'Good') continue
    observations.push({
      id: `positive-metric-${finding.audit_id || finding.title || observations.length}`,
      title: `${finding.title || 'Lighthouse metric'} — Good`,
      evidence: `PageSpeed measured ${finding.evidence || 'a result in the Good range'}.`,
      source: 'lighthouse',
      potential_benefit: 'No visitor or business outcome is inferred from this measurement.',
      priority: 'informational',
    })
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
