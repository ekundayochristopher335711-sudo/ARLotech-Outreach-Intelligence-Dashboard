import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { assertSafeExternalUrl, isPublicIpAddress } from './safety.ts'
import { extractNavigationPages } from './navigation.ts'

const MAX_HTML_BYTES = 2_000_000
const MAX_REDIRECTS = 5
const FETCH_TIMEOUT_MS = 10_000
const MAX_CONTACT_PAGES = 3
const httpClient = Deno.createHttpClient({ allowHttp1: true, allowHttp2: false })

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

async function assertPublicDestination(url: URL) {
  assertSafeExternalUrl(url)
  const hostname = url.hostname.replace(/^\[|\]$/g, '')
  if (/^\d{1,3}(?:\.\d{1,3}){3}$/.test(hostname) || hostname.includes(':')) return

  const results = await Promise.allSettled([
    Deno.resolveDns(hostname, 'A'),
    Deno.resolveDns(hostname, 'AAAA'),
  ])
  const addresses = results.flatMap((result) => result.status === 'fulfilled' ? result.value : [])
  if (addresses.length === 0) {
    throw new Error('The website hostname could not be resolved to a public address.')
  }
  if (addresses.some((address) => !isPublicIpAddress(address))) {
    throw new Error('Private or local website destinations are not supported.')
  }
}

async function readBoundedText(response: Response, maxBytes: number): Promise<string> {
  const contentLength = Number(response.headers.get('content-length'))
  if (Number.isFinite(contentLength) && contentLength > maxBytes) {
    await response.body?.cancel()
    throw new Error('The website response is too large to inspect.')
  }

  const reader = response.body?.getReader()
  if (!reader) return ''
  const decoder = new TextDecoder()
  let text = ''
  let bytesRead = 0
  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    bytesRead += value.byteLength
    if (bytesRead > maxBytes) {
      await reader.cancel()
      throw new Error('The website response is too large to inspect.')
    }
    text += decoder.decode(value, { stream: true })
  }
  return text + decoder.decode()
}

async function fetchPublicPage(startUrl: string) {
  let currentUrl = new URL(startUrl)
  for (let redirectCount = 0; redirectCount <= MAX_REDIRECTS; redirectCount += 1) {
    await assertPublicDestination(currentUrl)
    const response = await fetch(currentUrl, {
      client: httpClient,
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; ArloTechWebsiteAudit/1.0)',
        Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9',
      },
      redirect: 'manual',
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    })
    if ([301, 302, 303, 307, 308].includes(response.status)) {
      const location = response.headers.get('location')
      await response.body?.cancel()
      if (!location) throw new Error('The website returned a redirect without a destination.')
      if (redirectCount === MAX_REDIRECTS) throw new Error('The website exceeded the redirect limit.')
      currentUrl = new URL(location, currentUrl)
      continue
    }
    if (!response.ok) {
      await response.body?.cancel()
      throw new Error(`Failed to fetch URL: ${response.status} ${response.statusText}`)
    }
    const contentType = response.headers.get('content-type')?.toLowerCase() ?? ''
    if (contentType && !/(?:text\/html|application\/xhtml\+xml)/.test(contentType)) {
      await response.body?.cancel()
      throw new Error('The website URL did not return an HTML page.')
    }
    const html = await readBoundedText(response, MAX_HTML_BYTES)
    return { html, finalUrl: currentUrl.href, status: response.status }
  }
  throw new Error('The website exceeded the redirect limit.')
}

