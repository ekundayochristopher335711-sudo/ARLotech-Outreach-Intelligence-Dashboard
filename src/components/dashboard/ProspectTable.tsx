import { Badge } from '@/components/ui/Badge'
import { type Prospect } from '@/types'
import { MapPin, MoreVertical } from 'lucide-react'

interface ProspectTableProps {
  prospects: Prospect[]
  compact?: boolean
}

export function ProspectTable({ prospects, compact = false }: ProspectTableProps) {
  return (
    <div className={`space-y-3 ${compact ? 'divide-y' : ''}`}>
      {prospects.map((prospect) => (
        <div
          key={prospect.id}
          className={`flex items-center gap-3 rounded-lg p-3 transition-colors ${
            compact ? 'divide-y' : 'hover:bg-slate-50'
          }`}
        >
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-slate-200 text-xs font-semibold text-slate-600">
            {prospect.business_name.charAt(0)}
          </div>

          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-slate-800 truncate">{prospect.business_name}</p>
            <p className="text-xs text-slate-400 truncate">{prospect.email || 'No email'}</p>
            {prospect.city && (
              <p className="text-xs text-slate-400 flex items-center gap-1 mt-0.5">
                <MapPin className="h-3 w-3" />
                {prospect.city}
              </p>
            )}
          </div>

          <div className="flex items-center gap-2">
            <Badge variant="default">{prospect.status}</Badge>
          </div>

          <div className="flex items-center gap-1 opacity-0 hover:opacity-100 transition-opacity">
            <button type="button" className="p-1 text-slate-400 hover:text-slate-600 rounded hover:bg-slate-100">
              <MoreVertical className="h-4 w-4" />
            </button>
          </div>
        </div>
      ))}
    </div>
  )
}
