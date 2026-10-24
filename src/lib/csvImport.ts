import { useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import * as Papa from 'papaparse'
import { supabase } from '@/lib/supabase'
import { type Prospect } from '@/types'

// Export type for useCsvImport return
export type UseCsvImportReturn = {
  importCsv: (file: File) => Promise<{ success: boolean; errors?: string; count?: number }>
  isImporting: boolean
  importError: string | null
}

// Main async function for CSV import
async function importCsvInternal(
  file: File,
  queryClient: ReturnType<typeof useQueryClient>,
): Promise<{ success: boolean; errors?: string; count?: number }> {
  try {
    const text = await file.text()
    const results = Papa.parse<Record<string, string>>(text, {
      header: true,
      skipEmptyLines: true,
      dynamicTyping: true,
    })

    const errors: string[] = []
    const prospectsToInsert: Omit<Prospect, 'id' | 'created_at' | 'updated_at'>[] = []

    for (const [index, row] of results.data.entries()) {
      // Validate required fields
      if (!row.business_name) {
        errors.push(`Row ${index + 1}: Missing business name`)
        continue
      }

      // Normalize email if present
      const email = row.email ? row.email.trim() : null
      const normalizedEmail = email ? email.toLowerCase() : null

      // Check for duplicates in suppression list
      if (normalizedEmail) {
        const { data: existing } = await supabase
          .from('suppression_list')
          .select('email')
          .eq('normalized_email', normalizedEmail)
          .single()

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
        user_id: '',
      })
    }

    if (errors.length > 0) {
      return { success: false, errors: errors.join('; '), count: 0 }
    }

    // Insert in batches
    const { error } = await supabase
      .from('prospects')
      .insert(prospectsToInsert)

    if (error) throw error

    // Refresh the prospects list
    await queryClient.invalidateQueries(['/prospects'])

    return { success: true, count: prospectsToInsert.length }
  } catch (err: any) {
    return { success: false, errors: err.message, count: 0 }
  }
}

export function useCsvImport() {
  const [isImporting, setIsImporting] = useState(false)
  const [importError, setImportError] = useState<string | null>(null)
  const queryClient = useQueryClient()

  const importCsv = async (file: File) => {
    setIsImporting(true)
    setImportError(null)
    const result = await importCsvInternal(file, queryClient)
    setIsImporting(false)
    if (!result.success) setImportError(result.errors ?? 'CSV import failed')
    return result
  }

  return {
    importCsv,
    isImporting,
    importError,
  }
}