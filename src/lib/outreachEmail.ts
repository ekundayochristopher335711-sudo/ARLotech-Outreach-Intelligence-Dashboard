import type { Prospect, WebsiteAnalysis } from '@/types'

export interface OutreachPreview {
  prospect_id: string
  subject: string
  body: string
  has_website_report: boolean
}

function firstName(contactName: string | null | undefined) {
  return contactName?.trim().split(/\s+/)[0] || 'there'
}

function websiteHost(website: string) {
  const normalized = /^https?:\/\//i.test(website) ? website : `https://${website}`
  return new URL(normalized).hostname.replace(/^www\./i, '').toLowerCase()
}

export function hasMatchingWebsiteAnalysis(
  prospect: Pick<Prospect, 'website'>,
  analysis?: Pick<WebsiteAnalysis, 'website_url'> | null,
) {
  if (!prospect.website || !analysis?.website_url) return false
  try {
    return websiteHost(prospect.website) === websiteHost(analysis.website_url)
  } catch {
    return false
  }
}

export function createOutreachPreview(
  prospect: Pick<Prospect, 'id' | 'business_name' | 'contact_name' | 'website' | 'business_category'>,
  analysis?: Pick<WebsiteAnalysis, 'website_url' | 'findings' | 'overall_score'> | null,
): OutreachPreview {
  const name = prospect.business_name.trim() || 'your business'
  const greetingName = firstName(prospect.contact_name)
  const signOff = 'Kind regards,\nArloTech'

  if (!prospect.website) {
    const category = prospect.business_category?.trim()
    return {
      prospect_id: prospect.id,
      subject: `A website idea for ${name}`,
      body: [
        `Hi ${greetingName},`,
        '',
        `I came across ${name}${category ? ` while looking at local ${category.toLowerCase()} businesses` : ''}. I couldn't find a website linked to the business information I reviewed, so I wanted to ask: are you considering a simple website that helps prospective customers learn about your services and get in touch?`,
        '',
        'If that is something you are exploring, I would be happy to share a few practical ideas. If not, just reply and let me know; I will not follow up.',
        '',
        signOff,
      ].join('\n'),
      has_website_report: false,
    }
  }

  if (!hasMatchingWebsiteAnalysis(prospect, analysis)) {
    throw new Error('A completed audit for this exact website is required before preparing the email.')
  }

  const firstFinding = analysis?.findings?.[0]
  const findingTitle = firstFinding?.title?.trim()
  const findingDetail = firstFinding?.evidence?.trim()
  const recommendation = firstFinding?.recommended_fix?.trim()
  const observation = findingTitle
    ? `${findingTitle}${findingDetail ? ` — ${findingDetail}` : ''}`
    : 'a few opportunities to improve the site'
  const nextStep = recommendation
    ? ` One practical next step is ${recommendation.charAt(0).toLowerCase()}${recommendation.slice(1)}`
    : ''

  return {
    prospect_id: prospect.id,
    subject: `A website observation for ${name}`,
    body: [
      `Hi ${greetingName},`,
      '',
      `I reviewed ${name}'s website and noticed ${observation}.${nextStep}`,
      '',
      'I have attached a concise website review with the supporting details and suggested improvements. Would a brief conversation about the highest-priority opportunity be useful?',
      '',
      'If this is not relevant, reply and let me know; I will not follow up.',
      '',
      signOff,
    ].join('\n'),
    has_website_report: true,
  }
}
