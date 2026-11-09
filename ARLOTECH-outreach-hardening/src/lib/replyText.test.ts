import { describe, expect, it } from 'vitest'
import { splitReplyText } from './replyText'

describe('splitReplyText', () => {
  it('removes quoted lines from the readable reply and keeps them available', () => {
    expect(splitReplyText('Thanks, that sounds good.\n\n> Previous message\n> More context')).toEqual({
      readableText: 'Thanks, that sounds good.',
      quotedText: 'Previous message\nMore context',
    })
  })

  it('splits standard email reply separators', () => {
    expect(splitReplyText('Please send the details.\n\nOn Tuesday, Alex wrote:\nEarlier message')).toEqual({
      readableText: 'Please send the details.',
      quotedText: 'On Tuesday, Alex wrote:\nEarlier message',
    })
  })

  it('preserves the full content when there is no quoted history', () => {
    expect(splitReplyText('A short reply\nwith another line')).toEqual({
      readableText: 'A short reply\nwith another line',
      quotedText: null,
    })
  })
})
