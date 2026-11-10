import { describe, expect, it } from 'vitest'
import { extractLeadsFromText } from './leadExtraction'

describe('Google Maps lead extraction', () => {
  it('creates deduplicated leads from supplied website links without a remote parser', async () => {
    await expect(extractLeadsFromText('raw listing text', [
      { business_name: 'North Star Plumbing', website: '' },
      { business_name: 'North-Star Plumbing', website: 'https://northstar.example' },
      { business_name: 'Other Business', website: 'https://other.example' },
    ])).resolves.toEqual([
      {
        business_name: 'North Star Plumbing',
        website: 'https://northstar.example',
        source: 'Google Maps',
      },
      {
        business_name: 'Other Business',
        website: 'https://other.example',
        source: 'Google Maps',
      },
    ])
  })

  it('returns no leads when pasted text contains no Google Maps website links', async () => {
    await expect(extractLeadsFromText('No structured website listings here.')).resolves.toEqual([])
  })
})
