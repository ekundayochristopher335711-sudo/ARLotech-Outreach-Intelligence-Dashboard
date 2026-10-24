import { z } from 'zod'

export const WebsiteCategorySchema = z.enum([
  'Salon',
  'Barbershop',
  'Construction',
  'Cleaning Service',
  'Law Firm',
  'Real Estate',
  'Hotel',
  'Photography',
  'Retail',
  'Healthcare',
  'Restaurant',
  'Fitness',
  'Education',
  'Nonprofit',
  'Other',
])

export const ProspectStatusSchema = z.enum([
  'New',
  'Researching',
  'Ready for Outreach',
  'Drafted',
  'Contacted',
  'Follow-up Due',
  'Replied',
  'Interested',
  'Not Interested',
  'Meeting Booked',
  'Won',
  'Lost',
  'Do Not Contact',
])

export const TaskPrioritySchema = z.enum(['Low', 'Medium', 'High', 'Critical'])
export const TaskStatusSchema = z.enum(['Todo', 'In Progress', 'Done', 'Blocked'])

export const EmailDirectionSchema = z.enum(['outbound', 'inbound', 'reply'])
export const EmailStatusSchema = z.enum([
  'draft',
  'approved',
  'sent',
  'delivered',
  'bounced',
  'failed',
  'replied',
  'unsubscribed',
  'spam_complaint',
])

export const CampaignStatusSchema = z.enum([
  'Planning',
  'Active',
  'Paused',
  'Completed',
  'Archived',
])

export const FollowUpSequenceStatusSchema = z.enum([
  'Draft',
  'Active',
  'Paused',
  'Completed',
  'Stopped',
])

export const FollowUpStepStatusSchema = z.enum(['Pending', 'Sent', 'Completed', 'Canceled', 'Blocked'])

export const AnalysisStatusSchema = z.enum([
  'queued',
  'running',
  'completed',
  'failed',
  'blocked',
])

export const AnalysisProviderSchema = z.enum(['custom', 'pagespeed_insights', 'lighthouse'])

export const ImportResultSchema = z.object({
  id: z.string(),
  business_name: z.string(),
  email: z.string().optional(),
  website: z.string().optional(),
  status: z.enum(['success', 'updated', 'skipped_duplicate', 'invalid', 'failed']),
  reason: z.string().optional(),
})

export const UserRoleSchema = z.enum(['admin', 'member'])

export const EventLogEntrySchema = z.object({
  id: z.string(),
  user_id: z.string(),
  prospect_id: z.string().optional(),
  campaign_id: z.string().optional(),
  event_type: z.string(),
  description: z.string(),
  metadata: z.any().optional(),
  created_at: z.string(),
})

export const IntegrationEventSchema = z.object({
  id: z.string(),
  user_id: z.string(),
  provider: z.string(),
  event_id: z.string().optional(),
  event_type: z.string(),
  processing_status: z.string(),
  processed_at: z.string().optional(),
  created_at: z.string(),
})
