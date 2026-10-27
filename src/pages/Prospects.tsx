import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { useRef, useState, type ChangeEvent, type FormEvent } from 'react'
import { Card } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Badge } from '@/components/ui/Badge'
import { useCsvImport } from '@/lib/csvImport'
import { ProspectTable } from '@/components/dashboard/ProspectTable'
import { useAuth } from '@/hooks/useAuth'
import { supabase } from '@/lib/supabase'
import { type Prospect, type ImportSummary } from '@/types'
import { type ImportResultRow, importLeadsInternal } from '@/lib/csvImport'
import { extractLeadsFromText } from '@/lib/leadExtraction'
import { enrichAndAnalyzeProspect, type EnrichmentResult } from '@/lib/leadEnrichment'
import { ClipboardPaste, FileSpreadsheet, Plus, Search } from 'lucide-react'
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
  const [showTextImport, setShowTextImport] = useState(false)
  const [prospectText, setProspectText] = useState('')
  const [isExtractingText, setIsExtractingText] = useState(false)
  const [importMessage, setImportMessage] = useState('')
  const [importFailure, setImportFailure] = useState('')
  const [importSummary, setImportSummary] = useState<ImportSummary | null>(null)
  const [importResults, setImportResults] = useState<ImportResultRow[]>([])
  const [enrichmentResults, setEnrichmentResults] = useState<EnrichmentResult[]>([])
  const [isEnriching, setIsEnriching] = useState(false)
  const { importCsv, isImporting, importError } = useCsvImport()
  const deleteProspect = useMutation({
    mutationFn: async (prospectId: string) => {
      const userId = session?.user.id
      if (!userId) throw new Error('You must be signed in to delete prospects.')
      const { error } = await supabase
        .from('prospects')
        .delete()
        .eq('id', prospectId)
        .eq('user_id', userId)
      if (error) throw error
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['/prospects'] })
      toast.success('Prospect deleted')
    },
    onError: (error: unknown) => toast.error(error instanceof Error ? error.message : 'Could not delete prospect.'),
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

  const filteredProspects = (prospects ?? []).filter((prospect: Prospect) => {
    const searchValue = search.trim().toLowerCase()
    return (
      !searchValue ||
      prospect.business_name.toLowerCase().includes(searchValue) ||
      prospect.contact_name.toLowerCase().includes(searchValue) ||
      (prospect.email ?? '').toLowerCase().includes(searchValue)
    )
  })

  const completeImport = async (result: Awaited<ReturnType<typeof importLeadsInternal>>) => {
    setImportMessage('')
    setImportFailure('')
    setImportSummary(null)
    setImportResults([])
    setEnrichmentResults([])
    setIsEnriching(false)

    if (result.success) {
      setImportMessage(`Imported ${result.summary.success} of ${result.summary.total} prospects.`)
    } else if (result.summary.success > 0) {
      setImportMessage(`Imported ${result.summary.success} of ${result.summary.total} prospects with some issues.`)
    } else {
      setImportFailure(result.errors ?? 'Import failed.')
    }
    setImportSummary(result.summary)
    setImportResults(result.results)

    // Enrich/analyze inserted prospects with websites in the background
    const inserted = result.insertedProspects ?? []
    if (inserted.length > 0) {
      setIsEnriching(true)
      const enrichment: EnrichmentResult[] = []
      for (const prospect of inserted) {
        if (!prospect.website) continue
        const res = await enrichAndAnalyzeProspect(prospect)
        enrichment.push(res)
        setEnrichmentResults([...enrichment])
      }
      await queryClient.invalidateQueries({ queryKey: ['/prospects'] })
      setIsEnriching(false)
    }
  }

  const handleImport = async (event: ChangeEvent<HTMLInputElement>) => {
    const input = event.currentTarget
    const file = input.files?.[0]
    if (!file) return

    setImportMessage('')
    setImportFailure('')
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
    setImportSummary(null)
    setImportResults([])
    setEnrichmentResults([])
    setIsEnriching(false)
    setIsExtractingText(true)

    try {
      const leads = await extractLeadsFromText(text)
      if (leads.length === 0) {
        setImportFailure('No business prospects were found in that text.')
        return
      }

      await completeImport(await importLeadsInternal(leads as any, queryClient, session?.user.id))
      setProspectText('')
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
          <h1 className="text-2xl font-bold text-slate-800">Prospects</h1>
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
        </div>
      </div>

      {showTextImport && (
        <Card className="space-y-3 p-4">
          <div>
            <h2 className="text-base font-semibold text-slate-800">Paste prospect details</h2>
            <p className="mt-1 text-xs text-slate-500">
              Website links in Google Maps listings are matched to each business, then contact details are looked up from the website.
            </p>
          </div>
          <div className="space-y-1">
            <label htmlFor="prospect-text" className="block text-sm font-medium text-slate-700">
              Business information
            </label>
            <textarea
              id="prospect-text"
              value={prospectText}
              onChange={(event) => setProspectText(event.target.value)}
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

      {importSummary && (
        <Card className="p-4 space-y-3">
          <div className="flex flex-wrap gap-3 text-sm">
            <span className="rounded-full bg-slate-100 px-3 py-1">Total: {importSummary.total}</span>
            <span className="rounded-full bg-green-100 text-green-700 px-3 py-1">Imported: {importSummary.success}</span>
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
            <h3 className="text-sm font-semibold text-slate-800">Post-import enrichment</h3>
            {isEnriching && <span className="text-xs text-slate-500">Analyzing websites…</span>}
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
                    <td className="px-3 py-2">{r.error ?? 'OK'}</td>
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
            <h2 className="text-lg font-semibold text-slate-800">All Prospects</h2>
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
            {search ? 'No prospects match your search.' : 'No prospects yet. Add one or import a CSV to get started.'}
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
        <h1 className="text-2xl font-bold text-slate-800">Add prospect</h1>
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
