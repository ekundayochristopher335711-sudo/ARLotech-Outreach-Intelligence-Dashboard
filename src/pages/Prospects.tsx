import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { Card } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Badge } from '@/components/ui/Badge'
import { useCsvImport } from '@/lib/csvImport'
import { ProspectTable } from '@/components/dashboard/ProspectTable'
import { supabase } from '@/lib/supabase'
import { type Prospect } from '@/types'
import { Plus, FileSpreadsheet, ChevronDown, Trash, Edit, Check, Loader2, Flag } from 'lucide-react'
import { useState } from 'react'

export function ProspectsPage() {
  const navigate = useNavigate()

  const { data: prospects, isLoading } = useQuery({
    queryKey: ['/prospects'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('prospects')
        .select('*')
        .eq('user_id', 'current_user')
        .order('created_at', { ascending: false })
      if (error) throw error
      return data as Prospect[]
    },
  })

  const queryClient = useQueryClient()

  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const [sourceFilter, setSourceFilter] = useState('')

  const filteredProspects = prospects?.filter((prospect: Prospect) => {
    const matchesSearch =
      !search ||
      prospect.business_name.toLowerCase().includes(search.toLowerCase()) ||
      (prospect.contact_name &&
        prospect.contact_name.toLowerCase().includes(search.toLowerCase())) ||
      (prospect.email &&
        prospect.email.toLowerCase().includes(search.toLowerCase()))
    const matchesStatus = !statusFilter || prospect.status === statusFilter
    const matchesSource = !sourceFilter || prospect.source === sourceFilter
    return matchesSearch && matchesStatus && matchesSource
  }) || []

  const { importCsv, isImporting, importError } = useCsvImport()

  const { mutateAsync: insertProspect } = useMutation({
    mutationFn: async (newProspect: Omit<Prospect, 'id' | 'created_at' | 'updated_at'>) => {
      const { data, error } = await supabase
        .from('prospects')
        .insert({
          ...newProspect,
          user_id: 'current_user',
        })
        .select()
      if (error) throw error
      return data[0] as Prospect
    },
    onSuccess: () => {
      queryClient.invalidateQueries(['/prospects'])
    },
  })

  const { mutateAsync: updateProspect } = useMutation({
    mutationFn: async (updatedProspect: Prospect) => {
      const { data, error } = await supabase
        .from('prospects')
        .update(updatedProspect)
        .eq('id', updatedProspect.id)
        .select()
      if (error) throw error
      return data[0] as Prospect
    },
    onSuccess: () => {
      queryClient.invalidateQueries(['/prospects'])
    },
  })

  const { mutateAsync: deleteProspect } = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('prospects').delete().eq('id', id)
      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries(['/prospects'])
    },
  })

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">Prospects</h1>
          <p className="text-sm text-slate-500 mt-1">Manage and track your prospect pipeline</p>
        </div>
        <div className="flex gap-2">
          <Button variant="secondary" size="sm" ariaLabel="Import prospects">
            <FileSpreadsheet className="h-4 w-4" />
            Import
          </Button>
          <Button variant="primary" size="sm" onClick={() => navigate('/prospects/new')} ariaLabel="Add new prospect">
            <Plus className="h-4 w-4" />
            Add Prospect
          </Button>
        </div>
      </div>

      <Card>
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <h2 className="text-lg font-semibold text-slate-800">All Prospects</h2>
            <Badge variant="default">{prospects?.length ?? 0} total</Badge>
          </div>
          <div className="flex gap-2">
            <button type="button" className="text-sm text-slate-500 hover:text-slate-700">
              Export
            </button>
          </div>
        </div>

        {isLoading ? (
          <div className="space-y-3">
            {[...Array(4)].map((_, i) => (
              <div key={i} className="h-14 animate-pulse rounded-lg bg-slate-200" />
            ))}
          </div>
        ) : (
          <ProspectTable prospects={prospects || []} />
        )}
      </Card>
    </div>
  )
}
