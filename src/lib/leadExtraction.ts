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
  return leads as ExtractedLead[]
}
