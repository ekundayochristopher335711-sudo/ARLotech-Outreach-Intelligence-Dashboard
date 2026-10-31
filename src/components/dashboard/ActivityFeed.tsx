import { Badge } from '@/components/ui/Badge'
import { type ActivityLogEntry } from '@/types'
import { format } from 'date-fns'
import {
  Activity,
  Clock,
  FileText,
  Fingerprint,
  FolderKanban,
  ListChecks,
  Mail,
  MessageSquare,
  Pencil,
  Trash2,
  User,
  type LucideIcon,
} from 'lucide-react'

const eventIcons: Record<string, LucideIcon> = {
  email_sent: Mail,
  email_replied: MessageSquare,
  prospect_created: User,
  prospect_updated: Pencil,
  prospect_deleted: Trash2,
  prospect_insert: User,
  website_analyzed: Fingerprint,
  website_analysis_started: Fingerprint,
  website_analysis_updated: Fingerprint,
  website_analysis_failed: Fingerprint,
  website_analysis_deleted: Trash2,
  follow_up_sent: Clock,
  note_added: FileText,
  campaign_created: FolderKanban,
  campaign_updated: Pencil,
  campaign_deleted: Trash2,
  campaign_prospect_created: User,
  campaign_prospect_updated: Pencil,
  campaign_prospect_deleted: Trash2,
  email_draft_created: Mail,
  email_draft_updated: Pencil,
  email_draft_deleted: Trash2,
  email_template_created: FileText,
  email_template_updated: Pencil,
  email_template_deleted: Trash2,
  follow_up_sequence_created: Clock,
  follow_up_sequence_updated: Pencil,
  follow_up_sequence_deleted: Trash2,
  prospect_note_created: FileText,
  prospect_note_updated: Pencil,
  prospect_note_deleted: Trash2,
  task_created: ListChecks,
  task_updated: Pencil,
  task_deleted: Trash2,
  task_insert: ListChecks,
  task_update: Pencil,
  task_delete: Trash2,
}

const eventLabels: Record<string, string> = {
  email_sent: 'Email sent',
  email_replied: 'Reply received',
  prospect_created: 'Prospect added',
  prospect_updated: 'Prospect updated',
  prospect_deleted: 'Prospect deleted',
  website_analyzed: 'Website analyzed',
  website_analysis_started: 'Website analysis started',
  website_analysis_updated: 'Website analysis updated',
  website_analysis_failed: 'Website analysis failed',
  website_analysis_deleted: 'Website analysis deleted',
  follow_up_sent: 'Follow-up sent',
  note_added: 'Note added',
  campaign_created: 'Campaign created',
  campaign_updated: 'Campaign updated',
  campaign_deleted: 'Campaign deleted',
  campaign_prospect_created: 'Prospect assigned to campaign',
  campaign_prospect_updated: 'Campaign assignment updated',
  campaign_prospect_deleted: 'Prospect removed from campaign',
  email_draft_created: 'Email draft created',
  email_draft_updated: 'Email draft updated',
  email_draft_deleted: 'Email draft deleted',
  email_message_updated: 'Email status updated',
  email_template_created: 'Email template created',
  email_template_updated: 'Email template updated',
  email_template_deleted: 'Email template deleted',
  follow_up_sequence_created: 'Follow-up created',
  follow_up_sequence_updated: 'Follow-up updated',
  follow_up_sequence_deleted: 'Follow-up deleted',
  prospect_note_created: 'Prospect note added',
  prospect_note_updated: 'Prospect note updated',
  prospect_note_deleted: 'Prospect note deleted',
  task_created: 'Task created',
  task_updated: 'Task updated',
  task_deleted: 'Task deleted',
  suppression_entry_created: 'Suppression entry added',
  suppression_entry_updated: 'Suppression entry updated',
  suppression_entry_deleted: 'Suppression entry removed',
  profile_created: 'Profile created',
  profile_updated: 'Profile updated',
  profile_deleted: 'Profile deleted',
}

function getEventLabel(eventType: string) {
  return eventLabels[eventType] ??
    eventType.split('_').map((word) => word.charAt(0).toUpperCase() + word.slice(1)).join(' ')
}

export function ActivityFeed({ activity }: { activity: ActivityLogEntry[] }) {
  if (activity.length === 0) {
    return <p className="py-4 text-sm text-slate-500">No activity has been recorded yet.</p>
  }

  return (
    <div className="space-y-4">
      {activity.map((item) => {
        const Icon = eventIcons[item.event_type] || Activity
        return (
          <div key={item.id} className="flex flex-wrap items-start gap-3">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-arlotech/10 text-arlotech">
              <Icon className="h-4 w-4" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="break-words text-sm text-slate-700">{item.description}</p>
              <p className="mt-1 text-xs text-slate-400">
                {format(new Date(item.created_at), 'MMM d, yyyy HH:mm')}
              </p>
            </div>
            <Badge variant="default" className="shrink-0 text-[10px] sm:text-xs">
              {getEventLabel(item.event_type)}
            </Badge>
          </div>
        )
      })}
    </div>
  )
}
