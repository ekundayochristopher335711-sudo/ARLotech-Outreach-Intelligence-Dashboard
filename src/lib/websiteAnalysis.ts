import { supabase, getCurrentUserId } from '@/lib/supabase'
import { lighthouseRecommendation } from '@/lib/lighthouseRecommendations'
import {
  extractPageSpeedScreenshot,
  formatVisualCaptureError,
  MAX_VISUAL_REVIEW_PAGES,
  selectVisualReviewPages,
  type ScreenshotReview,
  type StoredVisualPage,
  type VisualScreenshot,
} from '@/lib/visualReview'
import {
  buildEvidenceBasedPositiveObservations,
  calculateUnifiedWebsiteScore,
  calculateTechnicalHealthScore,
  classifyLighthouseAudits,
  explainUnifiedWebsiteScore,
  extractCategoryScores,
  summarizePageInspectionCoverage,
  unifiedScoreCategories,
} from '@/lib/websiteAudit'
import { mapWithConcurrency } from '@/lib/mapWithConcurrency'
import {
  buildWebsiteContextSnapshot,
  selectRelevantWebsitePages,
  type WebsiteContextPageInput,
} from '@/lib/websiteContext'

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

async function collectWebsiteContext(
  requestedUrl: string,
  content: ExtractedContent,
  contentExtractionError?: string,
) {
  const homepageUrl = content.finalUrl || requestedUrl
  const homepage: WebsiteContextPageInput = {
    label: 'Homepage',
    url: homepageUrl,
    status: content.status,
    title: content.title,
    metaDescription: content.metaDescription,
    headings: content.headings,
    textExcerpt: content.textExcerpt,
    ...(contentExtractionError
      ? { error: contentExtractionError }
      : content.status < 200 || content.status >= 300
        ? { error: `The page returned HTTP ${content.status}.` }
        : {}),
  }
  const selectedPages = selectRelevantWebsitePages(homepageUrl, content.navigationPages ?? [])
  const additionalPages = await mapWithConcurrency(selectedPages, 2, async (page) => {
    try {
      const extracted = await extractContent(page.url)
      return {
        label: page.label,
        url: extracted.finalUrl || page.url,
        status: extracted.status,
        title: extracted.title,
        metaDescription: extracted.metaDescription,
        headings: extracted.headings,
        textExcerpt: extracted.textExcerpt,
        ...(extracted.status < 200 || extracted.status >= 300
          ? { error: `The page returned HTTP ${extracted.status}.` }
          : {}),
      } satisfies WebsiteContextPageInput
    } catch (error) {
      return {
        label: page.label,
        url: page.url,
        error: error instanceof Error ? error.message : 'Page content extraction failed.',
      } satisfies WebsiteContextPageInput
    }
  })

  return buildWebsiteContextSnapshot([homepage, ...additionalPages])
}

