import { describe, expect, it } from 'vitest'
import { unsubscribeSubmissionUrl } from './unsubscribe'

describe('unsubscribe submission URL', () => {
  it('targets the Supabase unsubscribe endpoint and preserves the signed token', () => {
    expect(unsubscribeSubmissionUrl('nonce.ciphertext', 'https://project.supabase.co'))
      .toBe('https://project.supabase.co/functions/v1/unsubscribe?token=nonce.ciphertext')
  })

  it('URL-encodes token parameters', () => {
    expect(unsubscribeSubmissionUrl('nonce+part.cipher text', 'https://project.supabase.co'))
      .toBe('https://project.supabase.co/functions/v1/unsubscribe?token=nonce%2Bpart.cipher+text')
  })
})
