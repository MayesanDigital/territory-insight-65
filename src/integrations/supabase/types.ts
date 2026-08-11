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
    PostgrestVersion: "14.15"
  }
  public: {
    Tables: {
      audit_logs: {
        Row: {
          action: string
          actor: string | null
          created_at: string
          entity: string | null
          entity_id: string | null
          id: string
          meta: Json | null
          org_id: string
        }
        Insert: {
          action: string
          actor?: string | null
          created_at?: string
          entity?: string | null
          entity_id?: string | null
          id?: string
          meta?: Json | null
          org_id: string
        }
        Update: {
          action?: string
          actor?: string | null
          created_at?: string
          entity?: string | null
          entity_id?: string | null
          id?: string
          meta?: Json | null
          org_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "audit_logs_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      contact_history: {
        Row: {
          action: string
          actor: string | null
          contact_id: string | null
          created_at: string
          details: Json | null
          id: string
          org_id: string
        }
        Insert: {
          action: string
          actor?: string | null
          contact_id?: string | null
          created_at?: string
          details?: Json | null
          id?: string
          org_id: string
        }
        Update: {
          action?: string
          actor?: string | null
          contact_id?: string | null
          created_at?: string
          details?: Json | null
          id?: string
          org_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "contact_history_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contact_history_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      contacts: {
        Row: {
          age: number | null
          consent_at: string | null
          consent_comms: boolean
          consent_storage: boolean
          created_at: string
          created_by: string | null
          email: string | null
          full_name: string
          gender: string | null
          id: string
          municipio: string | null
          notes: string | null
          org_id: string
          phone: string | null
          registered_at: string
          section_code: string | null
          status: string
          unit_id: string | null
          updated_at: string
        }
        Insert: {
          age?: number | null
          consent_at?: string | null
          consent_comms?: boolean
          consent_storage?: boolean
          created_at?: string
          created_by?: string | null
          email?: string | null
          full_name: string
          gender?: string | null
          id?: string
          municipio?: string | null
          notes?: string | null
          org_id: string
          phone?: string | null
          registered_at?: string
          section_code?: string | null
          status?: string
          unit_id?: string | null
          updated_at?: string
        }
        Update: {
          age?: number | null
          consent_at?: string | null
          consent_comms?: boolean
          consent_storage?: boolean
          created_at?: string
          created_by?: string | null
          email?: string | null
          full_name?: string
          gender?: string | null
          id?: string
          municipio?: string | null
          notes?: string | null
          org_id?: string
          phone?: string | null
          registered_at?: string
          section_code?: string | null
          status?: string
          unit_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "contacts_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contacts_unit_id_fkey"
            columns: ["unit_id"]
            isOneToOne: false
            referencedRelation: "territorial_units"
            referencedColumns: ["id"]
          },
        ]
      }
      organizations: {
        Row: {
          created_at: string
          id: string
          name: string
          slug: string
        }
        Insert: {
          created_at?: string
          id?: string
          name: string
          slug: string
        }
        Update: {
          created_at?: string
          id?: string
          name?: string
          slug?: string
        }
        Relationships: []
      }
      profiles: {
        Row: {
          created_at: string
          email: string | null
          full_name: string | null
          id: string
          org_id: string
        }
        Insert: {
          created_at?: string
          email?: string | null
          full_name?: string | null
          id: string
          org_id: string
        }
        Update: {
          created_at?: string
          email?: string | null
          full_name?: string | null
          id?: string
          org_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "profiles_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      reports: {
        Row: {
          created_at: string
          created_by: string | null
          format: string
          id: string
          name: string
          org_id: string
          params: Json | null
          report_type: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          format?: string
          id?: string
          name: string
          org_id: string
          params?: Json | null
          report_type: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          format?: string
          id?: string
          name?: string
          org_id?: string
          params?: Json | null
          report_type?: string
        }
        Relationships: [
          {
            foreignKeyName: "reports_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      territorial_units: {
        Row: {
          centroid_lat: number | null
          centroid_lng: number | null
          created_at: string
          gender_other: number
          geometry: Json | null
          households: number
          id: string
          localidad: string | null
          men: number
          municipio: string
          org_id: string
          pop_0_17: number
          pop_18_29: number
          pop_30_44: number
          pop_45_59: number
          pop_60_plus: number
          population: number
          section_code: string
          source: string | null
          women: number
        }
        Insert: {
          centroid_lat?: number | null
          centroid_lng?: number | null
          created_at?: string
          gender_other?: number
          geometry?: Json | null
          households?: number
          id?: string
          localidad?: string | null
          men?: number
          municipio: string
          org_id: string
          pop_0_17?: number
          pop_18_29?: number
          pop_30_44?: number
          pop_45_59?: number
          pop_60_plus?: number
          population?: number
          section_code: string
          source?: string | null
          women?: number
        }
        Update: {
          centroid_lat?: number | null
          centroid_lng?: number | null
          created_at?: string
          gender_other?: number
          geometry?: Json | null
          households?: number
          id?: string
          localidad?: string | null
          men?: number
          municipio?: string
          org_id?: string
          pop_0_17?: number
          pop_18_29?: number
          pop_30_44?: number
          pop_45_59?: number
          pop_60_plus?: number
          population?: number
          section_code?: string
          source?: string | null
          women?: number
        }
        Relationships: [
          {
            foreignKeyName: "territorial_units_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      user_roles: {
        Row: {
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
      web_mentions: {
        Row: {
          author: string | null
          created_at: string
          engagement: number | null
          excerpt: string | null
          id: string
          language: string | null
          monitor_id: string | null
          org_id: string
          published_at: string
          reach: number | null
          relevance: number | null
          sentiment: Database["public"]["Enums"]["sentiment_label"] | null
          sentiment_score: number | null
          source_domain: string | null
          source_type: string | null
          title: string
          topic: string | null
          url: string | null
        }
        Insert: {
          author?: string | null
          created_at?: string
          engagement?: number | null
          excerpt?: string | null
          id?: string
          language?: string | null
          monitor_id?: string | null
          org_id: string
          published_at?: string
          reach?: number | null
          relevance?: number | null
          sentiment?: Database["public"]["Enums"]["sentiment_label"] | null
          sentiment_score?: number | null
          source_domain?: string | null
          source_type?: string | null
          title: string
          topic?: string | null
          url?: string | null
        }
        Update: {
          author?: string | null
          created_at?: string
          engagement?: number | null
          excerpt?: string | null
          id?: string
          language?: string | null
          monitor_id?: string | null
          org_id?: string
          published_at?: string
          reach?: number | null
          relevance?: number | null
          sentiment?: Database["public"]["Enums"]["sentiment_label"] | null
          sentiment_score?: number | null
          source_domain?: string | null
          source_type?: string | null
          title?: string
          topic?: string | null
          url?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "web_mentions_monitor_id_fkey"
            columns: ["monitor_id"]
            isOneToOne: false
            referencedRelation: "web_monitors"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "web_mentions_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      web_monitors: {
        Row: {
          active: boolean
          created_at: string
          created_by: string | null
          id: string
          last_run_at: string | null
          name: string
          org_id: string
          query: string
          subject_type: string
        }
        Insert: {
          active?: boolean
          created_at?: string
          created_by?: string | null
          id?: string
          last_run_at?: string | null
          name: string
          org_id: string
          query: string
          subject_type?: string
        }
        Update: {
          active?: boolean
          created_at?: string
          created_by?: string | null
          id?: string
          last_run_at?: string | null
          name?: string
          org_id?: string
          query?: string
          subject_type?: string
        }
        Relationships: [
          {
            foreignKeyName: "web_monitors_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      web_sources: {
        Row: {
          active: boolean
          created_at: string
          domain: string
          id: string
          name: string | null
          org_id: string
          rss_url: string | null
          source_type: string
        }
        Insert: {
          active?: boolean
          created_at?: string
          domain: string
          id?: string
          name?: string | null
          org_id: string
          rss_url?: string | null
          source_type?: string
        }
        Update: {
          active?: boolean
          created_at?: string
          domain?: string
          id?: string
          name?: string | null
          org_id?: string
          rss_url?: string | null
          source_type?: string
        }
        Relationships: [
          {
            foreignKeyName: "web_sources_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      can_write: { Args: never; Returns: boolean }
      current_org: { Args: never; Returns: string }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
    }
    Enums: {
      app_role: "SUPER_ADMIN" | "ADMIN" | "ANALYST" | "VIEWER"
      sentiment_label: "positive" | "neutral" | "negative"
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
    Enums: {
      app_role: ["SUPER_ADMIN", "ADMIN", "ANALYST", "VIEWER"],
      sentiment_label: ["positive", "neutral", "negative"],
    },
  },
} as const
