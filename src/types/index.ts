import { ProspectStatusSchema, WebsiteCategorySchema } from '@/lib/validation'
import { z } from 'zod'

export type ProspectStatus = z.infer<typeof ProspectStatusSchema>
export type WebsiteCategory = z.infer<typeof WebsiteCategorySchema>

export interface UserProfile {
  id: string
  full_name: string
  email: string
  company_name: string
  avatar_url: string | null
  role: string
  created_at: string
}

export interface Prospect {
  id: string
  user_id: string
  business_name: string
  contact_name: string
  email: string | null
  website: string | null
  normalized_domain: string | null
  business_category: string | null
  city: string | null
  country: string | null
  phone: string | null
  linkedin_url: string | null
  notes: string | null
  source: string | null
  status: string
  do_not_contact: boolean
  last_contacted_at: string | null
  created_at: string
  updated_at: string
}

export interface WebsiteAnalysis {
  id: string
  user_id: string
  prospect_id: string | null
  website_url: string
  overall_score: number | null
  performance_score: number | null
  accessibility_score: number | null
  seo_score: number | null
  best_practices_score: number | null
  category_scores: Record<string, number | null> | null
  findings: Array<{
    id: string
    title: string
    evidence: string
    explanation: string
    recommended_fix: string
    potential_benefit: string
    priority: string
    confidence: string
    status: string
  }>
  positive_observations: Array<{
    id: string
    title: string
    evidence: string
    potential_benefit: string
    priority: string
  }>
  ai_analysis: Record<string, unknown> | null
  analysis_status: string
  error_message: string | null
  analysis_provider: string | null
  analyzed_at: string | null
  created_at: string
  updated_at: string
}

export interface EmailDraft {
  id: string
  user_id: string
  prospect_id: string | null
  campaign_id: string | null
  subject: string
  body: string
  template_type: string
  generation_source: string
  status: string
  approved_at: string | null
  created_at: string
  updated_at: string
}

export interface EmailMessage {
  id: string
  user_id: string
  prospect_id: string | null
  campaign_id: string | null
  provider: string | null
  provider_message_id: string | null
  recipient_email: string | null
  direction: string
  subject: string
  body: string
  status: string
  sent_at: string | null
  received_at: string | null
  created_at: string
}

export interface EmailConversation {
  id: string
  user_id: string
  prospect_id: string | null
  subject: string
  last_message_at: string | null
  status: string
  created_at: string
  updated_at: string
}

export interface Campaign {
  id: string
  user_id: string
  name: string
  description: string | null
  industry: string | null
  location: string | null
  status: string
  start_date: string | null
  end_date: string | null
  created_at: string
  updated_at: string
}

export interface CampaignProspect {
  id: string
  user_id: string
  campaign_id: string
  prospect_id: string
  status: string
  created_at: string
}

export interface FollowUpSequence {
  id: string
  user_id: string
  prospect_id: string | null
  campaign_id: string | null
  status: string
  current_step: number | null
  next_action_at: string | null
  timezone: string
  created_at: string
  updated_at: string
}

export interface FollowUpStep {
  id: string
  user_id: string
  sequence_id: string
  step_number: number
  delay_days: number
  template_id: string | null
  status: string
  scheduled_at: string | null
  completed_at: string | null
  created_at: string
}

export interface EmailTemplate {
  id: string
  user_id: string
  name: string
  subject_template: string
  body_template: string
  template_type: string
  created_at: string
}

export interface TaskItem {
  id: string
  user_id: string
  prospect_id: string | null
  title: string
  description: string | null
  priority: string
  status: string
  due_at: string | null
  completed_at: string | null
  created_at: string
}

export interface ProspectNote {
  id: string
  user_id: string
  prospect_id: string
  content: string
  created_at: string
  updated_at: string
}

export interface SuppressionList {
  id: string
  user_id: string
  email: string
  normalized_email: string
  reason: string
  source: string
  created_at: string
}

export interface ActivityLogEntry {
  id: string
  user_id: string
  prospect_id: string | null
  campaign_id: string | null
  event_type: string
  description: string
  metadata: Record<string, unknown> | null
  created_at: string
}

export interface DashboardMetrics {
  total_prospects: number
  prospects_contacted: number
  emails_sent: number
  replies_received: number
  interested_prospects: number
  follow_ups_due: number
  meetings_booked: number
  clients_won: number
}

export interface OutreachActivityPoint {
  date: string
  emails_sent: number
  replies_received: number
  follow_ups_completed: number
}

export interface PipelineStage {
  name: string
  count: number
  color: string
  icon: string
}

export interface MetricBreakdown {
  metric: string
  value: number
  denominator: number
  label: string
  calculation: string
}

export interface TaskItemWithProspect {
  id: string
  title: string
  description: string | null
  priority: string
  status: string
  due_at: string | null
  completed_at: string | null
  created_at: string
  prospect: {
    business_name: string
    id: string
  } | null
}

export interface WebsiteFinding {
  id: string
  title: string
  evidence: string
  explanation: string
  recommended_fix: string
  potential_benefit: string
  priority: string
  confidence: string
  status: string
}

export interface PositiveObservation {
  id: string
  title: string
  evidence: string
  potential_benefit: string
  priority: string
}

export interface AnalysisResult {
  id: string
  prospect: { business_name: string } | null
  website_url: string
  overall_score: number | null
  category_scores: Record<string, number | null> | null
  findings: WebsiteFinding[]
  positive_observations: PositiveObservation[]
  analysis_status: string
  error_message: string | null
  analysis_provider: string | null
  analyzed_at: string | null
  created_at: string
}

export interface CampaignStats {
  campaign_name: string
  prospects_assigned: number
  emails_sent: number
  replies_received: number
  meetings_booked: number
  won_invoices: number
}

export interface ReportRow {
  label: string
  value: number
}

export interface ImportSummary {
  total: number
  success: number
  updated: number
  skipped_duplicate: number
  invalid: number
  failed: number
}

export interface ImportRejection {
  id: string
  business_name: string
  email: string | null
  website: string | null
  reason: string
}
