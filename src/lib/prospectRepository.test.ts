import { describe, expect, it, vi } from 'vitest'
import {
  deleteOwnedProspect,
  deleteOwnedProspects,
  type ProspectBulkDeleteClient,
  type ProspectDeleteClient,
} from './prospectRepository'

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

describe('deleteOwnedProspects', () => {
  function createBulkDeleteClient(result: { data: { id: string }[] | null; error: { message: string } | null }) {
    const query = {
      in: vi.fn(),
      eq: vi.fn(),
      select: vi.fn().mockResolvedValue(result),
    }
    query.in.mockReturnValue(query)
    query.eq.mockReturnValue(query)
    const client: ProspectBulkDeleteClient = {
      from: vi.fn(() => ({ delete: vi.fn(() => query) })),
    }
    return { client, query }
  }

  it('deletes the selected prospects only for the authenticated owner', async () => {
    const { client, query } = createBulkDeleteClient({
      data: [{ id: 'prospect-1' }, { id: 'prospect-2' }],
      error: null,
    })

    await expect(deleteOwnedProspects(client, ['prospect-1', 'prospect-2'], 'user-1')).resolves.toBeUndefined()
    expect(query.in).toHaveBeenCalledWith('id', ['prospect-1', 'prospect-2'])
    expect(query.eq).toHaveBeenCalledWith('user_id', 'user-1')
  })

  it('reports incomplete deletion instead of false success', async () => {
    const { client } = createBulkDeleteClient({ data: [{ id: 'prospect-1' }], error: null })

    await expect(deleteOwnedProspects(client, ['prospect-1', 'prospect-2'], 'user-1'))
      .rejects.toThrow('One or more prospects were not found or not owned by this account.')
  })

  it('does not send an empty batch to the database', async () => {
    const { client } = createBulkDeleteClient({ data: [], error: null })

    await expect(deleteOwnedProspects(client, [], 'user-1')).resolves.toBeUndefined()
    expect(client.from).not.toHaveBeenCalled()
  })
})
