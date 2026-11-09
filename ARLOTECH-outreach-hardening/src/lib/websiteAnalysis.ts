import { supabase, getCurrentUserId } from '@/lib/supabase'
import { lighthouseRecommendation } from '@/lib/lighthouseRecommendations'
import {
  extractPageSpeedScreenshot,
  formatVisualCaptureError,
  MAX_VISUAL_REVIEW_PAGES,
  selectVisualReviewPages,
  type StoredVisualPage,
  type VisualAudit,
  type VisualScreenshot,
} from '@/lib/visualReview'
import {
  buildEvidenceBasedPositiveObservations,
  calculateTechnicalHealthScore,
  classifyLighthouseAudits,
  extractCategoryScores,
  sanitizePlainText,
  sanitizeRecommendationList,
  sanitizeVisualObservations,
  summarizePageInspectionCoverage,
} from '@/lib/websiteAudit'
import { mapWithConcurrency } from '@/lib/mapWithConcurrency'

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
  images: { total: number; missingAlt: number; emptyAlt?: number }
  schema: string[]
  schemaInspection?: {
    present: number
    validJson: number
    invalidJson: number
  }
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
      why_it_matters?: string
      severity: 'high' | 'medium' | 'low'
      confidence: number
      recommended_fix?: string
    }>
  } | null
  model: string
  error?: string
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

