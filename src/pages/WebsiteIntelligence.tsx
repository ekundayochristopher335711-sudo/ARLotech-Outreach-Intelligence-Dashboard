import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Card } from '@/components/ui/Card'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { getCurrentUserId, supabase } from '@/lib/supabase'
import { analyzeWebsite } from '@/lib/websiteAnalysis'
import { format } from 'date-fns'
import { Globe, AlertCircle, Clock, Loader2, Search } from 'lucide-react'

export function WebsiteIntelligencePage() {
  const queryClient = useQueryClient()
  const [url, setUrl] = useState('')
  const [lastResult, setLastResult] = useState<any>(null)

  const { data: analyses, isLoading } = useQuery({
    queryKey: ['/website-analyses'],
    queryFn: async () => {
      const userId = await getCurrentUserId()
      const { data, error } = await supabase
        .from('website_analyses')
        .select('*')
        .eq('user_id', userId)
        .order('analyzed_at', { ascending: false })
        .limit(20)
      if (error) throw error
      return data
    },
  })

  const mutation = useMutation({
    mutationFn: async (targetUrl: string) => analyzeWebsite(targetUrl),
    onSuccess: (result: any) => {
      setLastResult(result)
      setUrl('')
      queryClient.invalidateQueries({ queryKey: ['/website-analyses'] })
    },
  })

  const handleAnalyze = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    if (!url.trim()) return
    let target = url.trim()
    if (!/^https?:\/\//i.test(target)) target = 'https://' + target
    mutation.mutate(target)
  }

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
      <div>
        <h1 className="text-2xl font-bold text-slate-800">Website Intelligence</h1>
        <p className="text-sm text-slate-500 mt-1">AI-powered website analysis and improvement recommendations</p>
      </div>

      <Card className="p-6">
        <form onSubmit={handleAnalyze} className="flex flex-col gap-3 sm:flex-row">
          <input
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="https://example.com"
            className="flex-1"
            disabled={mutation.isPending}
          />
          <Button type="submit" disabled={mutation.isPending || !url.trim()}>
            {mutation.isPending ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Analyzing...
              </>
            ) : (
              <>
                <Search className="h-4 w-4" />
                Analyze
              </>
            )}
          </Button>
        </form>
        {mutation.isError && (
          <p className="mt-3 text-sm text-red-600">
            {mutation.error instanceof Error ? mutation.error.message : 'Analysis failed'}
          </p>
        )}
        {mutation.isPending && (
          <p className="mt-3 text-xs text-slate-500">
            Running PageSpeed Insights, extracting content, and generating AI explanation. This may take 20-40 seconds.
          </p>
        )}
      </Card>

      {lastResult && (
        <Card className="p-6 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold text-slate-800">Latest Analysis</h2>
            <Badge variant="default">{lastResult.overallScore ?? 0}/100</Badge>
          </div>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {Object.entries(lastResult.pagespeed?.lighthouseResult?.categories || {}).map(([k, v]: any) => (
              <div key={k} className="rounded-lg border border-slate-200 p-3">
                <p className="text-xs text-slate-500 capitalize">{k.replace(/-/g, ' ')}</p>
                <p className="text-lg font-bold text-slate-800">{Math.round((v?.score ?? 0) * 100)}</p>
              </div>
            ))}
          </div>
          {lastResult.gemini?.parsed?.summary && (
            <div>
              <h3 className="text-sm font-semibold text-slate-700 mb-1">Summary</h3>
              <p className="text-sm text-slate-600">{lastResult.gemini.parsed.summary}</p>
            </div>
          )}
          {lastResult.gemini?.parsed?.score_explanation && (
            <div>
              <h3 className="text-sm font-semibold text-slate-700 mb-1">Score Explanation</h3>
              <p className="text-sm text-slate-600">{lastResult.gemini.parsed.score_explanation}</p>
            </div>
          )}
          {lastResult.gemini?.parsed?.recommendations?.length ? (
            <div>
              <h3 className="text-sm font-semibold text-slate-700 mb-1">Recommendations</h3>
              <ul className="list-disc pl-5 text-sm text-slate-600 space-y-1">
                {lastResult.gemini.parsed.recommendations.map((r: string, i: number) => (
                  <li key={i}>{r}</li>
                ))}
              </ul>
            </div>
          ) : null}
          {lastResult.content && (
            <div className="text-xs text-slate-500">
              Extracted: {lastResult.content.wordCount} words, {lastResult.content.h1Count} H1, {lastResult.content.images.total} images ({lastResult.content.images.missingAlt} missing alt).
            </div>
          )}
        </Card>
      )}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {analyses?.map((analysis: { id: string; website_url: string; analysis_status: string; overall_score: number | null; analysis_provider: string | null; analyzed_at: string; findings: any[] }) => (
          <Card key={analysis.id} className="p-5">
            <div className="flex items-start justify-between mb-3">
              <div className="flex items-center gap-2">
                <Globe className="h-5 w-5 text-arlotech" />
                <span className="text-sm font-medium text-slate-700 truncate max-w-[180px]">{analysis.website_url}</span>
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
            <p className="text-sm text-slate-500">No analyses yet. Enter a website URL to get started.</p>
          </div>
        )}
      </div>
    </div>
  )
}



