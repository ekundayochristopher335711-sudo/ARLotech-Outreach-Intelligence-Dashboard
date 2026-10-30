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
  selectedProspectIds?: Set<string>
  onToggleSelection?: (prospectId: string) => void
  showManualContactActions?: boolean
  isUpdatingContact?: boolean
  isDeleting?: boolean
}

export function ProspectTable({
  prospects,
  compact = false,
  onMarkContacted,
  onDelete,
  selectedProspectIds,
  onToggleSelection,
  showManualContactActions = false,
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
          className={`flex w-full min-w-0 flex-col gap-3 rounded-lg p-3 transition-colors cursor-pointer sm:flex-row sm:items-center ${
            compact ? 'divide-y' : 'hover:bg-slate-50'
          }`}
        >
          <div className="flex min-w-0 items-start gap-3 sm:flex-1 sm:items-center">
            {selectedProspectIds && onToggleSelection && (
              <input
                type="checkbox"
                checked={selectedProspectIds.has(prospect.id)}
                onChange={() => onToggleSelection(prospect.id)}
                onClick={(event) => event.stopPropagation()}
                aria-label={`Select ${prospect.business_name}`}
                className="mt-3 h-4 w-4 shrink-0 rounded border-slate-300 text-arlotech focus:ring-arlotech sm:mt-0"
              />
            )}
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-slate-200 text-xs font-semibold text-slate-600">
              {prospect.business_name.charAt(0)}
            </div>
            <div className="min-w-0 flex-1">
              <p className="break-words text-sm font-medium leading-5 text-slate-800">{prospect.business_name}</p>
              <p className="break-all text-xs text-slate-400">{prospect.email || 'No email'}</p>
              {showManualContactActions && (
                <p className="break-all text-xs text-slate-500">{prospect.phone || 'No phone number'}</p>
              )}
              {prospect.city && (
                <p className="mt-0.5 flex items-center gap-1 break-words text-xs text-slate-400">
                  <MapPin className="h-3 w-3 shrink-0" />
                  {prospect.city}
                </p>
              )}
            </div>
          </div>

          <div
            className="flex min-w-0 flex-wrap items-center gap-2 border-t border-slate-100 pt-2 sm:ml-auto sm:border-0 sm:pt-0"
            onClick={(event) => event.stopPropagation()}
          >
            <Badge variant="default">{prospect.status}</Badge>
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
                  className="min-h-11 rounded px-2 py-1 text-xs font-medium text-green-700 hover:bg-green-50 disabled:opacity-50"
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
                className="min-h-11 min-w-11 rounded p-2 text-slate-400 hover:bg-red-50 hover:text-red-600 disabled:opacity-50"
                aria-label={`Delete ${prospect.business_name}`}
                title="Delete prospect"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            )}
            {showManualContactActions && prospect.phone && (
              <>
                <a
                  href={`tel:${prospect.phone}`}
                  className="min-h-11 rounded border border-slate-200 px-3 py-2 text-xs text-slate-700 hover:bg-slate-100"
                  aria-label={`Call ${prospect.business_name}`}
                >
                  Call
                </a>
                <a
                  href={`https://wa.me/${prospect.phone.replace(/\D/g, '')}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="min-h-11 rounded border border-green-200 bg-green-50 px-3 py-2 text-xs text-green-800 hover:bg-green-100"
                  aria-label={`Message ${prospect.business_name} on WhatsApp`}
                >
                  WhatsApp
                </a>
              </>
            )}
          </div>
        </div>
      ))}
    </div>
  )
}