export async function analyzeWebsite(
  url: string,
  prospectId: string | null = null,
  includeVisualReview = false,
  extractedContent?: ExtractedContent,
) {
  const userId = await getCurrentUserId()

  let content = extractedContent
  let contentExtractionError: string | undefined
  if (!content) {
    try {
      content = await extractContent(url)
    } catch (error) {
      contentExtractionError = error instanceof Error ? error.message : 'Website content extraction failed.'
      content = {
        url,
        finalUrl: url,
        status: 0,
        title: null,
        metaDescription: null,
        robots: null,
        canonical: null,
        lang: null,
        viewport: null,
        favicon: null,
        og: {},
        twitter: {},
        headings: {},
        wordCount: 0,
        textExcerpt: '',
        links: { total: 0, internal: 0, external: 0, externalDomains: [] },
        images: { total: 0, missingAlt: 0, emptyAlt: 0 },
        schema: [],
        h1Count: 0,
      }
    }
  }

  let pagespeed: PageSpeedResult
  let desktopError: string | undefined
  let mobileError: string | undefined
  try {
    pagespeed = await runPageSpeed(url, 'desktop')
  } catch (e) {
    desktopError = e instanceof Error ? e.message : 'PageSpeed desktop analysis failed.'
    try {
      pagespeed = await runPageSpeed(url, 'mobile')
    } catch (e2) {
      mobileError = e2 instanceof Error ? e2.message : 'PageSpeed mobile analysis failed.'
      pagespeed = { id: url, title: url, strategy: 'none', lighthouseResult: { categories: {}, audits: {} } } as PageSpeedResult
    }
  }
  if (contentExtractionError && desktopError && mobileError) {
    throw new Error(
      `Website analysis could not access the site. Content extraction failed: ${contentExtractionError}; PageSpeed desktop failed: ${desktopError}; PageSpeed mobile failed: ${mobileError}`,
    )
  }

  const visualPages: Array<{
    page_url: string
    page_label: string
    viewport: 'desktop' | 'mobile'
    screenshot: VisualScreenshot | null
    inspection_status: 'completed' | 'failed'
    error?: string
  }> = []
  const lighthousePageResults: Array<{
    page_url: string
    page_label: string
    viewport: 'desktop' | 'mobile'
    status: 'completed' | 'failed'
    error?: string
  }> = []
  let discoveredPageCount = 1
  let discoveredPageUrls = [content.finalUrl || url]
  if (includeVisualReview) {
    const pages = selectVisualReviewPages(
      content.finalUrl || url,
      content.navigationPages ?? [],
      MAX_VISUAL_REVIEW_PAGES,
    )
    discoveredPageCount = pages.length
    discoveredPageUrls = pages.map((page) => page.url)
    const primaryViewport = pagespeed.strategy === 'mobile' ? 'mobile' : 'desktop'
    const requests = pages.flatMap((page, pageIndex) =>
      (['desktop', 'mobile'] as const).map((viewport) => ({ page, pageIndex, viewport })),
    )
    const results = await mapWithConcurrency(requests, 2, async ({ page, pageIndex, viewport }) => {
      if (pageIndex === 0 && viewport === primaryViewport && pagespeed.strategy !== 'none') {
        return { page, viewport, result: pagespeed, error: undefined }
      }
      if (pageIndex === 0 && pagespeed.strategy === 'none') {
        const error = viewport === 'desktop' ? desktopError : mobileError
        return { page, viewport, result: null, error: error || 'PageSpeed inspection failed.' }
      }
      if (pageIndex === 0 && viewport === 'desktop' && desktopError) {
        return { page, viewport, result: null, error: desktopError }
      }
      if (pageIndex === 0 && viewport === 'mobile' && mobileError) {
        return { page, viewport, result: null, error: mobileError }
      }
      try {
        return { page, viewport, result: await runPageSpeed(page.url, viewport), error: undefined }
      } catch (error) {
        return {
          page,
          viewport,
          result: null,
          error: formatVisualCaptureError(error),
        }
      }
    })

    for (const { page, viewport, result, error } of results) {
      const screenshot = extractPageSpeedScreenshot(result?.lighthouseResult.fullPageScreenshot)
      const failure = error ? formatVisualCaptureError(error) : undefined
      visualPages.push({
        page_url: page.url,
        page_label: page.label,
        viewport,
        screenshot: screenshot ? { ...screenshot, page_url: page.url, page_label: page.label, viewport } : null,
        inspection_status: result ? 'completed' : 'failed',
        ...(!result
          ? { error: failure || 'PageSpeed inspection failed.' }
          : !screenshot
            ? { error: 'PageSpeed completed, but did not return a usable screenshot.' }
            : {}),
      })
      lighthousePageResults.push({
        page_url: page.url,
        page_label: page.label,
        viewport,
        status: result ? 'completed' : 'failed',
        ...(!result ? { error: failure || 'PageSpeed inspection failed.' } : {}),
      })
    }
  } else {
    lighthousePageResults.push({
      page_url: content.finalUrl || url,
      page_label: 'Homepage',
      viewport: pagespeed.strategy === 'mobile' ? 'mobile' : 'desktop',
      status: pagespeed.strategy === 'none' ? 'failed' : 'completed',
      ...(pagespeed.strategy === 'none' ? {
        error: desktopError || mobileError || 'PageSpeed inspection failed.',
      } : {}),
    })
  }

  const categoryScores = extractCategoryScores(pagespeed)
  const overall = calculateTechnicalHealthScore(categoryScores)
  const perfScore = categoryScores.performance
  const seoScore = categoryScores.seo
  const lighthouseFindings = classifyLighthouseAudits(pagespeed).map((finding) => ({
    ...finding,
    recommended_fix: lighthouseRecommendation(finding.audit_id, finding.title),
  }))
  const findings: Array<Record<string, unknown>> = lighthouseFindings
    .filter((finding) => finding.classification === 'verified_issue')
  const optimizationOpportunities = lighthouseFindings
    .filter((finding) => finding.classification === 'optimization_opportunity')
  const diagnostics = lighthouseFindings
    .filter((finding) => finding.classification === 'diagnostic')

  if (!contentExtractionError && content.title?.trim() === '') {
    findings.push({
      id: 'html-title',
      source: 'html_inspection',
      classification: 'observed_issue',
      title: 'HTML title element is empty',
      evidence: 'The extracted HTML has no non-empty page title.',
      explanation: 'The static HTML inspection did not find a usable title element.',
      recommended_fix: 'Review the rendered page title and add a descriptive title if it is also missing there.',
      priority: 'medium',
      confidence: 'high',
      status: 'open',
    })
  } else if (!contentExtractionError && !content.title?.trim()) {
    findings.push({
      id: 'html-title',
      source: 'html_inspection',
      classification: 'observed_issue',
      title: 'HTML title element is missing',
      evidence: 'The extracted HTML has no title.',
      explanation: 'The static HTML inspection did not find a title element.',
      recommended_fix: 'Confirm the title is absent in the rendered page, then add a descriptive title.',
      priority: 'medium',
      confidence: 'high',
      status: 'open',
    })
  }

  if (!contentExtractionError && content.h1Count === 0) {
    findings.push({
      id: 'content-h1',
      source: 'html_inspection',
      classification: 'observed_issue',
      title: 'No H1 heading was found in the extracted HTML',
      evidence: 'The static HTML inspection found zero H1 elements.',
      explanation: 'This is a source-HTML observation; client-rendered content may not be represented.',
      recommended_fix: 'Check the rendered page before changing its heading structure.',
      priority: 'medium',
      confidence: 'high',
      status: 'open',
    })
  }
  if (!contentExtractionError && content.images.missingAlt > 0) {
    findings.push({
      id: 'content-alt',
      source: 'html_inspection',
      classification: 'observed_issue',
      title: `${content.images.missingAlt} images have no alt attribute`,
      evidence: `${content.images.missingAlt} of ${content.images.total} inspected HTML images have no alt attribute.`,
      explanation: 'This describes image markup in the extracted HTML; an empty alt value may be appropriate for decorative images.',
      recommended_fix: 'Review each image in context and add meaningful alternative text where the image conveys information.',
      priority: 'medium',
      confidence: 'high',
      status: 'open',
    })
  }
  if (!contentExtractionError && !content.metaDescription?.trim()) {
    findings.push({
      id: 'content-meta',
      source: 'html_inspection',
      classification: 'observed_issue',
      title: 'No meta description was found in the extracted HTML',
      evidence: 'The static HTML inspection found no non-empty meta description.',
      explanation: 'This is a source-HTML observation; it does not establish how search engines will display the page.',
      recommended_fix: 'Confirm the rendered metadata and search appearance before adding a description.',
      priority: 'low',
      confidence: 'high',
      status: 'open',
    })
  }

  const positiveObservations = buildEvidenceBasedPositiveObservations(
    content,
    categoryScores,
    lighthouseFindings,
  )
  const inspectionCoverage = summarizePageInspectionCoverage(
    discoveredPageUrls,
    lighthousePageResults,
    includeVisualReview ? 2 : 1,
  )
  const inspectedViewports = inspectionCoverage.inspected_viewport_count
  const requestedViewports = inspectionCoverage.requested_viewport_count
  const missingCategories = Object.entries(categoryScores)
    .filter(([, score]) => score === null)
    .map(([category]) => category)
  const limitations = [
    ...(missingCategories.length ? [`Lighthouse did not return valid scores for: ${missingCategories.join(', ')}.`] : []),
    ...(contentExtractionError ? [`HTML extraction failed: ${contentExtractionError}`] : []),
    ...(desktopError && pagespeed.strategy === 'mobile'
      ? ['Desktop PageSpeed failed; the primary technical scores are from the mobile run.']
      : []),
    ...(!includeVisualReview ? ['Only the primary page was assessed; multi-page visual review was not requested.'] : []),
    ...(includeVisualReview && discoveredPageCount > 0
      ? [`Visual review was limited to ${discoveredPageCount} same-origin page(s) and initial-load screenshots.`]
      : []),
    'Sitemap and robots.txt availability, broken links, JavaScript-rendered states, and interactive controls were not independently tested.',
  ]
  const auditCompleteness = {
    status: missingCategories.length === 0 && !contentExtractionError && inspectedViewports === requestedViewports
      ? 'complete'
      : inspectedViewports > 0 || !contentExtractionError
        ? 'partial'
        : 'failed',
    ...inspectionCoverage,
    missing_categories: missingCategories,
    limitations,
  }

  let gemini: GeminiResult = {
    text: '',
    parsed: null,
    model: 'unavailable',
  }
  try {
    const visualScreenshots = visualPages.flatMap((page) => page.screenshot ? [page.screenshot] : [])
    gemini = await generateGeminiAnalysis({
      url,
      content,
      pagespeed: { ...pagespeed, lighthouseResult: { ...pagespeed.lighthouseResult, fullPageScreenshot: undefined } },
      ...(visualScreenshots.length ? { visualScreenshots } : {}),
    })
  } catch (error) {
    const detail = error instanceof Error ? error.message : 'Gemini analysis failed.'
    console.warn('AI analysis unavailable; saving measured audit data without AI analysis:', detail)
    gemini = { text: '', parsed: null, model: 'unavailable', error: detail }
  }

  const scoreExplanation = overall === null
    ? `A technical health score is unavailable because Lighthouse did not return valid scores for every required category${missingCategories.length ? ` (${missingCategories.join(', ')})` : ''}.`
    : `Technical health score: ${overall}/100, calculated from Lighthouse category scores using Performance 30%, SEO 25%, Accessibility 25%, and Best Practices 20%.`
  const parsedGemini = gemini.parsed && typeof gemini.parsed === 'object'
    ? {
        summary: sanitizePlainText(gemini.parsed.summary, 1200),
        recommendations: sanitizeRecommendationList(gemini.parsed.recommendations),
        visual_observations: sanitizeVisualObservations(
          gemini.parsed.visual_observations,
          visualPages.flatMap((page) => page.screenshot
            ? [{ page_url: page.page_url, viewport: page.viewport }]
            : []),
        ),
      }
    : null
  gemini = { ...gemini, parsed: parsedGemini }
  const aiSummary = {
    ...(parsedGemini?.summary ? { summary: parsedGemini.summary } : {}),
    score_explanation: scoreExplanation,
    recommendations: parsedGemini?.recommendations ?? [],
    text: gemini.text.slice(0, 6000),
    model: gemini.model,
    ...(gemini.error ? { error: gemini.error } : {}),
    technical_score: {
      methodology: 'Weighted Lighthouse category score',
      weights: { performance: 30, seo: 25, accessibility: 25, 'best-practices': 20 },
      value: overall,
      missing_categories: missingCategories,
    },
    audit_completeness: auditCompleteness,
    html_inspection: {
      requested_url: content.url,
      final_url: content.finalUrl,
      http_status: content.status,
      title_present: !!content.title?.trim(),
      meta_description_present: !!content.metaDescription?.trim(),
      h1_count: content.h1Count,
      image_count: content.images.total,
      images_without_alt_attribute: content.images.missingAlt,
      images_with_empty_alt: content.images.emptyAlt ?? null,
      canonical_present: !!content.canonical,
      viewport_meta_present: !!content.viewport,
      structured_data: content.schemaInspection ?? {
        present: content.schema.length,
        validJson: null,
        invalidJson: null,
      },
      discovered_same_origin_navigation_count: content.navigationPages?.length ?? 0,
    },
    optimization_opportunities: optimizationOpportunities,
    diagnostics,
    lighthouse_page_results: lighthousePageResults,
  }

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
      ai_analysis: aiSummary,
      analysis_status: 'completed',
      error_message: null,
      analysis_provider: gemini.model === 'unavailable' ? 'pagespeed' : 'pagespeed+gemini',
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
          inspection_status: page.inspection_status,
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
        inspection_status: page.inspection_status,
        image_path: uploadError ? null : imagePath,
        ...(uploadError ? { error: `Screenshot storage failed: ${uploadError.message}` } : {}),
        ...(!uploadError && page.error ? { error: page.error } : {}),
      }
    }))
    const savedPageViewports = new Set(
      savedPages.filter((page) => page.image_path).map((page) => `${page.page_url}|${page.viewport}`),
    )
    const observations = (parsedGemini?.visual_observations ?? [])
      .filter((observation) =>
        savedPageViewports.has(`${observation.page_url}|${observation.viewport}`) &&
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
      discovered_page_count: discoveredPageCount,
      requested_viewport_count: requestedViewports,
      inspected_viewport_count: inspectedViewports,
      completeness_percent: inspectionCoverage.completeness_percent,
    }
    const { data: updatedRecord, error: updateError } = await supabase
      .from('website_analyses')
      .update({
        ai_analysis: {
          ...aiSummary,
          audit_completeness: {
            ...auditCompleteness,
            saved_screenshot_count: successfulScreenshots,
            status: visualAudit.status === 'completed' && auditCompleteness.status === 'complete'
              ? 'complete'
              : 'partial',
          },
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
      contentExtractionError,
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
    contentExtractionError,
  }
}
