import { useQuery } from '@tanstack/react-query'
import { Card } from '@/components/ui/Card'
import { Badge } from '@/components/ui/Badge'
import { getCurrentUserId, supabase } from '@/lib/supabase'
import { format } from 'date-fns'
import { Globe, AlertCircle, Clock, FileSearch } from 'lucide-react'

export function WebsiteIntelligencePage() {
  const {
    data: analyses,
    isLoading,
  } = useQuery({
    queryKey: ['/website-analyses'],
    queryFn: async () => {
      const userId = await getCurrentUserId()
      const { data, error } = await supabase
        .from('website_analyses')
        .select('*')
        .eq('user_id', userId)
        .order('analyzed_at', { ascending: false })
        .limit(5)
      if (error) throw error
      return data
    },
  })

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div className="h-8 w-48 animate-pulse rounded bg-slate-200" />
        <Card className="p-6">
          <div className="h-40 animate-pulse rounded bg-slate-200" />
        </Card>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">Website Intelligence</h1>
          <p className="text-sm text-slate-500 mt-1">AI-powered website analysis and improvement recommendations</p>
        </div>
        <div className="flex gap-2">
          <button type="button" className="rounded-lg border border-slate-200 px-3 py-1.5 text-sm text-slate-600 hover:bg-slate-50">
            <FileSearch className="h-4 w-4" />
            Upload
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {analyses?.map((analysis: { id: string; website_url: string; analysis_status: string; overall_score: number | null; analysis_provider: string | null; analyzed_at: string; findings: any[] }) => (
          <Card key={analysis.id} className="p-5">
            <div className="flex items-start justify-between mb-3">
              <div className="flex items-center gap-2">
                <Globe className="h-5 w-5 text-arlotech" />
                <span className="text-sm font-medium text-slate-700">{analysis.website_url}</span>
              </div>
              <Badge variant="default">{analysis.analysis_status}</Badge>
            </div>

            {analysis.overall_score !== null && (
              <div className="mb-3">
                <div className="flex justify-between text-sm text-slate-600 mb-1">
                  <span>Overall Score</span>
                  <span>{analysis.overall_score}/100</span>
                </div>
                <div className="h-2 rounded-full bg-slate-100">
                  <div
                    className={`h-2 rounded-full ${(analysis.overall_score ?? 0) >= 70 ? 'bg-green-500' : (analysis.overall_score ?? 0) >= 40 ? 'bg-amber-500' : 'bg-red-500'}`}
                    style={{ width: `${(analysis.overall_score ?? 0) * 1.0}%` }}
                  />
                </div>
              </div>
            )}

            <div className="flex items-center gap-2 text-xs text-slate-500 mb-3">
              <Clock className="h-3 w-3" />
              {analysis.analysis_provider || 'Custom'} • {format(new Date(analysis.analyzed_at), 'MMM d')}
            </div>

            <div className="flex items-center gap-2 text-xs text-slate-500">
              <AlertCircle className="h-3 w-3" />
              {analysis.findings?.length ?? 0} findings
            </div>
          </Card>
        )) || (
          <div className="col-span-3 text-center py-12">
            <p className="text-sm text-slate-500">No analyses yet. Upload a website to get started.</p>
          </div>
        )}
      </div>
    </div>
  )
}
