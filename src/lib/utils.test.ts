import { describe, expect, it } from 'vitest'
import { getErrorMessage } from './utils'

describe('getErrorMessage', () => {
  it('returns messages from Error instances', () => {
    expect(getErrorMessage(new Error('request failed'))).toBe('request failed')
  })

  it('returns messages from plain database error objects', () => {
    expect(getErrorMessage({ code: '42501', message: 'row-level security policy denied insert' }))
      .toBe('row-level security policy denied insert')
  })

  it('uses the fallback when the error has no message', () => {
    expect(getErrorMessage({}, 'Save failed')).toBe('Save failed')
  })

  it('preserves string errors and shows an error code when the message is missing', () => {
    expect(getErrorMessage('Request timed out')).toBe('Request timed out')
    expect(getErrorMessage({ code: 'ETIMEDOUT' }, 'Could not save status'))
      .toBe('Request failed (ETIMEDOUT). Could not save status')
  })
})
