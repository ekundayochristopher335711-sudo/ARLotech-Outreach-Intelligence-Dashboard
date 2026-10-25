import { useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import * as Papa from 'papaparse'
import { useAuth } from '@/hooks/useAuth'
import { supabase } from '@/lib/supabase'
import { type Prospect } from '@/types'

export type UseCsvImportReturn = {
  importCsv: (file: File) => Promise<{ success: boolean; errors?: string; count?: number }>
  isImporting: boolean
  importError: string | null
}

async function importCsvInternal(
  file: File,
  queryClient: ReturnType<typeof useQueryClient>,
  userId: string | undefined,
): Promise<{ success: boolean; errors?: string; count?: number }> {
  try {
    if (!userId) throw new Error('You must be signed in to import prospects.')
    const text = await file.text()
    const results = Papa.parse<Record<string, string>>(text, {
      header: true,
      skipEmptyLines: true,
    })

    if (results.errors.length > 0) {
      return {
        success: false,
        errors: results.errors.map((error) => `Row ${error.row ?? '?'}: ${error.message}`).join('; '),
        count: 0,
      }
    }

    const errors: string[] = []
    const prospectsToInsert: Omit<Prospect, 'id' | 'created_at' | 'updated_at'>[] = []

    for (const [index, row] of results.data.entries()) {
      if (!row.business_name?.trim()) {
        errors.push(`Row ${index + 1}: Missing business name`)
        continue
      }

      const email = row.email?.trim() || null
      const normalizedEmail = email ? email.toLowerCase() : null

      if (normalizedEmail) {
        const { data: existing, error: suppressionError } = await supabase
          .from('suppression_list')
          .select('email')
          .eq('normalized_email', normalizedEmail)
          .maybeSingle()

        if (suppressionError) throw suppressionError
        if (existing) {
          errors.push(`Row ${index + 1}: Email ${email} is on the suppression list`)
          continue
        }
      }

      prospectsToInsert.push({
        business_name: row.business_name.trim(),
        contact_name: row.contact_name?.trim() || '',
        email: normalizedEmail || null,
        website: row.website?.trim() || null,
        normalized_domain: row.normalized_domain || null,
        business_category: row.business_category?.trim() || null,
        city: row.city?.trim() || null,
        country: row.country?.trim() || null,
        phone: row.phone?.trim() || null,
        linkedin_url: row.linkedin_url?.trim() || null,
        notes: row.notes?.trim() || null,
        source: row.source?.trim() || 'manual',
        status: row.status?.trim() || 'New',
        do_not_contact: row.do_not_contact === 'true' || false,
        last_contacted_at: null,
        user_id: userId,
      })
    }

    if (errors.length > 0) {
      return { success: false, errors: errors.join('; '), count: 0 }
    }

    if (prospectsToInsert.length === 0) {
      return { success: false, errors: 'The CSV file contains no prospects to import.', count: 0 }
    }

    const { error } = await supabase
      .from('prospects')
      .insert(prospectsToInsert)

    if (error) throw error

    void queryClient.invalidateQueries({ queryKey: ['/prospects'] })

    return { success: true, count: prospectsToInsert.length }
  } catch (error) {
    return {
      success: false,
      errors: error instanceof Error ? error.message : 'CSV import failed.',
      count: 0,
    }
  }
}

export function useCsvImport() {
  const [isImporting, setIsImporting] = useState(false)
  const [importError, setImportError] = useState<string | null>(null)
  const queryClient = useQueryClient()
  const { session } = useAuth()

  const importCsv = async (file: File) => {
    setIsImporting(true)
    setImportError(null)
    try {
      const result = await importCsvInternal(file, queryClient, session?.user.id)
      if (!result.success) setImportError(result.errors ?? 'CSV import failed')
      return result
    } finally {
      setIsImporting(false)
    }
  }

  return {
    importCsv,
    isImporting,
    importError,
  }
}