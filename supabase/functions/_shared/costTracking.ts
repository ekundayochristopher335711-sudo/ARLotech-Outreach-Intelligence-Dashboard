// Cost tracking for OpenAI API usage.
// Records per-operation usage to the existing activity_logs table (no new tables).
// Pricing is configurable and clearly labelled as an estimate. This module does not
// read or claim any access to the user's OpenAI credit balance.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

export interface OpenAIPricing {
  input_per_1m_tokens: number
  output_per_1m_tokens: number
  image_input_per_1m_tokens?: number
}

// Configurable model pricing (USD per 1 million tokens).
// These are planning estimates, not actual billing rates.
// Update these when OpenAI publishes revised pricing.
export const OPENAI_PRICING: Record<string, OpenAIPricing> = {
  'gpt-6-luna': {
    input_per_1m_tokens: 1.50,
    output_per_1m_tokens: 6.00,
    image_input_per_1m_tokens: 7.50,
  },
  'gpt-4o': {
    input_per_1m_tokens: 2.50,
    output_per_1m_tokens: 10.00,
    image_input_per_1m_tokens: 7.50,
  },
  'gpt-4o-mini': {
    input_per_1m_tokens: 0.15,
    output_per_1m_tokens: 0.60,
    image_input_per_1m_tokens: 0.75,
  },
}

export interface CostRecordInput {
  user_id: string
  operation: string
  model: string
  input_tokens: number | null
  output_tokens: number | null
  image_tokens?: number | null
  duration_ms: number
  status: 'completed' | 'failed'
  prospect_id?: string | null
  website_url?: string | null
}

function priceFor(tokens: number | null, ratePer1m: number | null): number | null {
  if (tokens === null || ratePer1m === null) return null
  return (tokens / 1_000_000) * ratePer1m
}

export function estimateCost(
  model: string,
  input_tokens: number | null,
  output_tokens: number | null,
  image_tokens: number | null = null,
): { estimated_cost_usd: number | null; pricing_label: string } {
  const pricing = OPENAI_PRICING[model]
  const label = pricing ? `${model} (estimated pricing)` : `${model} (pricing unavailable)`
  if (!pricing) {
    return { estimated_cost_usd: null, pricing_label: `${label} — cannot estimate cost` }
  }
  const inputCost = priceFor(input_tokens, pricing.input_per_1m_tokens)
  const outputCost = priceFor(output_tokens, pricing.output_per_1m_tokens)
  const imageCost = priceFor(image_tokens, pricing.image_input_per_1m_tokens ?? null)

  let total = 0
  let hasAny = false
  for (const value of [inputCost, outputCost, imageCost]) {
    if (value !== null) {
      total += value
      hasAny = true
    }
  }
  return {
    estimated_cost_usd: hasAny ? Math.round(total * 10000) / 10000 : null,
    pricing_label: label,
  }
}

export async function recordOpenAICost({
  user_id,
  operation,
  model,
  input_tokens,
  output_tokens,
  image_tokens = null,
  duration_ms,
  status,
  prospect_id = null,
  website_url = null,
}: CostRecordInput): Promise<void> {
  const supabaseUrl = Deno.env.get('SUPABASE_URL')
  const supabaseKey =
    Deno.env.get('SUPABASE_ANON_KEY') ?? Deno.env.get('SUPABASE_PUBLISHABLE_KEY')
  if (!supabaseUrl || !supabaseKey) return

  const { estimated_cost_usd, pricing_label } = estimateCost(
    model,
    input_tokens,
    output_tokens,
    image_tokens,
  )

  const metadata: Record<string, unknown> = {
    operation,
    model,
    input_tokens,
    output_tokens,
    ...(image_tokens !== null ? { image_tokens } : {}),
    estimated_cost_usd,
    pricing_label,
    duration_ms,
    ...(prospect_id ? { prospect_id } : {}),
    ...(website_url ? { website_url } : {}),
  }

  try {
    const supabase = createClient(supabaseUrl, supabaseKey)
    await supabase.from('activity_logs').insert({
      user_id,
      event_type: 'openai_request',
      description: `OpenAI ${operation} via ${model} — ${status}`,
      metadata,
    })
  } catch {
    // Cost tracking must never break the primary request.
  }
}