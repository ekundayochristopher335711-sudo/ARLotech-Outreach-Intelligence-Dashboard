export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.18"
  }
  public: {
    Tables: {
      activity_logs: {
        Row: {
          campaign_id: string | null
          created_at: string | null
          description: string
          event_type: string
          id: string
          metadata: Json | null
          prospect_id: string | null
          user_id: string
        }
        Insert: {
          campaign_id?: string | null
          created_at?: string | null
          description: string
          event_type: string
          id?: string
          metadata?: Json | null
          prospect_id?: string | null
          user_id: string
        }
        Update: {
          campaign_id?: string | null
          created_at?: string | null
          description?: string
          event_type?: string
          id?: string
          metadata?: Json | null
          prospect_id?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "activity_logs_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "campaigns"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "activity_logs_prospect_id_fkey"
            columns: ["prospect_id"]
            isOneToOne: false
            referencedRelation: "prospects"
            referencedColumns: ["id"]
          },
        ]
      }
      campaign_prospects: {
        Row: {
          campaign_id: string
          created_at: string | null
          id: string
          prospect_id: string
          status: string
          user_id: string
        }
        Insert: {
          campaign_id: string
          created_at?: string | null
          id?: string
          prospect_id: string
          status?: string
          user_id: string
        }
        Update: {
          campaign_id?: string
          created_at?: string | null
          id?: string
          prospect_id?: string
          status?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "campaign_prospects_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "campaigns"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "campaign_prospects_prospect_id_fkey"
            columns: ["prospect_id"]
            isOneToOne: false
            referencedRelation: "prospects"
            referencedColumns: ["id"]
          },
        ]
      }
      campaigns: {
        Row: {
          created_at: string | null
          description: string | null
          end_date: string | null
          id: string
          industry: string | null
          location: string | null
          name: string
          start_date: string | null
          status: string
          updated_at: string | null
          user_id: string
        }
        Insert: {
          created_at?: string | null
          description?: string | null
          end_date?: string | null
          id?: string
          industry?: string | null
          location?: string | null
          name: string
          start_date?: string | null
          status?: string
          updated_at?: string | null
          user_id: string
        }
        Update: {
          created_at?: string | null
          description?: string | null
          end_date?: string | null
          id?: string
          industry?: string | null
          location?: string | null
          name?: string
          start_date?: string | null
          status?: string
          updated_at?: string | null
          user_id?: string
        }
        Relationships: []
      }
      dashboard_metrics: {
        Row: {
          clients_won: number
          emails_sent: number
          follow_ups_due: number
          interested_prospects: number
          meetings_booked: number
          prospects_contacted: number
          replies_received: number
          total_prospects: number
          user_id: string
        }
        Insert: {
          clients_won?: number
          emails_sent?: number
          follow_ups_due?: number
          interested_prospects?: number
          meetings_booked?: number
          prospects_contacted?: number
          replies_received?: number
          total_prospects?: number
          user_id: string
        }
        Update: {
          clients_won?: number
          emails_sent?: number
          follow_ups_due?: number
          interested_prospects?: number
          meetings_booked?: number
          prospects_contacted?: number
          replies_received?: number
          total_prospects?: number
          user_id?: string
        }
        Relationships: []
      }
      email_drafts: {
        Row: {
          approved_at: string | null
          body: string
          campaign_id: string | null
          created_at: string | null
          generation_source: string
          id: string
          prospect_id: string | null
          status: string
          subject: string
          template_type: string
          updated_at: string | null
          user_id: string
        }
        Insert: {
          approved_at?: string | null
          body: string
          campaign_id?: string | null
          created_at?: string | null
          generation_source?: string
          id?: string
          prospect_id?: string | null
          status?: string
          subject: string
          template_type?: string
          updated_at?: string | null
          user_id: string
        }
        Update: {
          approved_at?: string | null
          body?: string
          campaign_id?: string | null
          created_at?: string | null
          generation_source?: string
          id?: string
          prospect_id?: string | null
          status?: string
          subject?: string
          template_type?: string
          updated_at?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "email_drafts_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "campaigns"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "email_drafts_prospect_id_fkey"
            columns: ["prospect_id"]
            isOneToOne: false
            referencedRelation: "prospects"
            referencedColumns: ["id"]
          },
        ]
      }
      email_messages: {
        Row: {
          body: string
          campaign_id: string | null
          created_at: string | null
          direction: string
          id: string
          prospect_id: string | null
          provider: string | null
          provider_message_id: string | null
          received_at: string | null
          recipient_email: string | null
          sender_email: string | null
          sent_at: string | null
          status: string
          subject: string
          user_id: string
        }
        Insert: {
          body?: string
          campaign_id?: string | null
          created_at?: string | null
          direction?: string
          id?: string
          prospect_id?: string | null
          provider?: string | null
          provider_message_id?: string | null
          received_at?: string | null
          recipient_email?: string | null
          sender_email?: string | null
          sent_at?: string | null
          status?: string
          subject?: string
          user_id: string
        }
        Update: {
          body?: string
          campaign_id?: string | null
          created_at?: string | null
          direction?: string
          id?: string
          prospect_id?: string | null
          provider?: string | null
          provider_message_id?: string | null
          received_at?: string | null
          recipient_email?: string | null
          sender_email?: string | null
          sent_at?: string | null
          status?: string
          subject?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "email_messages_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "campaigns"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "email_messages_prospect_id_fkey"
            columns: ["prospect_id"]
            isOneToOne: false
            referencedRelation: "prospects"
            referencedColumns: ["id"]
          },
        ]
      }
      email_templates: {
        Row: {
          body_template: string
          created_at: string | null
          id: string
          name: string
          subject_template: string
          template_type: string | null
          updated_at: string | null
          user_id: string
        }
        Insert: {
          body_template: string
          created_at?: string | null
          id?: string
          name: string
          subject_template: string
          template_type?: string | null
          updated_at?: string | null
          user_id: string
        }
        Update: {
          body_template?: string
          created_at?: string | null
          id?: string
          name?: string
          subject_template?: string
          template_type?: string | null
          updated_at?: string | null
          user_id?: string
        }
        Relationships: []
      }
      follow_up_sequences: {
        Row: {
          campaign_id: string | null
          created_at: string | null
          current_step: number | null
          id: string
          next_action_at: string | null
          prospect_id: string | null
          status: string
          timezone: string
          updated_at: string | null
          user_id: string
        }
        Insert: {
          campaign_id?: string | null
          created_at?: string | null
          current_step?: number | null
          id?: string
          next_action_at?: string | null
          prospect_id?: string | null
          status?: string
          timezone?: string
          updated_at?: string | null
          user_id: string
        }
        Update: {
          campaign_id?: string | null
          created_at?: string | null
          current_step?: number | null
          id?: string
          next_action_at?: string | null
          prospect_id?: string | null
          status?: string
          timezone?: string
          updated_at?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "follow_up_sequences_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "campaigns"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "follow_up_sequences_prospect_id_fkey"
            columns: ["prospect_id"]
            isOneToOne: false
            referencedRelation: "prospects"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          avatar_url: string | null
          company_name: string | null
          created_at: string | null
          email: string | null
          full_name: string | null
          id: string
          role: string
          updated_at: string | null
        }
        Insert: {
          avatar_url?: string | null
          company_name?: string | null
          created_at?: string | null
          email?: string | null
          full_name?: string | null
          id: string
          role?: string
          updated_at?: string | null
        }
        Update: {
          avatar_url?: string | null
          company_name?: string | null
          created_at?: string | null
          email?: string | null
          full_name?: string | null
          id?: string
          role?: string
          updated_at?: string | null
        }
        Relationships: []
      }
      prospect_notes: {
        Row: {
          content: string
          created_at: string | null
          id: string
          prospect_id: string
          updated_at: string | null
          user_id: string
        }
        Insert: {
          content: string
          created_at?: string | null
          id?: string
          prospect_id: string
          updated_at?: string | null
          user_id: string
        }
        Update: {
          content?: string
          created_at?: string | null
          id?: string
          prospect_id?: string
          updated_at?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "prospect_notes_prospect_id_fkey"
            columns: ["prospect_id"]
            isOneToOne: false
            referencedRelation: "prospects"
            referencedColumns: ["id"]
          },
        ]
      }
      prospects: {
        Row: {
          business_category: string | null
          business_name: string
          business_name_verified: boolean
          city: string | null
          contact_name: string
          country: string | null
          created_at: string | null
          do_not_contact: boolean
          email: string | null
          id: string
          last_contacted_at: string | null
          linkedin_url: string | null
          normalized_domain: string | null
          notes: string | null
          phone: string | null
          source: string | null
          status: string
          updated_at: string | null
          user_id: string
          website: string | null
        }
        Insert: {
          business_category?: string | null
          business_name: string
          business_name_verified?: boolean
          city?: string | null
          contact_name?: string
          country?: string | null
          created_at?: string | null
          do_not_contact?: boolean
          email?: string | null
          id?: string
          last_contacted_at?: string | null
          linkedin_url?: string | null
          normalized_domain?: string | null
          notes?: string | null
          phone?: string | null
          source?: string | null
          status?: string
          updated_at?: string | null
          user_id: string
          website?: string | null
        }
        Update: {
          business_category?: string | null
          business_name?: string
          business_name_verified?: boolean
          city?: string | null
          contact_name?: string
          country?: string | null
          created_at?: string | null
          do_not_contact?: boolean
          email?: string | null
          id?: string
          last_contacted_at?: string | null
          linkedin_url?: string | null
          normalized_domain?: string | null
          notes?: string | null
          phone?: string | null
          source?: string | null
          status?: string
          updated_at?: string | null
          user_id?: string
          website?: string | null
        }
        Relationships: []
      }
      suppression_list: {
        Row: {
          created_at: string | null
          email: string
          id: string
          normalized_email: string
          reason: string
          source: string
          user_id: string
        }
        Insert: {
          created_at?: string | null
          email: string
          id?: string
          normalized_email: string
          reason?: string
          source?: string
          user_id: string
        }
        Update: {
          created_at?: string | null
          email?: string
          id?: string
          normalized_email?: string
          reason?: string
          source?: string
          user_id?: string
        }
        Relationships: []
      }
      tasks: {
        Row: {
          completed_at: string | null
          created_at: string | null
          description: string | null
          due_at: string | null
          id: string
          priority: string
          prospect_id: string | null
          status: string
          title: string
          user_id: string
        }
        Insert: {
          completed_at?: string | null
          created_at?: string | null
          description?: string | null
          due_at?: string | null
          id?: string
          priority?: string
          prospect_id?: string | null
          status?: string
          title: string
          user_id: string
        }
        Update: {
          completed_at?: string | null
          created_at?: string | null
          description?: string | null
          due_at?: string | null
          id?: string
          priority?: string
          prospect_id?: string | null
          status?: string
          title?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "tasks_prospect_id_fkey"
            columns: ["prospect_id"]
            isOneToOne: false
            referencedRelation: "prospects"
            referencedColumns: ["id"]
          },
        ]
      }
      website_analyses: {
        Row: {
          accessibility_score: number | null
          ai_analysis: Json | null
          analysis_provider: string | null
          analysis_status: string
          analyzed_at: string | null
          best_practices_score: number | null
          category_scores: Json | null
          created_at: string | null
          error_message: string | null
          findings: Json
          id: string
          overall_score: number | null
          performance_score: number | null
          positive_observations: Json
          prospect_id: string | null
          seo_score: number | null
          updated_at: string | null
          user_id: string
          website_url: string
        }
        Insert: {
          accessibility_score?: number | null
          ai_analysis?: Json | null
          analysis_provider?: string | null
          analysis_status?: string
          analyzed_at?: string | null
          best_practices_score?: number | null
          category_scores?: Json | null
          created_at?: string | null
          error_message?: string | null
          findings?: Json
          id?: string
          overall_score?: number | null
          performance_score?: number | null
          positive_observations?: Json
          prospect_id?: string | null
          seo_score?: number | null
          updated_at?: string | null
          user_id: string
          website_url: string
        }
        Update: {
          accessibility_score?: number | null
          ai_analysis?: Json | null
          analysis_provider?: string | null
          analysis_status?: string
          analyzed_at?: string | null
          best_practices_score?: number | null
          category_scores?: Json | null
          created_at?: string | null
          error_message?: string | null
          findings?: Json
          id?: string
          overall_score?: number | null
          performance_score?: number | null
          positive_observations?: Json
          prospect_id?: string | null
          seo_score?: number | null
          updated_at?: string | null
          user_id?: string
          website_url?: string
        }
        Relationships: [
          {
            foreignKeyName: "website_analyses_prospect_id_fkey"
            columns: ["prospect_id"]
            isOneToOne: false
            referencedRelation: "prospects"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      [_ in never]: never
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {},
  },
} as const
