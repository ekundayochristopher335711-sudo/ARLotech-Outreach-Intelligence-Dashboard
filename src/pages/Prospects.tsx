import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { useRef, useState, type ChangeEvent, type FormEvent } from 'react'
import { Card } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Badge } from '@/components/ui/Badge'
import { useCsvImport } from '@/lib/csvImport'
import { ProspectTable } from '@/components/dashboard/ProspectTable'
import { useAuth } from '@/hooks/useAuthState'
import { supabase } from '@/lib/supabase'
import { type Prospect, type ImportSummary } from '@/types'
import { deleteOwnedProspect, deleteOwnedProspects } from '@/lib/prospectRepository'
import { type ImportResultRow, importLeadsInternal } from '@/lib/csvImport'
import { extractLeadsFromText } from '@/lib/leadExtraction'
import { extractGoogleMapsWebsitesFromHtml } from '@/lib/googleMapsWebsites'
import {
  enrichAndAnalyzeProspect,
  enrichProspectContacts,
  recordFailedWebsiteAnalysis,
  type EnrichmentResult,
} from '@/lib/leadEnrichment'
import { mapWithConcurrency } from '@/lib/mapWithConcurrency'
import { ClipboardPaste, FileSpreadsheet, Plus, Search, Trash2 } from 'lucide-react'
import { toast } from 'sonner'

interface ProspectFormValues {
  business_name: string
  contact_name: string
  email: string
  website: string
  business_category: string
  city: string
  country: string
  phone: string
  linkedin_url: string
  notes: string
}

const initialProspectForm: ProspectFormValues = {
  business_name: '',
  contact_name: '',
  email: '',
  website: '',
  business_category: '',
  city: '',
  country: '',
  phone: '',
  linkedin_url: '',
  notes: '',
}

function TextField({
  id,
  label,
  value,
  onChange,
  type = 'text',
  required = false,
  placeholder,
}: {
  id: keyof ProspectFormValues
  label: string
  value: string
  onChange: (value: string) => void
  type?: string
  required?: boolean
  placeholder?: string
}) {
  return (
    <div className="space-y-1">
      <label htmlFor={id} className="block text-sm font-medium text-slate-700">
        {label}
      </label>
      <input
        id={id}
        name={id}
        type={type}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        required={required}
        placeholder={placeholder}
        className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm placeholder:text-slate-400 focus:border-arlotech focus:outline-none focus:ring-2 focus:ring-arlotech/20"
      />
    </div>
  )
}

