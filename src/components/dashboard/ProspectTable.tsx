import { useNavigate } from 'react-router-dom'
import { Badge } from '@/components/ui/Badge'
import { type Prospect } from '@/types'
import { format } from 'date-fns'
import { CheckCircle2, MapPin, Trash2 } from 'lucide-react'

interface ProspectTableProps {
  prospects: Prospect[]
  compact?: boolean
  onMarkContacted?: (prospect: Prospect) => void
  onDelete?: (prospect: Prospect) => void
  isUpdatingContact?: boolean
  isDeleting?: boolean
}

export function ProspectTable({
  prospects,
  compact = false,
  onMarkContacted,
  onDelete,
  isUpdatingContact = false,
  isDeleting = false,
}: ProspectTableProps) {
  const navigate = useNavigate()
  return (
    <div className={`space-y-3 ${compact ? 'divide-y' : ''}`}>
      {prospects.map((prospect) => (
        <div
          key={prospect.id}
          onClick={() => navigate(`/prospects/${prospect.id}`)}
          className={`grid w-full grid-cols-[2.5rem_minmax(0,1fr)] items-start gap-3 rounded-lg p-3 transition-colors cursor-pointer sm:flex sm:items-center ${
            compact ? 'divide-y' : 'hover:bg-slate-50'
          }`}
        >
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-slate-200 text-xs font-semibold text-slate-600">
            {prospect.business_name.charAt(0)}
          </div>

          <div className="min-w-0 sm:flex-1">
            <p className="break-words text-sm font-medium leading-5 text-slate-800">{prospect.business_name}</p>
            <p className="break-all text-xs text-slate-400">{prospect.email || 'No email'}</p>
            {prospect.city && (
              <p className="text-xs text-slate-400 flex items-center gap-1 mt-0.5">
                <MapPin className="h-3 w-3" />
                {prospect.city}
              </p>
            )}
          </div>

          <div className="col-start-2 flex min-w-0 flex-wrap items-center gap-2 sm:col-auto">
            <Badge variant="default">{prospect.status}</Badge>
          </div>

          {(onMarkContacted || onDelete) && (
            <div className="col-start-2 flex min-w-0 flex-wrap items-center gap-2 sm:col-auto sm:shrink-0" onClick={(event) => event.stopPropagation()}>
              {onMarkContacted &&
                (prospect.last_contacted_at ? (
                  <span
                    className="flex items-center gap-1 text-xs text-green-700"
                    title={`Last contacted ${format(new Date(prospect.last_contacted_at), 'PPp')}`}
                  >
                    <CheckCircle2 className="h-4 w-4" />
                    <span className="hidden sm:inline">
                      Contacted {format(new Date(prospect.last_contacted_at), 'MMM d')}
                    </span>
                  </span>
                ) : (
                  <button
                    type="button"
                    onClick={() => onMarkContacted(prospect)}
                    disabled={isUpdatingContact}
                    className="rounded px-2 py-1 text-xs font-medium text-green-700 hover:bg-green-50 disabled:opacity-50"
                    aria-label={`Mark ${prospect.business_name} as contacted`}
                  >
                    Mark contacted
                  </button>
                ))}
              {onDelete && (
                <button
                  type="button"
                  onClick={() => onDelete(prospect)}
                  disabled={isDeleting}
                  className="rounded p-2 text-slate-400 hover:bg-red-50 hover:text-red-600 disabled:opacity-50"
                  aria-label={`Delete ${prospect.business_name}`}
                  title="Delete prospect"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              )}
            </div>
          )}
        </div>
      ))}
    </div>
  )
}
