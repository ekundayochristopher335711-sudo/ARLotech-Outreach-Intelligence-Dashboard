import { supabase, getCurrentUserId } from '@/lib/supabase'
import { lighthouseRecommendation } from '@/lib/lighthouseRecommendations'
import {
  extractPageSpeedScreenshot,
  MAX_VISUAL_REVIEW_PAGES,
  selectVisualReviewPages,
  type StoredVisualPage,
  type VisualAudit,
  type VisualScreenshot,
} from '@/lib/visualReview'

export interface ExtractedContent {
  url: string
  finalUrl: string
  status: number
  title: string | null
  metaDescription: string | null
  robots: string | null
  canonical: string | null
  lang: string | null
  viewport: string | null
  favicon: string | null
  og: Record<string, string | null>
  twitter: Record<string, string | null>
  headings: Record<string, string[]>
  wordCount: number
  textExcerpt: string
  links: { total: number; internal: number; external: number; externalDomains: string[] }
  navigationPages?: Array<{ label: string; url: string }>
  images: { total: number; missingAlt: number }
  schema: string[]
  h1Count: number
  contacts?: { emails: string[]; phones: string[] }
}

export interface PageSpeedResult {
  id: string
  title: string
  strategy: string
  lighthouseResult: {
    categories: Record<string, { id: string; title: string; score: number | null; scoreDisplayMode: string; description: string; auditRefs: any[] }>
    audits: Record<string, any>
    fullPageScreenshot?: any
    timing?: any
    userAgent?: any
  }
  loadingExperience?: any
  originLoadingExperience?: any
}
export interface GeminiResult {
  text: string
  parsed: {
    summary?: string
    score_explanation?: string
    recommendations?: string[]
    seo_notes?: string[]
    content_notes?: string[]
    positive_observations?: string[]
    visual_observations?: Array<{
      page_url: string
      viewport: 'desktop' | 'mobile'
      title: string
      evidence: string
      severity: 'high' | 'medium' | 'low'
      confidence: number
      recommended_fix?: string
    }>
  } | null
  model: string
}

export async function extractContent(url: string): Promise<ExtractedContent> {
  const { data, error } = await (supabase as any).functions.invoke('extract-content', { body: { url } })
  if (error) {
    let detail = error.message || 'extract-content failed'
    try {
      const ctx = (error as any)?.context
      if (ctx && typeof ctx.text === 'function') {
        const body = await ctx.text()
        if (body) detail = `${detail} — ${body}`
      }
    } catch { /* ignore */ }
    throw new Error(detail)
  }
  if (data?.error) throw new Error(data.error)
  return data as ExtractedContent
}

export async function runPageSpeed(url: string, strategy: 'mobile' | 'desktop' = 'desktop'): Promise<PageSpeedResult> {
  const { data, error } = await (supabase as any).functions.invoke('pagespeed-insights', {
    body: { url, strategy, categories: ['performance', 'accessibility', 'seo', 'best-practices'] },
  })
  if (error) {
    let detail = error.message || 'pagespeed-insights failed'
    try {
      const ctx = (error as any)?.context
      if (ctx && typeof ctx.text === 'function') {
        const body = await ctx.text()
        if (body) detail = `${detail} — ${body}`
      }
    } catch { /* ignore */ }
    throw new Error(detail)
  }
  if (data?.error) throw new Error(data.error)
  return data as PageSpeedResult
}

export async function generateGeminiAnalysis(payload: {
  url: string
  content: ExtractedContent
  pagespeed: PageSpeedResult
  visualScreenshots?: VisualScreenshot[]
}): Promise<GeminiResult> {
  const { fullPageScreenshot: _fullPageScreenshot, ...lighthouseResult } = payload.pagespeed.lighthouseResult
  const { data, error } = await (supabase as any).functions.invoke('gemini-analysis', {
    body: {
      ...payload,
      pagespeed: { ...payload.pagespeed, lighthouseResult },
    },
  })
  if (error) {
    let detail = error.message || 'gemini-analysis failed'
    try {
      const ctx = (error as any)?.context
      if (ctx && typeof ctx.text === 'function') {
        const body = await ctx.text()
        if (body) detail = `${detail} — ${body}`
      }
    } catch { /* ignore */ }
    throw new Error(detail)
  }
  if (data?.error) throw new Error(data.error)
  return data as GeminiResult
}

