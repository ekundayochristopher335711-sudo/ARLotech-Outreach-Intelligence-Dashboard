import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

function meta(html: string, name: string, attr = 'name'): string | null {
  const re = new RegExp(`<meta[^>]*${attr}=["']${name}["'][^>]*content=["']([^"']*)["']`, 'i')
  let m = html.match(re)
  if (m) return m[1]
  const re2 = new RegExp(`<meta[^>]*content=["']([^"']*)["'][^>]*${attr}=["']${name}["']`, 'i')
  m = html.match(re2)
  return m ? m[1] : null
}

function linkRel(html: string, rel: string): string | null {
  const re = new RegExp(`<link[^>]*rel=["'][^"']*${rel}[^"']*["'][^>]*href=["']([^"']+)["']`, 'i')
  let m = html.match(re)
  if (m) return m[1]
  const re2 = new RegExp(`<link[^>]*href=["']([^"']+)["'][^>]*rel=["'][^"']*${rel}[^"']*["']`, 'i')
  m = html.match(re2)
  return m ? m[1] : null
}

function allMatches(html: string, re: RegExp): string[] {
  const out: string[] = []
  let m: RegExpExecArray | null
  const r = new RegExp(re.source, re.flags.includes('g') ? re.flags : re.flags + 'g')
  while ((m = r.exec(html)) !== null) out.push(m[1] ?? m[0])
  return out
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const { url } = await req.json()
    if (!url) throw new Error('url is required')
    let parsed: URL
    try {
      parsed = new URL(url)
    } catch {
      throw new Error('Invalid URL provided')
    }
    if (!['http:', 'https:'].includes(parsed.protocol)) {
      throw new Error('Only http/https URLs are supported')
    }

    const res = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; ArlotechBot/1.0)',
        'Accept': 'text/html,application/xhtml+xml',
      },
      redirect: 'follow',
    })

    if (!res.ok) {
      throw new Error(`Failed to fetch URL: ${res.status} ${res.statusText}`)
    }
    const html = await res.text()
    const finalUrl = res.url

    const titleMatch = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)
    const title = titleMatch ? titleMatch[1].replace(/\s+/g, ' ').trim() : null

    const description = meta(html, 'description')
    const robots = meta(html, 'robots')
    const canonical = linkRel(html, 'canonical')

    const og = {
      title: meta(html, 'og:title', 'property'),
      description: meta(html, 'og:description', 'property'),
      image: meta(html, 'og:image', 'property'),
      url: meta(html, 'og:url', 'property'),
      type: meta(html, 'og:type', 'property'),
    }
    const twitter = {
      card: meta(html, 'twitter:card', 'name'),
      title: meta(html, 'twitter:title', 'name'),
      description: meta(html, 'twitter:description', 'name'),
    }

    const headings: Record<string, string[]> = {}
    for (const tag of ['h1', 'h2', 'h3', 'h4', 'h5', 'h6']) {
      headings[tag] = allMatches(html, new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`, 'i'))
        .map((t) => t.replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim())
        .filter(Boolean)
    }

    const cleaned = html
      .replace(/<script[\s\S]*?<\/script>/gi, ' ')
      .replace(/<style[\s\S]*?<\/style>/gi, ' ')
      .replace(/<noscript[\s\S]*?<\/noscript>/gi, ' ')
      .replace(/<!--[\s\S]*?-->/g, ' ')
    const text = cleaned.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()
    const words = text.split(/\s+/).filter(Boolean)
    const wordCount = words.length

    const linkMatches = [...html.matchAll(/<a[^>]*href=["']([^"']+)["']/gi)].map((m) => m[1])
    const baseHost = new URL(finalUrl).host
    let internalLinks = 0
    let externalLinks = 0
    const externalDomains = new Set<string>()
    for (const href of linkMatches) {
      try {
        if (href.startsWith('#') || href.startsWith('mailto:') || href.startsWith('tel:')) continue
        const u = new URL(href, finalUrl)
        if (u.host === baseHost) internalLinks++
        else {
          externalLinks++
          externalDomains.add(u.host)
        }
      } catch {
        internalLinks++
      }
    }

    const imgTags = [...html.matchAll(/<img[^>]*>/gi)].map((m) => m[0])
    const imagesTotal = imgTags.length
    const imagesMissingAlt = imgTags.filter((t) => !/alt\s*=\s*["'][^"']*["']/i.test(t)).length

    const schemaScripts = allMatches(html, /<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/i)

    const langMatch = html.match(/<html[^>]*lang=["']([^"']+)["']/i)
    const lang = langMatch ? langMatch[1] : null

    const viewport = meta(html, 'viewport')

    const favicon = linkRel(html, 'icon') || linkRel(html, 'shortcut icon')

    const result = {
      url,
      finalUrl,
      status: res.status,
      title,
      metaDescription: description,
      robots,
      canonical,
      lang,
      viewport,
      favicon,
      og,
      twitter,
      headings,
      wordCount,
      textExcerpt: text.slice(0, 3000),
      links: {
        total: linkMatches.length,
        internal: internalLinks,
        external: externalLinks,
        externalDomains: [...externalDomains],
      },
      images: {
        total: imagesTotal,
        missingAlt: imagesMissingAlt,
      },
      schema: schemaScripts,
      h1Count: headings.h1.length,
    }

    return new Response(JSON.stringify(result), {
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