async function fetchSameOriginScripts(html: string, pageUrl: string): Promise<string[]> {
  const pageOrigin = new URL(pageUrl).origin
  const scriptUrls = new Set<string>()
  for (const [, attributes] of html.matchAll(/<script\b([^>]*)>/gi)) {
    const source = attributes.match(/(?:^|\s)src\s*=\s*(["'])(.*?)\1/i)?.[2]
    if (!source) continue
    try {
      const scriptUrl = new URL(source, pageUrl)
      if (scriptUrl.origin === pageOrigin && ['http:', 'https:'].includes(scriptUrl.protocol)) {
        assertSafeExternalUrl(scriptUrl)
        scriptUrls.add(scriptUrl.href)
      }
    } catch {
      continue
    }
    if (scriptUrls.size >= 4) break
  }

  return Promise.all([...scriptUrls].map(async (scriptUrl) => {
    try {
      const url = new URL(scriptUrl)
      await assertPublicDestination(url)
      const response = await fetch(url, {
        client: httpClient,
        headers: { Accept: 'application/javascript, text/javascript, */*;q=0.1' },
        redirect: 'error',
        signal: AbortSignal.timeout(5000),
      })
      if (!response.ok) return ''

      const contentLength = Number(response.headers.get('content-length'))
      if (Number.isFinite(contentLength) && contentLength > 1_000_000) {
        console.warn('Skipping oversized same-origin contact script:', scriptUrl)
        return ''
      }

      const reader = response.body?.getReader()
      if (!reader) return ''
      const decoder = new TextDecoder()
      let text = ''
      let bytesRead = 0
      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        bytesRead += value.byteLength
        if (bytesRead > 1_000_000) {
          await reader.cancel()
          console.warn('Skipping oversized same-origin contact script:', scriptUrl)
          return ''
        }
        text += decoder.decode(value, { stream: true })
      }
      return text + decoder.decode()
    } catch (error) {
      console.warn('Unable to inspect same-origin contact script:', scriptUrl, error)
      return ''
    }
  }))
}

function findContactPageUrls(html: string, pageUrl: string): string[] {
  const origin = new URL(pageUrl).origin
  const urls = new Set<string>()
  for (const [, attributes, body] of html.matchAll(/<a\b([^>]*)>([\s\S]*?)<\/a>/gi)) {
    const rawHref = attributes.match(/(?:^|\s)href\s*=\s*(["'])(.*?)\1/i)?.[2]
    if (!rawHref) continue
    const label = `${body.replace(/<[^>]*>/g, ' ')} ${rawHref}`.replace(/\s+/g, ' ')
    if (!/\b(contact|about|team|staff|people|meet|imprint|legal)\b/i.test(label)) continue

    try {
      const target = new URL(rawHref.replace(/&amp;/gi, '&'), pageUrl)
      if (
        target.origin !== origin ||
        !['http:', 'https:'].includes(target.protocol) ||
        target.username ||
        target.password
      ) continue
      target.hash = ''
      urls.add(target.href)
    } catch {
      continue
    }
    if (urls.size >= MAX_CONTACT_PAGES) break
  }
  return [...urls]
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

    const { html, finalUrl, status } = await fetchPublicPage(parsed.href)
    const contactPages = await Promise.all(findContactPageUrls(html, finalUrl).map(async (contactUrl) => {
      try {
        return await fetchPublicPage(contactUrl)
      } catch (error) {
        console.warn('Unable to inspect contact page:', contactUrl, error)
        return null
      }
    }))
    const contactSources = [
      html,
      ...contactPages.flatMap((page) => page ? [page.html] : []),
      ...(await fetchSameOriginScripts(html, finalUrl)),
    ]

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
      headings[tag] = allMatches(html, new RegExp(`<${tag}\\b[^>]*>([\\s\\S]*?)<\\/${tag}\\s*>`, 'i'))
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

    const imgTags = [...html.matchAll(/<img\b[^>]*>/gi)].map((m) => m[0])
    const imagesTotal = imgTags.length
    const imagesMissingAlt = imgTags.filter((t) => !/(?:^|\s)alt\s*=/i.test(t)).length
    const imagesEmptyAlt = imgTags.filter((t) => /(?:^|\s)alt\s*=\s*["']\s*["']/i.test(t)).length

    const schemaScripts = allMatches(html, /<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/i)
    const schemaInspection = {
      present: schemaScripts.length,
      validJson: 0,
      invalidJson: 0,
    }
    for (const script of schemaScripts) {
      try {
        JSON.parse(script.trim())
        schemaInspection.validJson += 1
      } catch {
        schemaInspection.invalidJson += 1
      }
    }

    const langMatch = html.match(/<html[^>]*lang=["']([^"']+)["']/i)
    const lang = langMatch ? langMatch[1] : null

    const viewport = meta(html, 'viewport')

    const favicon = linkRel(html, 'icon') || linkRel(html, 'shortcut icon')

    const emailRegex = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g
    const phoneRegex = /(?:\+?\d{1,3}[\s.-]?)?(?:\(?\d{3}\)?[\s.-]?)?\d{3}[\s.-]?\d{4}/g
    const emails = new Set<string>()
    for (const source of contactSources) {
      for (const m of source.matchAll(emailRegex)) emails.add(m[0].toLowerCase())
      for (const m of source.matchAll(/mailto:([^"'>\s]+)/gi)) {
        try { emails.add(decodeURIComponent(m[1].split('?')[0]).toLowerCase()) } catch { emails.add(m[1].split('?')[0].toLowerCase()) }
      }
    }
    const phones = new Set<string>()
    for (const m of html.matchAll(phoneRegex)) phones.add(m[0].trim())
    for (const source of contactSources) {
      for (const m of source.matchAll(/tel:([^"'>\s]+)/gi)) {
        let phone: string
        try { phone = decodeURIComponent(m[1]) } catch { phone = m[1] }
        if (/^\+?[\d\s().-]{7,20}$/.test(phone) && (phone.match(/\d/g)?.length ?? 0) >= 7) {
          phones.add(phone)
        }
      }
    }

    const result = {
      url,
      finalUrl,
      status,
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
      navigationPages: extractNavigationPages(html, finalUrl),
      images: {
        total: imagesTotal,
        missingAlt: imagesMissingAlt,
        emptyAlt: imagesEmptyAlt,
      },
      schema: schemaScripts,
      schemaInspection,
      h1Count: headings.h1.length,
      contacts: { emails: [...emails], phones: [...phones] },
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
