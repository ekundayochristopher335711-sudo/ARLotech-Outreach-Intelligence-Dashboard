import { describe, expect, it } from 'vitest'
import {
  extractPageSpeedScreenshot,
  formatVisualCaptureError,
  selectVisualReviewPages,
} from './visualReview'

describe('visual review helpers', () => {
  it('selects only bounded, unique pages from the homepage origin', () => {
    const pages = selectVisualReviewPages('https://example.com/', [
      { label: 'Home duplicate', url: 'https://example.com/#top' },
      { label: 'Services', url: '/services' },
      { label: 'External', url: 'https://other.example/' },
      { label: 'Contact', url: '/contact' },
      { label: 'About', url: '/about' },
    ], 3)

    expect(pages).toEqual([
      { label: 'Homepage', url: 'https://example.com/' },
      { label: 'Services', url: 'https://example.com/services' },
      { label: 'Contact', url: 'https://example.com/contact' },
    ])
  })

  it('extracts supported screenshot data URIs and rejects oversized or invalid images', () => {
    expect(extractPageSpeedScreenshot({
      screenshot: { data: 'data:image/jpeg;base64,aGVsbG8=' },
    })).toEqual({ mime_type: 'image/jpeg', data: 'aGVsbG8=' })
    expect(extractPageSpeedScreenshot({ data: 'data:text/html;base64,aGVsbG8=' })).toBeNull()
    expect(extractPageSpeedScreenshot({
      data: `data:image/png;base64,${'a'.repeat(100)}`,
    }, 20)).toBeNull()
  })

  it('explains Lighthouse timeouts without exposing the full API error payload', () => {
    expect(formatVisualCaptureError(new Error(
      'PageSpeed Insights API error: 400 - FAILED_DOCUMENT_REQUEST (Details: net::ERR_TIMED_OUT)',
    ))).toContain('timed out')
    expect(formatVisualCaptureError(new Error('x'.repeat(400)))).toHaveLength(300)
  })
})
