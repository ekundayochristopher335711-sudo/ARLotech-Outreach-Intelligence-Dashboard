import { useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import * as Papa from 'papaparse'
import { z } from 'zod'
import { useAuth } from '@/hooks/useAuthState'
import { supabase } from '@/lib/supabase'
import { type Prospect, type ImportSummary } from '@/types'
import { ImportResultSchema } from '@/lib/validation'

export type ImportResultRow = z.infer<typeof ImportResultSchema>

export type CsvImportOutcome = {
  success: boolean
  summary: ImportSummary
  results: ImportResultRow[]
  insertedProspects: Prospect[]
  errors?: string
}

export type UseCsvImportReturn = {
  importCsv: (file: File) => Promise<CsvImportOutcome>
  isImporting: boolean
  importError: string | null
}

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

function isValidEmail(value: string) {
  return EMAIL_REGEX.test(value)
}

function normalizeWebsite(value: string | null) {
  if (!value) return null
  const trimmed = value.trim()
  if (!trimmed) return null
  if (/^https?:\/\//i.test(trimmed)) return trimmed
  return `https://${trimmed}`
}

function isValidWebsite(value: string | null) {
  if (!value) return true
  try {
    const url = new URL(normalizeWebsite(value) as string)
    return url.protocol === 'http:' || url.protocol === 'https:'
  } catch {
    return false
  }
}

function parseBoolean(value: string | undefined) {
  if (!value) return false
  const normalized = value.trim().toLowerCase()
  return normalized === 'true' || normalized === '1' || normalized === 'yes'
}

export async function importLeadsInternal(
  rows: Record<string, any>[],
  queryClient: ReturnType<typeof useQueryClient>,
  userId: string | undefined,
): Promise<CsvImportOutcome> {
  const emptySummary: ImportSummary = {
    total: 0,
    success: 0,
    updated: 0,
    skipped_duplicate: 0,
    invalid: 0,
    failed: 0,
  }

  try {
    if (!userId) throw new Error('You must be signed in to import prospects.')

    const summary: ImportSummary = {
      total: rows.length,
      success: 0,
      updated: 0,
      skipped_duplicate: 0,
      invalid: 0,
      failed: 0,
    }
    const importResults: ImportResultRow[] = []

    const [{ data: existingProspects, error: existingError }, { data: suppressedRows, error: suppressionError }] =
      await Promise.all([
        supabase.from('prospects').select('id, business_name, email, website').eq('user_id', userId),
        supabase.from('suppression_list').select('normalized_email').eq('user_id', userId),
      ])

    if (existingError) throw existingError
    if (suppressionError) throw suppressionError

    const existingByEmail = new Map<string, string>()
    const existingByNameWebsite = new Set<string>()
    for (const prospect of existingProspects ?? []) {
      if (prospect.email) existingByEmail.set(prospect.email.toLowerCase(), prospect.id)
      const key = `${(prospect.business_name || '').trim().toLowerCase()}::${(prospect.website || '').trim().toLowerCase()}`
      existingByNameWebsite.add(key)
    }

    const suppressedEmails = new Set((suppressedRows ?? []).map((row: any) => (row.normalized_email || '').toLowerCase()))

    const seenEmails = new Set<string>()
    const seenNameWebsite = new Set<string>()

    const prospectsToInsert: Omit<Prospect, 'id' | 'created_at' | 'updated_at'>[] = []
    const rowResultIndex = new Map<number, number>()

    for (const [index, row] of rows.entries()) {
      const businessName = row.business_name?.trim() || ''
      const contactName = row.contact_name?.trim() || ''
      const rawEmail = row.email?.trim() || ''
      const rawWebsite = row.website?.trim() || ''
      const businessCategory = row.business_category?.trim() || null
      const city = row.city?.trim() || null
      const country = row.country?.trim() || null
      const phone = row.phone?.trim() || null
      const linkedinUrl = row.linkedin_url?.trim() || null
      const notes = row.notes?.trim() || null
      const source = row.source?.trim() || 'manual'
      const status = row.status?.trim() || 'New'
      const doNotContact = parseBoolean(row.do_not_contact)

      if (!businessName) {
        summary.invalid += 1
        importResults.push({
          id: `row-${index + 1}`,
          business_name: businessName || '(missing)',
          status: 'invalid',
          reason: 'Missing business name',
        })
        continue
      }

      const normalizedEmail = rawEmail ? rawEmail.toLowerCase() : null

      if (rawEmail && !isValidEmail(rawEmail)) {
        summary.invalid += 1
        importResults.push({
          id: `row-${index + 1}`,
          business_name: businessName,
          email: rawEmail,
          website: rawWebsite || undefined,
          status: 'invalid',
          reason: 'Invalid email format',
        })
        continue
      }

      if (rawWebsite && !isValidWebsite(rawWebsite)) {
        summary.invalid += 1
        importResults.push({
          id: `row-${index + 1}`,
          business_name: businessName,
          email: rawEmail || undefined,
          website: rawWebsite,
          status: 'invalid',
          reason: 'Invalid website URL',
        })
        continue
      }

      if (normalizedEmail && suppressedEmails.has(normalizedEmail)) {
        summary.skipped_duplicate += 1
        importResults.push({
          id: `row-${index + 1}`,
          business_name: businessName,
          email: rawEmail || undefined,
          website: rawWebsite || undefined,
          status: 'skipped_duplicate',
          reason: 'Email is on the suppression list',
        })
        continue
      }

      const nameWebsiteKey = `${businessName.toLowerCase()}::${rawWebsite.toLowerCase()}`
      const isDuplicate =
        (normalizedEmail !== null && (existingByEmail.has(normalizedEmail) || seenEmails.has(normalizedEmail))) ||
        existingByNameWebsite.has(nameWebsiteKey) ||
        seenNameWebsite.has(nameWebsiteKey)

      if (isDuplicate) {
        summary.skipped_duplicate += 1
        importResults.push({
          id: `row-${index + 1}`,
          business_name: businessName,
          email: rawEmail || undefined,
          website: rawWebsite || undefined,
          status: 'skipped_duplicate',
          reason: 'Duplicate prospect',
        })
        continue
      }

      if (normalizedEmail) seenEmails.add(normalizedEmail)
      seenNameWebsite.add(nameWebsiteKey)

      const prospect: Omit<Prospect, 'id' | 'created_at' | 'updated_at'> = {
        business_name: businessName,
        business_name_verified: false,
        contact_name: contactName,
        email: normalizedEmail,
        website: rawWebsite || null,
        normalized_domain: row.normalized_domain?.trim() || null,
        business_category: businessCategory,
        city,
        country,
        phone,
        linkedin_url: linkedinUrl,
        notes,
        source,
        status,
        do_not_contact: doNotContact,
        last_contacted_at: null,
        user_id: userId,
      }

      prospectsToInsert.push(prospect)
      rowResultIndex.set(prospectsToInsert.length - 1, importResults.length)
      importResults.push({
        id: `row-${index + 1}`,
        business_name: businessName,
        email: rawEmail || undefined,
        website: rawWebsite || undefined,
        status: 'success',
      })
    }

    const insertedProspects: Prospect[] = []
    if (prospectsToInsert.length > 0) {
      const { data: inserted, error: insertError } = await supabase
        .from('prospects')
        .insert(prospectsToInsert)
        .select('*')

      if (insertError) {
        let successCount = 0
        for (let i = 0; i < prospectsToInsert.length; i++) {
          const { data: single, error: singleError } = await supabase
            .from('prospects')
            .insert(prospectsToInsert[i])
            .select('*')
            .single()

          const resultIndex = rowResultIndex.get(i)
          if (singleError) {
            summary.failed += 1
            if (resultIndex !== undefined) {
              importResults[resultIndex] = {
                ...importResults[resultIndex],
                status: 'failed',
                reason: singleError.message,
              }
            }
          } else {
            successCount += 1
            summary.success += 1
            if (single) insertedProspects.push(single as Prospect)
            if (resultIndex !== undefined && single?.id) {
              importResults[resultIndex] = {
                ...importResults[resultIndex],
                id: single.id,
              }
            }
          }
        }
        if (successCount === 0 && summary.failed < prospectsToInsert.length) {
          summary.failed = prospectsToInsert.length - summary.success
        }
      } else {
        summary.success += inserted?.length ?? prospectsToInsert.length
        if (inserted) {
          for (const row of inserted) insertedProspects.push(row as Prospect)
          for (let i = 0; i < inserted.length; i++) {
            const resultIndex = rowResultIndex.get(i)
            if (resultIndex !== undefined && inserted[i]?.id) {
              importResults[resultIndex] = {
                ...importResults[resultIndex],
                id: inserted[i].id,
              }
            }
          }
        }
      }
    }

    void queryClient.invalidateQueries({ queryKey: ['/prospects'] })

    const hasFailures = summary.failed > 0 || summary.invalid > 0
    return {
      success: summary.failed === 0 && summary.invalid === 0,
      summary,
      results: importResults,
      insertedProspects,
      errors: hasFailures
        ? importResults
            .filter((r) => r.status === 'invalid' || r.status === 'failed')
            .map((r) => `${r.business_name}: ${r.reason ?? 'Failed'}`)
            .join('; ') || undefined
        : undefined,
    }
  } catch (error) {
    return {
      success: false,
      summary: emptySummary,
      results: [],
      insertedProspects: [],
      errors: error instanceof Error ? error.message : 'CSV import failed.',
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
      const text = await file.text()
      const parsed = Papa.parse<Record<string, string>>(text, { header: true, skipEmptyLines: true })
      if (parsed.errors.length > 0) {
        const outcome: CsvImportOutcome = {
          success: false,
          summary: { total: parsed.data.length, success: 0, updated: 0, skipped_duplicate: 0, invalid: 0, failed: 0 },
          results: [],
          insertedProspects: [],
          errors: parsed.errors.map((e) => `Row ${e.row ?? '?'}: ${e.message}`).join('; '),
        }
        setImportError(outcome.errors ?? null)
        return outcome
      }
      const result = await importLeadsInternal(parsed.data, queryClient, session?.user.id)
      if (!result.success && result.errors) setImportError(result.errors)
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
