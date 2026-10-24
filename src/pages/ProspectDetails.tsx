import { Card } from '@/components/ui/Card'
import { Badge } from '@/components/ui/Badge'
import { type Prospect } from '@/types'
import { format } from 'date-fns'
import {
  Users,
  Mail,
  Globe,
  MapPin,
  Phone,
  Calendar,
  Edit,
  Trash2,
} from 'lucide-react'

interface ProspectDetailsProps {
  prospect?: Prospect | null
}

export function ProspectDetails({ prospect = null }: ProspectDetailsProps) {
  if (!prospect) {
    return (
      <div className="flex flex-col items-center justify-center py-16">
        <p className="text-slate-500">Prospect not found</p>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <div className="flex h-12 w-12 items-center justify-center rounded-full bg-arlotech text-white text-lg font-bold">
            {prospect.business_name.charAt(0)}
          </div>
          <div>
            <h1 className="text-2xl font-bold text-slate-800">{prospect.business_name}</h1>
            <p className="text-sm text-slate-500">{prospect.contact_name}</p>
          </div>
        </div>
        <div className="flex gap-2">
          <button type="button" className="rounded-lg border border-slate-200 px-3 py-1.5 text-sm text-slate-600 hover:bg-slate-50">
            <Edit className="h-4 w-4" />
          </button>
          <button type="button" className="rounded-lg border border-slate-200 px-3 py-1.5 text-sm text-slate-600 hover:bg-slate-50">
            <Trash2 className="h-4 w-4" />
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <Card className="p-4">
          <h3 className="text-sm font-semibold text-slate-700 mb-2">Contact</h3>
          <div className="space-y-2 text-sm">
            <p className="flex items-center gap-2 text-slate-600">
              <Mail className="h-4 w-4 text-slate-400" />
              {prospect.email || 'Not provided'}
            </p>
            <p className="flex items-center gap-2 text-slate-600">
              <Phone className="h-4 w-4 text-slate-400" />
              {prospect.phone || 'Not provided'}
            </p>
          </div>
        </Card>

        <Card className="p-4">
          <h3 className="text-sm font-semibold text-slate-700 mb-2">Business Info</h3>
          <div className="space-y-2 text-sm">
            <p className="flex items-center gap-2 text-slate-600">
              <Globe className="h-4 w-4 text-slate-400" />
              {prospect.website || 'Not provided'}
            </p>
            <p className="flex items-center gap-2 text-slate-600">
              <MapPin className="h-4 w-4 text-slate-400" />
              {prospect.city || 'Not provided'}
            </p>
            <p className="flex items-center gap-2 text-slate-600">
              <Users className="h-4 w-4 text-slate-400" />
              Category: {prospect.business_category || 'General'}
            </p>
          </div>
        </Card>

        <Card className="p-4">
          <h3 className="text-sm font-semibold text-slate-700 mb-2">Status</h3>
          <div className="flex items-center gap-2">
            <Badge variant="default">{prospect.status}</Badge>
          </div>
          <div className="mt-4 text-sm text-slate-500">
            <p className="flex items-center gap-2 mb-1">
              <Calendar className="h-4 w-4 text-slate-400" />
              Created: {format(new Date(prospect.created_at), 'MMM d, yyyy')}
            </p>
            {prospect.last_contacted_at && (
              <p className="flex items-center gap-2">
                <Calendar className="h-4 w-4 text-slate-400" />
                Last contacted: {format(new Date(prospect.last_contacted_at), 'MMM d, yyyy')}
              </p>
            )}
          </div>
        </Card>
      </div>

      <Card className="p-4">
        <h3 className="text-sm font-semibold text-slate-700 mb-3">Notes</h3>
        <div className="space-y-3">
          {prospect.notes ? (
            <p className="text-sm text-slate-600">{prospect.notes}</p>
          ) : (
            <p className="text-sm text-slate-400">No notes added yet</p>
          )}
        </div>
      </Card>
    </div>
  )
}
