import { describe, expect, it } from 'vitest'
import {
  createUnsubscribeToken,
  UNSUBSCRIBE_CONFIRMATION_URL,
  verifyUnsubscribeToken,
} from './unsubscribe'

const userId = 'c5b932f4-4f34-4e42-9c5e-e4d7f0c05c33'
const secret = 'a-secure-random-test-secret-with-at-least-32-characters'

describe('unsubscribe token', () => {
  it('uses the public confirmation route for browser unsubscribe links', () => {
    expect(UNSUBSCRIBE_CONFIRMATION_URL).toBe('https://aoid.vercel.app/unsubscribe')
  })

  it('signs and verifies an account-scoped normalized recipient', async () => {
    const token = await createUnsubscribeToken(userId, ' Person@Example.com ', secret)
    expect(token).not.toContain('person@example.com')
    expect(await createUnsubscribeToken(userId, 'person@example.com', secret)).not.toBe(token)

    await expect(verifyUnsubscribeToken(token, secret)).resolves.toEqual({
      userId,
      email: 'person@example.com',
    })
  })

  it('rejects altered tokens, the wrong secret, and short secrets', async () => {
    const token = await createUnsubscribeToken(userId, 'person@example.com', secret)
    const [nonce, ciphertext] = token.split('.')
    const alteredCiphertext = `${ciphertext[0] === 'A' ? 'B' : 'A'}${ciphertext.slice(1)}`

    await expect(verifyUnsubscribeToken(`${nonce}.${alteredCiphertext}`, secret))
      .rejects.toThrow('Invalid unsubscribe token.')
    await expect(verifyUnsubscribeToken(token, `${secret}-different`))
      .rejects.toThrow('Invalid unsubscribe token.')
    await expect(createUnsubscribeToken(userId, 'person@example.com', 'short'))
      .rejects.toThrow('at least 32 random bytes')
  })
})
