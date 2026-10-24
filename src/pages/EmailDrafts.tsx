import { Card } from '@/components/ui/Card'

export function EmailDraftsPage() {
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">Email Drafts</h1>
          <p className="text-sm text-slate-500 mt-1">Manage and edit email templates</p>
        </div>
        <div className="flex gap-2">
          <button type="button" className="rounded-lg border border-slate-200 px-3 py-1.5 text-sm text-slate-600 hover:bg-slate-50">
            Import
          </button>
          <button type="button" className="rounded-lg bg-arlotech px-3 py-1.5 text-sm text-white hover:bg-arlotech-muted">
            New Draft
          </button>
        </div>
      </div>
      <Card className="p-6">
        <div className="text-center py-12">
          <p className="text-sm text-slate-500">Email drafts will be available soon</p>
        </div>
      </Card>
    </div>
  )
}
