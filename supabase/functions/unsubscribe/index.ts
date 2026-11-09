import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import {
  UNSUBSCRIBE_CONFIRMATION_URL,
  verifyUnsubscribeToken,
} from '../_shared/unsubscribe.ts'

const securityHeaders = {
  'Cache-Control': 'no-store',
  'Content-Security-Policy': "default-src 'none'; form-action 'self'; style-src 'unsafe-inline'; base-uri 'none'; frame-ancestors 'none'",
  'Referrer-Policy': 'no-referrer',
  'X-Content-Type-Options': 'nosniff',
}

function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, (character) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
  })[character]!)
}

function resubscribeForm(token: string) {
  const action = `?token=${encodeURIComponent(token)}`
  return `<form method="post" action="${escapeHtml(action)}">
  <input type="hidden" name="confirm" value="subscribe">
  <button type="submit">Subscribe again</button>
</form>`
}

function page(title: string, message: string, form?: string) {
  return new Response(`<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${title}</title><style>body{margin:0;padding:24px;background:#f8fafc;color:#1e293b;font:16px/1.6 Arial,sans-serif}
main{max-width:480px;margin:48px auto;padding:28px;background:#fff;border:1px solid #e2e8f0;border-radius:12px}
h1{font-size:21px}button{padding:10px 16px;border:0;border-radius:6px;background:#10243a;color:white;font:inherit;cursor:pointer}</style>
</head><body><main><h1>${title}</h1><p>${message}</p>${form ?? ''}</main></body></html>`, {
    status: 200,
    headers: { ...securityHeaders, 'Content-Type': 'text/html; charset=utf-8' },
  })
}

function errorResponse(message: string, status = 400) {
  return new Response(JSON.stringify({ error: message }), {
    status,
    headers: { ...securityHeaders, 'Content-Type': 'application/json' },
  })
}

serve(async (request) => {
  const url = new URL(request.url)
  if (request.method !== 'GET' && request.method !== 'POST') {
    return errorResponse('Method not allowed.', 405)
  }

  const token = url.searchParams.get('token') ?? ''
  if (!token || token.length > 4096) return errorResponse('This unsubscribe link is invalid.')

  if (request.method === 'GET') {
    const confirmationUrl = new URL(UNSUBSCRIBE_CONFIRMATION_URL)
    confirmationUrl.searchParams.set('token', token)
    return new Response(null, {
      status: 303,
      headers: { ...securityHeaders, Location: confirmationUrl.toString() },
    })
  }

  const contentType = request.headers.get('content-type')?.split(';')[0].trim().toLowerCase()
  if (contentType !== 'application/x-www-form-urlencoded') {
    return errorResponse('Unsupported unsubscribe request format.', 415)
  }
  const body = await request.text()
  if (body.length > 2048) return errorResponse('Invalid unsubscribe request.')
  const form = new URLSearchParams(body)
  const action = form.get('confirm')
  const oneClick = form.get('List-Unsubscribe') === 'One-Click'
  if (!oneClick && action !== 'unsubscribe' && action !== 'subscribe') {
    return errorResponse('Confirm the subscription preference change to continue.')
  }

  try {
    const secret = Deno.env.get('OUTREACH_UNSUBSCRIBE_SECRET')
    const supabaseUrl = Deno.env.get('SUPABASE_URL')
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
    if (!secret || !supabaseUrl || !serviceRoleKey) {
      throw new Error('The unsubscribe service is not configured.')
    }
    const { userId, email } = await verifyUnsubscribeToken(token, secret)
    const supabase = createClient(supabaseUrl, serviceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    })
    if (!oneClick && action === 'subscribe') {
      const { error: deleteError } = await supabase
        .from('suppression_list')
        .delete()
        .eq('user_id', userId)
        .eq('normalized_email', email)
        .eq('source', 'unsubscribe_link')
      if (deleteError) throw new Error(`Could not restore subscription: ${deleteError.message}`)

      const { data: remainingSuppression, error: lookupError } = await supabase
        .from('suppression_list')
        .select('id')
        .eq('user_id', userId)
        .eq('normalized_email', email)
        .maybeSingle()
      if (lookupError) throw new Error(`Could not verify subscription: ${lookupError.message}`)
      if (remainingSuppression) {
        return page('Unable to resubscribe', 'This email address has a separate suppression in place. Please contact Arlotech for help.')
      }
      return page('Subscribed', 'This email address can receive future Arlotech outreach again.')
    }

    const { error } = await supabase.from('suppression_list').upsert({
      user_id: userId,
      email,
      normalized_email: email,
      reason: 'Unsubscribed using email link',
      source: 'unsubscribe_link',
    }, { onConflict: 'user_id,normalized_email', ignoreDuplicates: true })
    if (error) throw new Error(`Could not record unsubscribe: ${error.message}`)
    return page(
      'Unsubscribed',
      'This email address has been removed from future Arlotech outreach. If this was a mistake, you can subscribe again below.',
      resubscribeForm(token),
    )
  } catch (error) {
    console.error('Unsubscribe request failed:', error)
    const message = error instanceof Error && error.message === 'Invalid unsubscribe token.'
      ? error.message
      : 'The unsubscribe request could not be completed. Please try again later.'
    return errorResponse(message, message === 'Invalid unsubscribe token.' ? 400 : 500)
  }
})
