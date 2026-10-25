import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const PAGESPEED_API_KEY = Deno.env.get('PAGESPEED_API_KEY')
    if (!PAGESPEED_API_KEY) throw new Error('PAGESPEED_API_KEY is not configured')

    const { url, strategy, categories } = await req.json()
    if (!url) throw new Error('url is required')

    try {
      new URL(url)
    } catch {
      throw new Error('Invalid URL provided')
    }

    const validStrategy = strategy === 'mobile' || strategy === 'desktop' ? strategy : 'desktop'
    const cats = (categories || ['performance', 'accessibility', 'seo', 'best-practices'])
    const categoryParams = cats.map((c: string) => `category=${encodeURIComponent(c)}`).join('&')

    const apiUrl = `https://www.googleapis.com/pagespeedonline/v5/runPagespeed?url=${encodeURIComponent(url)}&key=${PAGESPEED_API_KEY}&strategy=${validStrategy}&${categoryParams}`

    const response = await fetch(apiUrl)
    if (!response.ok) {
      const errorBody = await response.text()
      throw new Error(`PageSpeed Insights API error: ${response.status} - ${errorBody}`)
    }

    const data = await response.json()

    const simplifiedData = {
      id: data.id,
      title: data.title,
      strategy: validStrategy,
      lighthouseResult: {
        categories: extractCategories(data.lighthouseResult?.categories),
        audits: extractAudits(data.lighthouseResult?.audits),
        fullPageScreenshot: data.lighthouseResult?.fullPageScreenshot,
        timing: data.lighthouseResult?.timing,
        userAgent: data.lighthouseResult?.userAgent,
      },
      loadingExperience: data.loadingExperience,
      originLoadingExperience: data.originLoadingExperience,
    }

    return new Response(JSON.stringify(simplifiedData), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  } catch (error) {
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'An error occurred' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    )
  }
})

function extractCategories(categories: Record<string, any> | undefined) {
  if (!categories) return {}
  const result: Record<string, any> = {}
  for (const [key, value] of Object.entries(categories)) {
    result[key] = {
      id: value.id,
      title: value.title,
      score: value.score,
      scoreDisplayMode: value.scoreDisplayMode,
      description: value.description,
      auditRefs: value.auditRefs,
    }
  }
  return result
}

function extractAudits(audits: Record<string, any> | undefined) {
  if (!audits) return {}
  const result: Record<string, any> = {}
  for (const [key, value] of Object.entries(audits)) {
    result[key] = {
      id: value.id,
      title: value.title,
      description: value.description,
      score: value.score,
      scoreDisplayMode: value.scoreDisplayMode,
      displayValue: value.displayValue,
      numericValue: value.numericValue,
      details: value.details,
    }
  }
  return result
}
