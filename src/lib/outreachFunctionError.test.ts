import { describe, expect, it } from 'vitest'
import { getOutreachFunctionError } from './outreachFunctionError'

describe('getOutreachFunctionError', () => {
  it('extracts server error messages from a Response context', async () => {
    const error = { message: 'Edge Function returned a non-2xx status code', context: new Response(
      JSON.stringify({ error: 'Could not load eligible prospects.' }),
      { status: 500, headers: { 'Content-Type': 'application/json' } },
    ) }

    await expect(getOutreachFunctionError(error)).resolves.toBe('Could not load eligible prospects.')
  })

  it('supports response-like contexts without relying on instanceof Response', async () => {
    const error = { context: { json: async () => ({ error: 'The sender address is invalid.' }) } }

    await expect(getOutreachFunctionError(error)).resolves.toBe('The sender address is invalid.')
  })

  it('uses the SDK message when the response has no usable error body', async () => {
    const error = { message: 'The network request failed.', context: new Response('', { status: 502 }) }

    await expect(getOutreachFunctionError(error)).resolves.toBe('The network request failed.')
  })

  it('provides a useful fallback when the error has no message', async () => {
    await expect(getOutreachFunctionError(null))
      .resolves.toBe('Could not send outreach batch. Check the send-outreach function logs for details.')
  })
})
