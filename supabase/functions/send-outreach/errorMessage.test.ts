import { describe, expect, it } from 'vitest'
import { getOutreachErrorMessage } from './errorMessage'

describe('getOutreachErrorMessage', () => {
  it('preserves useful messages from Supabase error objects', () => {
    expect(getOutreachErrorMessage({ message: 'Could not load eligible prospects.' }))
      .toBe('Could not load eligible prospects.')
  })

  it('uses Error and string messages when available', () => {
    expect(getOutreachErrorMessage(new Error('Provider request failed.')))
      .toBe('Provider request failed.')
    expect(getOutreachErrorMessage('Request timed out.')).toBe('Request timed out.')
  })

  it('returns a safe fallback for errors without a message', () => {
    expect(getOutreachErrorMessage({ code: 'UNKNOWN' }))
      .toBe('The outreach batch could not be processed. Error code: UNKNOWN. Check the send-outreach function logs for details.')
    expect(getOutreachErrorMessage({ response: 500, table: 'email_messages' }))
      .toBe('The outreach batch could not be processed. Error fields: response, table. Check the send-outreach function logs for details.')
    expect(getOutreachErrorMessage(null))
      .toBe('The outreach batch could not be processed.')
  })
})
