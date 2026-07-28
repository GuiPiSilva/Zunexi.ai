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
          key: string
          label: string | null
          last_used_at: string | null
          uses: number
          credits_per_day: number
          unlimited_credits: boolean
          credits_used_today: number
          credits_reset_date: string
        }
        Insert: {
          active?: boolean
          created_at?: string
          id?: string
          key: string
          label?: string | null
          last_used_at?: string | null
          uses?: number
          credits_per_day?: number
          unlimited_credits?: boolean
          credits_used_today?: number
          credits_reset_date?: string
        }
        Update: {
          active?: boolean
          created_at?: string
          id?: string
          key?: string
          label?: string | null
          last_used_at?: string | null
          uses?: number
          credits_per_day?: number
          unlimited_credits?: boolean
          credits_used_today?: number
          credits_reset_date?: string
        }
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
          job_id: string
          created_at: string
        }
        Insert: {
          id?: string
          access_key_id: string
          job_id: string
          created_at?: string
        }
        Update: {
          id?: string
          access_key_id?: string
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