export async function refreshProspectContactsFromWebsite(
  prospectId: string,
  userId: string,
  contacts?: ExtractedContent['contacts'],
) {
  const updates: { email?: string; phone?: string } = {}
  const extractedEmail = contacts?.emails.find((value) =>
    /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim()),
  )
  const extractedPhone = contacts?.phones.find((value) => value.replace(/\D/g, '').length >= 7)
  if (extractedEmail) updates.email = extractedEmail.trim().toLowerCase()
  if (extractedPhone) updates.phone = extractedPhone.trim()
  if (Object.keys(updates).length === 0) return

  const { data, error } = await supabase
    .from('prospects')
    .update(updates)
    .eq('id', prospectId)
    .eq('user_id', userId)
    .select('id')
    .maybeSingle()
  if (error) throw error
  if (!data) throw new Error('The prospect could not be found while updating website contacts.')
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

  const websiteContextPromise = collectWebsiteContext(url, content, contentExtractionError)
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
  const websiteContext = await websiteContextPromise

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
  const technicalOverall = calculateTechnicalHealthScore(categoryScores)
  const initialUnifiedScore = calculateUnifiedWebsiteScore(
    unifiedScoreCategories(categoryScores, null),
  )
  let overall = initialUnifiedScore.score
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
    1,
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

  const scoreExplanation = explainUnifiedWebsiteScore(initialUnifiedScore)
  const analysisDetails = {
    score_explanation: scoreExplanation,
    technical_score: {
      methodology: 'Weighted Lighthouse category score',
      weights: { performance: 30, seo: 25, accessibility: 25, 'best-practices': 20 },
      value: technicalOverall,
      missing_categories: missingCategories,
    },
    unified_score: initialUnifiedScore,
    audit_completeness: auditCompleteness,
    website_context: websiteContext,
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
      overall_score: initialUnifiedScore.score,
      performance_score: perfScore,
      accessibility_score: categoryScores.accessibility ?? null,
      seo_score: seoScore,
      best_practices_score: categoryScores['best-practices'] ?? null,
      category_scores: categoryScores,
      findings,
      positive_observations: positiveObservations,
      analysis_details: analysisDetails,
      analysis_status: 'completed',
      error_message: null,
      analysis_provider: 'pagespeed',
      analyzed_at: new Date().toISOString(),
    })
    .select()
    .single()

  if (error) throw error

  let contactUpdateError: string | undefined
  if (prospectId) {
    try {
      await refreshProspectContactsFromWebsite(prospectId, userId, content.contacts)
    } catch (error) {
      contactUpdateError = error instanceof Error ? error.message : 'Could not update prospect contact details.'
    }
  }

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
    const successfulScreenshots = savedPages.filter((page) => page.image_path).length
    const screenshotReview: ScreenshotReview = {
      status: successfulScreenshots === 0
        ? 'unavailable'
        : savedPages.some((page) => !page.image_path)
          ? 'partial'
          : 'completed',
      pages: savedPages,
      discovered_page_count: discoveredPageCount,
      requested_viewport_count: requestedViewports,
      inspected_viewport_count: inspectedViewports,
      completeness_percent: inspectionCoverage.completeness_percent,
    }
    const { data: updatedRecord, error: updateError } = await supabase
      .from('website_analyses')
      .update({
        analysis_details: {
          ...analysisDetails,
          audit_completeness: {
            ...auditCompleteness,
            saved_screenshot_count: successfulScreenshots,
            status: screenshotReview.status === 'completed' && auditCompleteness.status === 'complete'
              ? 'complete'
              : 'partial',
          },
          screenshot_review: screenshotReview,
        },
      })
      .eq('id', data.id)
      .eq('user_id', userId)
      .select()
      .single()
    if (updateError) throw updateError

    // The screenshots are already persisted before the vision function is invoked.
    // Visual failures do not discard a successful technical audit.
    let finalRecord = updatedRecord
    const storedScreenshotCount = savedPages.filter((page) => page.image_path).length
    if (storedScreenshotCount > 0) {
      const { data: visualResult, error: visualError } = await supabase.functions.invoke<{
        visual_audit?: Record<string, unknown>
        error?: string
      }>('analyze-website-visuals', {
        body: { audit_id: data.id },
      })
      if (visualError || visualResult?.error) {
        const currentDetails = (updatedRecord.analysis_details || {}) as Record<string, unknown>
        const { data: statusRecord, error: statusUpdateError } = await supabase
          .from('website_analyses')
          .update({
            analysis_details: {
              ...currentDetails,
              visual_audit: {
                status: 'failed',
                error: visualResult?.error || visualError?.message || 'AI visual analysis failed.',
                analyzed_at: new Date().toISOString(),
                analysis_version: '1.0',
              },
            },
          })
          .eq('id', data.id)
          .eq('user_id', userId)
          .select()
          .single()
        if (statusUpdateError) {
          throw new Error(
            `Visual analysis failed and its failure status could not be saved: ${statusUpdateError.message}`,
          )
        }
        if (!statusRecord) throw new Error('Visual analysis failed and its failure status was not saved.')
        finalRecord = statusRecord
      } else {
        if (!visualResult?.visual_audit) {
          throw new Error('The visual analysis function returned no visual audit.')
        }
        const { data: refreshed, error: refreshError } = await supabase
          .from('website_analyses')
          .select('*')
          .eq('id', data.id)
          .eq('user_id', userId)
          .single()
        if (refreshError) throw refreshError
        if (!refreshed) throw new Error('The completed visual audit could not be reloaded.')
        const refreshedDetails = (refreshed.analysis_details || {}) as Record<string, unknown>
        const visualAudit = refreshedDetails.visual_audit as { visual_score?: unknown } | undefined
        const unifiedScore = calculateUnifiedWebsiteScore(
          unifiedScoreCategories(refreshed.category_scores, visualAudit?.visual_score),
        )
        const { data: scoredRecord, error: scoreUpdateError } = await supabase
          .from('website_analyses')
          .update({
            overall_score: unifiedScore.score,
            analysis_details: {
              ...refreshedDetails,
              unified_score: unifiedScore,
              score_explanation: explainUnifiedWebsiteScore(unifiedScore),
            },
          })
          .eq('id', data.id)
          .eq('user_id', userId)
          .select()
          .single()
        if (scoreUpdateError) throw scoreUpdateError
        if (!scoredRecord) throw new Error('The unified website score could not be saved.')
        finalRecord = scoredRecord
        overall = unifiedScore.score
      }
    }

    return {
      record: finalRecord,
      content,
      pagespeed: pagespeedSummary,
      overallScore: overall,
      seoScore,
      perfScore,
      contentExtractionError,
      contactUpdateError,
    }
  }

  return {
    record: data,
    content,
    pagespeed: pagespeedSummary,
    overallScore: overall,
    seoScore,
    perfScore,
    contentExtractionError,
    contactUpdateError,
  }
}