export function ProspectsPage() {
  const navigate = useNavigate()
  const { session } = useAuth()
  const queryClient = useQueryClient()
  const fileInput = useRef<HTMLInputElement>(null)
  const [search, setSearch] = useState('')
  const [websiteFilter, setWebsiteFilter] = useState<
    'all' | 'with-website' | 'without-website' | 'unanalyzed' | 'failed-analysis' | 'missing-email'
  >('all')
  const [selectedProspectIds, setSelectedProspectIds] = useState<Set<string>>(() => new Set())
  const [showTextImport, setShowTextImport] = useState(false)
  const [prospectText, setProspectText] = useState('')
  const [clipboardWebsiteLinks, setClipboardWebsiteLinks] = useState<
    ReturnType<typeof extractGoogleMapsWebsitesFromHtml>
  >([])
  const [importWarning, setImportWarning] = useState('')
  const [isExtractingText, setIsExtractingText] = useState(false)
  const [importMessage, setImportMessage] = useState('')
  const [importFailure, setImportFailure] = useState('')
  const [importSummary, setImportSummary] = useState<ImportSummary | null>(null)
  const [importResults, setImportResults] = useState<ImportResultRow[]>([])
  const [enrichmentResults, setEnrichmentResults] = useState<EnrichmentResult[]>([])
  const [isEnriching, setIsEnriching] = useState(false)
  const [isReanalyzingAll, setIsReanalyzingAll] = useState(false)
  const [enrichmentProgress, setEnrichmentProgress] = useState({ completed: 0, total: 0 })
  const [contactScanMode, setContactScanMode] = useState(false)
  const { importCsv, isImporting, importError } = useCsvImport()
  const deleteProspect = useMutation<void, Error, string>({
    mutationFn: async (prospectId: string) => {
      const userId = session?.user.id
      if (!userId) throw new Error('You must be signed in to delete prospects.')
      await deleteOwnedProspect(supabase, prospectId, userId)
    },
    onSuccess: async (_: void, prospectId: string) => {
      setSelectedProspectIds((selected) => {
        const remaining = new Set(selected)
        remaining.delete(prospectId)
        return remaining
      })
      await queryClient.invalidateQueries({ queryKey: ['/prospects'] })
      toast.success('Prospect deleted')
    },
    onError: (error: unknown) => toast.error(error instanceof Error ? error.message : 'Could not delete prospect.'),
  })
  const deleteSelectedProspects = useMutation<void, Error, string[]>({
    mutationFn: async (prospectIds: string[]) => {
      const userId = session?.user.id
      if (!userId) throw new Error('You must be signed in to delete prospects.')
      await deleteOwnedProspects(supabase, prospectIds, userId)
    },
    onSuccess: async (_: void, prospectIds: string[]) => {
      setSelectedProspectIds((selected) => {
        const remaining = new Set(selected)
        prospectIds.forEach((id: string) => remaining.delete(id))
        return remaining
      })
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['/prospects'] }),
        queryClient.invalidateQueries({ queryKey: ['/dashboard/metrics'] }),
      ])
      toast.success(`${prospectIds.length} prospects deleted`)
    },
    onError: (error: unknown) => {
      void queryClient.invalidateQueries({ queryKey: ['/prospects'] })
      toast.error(error instanceof Error ? error.message : 'Could not delete selected prospects.')
    },
  })
  const markContacted = useMutation({
    mutationFn: async (prospect: Prospect) => {
      const userId = session?.user.id
      if (!userId) throw new Error('You must be signed in to update prospects.')
      const { error } = await supabase
        .from('prospects')
        .update({
          last_contacted_at: new Date().toISOString(),
          ...(prospect.status === 'New' ? { status: 'Contacted' } : {}),
        })
        .eq('id', prospect.id)
        .eq('user_id', userId)
      if (error) throw error
    },
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['/prospects'] }),
        queryClient.invalidateQueries({ queryKey: ['/dashboard/metrics'] }),
      ])
      toast.success('Prospect marked as contacted')
    },
    onError: (error: unknown) => toast.error(error instanceof Error ? error.message : 'Could not update prospect.'),
  })
  const {
    data: prospects,
    isLoading,
    error,
  } = useQuery({
    queryKey: ['/prospects'],
    queryFn: async () => {
      const userId = session?.user.id
      if (!userId) throw new Error('You must be signed in to access prospects.')
      const { data, error } = await supabase
        .from('prospects')
        .select('*')
        .eq('user_id', userId)
        .order('created_at', { ascending: false })
      if (error) throw error
      return data as Prospect[]
    },
  })

  const {
    data: websiteAnalysisRows,
    isLoading: isLoadingAnalyses,
    error: analysesError,
  } = useQuery<Array<{
    prospect_id: string | null
    website_url: string
    analysis_status: string
    error_message: string | null
    created_at: string | null
  }>>({
    queryKey: ['/website-analyses', 'prospect-status'],
    queryFn: async () => {
      const userId = session?.user.id
      if (!userId) throw new Error('You must be signed in to check prospect analysis status.')
      const { data, error } = await supabase
        .from('website_analyses')
        .select('prospect_id, website_url, analysis_status, error_message, created_at')
        .eq('user_id', userId)
        .not('prospect_id', 'is', null)
        .order('created_at', { ascending: false })
      if (error) throw error
      return data
    },
    enabled: Boolean(session?.user.id),
  })

  const prospectRecords = [...((prospects ?? []) as Prospect[])].sort((a, b) =>
    a.business_name.localeCompare(b.business_name, undefined, { sensitivity: 'base', numeric: true }),
  )
  const completedWebsiteKeys = new Set<string>()
  const latestFailedWebsiteKeys = new Set<string>()
  const knownWebsiteKeys = new Set<string>()
  const failedAnalysisErrors = new Map<string, string>()
  for (const analysis of websiteAnalysisRows ?? []) {
    if (!analysis.prospect_id) continue
    const key = `${analysis.prospect_id}::${analysis.website_url.trim().replace(/\/+$/, '').toLowerCase()}`
    if (knownWebsiteKeys.has(key)) continue
    knownWebsiteKeys.add(key)
    if (analysis.analysis_status === 'completed') completedWebsiteKeys.add(key)
    if (analysis.analysis_status === 'failed') {
      latestFailedWebsiteKeys.add(key)
      if (analysis.error_message) failedAnalysisErrors.set(analysis.prospect_id, analysis.error_message)
    }
  }
  const websiteKeyFor = (prospect: Prospect) =>
    `${prospect.id}::${(prospect.website ?? '').trim().replace(/\/+$/, '').toLowerCase()}`
  const hasCompletedAnalysis = (prospect: Prospect) => completedWebsiteKeys.has(websiteKeyFor(prospect))
  const unanalyzedProspects = prospectRecords.filter(
    (prospect) => Boolean(
      prospect.website &&
      !hasCompletedAnalysis(prospect) &&
      !latestFailedWebsiteKeys.has(websiteKeyFor(prospect)),
    ),
  )
  const failedAnalysisProspects = prospectRecords.filter(
    (prospect) => Boolean(
      prospect.website &&
      !hasCompletedAnalysis(prospect) &&
      latestFailedWebsiteKeys.has(websiteKeyFor(prospect)),
    ),
  )
  const missingEmailProspects = prospectRecords.filter((prospect) => !prospect.email?.trim())
  const filteredProspects = prospectRecords.filter((prospect) => {
    const searchValue = search.trim().toLowerCase()
    const matchesWebsiteFilter =
      websiteFilter === 'all' ||
      (websiteFilter === 'with-website' && Boolean(prospect.website)) ||
      (websiteFilter === 'without-website' && !prospect.website) ||
      (websiteFilter === 'unanalyzed' &&
        Boolean(!isLoadingAnalyses && !analysesError && unanalyzedProspects.some(({ id }) => id === prospect.id))) ||
      (websiteFilter === 'failed-analysis' &&
        Boolean(!isLoadingAnalyses && !analysesError && failedAnalysisProspects.some(({ id }) => id === prospect.id))) ||
      (websiteFilter === 'missing-email' && !prospect.email?.trim())
    const matchesSearch =
      !searchValue ||
      prospect.business_name.toLowerCase().includes(searchValue) ||
      prospect.contact_name.toLowerCase().includes(searchValue) ||
      (prospect.email ?? '').toLowerCase().includes(searchValue) ||
      (prospect.phone ?? '').toLowerCase().includes(searchValue)
    return matchesWebsiteFilter && matchesSearch
  })
  const contactScanTargets = prospectRecords.filter(
    (prospect) => Boolean(prospect.website && (!prospect.email || !prospect.phone)),
  )
  const prospectsWithWebsites = prospectRecords.filter((prospect) => Boolean(prospect.website?.trim()))
  const allFilteredSelected =
    filteredProspects.length > 0 && filteredProspects.every(({ id }) => selectedProspectIds.has(id))

  const toggleFilteredProspects = () => {
    setSelectedProspectIds((selected) => {
      const next = new Set(selected)
      if (allFilteredSelected) filteredProspects.forEach(({ id }) => next.delete(id))
      else filteredProspects.forEach(({ id }) => next.add(id))
      return next
    })
  }

  const analyzeProspectWebsites = async (
    targets: Prospect[],
    { createDrafts = true }: { createDrafts?: boolean } = {},
  ) => {
    if (targets.length === 0) {
      toast.info('All prospects with websites have already been analyzed.')
      return
    }

    setContactScanMode(false)
    setEnrichmentProgress({ completed: 0, total: targets.length })
    setEnrichmentResults(targets.map((prospect) => ({
      prospect_id: prospect.id,
      business_name: prospect.business_name,
      website: prospect.website,
      contact_email: prospect.email,
      contact_phone: prospect.phone,
      analysis_score: null,
      draft_created: false,
      error: 'Queued for website analysis',
    })))
    setIsEnriching(true)
    try {
      const results = await mapWithConcurrency(targets, 3, async (prospect, index) => {
        let enrichmentResult: EnrichmentResult
        try {
          try {
            enrichmentResult = await enrichAndAnalyzeProspect(prospect, { createDraft: createDrafts })
          } catch (error) {
            enrichmentResult = {
              prospect_id: prospect.id,
              business_name: prospect.business_name,
              website: prospect.website,
              contact_email: prospect.email,
              contact_phone: prospect.phone,
              analysis_score: null,
              draft_created: false,
              error: error instanceof Error ? error.message : 'Website enrichment failed.',
            }
          }
          if (!enrichmentResult.analysis_completed && enrichmentResult.error) {
            try {
              await recordFailedWebsiteAnalysis(prospect, enrichmentResult.error)
            } catch (recordError) {
              enrichmentResult.error += `; Could not save failure status: ${recordError instanceof Error ? recordError.message : 'Unknown error'}`
            }
          }
        } finally {
          setEnrichmentProgress((progress) => ({ ...progress, completed: progress.completed + 1 }))
        }
        setEnrichmentResults((current) =>
          current.map((item, itemIndex) => itemIndex === index ? enrichmentResult : item),
        )
        return enrichmentResult
      })
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['/prospects'] }),
        queryClient.invalidateQueries({ queryKey: ['/website-analyses', 'prospect-status'] }),
      ])
      const completed = results.filter((result) => result.analysis_completed).length
      const failed = results.length - completed
      if (failed > 0) {
        toast.warning(`Completed ${completed} of ${results.length} website analyses. ${failed} failed; review the Failed analysis filter to retry or correct their URLs.`)
      } else {
        toast.success(`Analyzed ${completed} of ${results.length} websites.`)
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not analyze prospect websites.')
    } finally {
      setIsEnriching(false)
    }
  }

  const handleReanalyzeAllWebsites = async () => {
    if (prospectsWithWebsites.length === 0) {
      toast.info('There are no prospects with website URLs to re-analyze.')
      return
    }

    const confirmed = window.confirm(
      `Re-analyze all ${prospectsWithWebsites.length} prospects with websites? Existing analyses will be kept, and no new email drafts will be created.`,
    )
    if (!confirmed) return

    setIsReanalyzingAll(true)
    try {
      await analyzeProspectWebsites(prospectsWithWebsites, { createDrafts: false })
    } finally {
      setIsReanalyzingAll(false)
    }
  }

  const handleDeleteSelected = () => {
    const selectedIds = [...selectedProspectIds]
    if (selectedIds.length === 0) return
    if (window.confirm(`Delete ${selectedIds.length} selected prospects? This cannot be undone.`)) {
      deleteSelectedProspects.mutate(selectedIds)
    }
  }

  const handleScanMissingContacts = async () => {
    if (contactScanTargets.length === 0) {
      toast.info('No prospects with a website and missing contact details were found.')
      return
    }

    setEnrichmentProgress({ completed: 0, total: contactScanTargets.length })
    setContactScanMode(true)
    setEnrichmentResults(contactScanTargets.map((prospect) => ({
      prospect_id: prospect.id,
      business_name: prospect.business_name,
      website: prospect.website,
      contact_email: prospect.email,
      contact_phone: prospect.phone,
      analysis_score: null,
      draft_created: false,
      error: 'Queued for contact lookup',
    })))
    setIsEnriching(true)
    try {
      const results = await mapWithConcurrency(contactScanTargets, 3, async (prospect, index) => {
        let result: EnrichmentResult
        try {
          const contacts = await enrichProspectContacts(prospect)
          result = {
            prospect_id: prospect.id,
            business_name: prospect.business_name,
            website: prospect.website,
            contact_email: contacts.email,
            contact_phone: contacts.phone,
            analysis_score: null,
            draft_created: false,
            ...(!contacts.email && !contacts.phone
              ? { error: 'No contact details were found on the inspected pages.' }
              : {}),
          }
        } catch (error) {
          result = {
            prospect_id: prospect.id,
            business_name: prospect.business_name,
            website: prospect.website,
            contact_email: prospect.email,
            contact_phone: prospect.phone,
            analysis_score: null,
            draft_created: false,
            error: `Contact lookup failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
          }
        } finally {
          setEnrichmentProgress((progress) => ({ ...progress, completed: progress.completed + 1 }))
        }
        setEnrichmentResults((current) => current.map((item, itemIndex) => itemIndex === index ? result : item))
        return result
      })
      await queryClient.invalidateQueries({ queryKey: ['/prospects'] })
      const foundEmails = results.filter((result) => result.contact_email).length
      toast.success(`Checked ${results.length} websites; found email addresses for ${foundEmails}.`)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not complete the contact lookup.')
    } finally {
      setIsEnriching(false)
    }
  }

  const completeImport = async (result: Awaited<ReturnType<typeof importLeadsInternal>>) => {
    setImportMessage('')
    setImportFailure('')
    setImportWarning('')
    setImportSummary(null)
    setImportResults([])
    setEnrichmentResults([])
    setIsEnriching(false)
    setContactScanMode(false)

    if (result.success) {
      setImportMessage(
        `Imported ${result.summary.success} of ${result.summary.total} prospects.` +
        (result.summary.updated ? ` Updated ${result.summary.updated} existing prospects.` : ''),
      )
    } else if (result.summary.success > 0) {
      setImportMessage(
        `Imported ${result.summary.success} of ${result.summary.total} prospects with some issues.` +
        (result.summary.updated ? ` Updated ${result.summary.updated} existing prospects.` : ''),
      )
    } else {
      setImportFailure(result.errors ?? 'Import failed.')
    }
    setImportSummary(result.summary)
    setImportResults(result.results)

    // Enrich/analyze inserted prospects with websites in the background
    const inserted = result.insertedProspects ?? []
    const withWebsite = inserted.filter((prospect) => Boolean(prospect.website))
    const withoutWebsiteCount = inserted.length - withWebsite.length
    if (withoutWebsiteCount > 0) {
      setImportWarning(
        `${withoutWebsiteCount} imported prospect${withoutWebsiteCount === 1 ? '' : 's'} had no website URL, so contact lookup and website analysis could not run for those records.`,
      )
    }
    if (withWebsite.length > 0) {
      await analyzeProspectWebsites(withWebsite)
    }
  }

  const handleImport = async (event: ChangeEvent<HTMLInputElement>) => {
    const input = event.currentTarget
    const file = input.files?.[0]
    if (!file) return

    setImportMessage('')
    setImportFailure('')
    setImportWarning('')
    setImportSummary(null)
    setImportResults([])
    setEnrichmentResults([])
    setIsEnriching(false)

    try {
      const userId = session?.user.id
      const isText = file.name.toLowerCase().endsWith('.txt') || file.type.startsWith('text/')
      if (isText) {
        const text = await file.text()
        const leads = await extractLeadsFromText(text)
        await completeImport(await importLeadsInternal(leads as any, queryClient, userId))
      } else {
        await completeImport(await importCsv(file))
      }
    } catch (error) {
      setImportFailure(error instanceof Error ? error.message : 'Could not import prospects.')
    } finally {
      input.value = ''
    }
  }

  const handleTextImport = async () => {
    const text = prospectText.trim()
    if (!text) {
      setImportFailure('Paste prospect details first.')
      return
    }

    setImportMessage('')
    setImportFailure('')
    setImportWarning('')
    setImportSummary(null)
    setImportResults([])
    setEnrichmentResults([])
    setIsEnriching(false)
    setIsExtractingText(true)

    try {
      const leads = await extractLeadsFromText(text, clipboardWebsiteLinks)
      if (leads.length === 0) {
        setImportFailure('No business prospects were found in that text.')
        return
      }

      const websiteCount = leads.filter((lead) => lead.website).length
      const hasWebsiteLabels = /^\s*Website\s*$/im.test(text)
      await completeImport(await importLeadsInternal(leads as any, queryClient, session?.user.id))
      if (hasWebsiteLabels && websiteCount < leads.length) {
        setImportWarning(
          `Google Maps included “Website” buttons, but the clipboard provided website destinations for only ${websiteCount} of ${leads.length} prospects. Only prospects with a destination URL can be scanned. Paste the listings directly with rich links, or add the missing URLs before re-importing.`,
        )
      }
      setProspectText('')
      setClipboardWebsiteLinks([])
      setShowTextImport(false)
    } catch (error) {
      setImportFailure(error instanceof Error ? error.message : 'Could not extract prospects from this text.')
    } finally {
      setIsExtractingText(false)
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">{localStorage.getItem('arlotech-login-mode') === 'blacksite' ? 'TARGET REGISTRY' : 'Prospects'}</h1>
          <p className="mt-1 text-sm text-slate-500">Manage and track your prospect pipeline</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <input
            ref={fileInput}
            type="file"
            accept=".csv,.txt,text/csv,text/plain"
            className="hidden"
            onChange={handleImport}
            aria-label="Choose prospects CSV or text file"
          />
          <Button
            variant="secondary"
            size="sm"
            className="min-h-11"
            onClick={() => void handleReanalyzeAllWebsites()}
            disabled={
              isEnriching ||
              isExtractingText ||
              prospectsWithWebsites.length === 0
            }
            ariaLabel="Re-analyze every prospect with a website"
          >
            {isReanalyzingAll
              ? `Re-analyzing… ${enrichmentProgress.completed}/${enrichmentProgress.total}`
              : `Re-analyze all websites (${isLoadingAnalyses ? '…' : prospectsWithWebsites.length})`}
          </Button>
          <Button
            variant="secondary"
            size="sm"
            onClick={() => fileInput.current?.click()}
            disabled={isImporting}
            ariaLabel="Import prospects"
          >
            <FileSpreadsheet className="h-4 w-4" />
            {isImporting ? 'Importing...' : 'Import file'}
          </Button>
          <Button
            variant="secondary"
            size="sm"
            onClick={() => setShowTextImport((visible) => !visible)}
            ariaLabel="Paste prospect details"
          >
            <ClipboardPaste className="h-4 w-4" />
            {showTextImport ? 'Close paste' : 'Paste text'}
          </Button>
          <Button
            variant="primary"
            size="sm"
            onClick={() => navigate('/prospects/new')}
            ariaLabel="Add new prospect"
          >
            <Plus className="h-4 w-4" />
            Add Prospect
          </Button>
          <Button
            variant="secondary"
            size="sm"
            className="min-h-11"
            onClick={() => void analyzeProspectWebsites(unanalyzedProspects)}
            disabled={
              isEnriching ||
              isExtractingText ||
              isLoadingAnalyses ||
              Boolean(analysesError) ||
              unanalyzedProspects.length === 0
            }
            ariaLabel="Analyze prospects that do not have a completed website analysis"
          >
            {isEnriching && !contactScanMode
              ? `Analyzing… ${enrichmentProgress.completed}/${enrichmentProgress.total}`
              : `Analyze unanalysed (${isLoadingAnalyses ? '…' : unanalyzedProspects.length})`}
          </Button>
          <Button
          variant="secondary"
          size="sm"
          className="min-h-11"
          onClick={() => void analyzeProspectWebsites(failedAnalysisProspects)}
          disabled={
            isEnriching ||
            isExtractingText ||
            isLoadingAnalyses ||
            Boolean(analysesError) ||
            failedAnalysisProspects.length === 0
          }
          ariaLabel="Retry website analyses that previously failed"
          >
          Retry failed ({isLoadingAnalyses ? '…' : failedAnalysisProspects.length})
          </Button>
          <Button
            variant="secondary"
            size="sm"
            className="min-h-11"
            onClick={handleScanMissingContacts}
            disabled={isEnriching || isExtractingText || contactScanTargets.length === 0}
            ariaLabel="Look up missing prospect contact details"
          >
            {isEnriching && contactScanMode ? 'Looking up…' : `Find missing contacts (${contactScanTargets.length})`}
          </Button>
        </div>
      </div>

      {showTextImport && (
        <Card className="space-y-3 p-4">
          <div>
            <h2 className="text-base font-semibold text-slate-800">{localStorage.getItem('arlotech-login-mode') === 'blacksite' ? 'INTELLIGENCE INTAKE' : 'Paste prospect details'}</h2>
            <p className="mt-1 text-xs text-slate-500">
              Paste Google Maps listings directly; hidden website links are read from clipboard formatting and matched to each business.
            </p>
          </div>
          <div className="space-y-1">
            <label htmlFor="prospect-text" className="block text-sm font-medium text-slate-700">
              Business information
            </label>
            <textarea
              id="prospect-text"
              value={prospectText}
              onChange={(event) => {
                setProspectText(event.target.value)
                setImportWarning('')
              }}
              onPaste={(event) => {
                const html = event.clipboardData.getData('text/html')
                const pastedText = event.clipboardData.getData('text/plain')
                setClipboardWebsiteLinks(
                  html
                    ? extractGoogleMapsWebsitesFromHtml(html, pastedText || prospectText)
                    : [],
                )
              }}
              rows={7}
              disabled={isExtractingText}
              className="w-full resize-y rounded-lg border border-slate-300 px-3 py-2 text-sm placeholder:text-slate-400 focus:border-arlotech focus:outline-none focus:ring-2 focus:ring-arlotech/20 disabled:bg-slate-50"
              placeholder="Paste business listings, directory entries, or prospect notes..."
            />
          </div>
          <div className="flex justify-end">
            <Button onClick={handleTextImport} disabled={isExtractingText || !prospectText.trim()}>
              {isExtractingText ? 'Extracting...' : 'Extract & import'}
            </Button>
          </div>
        </Card>
      )}

      {(importError || importFailure || importMessage) && (
        <p
          className={`rounded-lg border p-3 text-sm ${
            importError || importFailure
              ? 'border-red-200 bg-red-50 text-red-700'
              : 'border-green-200 bg-green-50 text-green-700'
          }`}
          role={importError || importFailure ? 'alert' : 'status'}
        >
          {importError || importFailure || importMessage}
        </p>
      )}
      {importWarning && (
        <p className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900" role="alert">
          {importWarning}
        </p>
      )}

      {importSummary && (
        <Card className="p-4 space-y-3">
          <div className="flex flex-wrap gap-3 text-sm">
            <span className="rounded-full bg-slate-100 px-3 py-1">Total: {importSummary.total}</span>
            <span className="rounded-full bg-green-100 text-green-700 px-3 py-1">Imported: {importSummary.success}</span>
            {importSummary.updated > 0 && (
              <span className="rounded-full bg-blue-100 text-blue-700 px-3 py-1">
                Existing updated: {importSummary.updated}
              </span>
            )}
            <span className="rounded-full bg-amber-100 text-amber-700 px-3 py-1">Skipped duplicates: {importSummary.skipped_duplicate}</span>
            <span className="rounded-full bg-red-100 text-red-700 px-3 py-1">Invalid: {importSummary.invalid}</span>
            <span className="rounded-full bg-red-100 text-red-700 px-3 py-1">Failed: {importSummary.failed}</span>
          </div>
          {importResults.some((r) => r.status !== 'success') && (
            <div className="max-h-48 overflow-auto rounded-lg border border-slate-200">
              <table className="w-full text-xs">
                <thead className="bg-slate-50">
                  <tr>
                    <th className="px-3 py-2 text-left">Row</th>
                    <th className="px-3 py-2 text-left">Business</th>
                    <th className="px-3 py-2 text-left">Status</th>
                    <th className="px-3 py-2 text-left">Reason</th>
                  </tr>
                </thead>
                <tbody>
                  {importResults
                    .filter((r) => r.status !== 'success')
                    .map((r) => (
                      <tr key={r.id} className="border-t border-slate-100">
                        <td className="px-3 py-2">{r.id}</td>
                        <td className="px-3 py-2">{r.business_name}</td>
                        <td className="px-3 py-2">{r.status}</td>
                        <td className="px-3 py-2">{r.reason ?? '—'}</td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      )}

      {(isEnriching || enrichmentResults.length > 0) && (
        <Card className="p-4 space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-slate-800">
              {contactScanMode
                ? 'Contact lookup'
                : localStorage.getItem('arlotech-login-mode') === 'blacksite'
                  ? 'POST-INTAKE ENRICHMENT'
                  : 'Post-import enrichment'}
            </h3>
            {isEnriching && (
              <span className="text-xs text-slate-500">
                {contactScanMode ? 'Looking up contacts' : 'Analyzing websites'}… {enrichmentProgress.completed}/{enrichmentProgress.total}
              </span>
            )}
          </div>
          <div className="max-h-64 overflow-auto rounded-lg border border-slate-200">
            <table className="w-full text-xs">
              <thead className="bg-slate-50">
                <tr>
                  <th className="px-3 py-2 text-left">Business</th>
                  <th className="px-3 py-2 text-left">Contact email</th>
                  <th className="px-3 py-2 text-left">Contact phone</th>
                  <th className="px-3 py-2 text-left">Score</th>
                  <th className="px-3 py-2 text-left">Draft</th>
                  <th className="px-3 py-2 text-left">Status</th>
                </tr>
              </thead>
              <tbody>
                {enrichmentResults.map((r) => (
                  <tr key={r.prospect_id} className="border-t border-slate-100">
                    <td className="px-3 py-2">{r.business_name}</td>
                    <td className="px-3 py-2">{r.contact_email ?? '—'}</td>
                    <td className="px-3 py-2">{r.contact_phone ?? '—'}</td>
                    <td className="px-3 py-2">{r.analysis_score ?? '—'}</td>
                    <td className="px-3 py-2">{r.draft_created ? 'Created' : '—'}</td>
                    <td className="max-w-[28rem] whitespace-normal px-3 py-2">
                      {r.analysis_completed
                        ? `Analysis complete${r.error ? `; ${r.error}` : ''}`
                        : r.error ?? 'Analysis did not complete'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      <Card>
        <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-3">
            <h2 className="text-lg font-semibold text-slate-800">{localStorage.getItem('arlotech-login-mode') === 'blacksite' ? 'ALL TARGET RECORDS' : 'All Prospects'}</h2>
            <Badge variant="default">{prospects?.length ?? 0} total</Badge>
          </div>
          <label className="relative block w-full sm:max-w-xs">
            <span className="sr-only">Search prospects</span>
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              type="search"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search prospects..."
              className="w-full rounded-lg border border-slate-300 py-2 pl-9 pr-3 text-sm focus:border-arlotech focus:outline-none focus:ring-2 focus:ring-arlotech/20"
            />
          </label>
        </div>
        <div className="mb-3 flex flex-wrap gap-2" role="group" aria-label="Filter prospects">
          {([
            ['all', `All (${prospectRecords.length})`],
            ['with-website', `With website (${prospectRecords.filter((prospect) => Boolean(prospect.website)).length})`],
            ['without-website', `No website (${prospectRecords.filter((prospect) => !prospect.website).length})`],
            ['unanalyzed', `Not analyzed (${isLoadingAnalyses ? '…' : unanalyzedProspects.length})`],
            ['failed-analysis', `Failed analysis (${isLoadingAnalyses ? '…' : failedAnalysisProspects.length})`],
            ['missing-email', `Missing email (${missingEmailProspects.length})`],
          ] as const).map(([filter, label]) => (
            <Button
              key={filter}
              variant={websiteFilter === filter ? 'primary' : 'secondary'}
              size="sm"
              className="min-h-11"
              onClick={() => setWebsiteFilter(filter)}
              ariaLabel={`Show prospects ${label}`}
            >
              {label}
            </Button>
          ))}
        </div>
        {analysesError && (
          <p className="mb-3 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700" role="alert">
            Could not load website analysis status: {analysesError.message}. Analysis filters and batch analysis are unavailable until this is resolved.
          </p>
        )}
        {filteredProspects.length > 0 && (
          <div className="mb-3 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-slate-200 bg-slate-50 p-3">
            <label className="flex items-center gap-2 text-sm text-slate-700">
              <input
                type="checkbox"
                checked={allFilteredSelected}
                onChange={toggleFilteredProspects}
                aria-label={`Select all ${filteredProspects.length} visible prospects`}
                className="h-4 w-4 rounded border-slate-300 text-arlotech focus:ring-arlotech"
              />
              Select all {filteredProspects.length} shown
              {selectedProspectIds.size > 0 && (
                <span className="text-slate-500">({selectedProspectIds.size} selected)</span>
              )}
            </label>
            <Button
              variant="danger"
              size="sm"
              onClick={handleDeleteSelected}
              disabled={selectedProspectIds.size === 0 || deleteSelectedProspects.isPending}
              ariaLabel="Delete selected prospects"
            >
              <Trash2 className="h-4 w-4" />
              {deleteSelectedProspects.isPending ? 'Deleting…' : `Delete selected (${selectedProspectIds.size})`}
            </Button>
          </div>
        )}

        {isLoading ? (
          <div className="space-y-3">
            {[...Array(4)].map((_, index) => (
              <div key={index} className="h-14 animate-pulse rounded-lg bg-slate-200" />
            ))}
          </div>
        ) : error ? (
          <p className="py-8 text-center text-sm text-red-600" role="alert">
            Could not load prospects: {error.message}
          </p>
        ) : filteredProspects.length > 0 ? (
          <ProspectTable
            prospects={filteredProspects}
            showManualContactActions={websiteFilter === 'without-website'}
            analysisErrors={websiteFilter === 'failed-analysis' ? failedAnalysisErrors : undefined}
            selectedProspectIds={selectedProspectIds}
            onToggleSelection={(prospectId) => {
              setSelectedProspectIds((selected) => {
                const next = new Set(selected)
                if (next.has(prospectId)) next.delete(prospectId)
                else next.add(prospectId)
                return next
              })
            }}
            onMarkContacted={(prospect) => markContacted.mutate(prospect)}
            onDelete={(prospect) => {
              if (window.confirm(`Delete ${prospect.business_name}? This cannot be undone.`)) {
                deleteProspect.mutate(prospect.id)
              }
            }}
            isUpdatingContact={markContacted.isPending}
            isDeleting={deleteProspect.isPending}
          />
        ) : (
          <p className="py-8 text-center text-sm text-slate-500">
            {websiteFilter === 'without-website'
              ? prospectRecords.length === 0
                ? 'No prospects yet. Add one or import a CSV to get started.'
                : prospectRecords.some((prospect) => !prospect.website)
                  ? 'No prospects without a website match your search.'
                  : 'All prospects currently have a website.'
              : websiteFilter === 'with-website'
                ? 'No prospects with websites match this view.'
                : websiteFilter === 'unanalyzed'
                  ? isLoadingAnalyses
                    ? 'Checking website analysis status…'
                    : analysesError
                      ? 'Website analysis status is unavailable.'
                      : unanalyzedProspects.length === 0
                      ? 'All prospects with websites have a completed analysis.'
                      : 'No unanalyzed prospects match your search.'
                  : websiteFilter === 'missing-email'
                    ? 'No prospects without an email address match your search.'
                    : websiteFilter === 'failed-analysis'
                      ? 'No failed website analyses match your search.'
                    : search
                  ? 'No prospects match your search.'
                  : 'No prospects yet. Add one or import a CSV to get started.'}
          </p>
        )}
      </Card>
    </div>
  )
}

export function NewProspectPage() {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const { session } = useAuth()
  const [form, setForm] = useState(initialProspectForm)
  const [formError, setFormError] = useState('')

  const createProspect = useMutation({
    mutationFn: async (values: ProspectFormValues) => {
      const userId = session?.user.id
      if (!userId) throw new Error('You must be signed in to add a prospect.')
      const { data, error } = await supabase
        .from('prospects')
        .insert({
          business_name: values.business_name.trim(),
          contact_name: values.contact_name.trim(),
          email: values.email.trim().toLowerCase() || null,
          website: values.website.trim() || null,
          normalized_domain: null,
          business_category: values.business_category.trim() || null,
          city: values.city.trim() || null,
          country: values.country.trim() || null,
          phone: values.phone.trim() || null,
          linkedin_url: values.linkedin_url.trim() || null,
          notes: values.notes.trim() || null,
          source: 'manual',
          status: 'New',
          do_not_contact: false,
          last_contacted_at: null,
          user_id: userId,
        })
        .select('*')
        .single()
      if (error) throw error
      return data as Prospect
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['/prospects'] })
      navigate('/prospects')
    },
  })

  const updateField = (field: keyof ProspectFormValues, value: string) => {
    setForm((current) => ({ ...current, [field]: value }))
  }

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setFormError('')
    try {
      await createProspect.mutateAsync(form)
    } catch (error) {
      setFormError(error instanceof Error ? error.message : 'Could not save this prospect.')
    }
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-800">{localStorage.getItem('arlotech-login-mode') === 'blacksite' ? 'REGISTER TARGET' : 'Add prospect'}</h1>
        <p className="mt-1 text-sm text-slate-500">Add a business to your outreach pipeline.</p>
      </div>

      <Card>
        <form onSubmit={handleSubmit} className="space-y-5">
          {formError && (
            <p className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700" role="alert">
              {formError}
            </p>
          )}

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <TextField
              id="business_name"
              label="Business name"
              value={form.business_name}
              onChange={(value) => updateField('business_name', value)}
              required
            />
            <TextField
              id="contact_name"
              label="Contact name"
              value={form.contact_name}
              onChange={(value) => updateField('contact_name', value)}
            />
            <TextField
              id="email"
              label="Email"
              type="email"
              value={form.email}
              onChange={(value) => updateField('email', value)}
            />
            <TextField
              id="website"
              label="Website"
              type="url"
              placeholder="https://example.com"
              value={form.website}
              onChange={(value) => updateField('website', value)}
            />
            <TextField
              id="business_category"
              label="Business category"
              value={form.business_category}
              onChange={(value) => updateField('business_category', value)}
            />
            <TextField
              id="phone"
              label="Phone"
              type="tel"
              value={form.phone}
              onChange={(value) => updateField('phone', value)}
            />
            <TextField
              id="city"
              label="City"
              value={form.city}
              onChange={(value) => updateField('city', value)}
            />
            <TextField
              id="country"
              label="Country"
              value={form.country}
              onChange={(value) => updateField('country', value)}
            />
            <TextField
              id="linkedin_url"
              label="LinkedIn URL"
              type="url"
              value={form.linkedin_url}
              onChange={(value) => updateField('linkedin_url', value)}
            />
          </div>

          <div className="space-y-1">
            <label htmlFor="notes" className="block text-sm font-medium text-slate-700">
              Notes
            </label>
            <textarea
              id="notes"
              name="notes"
              rows={4}
              value={form.notes}
              onChange={(event) => updateField('notes', event.target.value)}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-arlotech focus:outline-none focus:ring-2 focus:ring-arlotech/20"
            />
          </div>

          <div className="flex flex-col-reverse gap-2 border-t border-slate-100 pt-4 sm:flex-row sm:justify-end">
            <Button variant="secondary" onClick={() => navigate('/prospects')} disabled={createProspect.isPending}>
              Cancel
            </Button>
            <Button type="submit" disabled={createProspect.isPending}>
              {createProspect.isPending ? 'Saving...' : 'Save prospect'}
            </Button>
          </div>
        </form>
      </Card>
    </div>
  )
}
