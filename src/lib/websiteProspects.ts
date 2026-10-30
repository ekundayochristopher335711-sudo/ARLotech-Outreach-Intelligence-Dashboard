import { getCurrentUserId, supabase } from '@/lib/supabase'
import { normalizeWebsiteDomain, suggestProspectNameFromWebsite } from '@/lib/websiteDomain'

export async function ensureWebsiteProspect(website: string, prospectId?: string | null) {
  const domain = normalizeWebsiteDomain(website)
  const userId = await getCurrentUserId()

  if (prospectId) {
    const { data, error } = await supabase
      .from('prospects')
      .select('id, website, normalized_domain')
      .eq('id', prospectId)
      .eq('user_id', userId)
      .maybeSingle()
    if (error) throw error
    if (!data) throw new Error('The selected prospect is not available in this account.')

    const existingDomain = data.normalized_domain
      ? data.normalized_domain.toLowerCase().replace(/^www\./, '')
      : data.website
        ? normalizeWebsiteDomain(data.website)
        : null
    if (existingDomain !== domain) {
      throw new Error('The prospect website changed. Refresh the prospect and try again.')
    }
    return { id: data.id, created: false }
  }

  const { data: prospects, error: prospectError } = await supabase
    .from('prospects')
    .select('id, website, normalized_domain')
    .eq('user_id', userId)
    .not('website', 'is', null)
    .limit(1000)
  if (prospectError) throw prospectError

  for (const prospect of prospects ?? []) {
    const existingDomain = prospect.normalized_domain
      ? prospect.normalized_domain.toLowerCase().replace(/^www\./, '')
      : prospect.website
        ? normalizeWebsiteDomain(prospect.website)
        : null
    if (existingDomain === domain) return { id: prospect.id, created: false }
  }

  const normalizedWebsite = /^https?:\/\//i.test(website.trim())
    ? website.trim()
    : `https://${website.trim()}`
  const { data, error } = await supabase
    .from('prospects')
    .insert({
      user_id: userId,
      business_name: suggestProspectNameFromWebsite(normalizedWebsite),
      business_name_verified: false,
      contact_name: '',
      email: null,
      website: normalizedWebsite,
      normalized_domain: domain,
      business_category: null,
      city: null,
      country: null,
      phone: null,
      linkedin_url: null,
      notes: 'Automatically added from Website Intelligence. Confirm the business name and contact details before outreach.',
      source: 'website_analysis',
      status: 'New',
      do_not_contact: false,
      last_contacted_at: null,
    })
    .select('id')
    .single()
  if (error) throw error
  return { id: data.id, created: true }
}
