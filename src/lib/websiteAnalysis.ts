import { supabase, getCurrentUserId } from '@/lib/supabase'

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
}): Promise<GeminiResult> {
  const { data, error } = await (supabase as any).functions.invoke('gemini-analysis', { body: payload })
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

export async function analyzeWebsite(url: string, prospectId: string | null = null) {
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

  const gemini = await generateGeminiAnalysis({ url, content, pagespeed })

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
    : 50

  const audits = pagespeed?.lighthouseResult?.audits || {}
  const failedAudits = Object.values(audits)
    .filter((a: any) => a?.score !== null && a?.score !== undefined && a.score < 1)
    .slice(0, 25)

  const findings: any[] = [
    ...failedAudits.map((a: any, idx: number) => ({
      id: `ps-${idx}`,
      title: a.title,
      evidence: a.displayValue || '',
      explanation: a.description || '',
      recommended_fix: a.description || '',
      potential_benefit: '',
      priority: (a.score ?? 0) < 0.5 ? 'high' : 'medium',
      confidence: 'high',
      status: 'open',
    })),
  ]

  ;(gemini.parsed?.recommendations || []).forEach((r: string, idx: number) => {
    findings.push({
      id: `ai-${idx}`,
      title: r,
      evidence: 'AI-generated',
      explanation: r,
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

  return {
    record: data,
    content,
    pagespeed,
    gemini,
    overallScore: overall,
    seoScore,
    perfScore,
  }
}


