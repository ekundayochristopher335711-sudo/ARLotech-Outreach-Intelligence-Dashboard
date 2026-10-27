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
