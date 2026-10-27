import { supabase } from '@/lib/supabase'

export interface ExtractedLead {
  business_name: string
  contact_name?: string | null
  email?: string | null
  website?: string | null
  business_category?: string | null
  city?: string | null
  country?: string | null
  phone?: string | null
  linkedin_url?: string | null
  notes?: string | null
  source?: string | null
  status?: string | null
  do_not_contact?: boolean | null
}

function normalizeBusinessName(name: string) {
  return name.toLowerCase().replace(/[^a-z0-9]/g, '')
}

function extractGoogleMapsWebsites(text: string) {
  const links = [...text.matchAll(/\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)/gi)].map((match) => ({
    label: match[1].trim(),
    url: match[2].replace(/&amp;/g, '&'),
    index: match.index ?? 0,
  }))
  const mapListings = links.filter(({ url }) => /^https?:\/\/(?:www\.)?google\.[^/]+\/maps\/place\//i.test(url))

  return mapListings.flatMap((listing, index) => {
    const nextListingIndex = mapListings[index + 1]?.index ?? text.length
    const websiteLink = links.find(
      (link) =>
        link.index > listing.index &&
        link.index < nextListingIndex &&
        /website/i.test(link.label) &&
        !/^https?:\/\/(?:www\.)?google\./i.test(link.url),
    )
    return websiteLink
      ? [{ business_name: listing.label, website: websiteLink.url }]
      : []
  })
}

export async function extractLeadsFromText(text: string): Promise<ExtractedLead[]> {
  const { data, error } = await (supabase as any).functions.invoke('extract-leads', { body: { text } })
  if (error) {
    let detail = error.message || 'extract-leads failed'
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
  const leads = Array.isArray(data?.leads) ? data.leads : Array.isArray(data) ? data : []
  const extractedLeads = leads as ExtractedLead[]
  const websiteLinks = extractGoogleMapsWebsites(text)

  for (const websiteLink of websiteLinks) {
    const normalizedListingName = normalizeBusinessName(websiteLink.business_name)
    const matchingLead = extractedLeads.find((lead) => {
      const normalizedLeadName = normalizeBusinessName(lead.business_name)
      return (
        normalizedLeadName === normalizedListingName ||
        (Math.min(normalizedLeadName.length, normalizedListingName.length) > 5 &&
          (normalizedLeadName.includes(normalizedListingName) || normalizedListingName.includes(normalizedLeadName)))
      )
    })
    if (matchingLead) {
      matchingLead.website ||= websiteLink.website
    } else {
      extractedLeads.push({
        business_name: websiteLink.business_name,
        website: websiteLink.website,
        source: 'Google Maps',
      })
    }
  }

  return extractedLeads
}
