import { Badge } from '@/components/ui/Badge'
import { type ActivityLogEntry } from '@/types'
import { format } from 'date-fns'
import { Clock, Mail, MessageSquare, Fingerprint, User, FileText } from 'lucide-react'

const eventIcons: Record<string, React.ElementType> = {
  email_sent: Mail,
  email_replied: MessageSquare,
  prospect_created: User,
  website_analyzed: Fingerprint,
  follow_up_sent: Clock,
  note_added: FileText,
}

export function ActivityFeed({ activity }: { activity: ActivityLogEntry[] }) {
  return (
    <div className="space-y-4">
      {activity.map((item) => {
        const Icon = eventIcons[item.event_type] || Clock
        return (
          <div key={item.id} className="flex items-start gap-3">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-arlotech/10 text-arlotech">
              <Icon className="h-4 w-4" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm text-slate-700">{item.description}</p>
              <p className="text-xs text-slate-400 mt-0.5">
                {format(new Date(item.created_at), 'MMM d, yyyy HH:mm')}
              </p>
            </div>
            <Badge variant="default">{item.event_type}</Badge>
          </div>
        )
      })}
    </div>
  )
}
