import { describe, expect, it } from 'vitest'
import {
  buildWebsiteContextSnapshot,
  MAX_WEBSITE_CONTEXT_ADDITIONAL_PAGES,
  selectRelevantWebsitePages,
} from './websiteContext'

describe('saved website context', () => {
  it('selects only bounded, relevant pages on the audited origin', () => {
    const selected = selectRelevantWebsitePages('https://example.com/', [
      { label: 'Contact', url: 'https://example.com/contact' },
      { label: 'Our Services', url: '/services' },
      { label: 'About the team', url: '/about' },
      { label: 'Products', url: '/products' },
      { label: 'Services on another site', url: 'https://other.example/services' },
      { label: 'Unsafe', url: 'javascript:alert(1)' },
    ])

    expect(selected).toEqual([
      { label: 'Our Services', url: 'https://example.com/services' },
      { label: 'About the team', url: 'https://example.com/about' },
      { label: 'Products', url: 'https://example.com/products' },
    ])
    expect(selected).toHaveLength(MAX_WEBSITE_CONTEXT_ADDITIONAL_PAGES)
  })

  it('normalizes and bounds snapshot content while preserving page sources', () => {
    const snapshot = buildWebsiteContextSnapshot([
      {
        label: 'Homepage',
        url: 'https://example.com/',
        status: 200,
        title: `  Example\n Business  `,
        metaDescription: '  Services for local customers ',
        headings: { h1: [' Our services ', ''], h2: ['Contact us'] },
        textExcerpt: '  We provide web design. '.repeat(200),
      },
      {
        label: 'Services',
        url: 'https://example.com/services',
        status: 200,
        headings: { h1: ['Website design'] },
        textExcerpt: 'Website design and support.',
      },
      {
        label: 'About',
        url: 'https://example.com/about',
        error: 'Timed out',
      },
    ], '2026-11-11T00:00:00.000Z')

    expect(snapshot).toMatchObject({
      version: 1,
      captured_at: '2026-11-11T00:00:00.000Z',
      pages: [
        {
          source_url: 'https://example.com/',
          extraction_status: 'completed',
          title: 'Example Business',
          meta_description: 'Services for local customers',
          headings: ['H1: Our services', 'H2: Contact us'],
        },
        {
          source_url: 'https://example.com/services',
          extraction_status: 'completed',
        },
        {
          source_url: 'https://example.com/about',
          extraction_status: 'failed',
          error: 'Timed out',
        },
      ],
    })
    expect(snapshot.pages[0].text_excerpt).toHaveLength(1600)
    expect(snapshot.pages[0].text_excerpt).not.toContain('\n')
  })

  it('rejects invalid limits and returns no pages for an invalid audited URL', () => {
    expect(() => selectRelevantWebsitePages('https://example.com', [], -1)).toThrow(
      'The website context page limit must be a non-negative integer.',
    )
    expect(selectRelevantWebsitePages('not a url', [{ label: 'Services', url: '/services' }])).toEqual([])
  })
})
