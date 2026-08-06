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
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      access_keys: {
        Row: {
          active: boolean
          created_at: string
          id: string
          tenant_id: string
          key: string
          label: string | null
          last_used_at: string | null
          uses: number
          credits_per_day: number
          unlimited_credits: boolean
          credits_used_today: number
          credits_reset_date: string
          plan: string
          credits_per_month: number
          credits_used_month: number
          credits_reset_month: string
        }
        Insert: {
          active?: boolean
          created_at?: string
          id?: string
          tenant_id: string
          key: string
          label?: string | null
          last_used_at?: string | null
          uses?: number
          credits_per_day?: number
          unlimited_credits?: boolean
          credits_used_today?: number
          credits_reset_date?: string
          plan?: string
          credits_per_month?: number
          credits_used_month?: number
          credits_reset_month?: string
        }
        Update: {
          active?: boolean
          created_at?: string
          id?: string
          tenant_id?: string
          key?: string
          label?: string | null
          last_used_at?: string | null
          uses?: number
          credits_per_day?: number
          unlimited_credits?: boolean
          credits_used_today?: number
          credits_reset_date?: string
          plan?: string
          credits_per_month?: number
          credits_used_month?: number
          credits_reset_month?: string
        }
        Relationships: []
      }
      brand_profiles: {
        Row: {
          id: string
          access_key_id: string
          tenant_id: string
          created_by_member_id: string | null
          name: string
          primary_color: string
          secondary_color: string
          accent_color: string
          tone_of_voice: string
          audience: string
          visual_style: string
          notes: string
          typography: Json
          content_pillars: Json
          prohibited_terms: Json
          brand_rules: Json
          guide_summary: string
          guide_text: string
          guide_updated_at: string | null
          is_primary: boolean
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          access_key_id: string
          tenant_id: string
          created_by_member_id?: string | null
          name: string
          primary_color?: string
          secondary_color?: string
          accent_color?: string
          tone_of_voice?: string
          audience?: string
          visual_style?: string
          notes?: string
          typography?: Json
          content_pillars?: Json
          prohibited_terms?: Json
          brand_rules?: Json
          guide_summary?: string
          guide_text?: string
          guide_updated_at?: string | null
          is_primary?: boolean
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          access_key_id?: string
          tenant_id?: string
          created_by_member_id?: string | null
          name?: string
          primary_color?: string
          secondary_color?: string
          accent_color?: string
          tone_of_voice?: string
          audience?: string
          visual_style?: string
          notes?: string
          typography?: Json
          content_pillars?: Json
          prohibited_terms?: Json
          brand_rules?: Json
          guide_summary?: string
          guide_text?: string
          guide_updated_at?: string | null
          is_primary?: boolean
          created_at?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "brand_profiles_access_key_id_fkey"
            columns: ["access_key_id"]
            isOneToOne: false
            referencedRelation: "access_keys"
            referencedColumns: ["id"]
          },
        ]
      }
      scheduled_posts: {
        Row: {
          id: string
          access_key_id: string
          tenant_id: string
          owner_member_id: string
          brand_profile_id: string | null
          title: string
          caption: string
          platform: string
          content_type: string
          scheduled_for: string
          status: string
          project_id: string | null
          notes: string
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          access_key_id: string
          tenant_id: string
          owner_member_id: string
          brand_profile_id?: string | null
          title: string
          caption?: string
          platform?: string
          content_type?: string
          scheduled_for: string
          status?: string
          project_id?: string | null
          notes?: string
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          access_key_id?: string
          tenant_id?: string
          owner_member_id?: string
          brand_profile_id?: string | null
          title?: string
          caption?: string
          platform?: string
          content_type?: string
          scheduled_for?: string
          status?: string
          project_id?: string | null
          notes?: string
          created_at?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "scheduled_posts_access_key_id_fkey"
            columns: ["access_key_id"]
            isOneToOne: false
            referencedRelation: "access_keys"
            referencedColumns: ["id"]
          },
        ]
      }
      tenants: {
        Row: { id: string; name: string; slug: string; plan: string; credits_per_month: number; credits_used_month: number; credits_reset_month: string; unlimited_credits: boolean; active: boolean; created_at: string; updated_at: string }
        Insert: { id?: string; name: string; slug: string; plan?: string; credits_per_month?: number; credits_used_month?: number; credits_reset_month?: string; unlimited_credits?: boolean; active?: boolean; created_at?: string; updated_at?: string }
        Update: { id?: string; name?: string; slug?: string; plan?: string; credits_per_month?: number; credits_used_month?: number; credits_reset_month?: string; unlimited_credits?: boolean; active?: boolean; created_at?: string; updated_at?: string }
        Relationships: []
      }
      tenant_members: {
        Row: { id: string; tenant_id: string; access_key_id: string; display_name: string; role: string; active: boolean; created_at: string; updated_at: string }
        Insert: { id?: string; tenant_id: string; access_key_id: string; display_name?: string; role?: string; active?: boolean; created_at?: string; updated_at?: string }
        Update: { id?: string; tenant_id?: string; access_key_id?: string; display_name?: string; role?: string; active?: boolean; created_at?: string; updated_at?: string }
        Relationships: []
      }
      brand_documents: {
        Row: { id: string; tenant_id: string; brand_profile_id: string; uploaded_by_member_id: string | null; file_name: string; storage_path: string; mime_type: string; size_bytes: number; page_count: number; extracted_text: string; extracted_data: Json; created_at: string }
        Insert: { id?: string; tenant_id: string; brand_profile_id: string; uploaded_by_member_id?: string | null; file_name: string; storage_path: string; mime_type?: string; size_bytes?: number; page_count?: number; extracted_text?: string; extracted_data?: Json; created_at?: string }
        Update: { id?: string; tenant_id?: string; brand_profile_id?: string; uploaded_by_member_id?: string | null; file_name?: string; storage_path?: string; mime_type?: string; size_bytes?: number; page_count?: number; extracted_text?: string; extracted_data?: Json; created_at?: string }
        Relationships: []
      }
      cloud_projects: {
        Row: { id: string; tenant_id: string; owner_member_id: string; name: string; project_type: string; payload: Json; created_at: string; updated_at: string }
        Insert: { id: string; tenant_id: string; owner_member_id: string; name: string; project_type: string; payload?: Json; created_at?: string; updated_at?: string }
        Update: { id?: string; tenant_id?: string; owner_member_id?: string; name?: string; project_type?: string; payload?: Json; created_at?: string; updated_at?: string }
        Relationships: []
      }
      cloud_library_items: {
        Row: { id: string; tenant_id: string; owner_member_id: string; name: string; url: string; metadata: Json; created_at: string }
        Insert: { id: string; tenant_id: string; owner_member_id: string; name: string; url: string; metadata?: Json; created_at?: string }
        Update: { id?: string; tenant_id?: string; owner_member_id?: string; name?: string; url?: string; metadata?: Json; created_at?: string }
        Relationships: []
      }
      cloudflare_ai_usage: {
        Row: {
          created_at: string
          estimated_neurons: number
          has_reference: boolean
          height: number
          id: string
          input_tiles: number
          model: string
          output_tiles: number
          source: string
          width: number
        }
        Insert: {
          created_at?: string
          estimated_neurons: number
          has_reference?: boolean
          height: number
          id?: string
          input_tiles?: number
          model: string
          output_tiles: number
          source?: string
          width: number
        }
        Update: {
          created_at?: string
          estimated_neurons?: number
          has_reference?: boolean
          height?: number
          id?: string
          input_tiles?: number
          model?: string
          output_tiles?: number
          source?: string
          width?: number
        }
        Relationships: []
      }
      credit_transactions: {
        Row: {
          id: string
          access_key_id: string
          tenant_id: string | null
          member_id: string | null
          job_id: string
          created_at: string
        }
        Insert: {
          id?: string
          access_key_id: string
          tenant_id?: string | null
          member_id?: string | null
          job_id: string
          created_at?: string
        }
        Update: {
          id?: string
          access_key_id?: string
          tenant_id?: string | null
          member_id?: string | null
          job_id?: string
          created_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "credit_transactions_access_key_id_fkey"
            columns: ["access_key_id"]
            isOneToOne: false
            referencedRelation: "access_keys"
            referencedColumns: ["id"]
          },
        ]
      }
      generations: {
        Row: {
          access_key_id: string | null
          tenant_id: string | null
          member_id: string | null
          brand_profile_id: string | null
          client_job_id: string | null
          created_at: string
          hashtags: Json
          id: string
          informacoes_adicionais: string | null
          legenda: string
          objetivo: string | null
          publico_alvo: string | null
          quantidade_slides: number
          slides: Json
          tema: string
          titulo: string
          tom: string | null
          updated_at: string
          user_id: string | null
        }
        Insert: {
          access_key_id?: string | null
          tenant_id?: string | null
          member_id?: string | null
          brand_profile_id?: string | null
          client_job_id?: string | null
          created_at?: string
          hashtags?: Json
          id?: string
          informacoes_adicionais?: string | null
          legenda: string
          objetivo?: string | null
          publico_alvo?: string | null
          quantidade_slides: number
          slides?: Json
          tema: string
          titulo: string
          tom?: string | null
          updated_at?: string
          user_id?: string | null
        }
        Update: {
          access_key_id?: string | null
          tenant_id?: string | null
          member_id?: string | null
          brand_profile_id?: string | null
          client_job_id?: string | null
          created_at?: string
          hashtags?: Json
          id?: string
          informacoes_adicionais?: string | null
          legenda?: string
          objetivo?: string | null
          publico_alvo?: string | null
          quantidade_slides?: number
          slides?: Json
          tema?: string
          titulo?: string
          tom?: string | null
          updated_at?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "generations_access_key_id_fkey"
            columns: ["access_key_id"]
            isOneToOne: false
            referencedRelation: "access_keys"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      consume_access_credit: {
        Args: { p_key: string; p_job_id: string }
        Returns: Json
      }
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
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
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
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
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
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
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
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
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
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
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