function scoreToNumber(score: number | null | undefined): number | null {
  if (score === null || score === undefined) return null
  return Math.round(score * 100)
}

function canonicalAuditKey(audit: any) {
  const id = typeof audit?.id === 'string' ? audit.id : ''
  if (/unused-javascript/i.test(id)) return 'unused-javascript'
  if (/legacy-javascript/i.test(id)) return 'legacy-javascript'
  if (/forced-reflow/i.test(id)) return 'forced-reflow'
  return id || String(audit?.title ?? '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()
}

function affectedResources(details: any): string[] {
  const items = Array.isArray(details?.items) ? details.items : []
  const urls: string[] = items.flatMap((item: any): string[] => {
    const url = item?.url ?? item?.source?.url ?? item?.node?.snippet ?? item?.node?.selector
    return typeof url === 'string' && url.trim() ? [url.trim()] : []
  })
  return [...new Set(urls)].slice(0, 3)
}

export async function analyzeWebsite(
  url: string,
  prospectId: string | null = null,
  includeVisualReview = false,
) {
  const userId = await getCurrentUserId()

  const content = await extractContent(url)

  let pagespeed: PageSpeedResult
  try {
    pagespeed = await runPageSpeed(url, 'desktop')
  } catch (e) {
    console.warn('PageSpeed desktop failed, retrying mobile:', e)
    try {
      pagespeed = await runPageSpeed(url, 'mobile')
    } catch (e2) {
      console.warn('PageSpeed mobile failed, continuing without PageSpeed:', e2)
      pagespeed = { id: url, title: url, strategy: 'none', lighthouseResult: { categories: {}, audits: {} } } as PageSpeedResult
    }
  }

  const visualPages: Array<{
    page_url: string
    page_label: string
    viewport: 'desktop' | 'mobile'
    screenshot: VisualScreenshot | null
    error?: string
  }> = []
  let gemini: GeminiResult
  if (includeVisualReview) {
    const pages = selectVisualReviewPages(
      content.finalUrl || url,
      content.navigationPages ?? [],
      MAX_VISUAL_REVIEW_PAGES,
    )
    const addScreenshot = (
      page: { url: string; label: string },
      viewport: 'desktop' | 'mobile',
      result: PageSpeedResult | null,
      error?: string,
    ) => {
      const image = extractPageSpeedScreenshot(result?.lighthouseResult.fullPageScreenshot)
      visualPages.push({
        page_url: page.url,
        page_label: page.label,
        viewport,
        screenshot: image ? { ...image, page_url: page.url, page_label: page.label, viewport } : null,
        ...(!image ? { error: error || 'PageSpeed did not return a usable screenshot.' } : {}),
      })
    }

    const home = pages[0]
    addScreenshot(
      home,
      pagespeed.strategy === 'mobile' ? 'mobile' : 'desktop',
      pagespeed,
      'The primary PageSpeed result did not include a usable screenshot.',
    )

    const mobilePages = pagespeed.strategy === 'mobile' ? pages.slice(1) : pages
    const mobileResults = await Promise.all(mobilePages.map(async (page) => {
      try {
        return { page, result: await runPageSpeed(page.url, 'mobile') }
      } catch (error) {
        return {
          page,
          result: null,
          error: error instanceof Error ? error.message : 'Mobile screenshot request failed.',
        }
      }
    }))
    for (const { page, result, error } of mobileResults) {
      addScreenshot(page, 'mobile', result, error)
    }

    const screenshotPages: VisualScreenshot[] = visualPages.flatMap((page) =>
      page.screenshot ? [page.screenshot] : [],
    )
    gemini = await generateGeminiAnalysis({
      url,
      content,
      pagespeed: { ...pagespeed, lighthouseResult: { ...pagespeed.lighthouseResult, fullPageScreenshot: undefined } },
      visualScreenshots: screenshotPages,
    })
  } else {
    gemini = await generateGeminiAnalysis({ url, content, pagespeed })
  }

  const cats = pagespeed?.lighthouseResult?.categories || {}
  const categoryScores: Record<string, number | null> = {}
  for (const [k, v] of Object.entries(cats)) {
    categoryScores[k] = scoreToNumber((v as any)?.score)
  }

  const perfScore = categoryScores.performance ?? null
  const seoScore = categoryScores.seo ?? null
  const scores = Object.values(categoryScores).filter((n): n is number => n !== null)
  const hasPageSpeed = scores.length > 0
  const overall = hasPageSpeed
    ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length)
    : null

  const audits = pagespeed?.lighthouseResult?.audits || {}
  const auditCategories = new Map<string, string>()
  for (const [category, details] of Object.entries(cats)) {
    for (const auditRef of (details as any)?.auditRefs ?? []) {
      if (typeof auditRef?.id === 'string') auditCategories.set(auditRef.id, category)
    }
  }
  const failedAudits = new Map<string, any>()
  for (const [auditId, audit] of Object.entries(audits) as Array<[string, any]>) {
    if (
      typeof audit?.score !== 'number' ||
      audit.score >= 1 ||
      ['informative', 'manual', 'notApplicable', 'error'].includes(audit.scoreDisplayMode)
    ) continue
    const key = canonicalAuditKey({ ...audit, id: auditId })
    if (key && !failedAudits.has(key)) failedAudits.set(key, { ...audit, id: auditId })
  }

  const findings: any[] = [
    ...[...failedAudits.values()].map((audit: any) => ({
      id: `ps-${audit.id}`,
      audit_id: audit.id,
      source: 'lighthouse',
      category: auditCategories.get(audit.id) ?? null,
      title: audit.title,
      evidence: audit.displayValue || '',
      display_value: audit.displayValue || '',
      explanation: audit.description || '',
      recommended_fix: lighthouseRecommendation(audit.id, audit.title || 'this issue'),
      affected_resources: affectedResources(audit.details),
      lighthouse_score_pct: scoreToNumber(audit.score),
      opportunity_ms: audit.details?.overallSavingsMs ?? null,
      opportunity_bytes: audit.details?.overallSavingsBytes ?? null,
      priority: audit.score < 0.5 ? 'high' : audit.score < 0.9 ? 'medium' : 'low',
      confidence: 'high',
      status: 'open',
    })),
  ]

  ;(gemini.parsed?.recommendations || []).slice(0, 8).forEach((r: string, idx: number) => {
    findings.push({
      id: `ai-${idx}`,
      source: 'ai',
      title: r,
      evidence: null,
      explanation: 'AI-assisted suggestion; not a measured Lighthouse or direct HTML observation.',
      recommended_fix: r,
      potential_benefit: '',
      priority: 'medium',
      confidence: 'medium',
      status: 'open',
    })
  })

  if (content.h1Count === 0) {
    findings.push({
      id: 'content-h1',
      source: 'content',
      title: 'Missing H1 heading',
      evidence: 'No H1 tag found',
      explanation: 'Page has no H1 heading, which is important for SEO.',
      recommended_fix: 'Add a single descriptive H1 heading.',
      potential_benefit: 'Improved SEO and accessibility.',
      priority: 'high',
      confidence: 'high',
      status: 'open',
    })
  }
  if (content.images.missingAlt > 0) {
    findings.push({
      id: 'content-alt',
      source: 'content',
      title: `${content.images.missingAlt} images missing alt text`,
      evidence: `${content.images.missingAlt} of ${content.images.total} images`,
      explanation: 'Images without alt text hurt accessibility and SEO.',
      recommended_fix: 'Add descriptive alt attributes to all images.',
      potential_benefit: 'Better accessibility and image SEO.',
      priority: 'medium',
      confidence: 'high',
      status: 'open',
    })
  }
  if (!content.metaDescription) {
    findings.push({
      id: 'content-meta',
      source: 'content',
      title: 'Missing meta description',
      evidence: 'No meta description found',
      explanation: 'Meta description helps search engines and click-through rates.',
      recommended_fix: 'Add a concise meta description (120-160 chars).',
      potential_benefit: 'Improved SERP click-through rate.',
      priority: 'medium',
      confidence: 'high',
      status: 'open',
    })
  }

  const positiveObservations = (gemini.parsed?.positive_observations || []).map((p: string, idx: number) => ({
    id: `pos-${idx}`,
    title: p,
    evidence: 'AI-generated',
    potential_benefit: '',
    priority: 'low',
  }))

  const { data, error } = await supabase
    .from('website_analyses')
    .insert({
      user_id: userId,
      prospect_id: prospectId,
      website_url: url,
      overall_score: overall,
      performance_score: perfScore,
      accessibility_score: categoryScores.accessibility ?? null,
      seo_score: seoScore,
      best_practices_score: categoryScores['best-practices'] ?? null,
      category_scores: categoryScores,
      findings,
      positive_observations: positiveObservations,
      ai_analysis: gemini.parsed ?? { text: gemini.text },
      analysis_status: 'completed',
      error_message: null,
      analysis_provider: 'pagespeed+gemini',
      analyzed_at: new Date().toISOString(),
    })
    .select()
    .single()

  if (error) throw error

  const pagespeedSummary = {
    ...pagespeed,
    lighthouseResult: { ...pagespeed.lighthouseResult, fullPageScreenshot: undefined },
  }

  if (includeVisualReview) {
    const savedPages: StoredVisualPage[] = await Promise.all(visualPages.map(async (page, index) => {
      if (!page.screenshot) {
        return {
          page_url: page.page_url,
          page_label: page.page_label,
          viewport: page.viewport,
          image_path: null,
          error: page.error,
        }
      }

      const extension = page.screenshot.mime_type === 'image/png' ? 'png' :
        page.screenshot.mime_type === 'image/webp' ? 'webp' : 'jpg'
      const imagePath = `${userId}/${data.id}/${index}-${page.viewport}.${extension}`
      const bytes = Uint8Array.from(atob(page.screenshot.data), (character) => character.charCodeAt(0))
      const { error: uploadError } = await supabase.storage
        .from('website-audit-screenshots')
        .upload(imagePath, new Blob([bytes], { type: page.screenshot.mime_type }), {
          contentType: page.screenshot.mime_type,
          upsert: false,
        })

      return {
        page_url: page.page_url,
        page_label: page.page_label,
        viewport: page.viewport,
        image_path: uploadError ? null : imagePath,
        ...(uploadError ? { error: `Screenshot storage failed: ${uploadError.message}` } : {}),
      }
    }))
    const availablePageViewports = new Set(
      visualPages.filter((page) => page.screenshot).map((page) => `${page.page_url}|${page.viewport}`),
    )
    const observations = (gemini.parsed?.visual_observations ?? [])
      .filter((observation) =>
        availablePageViewports.has(`${observation.page_url}|${observation.viewport}`) &&
        typeof observation.title === 'string' &&
        observation.title.trim().length > 0 &&
        typeof observation.evidence === 'string' &&
        ['high', 'medium', 'low'].includes(observation.severity) &&
        Number.isFinite(observation.confidence) &&
        observation.confidence >= 0 &&
        observation.confidence <= 1,
      )
      .slice(0, 15)
      .map((observation) => ({
        ...observation,
        title: observation.title.trim().slice(0, 200),
        evidence: observation.evidence.trim().slice(0, 800),
        confidence: Math.round(observation.confidence * 100) / 100,
        recommended_fix: typeof observation.recommended_fix === 'string'
          ? observation.recommended_fix.trim().slice(0, 500)
          : undefined,
      }))
    const successfulScreenshots = savedPages.filter((page) => page.image_path).length
    const visualAudit: VisualAudit = {
      status: successfulScreenshots === 0
        ? 'unavailable'
        : savedPages.some((page) => !page.image_path)
          ? 'partial'
          : 'completed',
      pages: savedPages,
      observations,
    }
    const { data: updatedRecord, error: updateError } = await supabase
      .from('website_analyses')
      .update({
        ai_analysis: {
          ...(gemini.parsed ?? {}),
          text: gemini.text,
          visual_audit: visualAudit,
        },
      })
      .eq('id', data.id)
      .eq('user_id', userId)
      .select()
      .single()
    if (updateError) throw updateError

    return {
      record: updatedRecord,
      content,
      pagespeed: pagespeedSummary,
      gemini,
      overallScore: overall,
      seoScore,
      perfScore,
    }
  }

  return {
    record: data,
    content,
    pagespeed: pagespeedSummary,
    gemini,
    overallScore: overall,
    seoScore,
    perfScore,
  }
}
