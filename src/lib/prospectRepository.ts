interface DeleteResult {
  data: { id: string } | null
  error: { message: string } | null
}

interface ProspectDeleteQuery {
  eq(column: 'id' | 'user_id', value: string): ProspectDeleteQuery
  select(columns: 'id'): ProspectDeleteQuery
  maybeSingle(): PromiseLike<DeleteResult>
}

export interface ProspectDeleteClient {
  from(table: 'prospects'): { delete(): ProspectDeleteQuery }
}

interface ProspectBulkDeleteQuery {
  in(column: 'id', values: string[]): ProspectBulkDeleteQuery
  eq(column: 'user_id', value: string): ProspectBulkDeleteQuery
  select(columns: 'id'): PromiseLike<{
    data: { id: string }[] | null
    error: { message: string } | null
  }>
}

export interface ProspectBulkDeleteClient {
  from(table: 'prospects'): { delete(): ProspectBulkDeleteQuery }
}

export async function deleteOwnedProspect(
  client: ProspectDeleteClient,
  prospectId: string,
  userId: string,
) {
  const { data, error } = await client
    .from('prospects')
    .delete()
    .eq('id', prospectId)
    .eq('user_id', userId)
    .select('id')
    .maybeSingle()

  if (error) throw error
  if (!data) throw new Error('Prospect not found or not owned by this account.')
}

export async function deleteOwnedProspects(
  client: ProspectBulkDeleteClient,
  prospectIds: string[],
  userId: string,
) {
  const uniqueIds = [...new Set(prospectIds)]
  if (uniqueIds.length === 0) return

  const { data, error } = await client
    .from('prospects')
    .delete()
    .in('id', uniqueIds)
    .eq('user_id', userId)
    .select('id')

  if (error) throw error
  const deletedIds = new Set((data ?? []).map(({ id }) => id))
  if (uniqueIds.some((id) => !deletedIds.has(id))) {
    throw new Error('One or more prospects were not found or not owned by this account.')
  }
}
