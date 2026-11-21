export async function createReplyIdempotencyKey(userId: string, messageId: string, replyBody: string) {
  const value = new TextEncoder().encode(`${userId}:${messageId}:${replyBody}`)
  const digest = await crypto.subtle.digest('SHA-256', value)
  const hexDigest = Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('')
  return `reply-${userId}-${messageId}-${hexDigest}`
}
