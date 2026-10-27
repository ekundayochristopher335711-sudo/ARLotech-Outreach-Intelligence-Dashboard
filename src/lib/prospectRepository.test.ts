import { describe, expect, it, vi } from 'vitest'
import { deleteOwnedProspect, type ProspectDeleteClient } from './prospectRepository'

function createDeleteClient(result: { data: { id: string } | null; error: { message: string } | null }) {
  const query = {
    eq: vi.fn(),
    select: vi.fn(),
    maybeSingle: vi.fn().mockResolvedValue(result),
  }
  query.eq.mockReturnValue(query)
  query.select.mockReturnValue(query)
  const client: ProspectDeleteClient = {
    from: vi.fn(() => ({ delete: vi.fn(() => query) })),
  }
  return { client, query }
}

describe('deleteOwnedProspect', () => {
  it('scopes deletion to both prospect and authenticated owner', async () => {
    const { client, query } = createDeleteClient({ data: { id: 'prospect-1' }, error: null })

    await expect(deleteOwnedProspect(client, 'prospect-1', 'user-1')).resolves.toBeUndefined()
    expect(query.eq).toHaveBeenNthCalledWith(1, 'id', 'prospect-1')
    expect(query.eq).toHaveBeenNthCalledWith(2, 'user_id', 'user-1')
  })

  it('reports a missing or non-owned prospect instead of false success', async () => {
    const { client } = createDeleteClient({ data: null, error: null })

    await expect(deleteOwnedProspect(client, 'prospect-1', 'user-1'))
      .rejects.toThrow('Prospect not found or not owned by this account.')
  })
})
