export function unsubscribeSubmissionUrl(token: string, supabaseUrl: string) {
  const url = new URL('/functions/v1/unsubscribe', supabaseUrl)
  url.searchParams.set('token', token)
  return url.toString()
}
