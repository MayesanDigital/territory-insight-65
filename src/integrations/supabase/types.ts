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
  graphql_public: {
    Tables: {
      [_ in never]: never
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      graphql: {
        Args: {
          extensions?: Json
          operationName?: string
          query?: string
          variables?: Json
        }
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
          ip_hash: string | null
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
          ip_hash?: string | null
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
          ip_hash?: string | null
          meta?: Json | null
          org_id?: string
        }
        Relationships: []
      }
      contact_consents: {
        Row: {
          consent_type: string
          contact_id: string
          created_at: string
          granted: boolean
          granted_at: string
          id: string
          method: string
          notes: string | null
          org_id: string
          recorded_by: string | null
          revoked_at: string | null
        }
        Insert: {
          consent_type: string
          contact_id: string
          created_at?: string
          granted: boolean
          granted_at?: string
          id?: string
          method?: string
          notes?: string | null
          org_id: string
          recorded_by?: string | null
          revoked_at?: string | null
        }
        Update: {
          consent_type?: string
          contact_id?: string
          created_at?: string
          granted?: boolean
          granted_at?: string
          id?: string
          method?: string
          notes?: string | null
          org_id?: string
          recorded_by?: string | null
          revoked_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "contact_consents_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "contacts"
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
        ]
      }
      contacts: {
        Row: {
          address: string | null
          age: number | null
          category: string | null
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
          address?: string | null
          age?: number | null
          category?: string | null
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
          address?: string | null
          age?: number | null
          category?: string | null
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
          {
            foreignKeyName: "contacts_unit_id_fkey"
            columns: ["unit_id"]
            isOneToOne: false
            referencedRelation: "territorial_units_detailed"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contacts_unit_id_fkey"
            columns: ["unit_id"]
            isOneToOne: false
            referencedRelation: "territorial_units_summary"
            referencedColumns: ["id"]
          },
        ]
      }
      demographics: {
        Row: {
          adults_18_plus: number
          age_0_17: number
          age_18_24: number
          age_25_59: number
          age_60_plus: number
          created_at: string
          gender_female: number
          gender_male: number
          gender_other: number
          households: number
          id: string
          indicators: Json | null
          org_id: string
          population: number
          source: string
          territorial_unit_id: string
          updated_at: string
          year: number
        }
        Insert: {
          adults_18_plus?: number
          age_0_17?: number
          age_18_24?: number
          age_25_59?: number
          age_60_plus?: number
          created_at?: string
          gender_female?: number
          gender_male?: number
          gender_other?: number
          households?: number
          id?: string
          indicators?: Json | null
          org_id: string
          population?: number
          source?: string
          territorial_unit_id: string
          updated_at?: string
          year: number
        }
        Update: {
          adults_18_plus?: number
          age_0_17?: number
          age_18_24?: number
          age_25_59?: number
          age_60_plus?: number
          created_at?: string
          gender_female?: number
          gender_male?: number
          gender_other?: number
          households?: number
          id?: string
          indicators?: Json | null
          org_id?: string
          population?: number
          source?: string
          territorial_unit_id?: string
          updated_at?: string
          year?: number
        }
        Relationships: [
          {
            foreignKeyName: "demographics_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "demographics_territorial_unit_id_fkey"
            columns: ["territorial_unit_id"]
            isOneToOne: false
            referencedRelation: "territorial_units"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "demographics_territorial_unit_id_fkey"
            columns: ["territorial_unit_id"]
            isOneToOne: false
            referencedRelation: "territorial_units_detailed"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "demographics_territorial_unit_id_fkey"
            columns: ["territorial_unit_id"]
            isOneToOne: false
            referencedRelation: "territorial_units_summary"
            referencedColumns: ["id"]
          },
        ]
      }
      mention_topics: {
        Row: {
          mention_id: string
          org_id: string
          topic_id: string
          weight: number
        }
        Insert: {
          mention_id: string
          org_id: string
          topic_id: string
          weight?: number
        }
        Update: {
          mention_id?: string
          org_id?: string
          topic_id?: string
          weight?: number
        }
        Relationships: [
          {
            foreignKeyName: "mention_topics_mention_id_fkey"
            columns: ["mention_id"]
            isOneToOne: false
            referencedRelation: "web_mentions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "mention_topics_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "mention_topics_topic_id_fkey"
            columns: ["topic_id"]
            isOneToOne: false
            referencedRelation: "topics"
            referencedColumns: ["id"]
          },
        ]
      }
      monitor_runs: {
        Row: {
          errors: Json | null
          finished_at: string | null
          id: string
          items_found: number
          items_new: number
          monitor_id: string
          org_id: string
          sources_checked: number
          started_at: string
          status: string
        }
        Insert: {
          errors?: Json | null
          finished_at?: string | null
          id?: string
          items_found?: number
          items_new?: number
          monitor_id: string
          org_id: string
          sources_checked?: number
          started_at?: string
          status?: string
        }
        Update: {
          errors?: Json | null
          finished_at?: string | null
          id?: string
          items_found?: number
          items_new?: number
          monitor_id?: string
          org_id?: string
          sources_checked?: number
          started_at?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "monitor_runs_monitor_id_fkey"
            columns: ["monitor_id"]
            isOneToOne: false
            referencedRelation: "web_monitors"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "monitor_runs_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      municipal_demographics: {
        Row: {
          age_0_17: number
          age_18_29: number
          age_30_44: number
          age_45_59: number
          age_60_plus: number
          age_unspecified: number
          created_at: string
          gender_female: number
          gender_male: number
          households: number
          id: string
          indicators: Json | null
          municipio: string
          municipio_code: string | null
          municipio_key: string
          org_id: string
          population: number
          source: string
          updated_at: string
          year: number
        }
        Insert: {
          age_0_17?: number
          age_18_29?: number
          age_30_44?: number
          age_45_59?: number
          age_60_plus?: number
          age_unspecified?: number
          created_at?: string
          gender_female?: number
          gender_male?: number
          households?: number
          id?: string
          indicators?: Json | null
          municipio: string
          municipio_code?: string | null
          municipio_key: string
          org_id: string
          population?: number
          source?: string
          updated_at?: string
          year: number
        }
        Update: {
          age_0_17?: number
          age_18_29?: number
          age_30_44?: number
          age_45_59?: number
          age_60_plus?: number
          age_unspecified?: number
          created_at?: string
          gender_female?: number
          gender_male?: number
          households?: number
          id?: string
          indicators?: Json | null
          municipio?: string
          municipio_code?: string | null
          municipio_key?: string
          org_id?: string
          population?: number
          source?: string
          updated_at?: string
          year?: number
        }
        Relationships: [
          {
            foreignKeyName: "municipal_demographics_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      organization_invitations: {
        Row: {
          accepted_at: string | null
          created_at: string
          email: string
          expires_at: string
          id: string
          invited_by: string | null
          org_id: string
          role: Database["public"]["Enums"]["app_role"]
        }
        Insert: {
          accepted_at?: string | null
          created_at?: string
          email: string
          expires_at?: string
          id?: string
          invited_by?: string | null
          org_id: string
          role?: Database["public"]["Enums"]["app_role"]
        }
        Update: {
          accepted_at?: string | null
          created_at?: string
          email?: string
          expires_at?: string
          id?: string
          invited_by?: string | null
          org_id?: string
          role?: Database["public"]["Enums"]["app_role"]
        }
        Relationships: [
          {
            foreignKeyName: "organization_invitations_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
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
          org_id: string | null
        }
        Insert: {
          created_at?: string
          email?: string | null
          full_name?: string | null
          id: string
          org_id?: string | null
        }
        Update: {
          created_at?: string
          email?: string | null
          full_name?: string | null
          id?: string
          org_id?: string | null
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
      sentiment_analysis: {
        Row: {
          analyzed_at: string
          engine: string
          id: string
          label: Database["public"]["Enums"]["sentiment_label"]
          matches: number
          mention_id: string
          org_id: string
          relevance: number | null
          score: number
        }
        Insert: {
          analyzed_at?: string
          engine?: string
          id?: string
          label: Database["public"]["Enums"]["sentiment_label"]
          matches?: number
          mention_id: string
          org_id: string
          relevance?: number | null
          score?: number
        }
        Update: {
          analyzed_at?: string
          engine?: string
          id?: string
          label?: Database["public"]["Enums"]["sentiment_label"]
          matches?: number
          mention_id?: string
          org_id?: string
          relevance?: number | null
          score?: number
        }
        Relationships: [
          {
            foreignKeyName: "sentiment_analysis_mention_id_fkey"
            columns: ["mention_id"]
            isOneToOne: false
            referencedRelation: "web_mentions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sentiment_analysis_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      territorial_geometries: {
        Row: {
          centroid_lat: number | null
          centroid_lng: number | null
          created_at: string
          geometry: Json
          geometry_type: string
          id: string
          org_id: string
          source: string
          territorial_unit_id: string
        }
        Insert: {
          centroid_lat?: number | null
          centroid_lng?: number | null
          created_at?: string
          geometry: Json
          geometry_type: string
          id?: string
          org_id: string
          source?: string
          territorial_unit_id: string
        }
        Update: {
          centroid_lat?: number | null
          centroid_lng?: number | null
          created_at?: string
          geometry?: Json
          geometry_type?: string
          id?: string
          org_id?: string
          source?: string
          territorial_unit_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "territorial_geometries_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "territorial_geometries_territorial_unit_id_fkey"
            columns: ["territorial_unit_id"]
            isOneToOne: false
            referencedRelation: "territorial_units"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "territorial_geometries_territorial_unit_id_fkey"
            columns: ["territorial_unit_id"]
            isOneToOne: false
            referencedRelation: "territorial_units_detailed"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "territorial_geometries_territorial_unit_id_fkey"
            columns: ["territorial_unit_id"]
            isOneToOne: false
            referencedRelation: "territorial_units_summary"
            referencedColumns: ["id"]
          },
        ]
      }
      section_election_results: {
        Row: {
          actas: number
          created_at: string
          election_label: string
          election_type: string
          election_year: number
          ganador: string | null
          id: string
          lista_nominal: number
          no_registrados: number
          org_id: string
          participacion: number | null
          partidos: Json
          resultados: Json
          section_code: string
          source: string
          total_votos: number
          votos_nulos: number
        }
        Insert: {
          actas?: number
          created_at?: string
          election_label: string
          election_type: string
          election_year: number
          ganador?: string | null
          id?: string
          lista_nominal?: number
          no_registrados?: number
          org_id: string
          participacion?: number | null
          partidos?: Json
          resultados?: Json
          section_code: string
          source: string
          total_votos?: number
          votos_nulos?: number
        }
        Update: {
          actas?: number
          created_at?: string
          election_label?: string
          election_type?: string
          election_year?: number
          ganador?: string | null
          id?: string
          lista_nominal?: number
          no_registrados?: number
          org_id?: string
          participacion?: number | null
          partidos?: Json
          resultados?: Json
          section_code?: string
          source?: string
          total_votos?: number
          votos_nulos?: number
        }
        Relationships: [
          {
            foreignKeyName: "section_election_results_org_id_fkey"
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
          data_status: string
          district: number | null
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
          section_type: string | null
          source: string | null
          women: number
        }
        Insert: {
          centroid_lat?: number | null
          centroid_lng?: number | null
          created_at?: string
          data_status?: string
          district?: number | null
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
          section_type?: string | null
          source?: string | null
          women?: number
        }
        Update: {
          centroid_lat?: number | null
          centroid_lng?: number | null
          created_at?: string
          data_status?: string
          district?: number | null
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
          section_type?: string | null
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
      topics: {
        Row: {
          created_at: string
          first_seen_at: string
          id: string
          last_seen_at: string
          mention_count: number
          name: string
          org_id: string
          slug: string
        }
        Insert: {
          created_at?: string
          first_seen_at?: string
          id?: string
          last_seen_at?: string
          mention_count?: number
          name: string
          org_id: string
          slug: string
        }
        Update: {
          created_at?: string
          first_seen_at?: string
          id?: string
          last_seen_at?: string
          mention_count?: number
          name?: string
          org_id?: string
          slug?: string
        }
        Relationships: [
          {
            foreignKeyName: "topics_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      user_roles: {
        Row: {
          created_at: string
          granted_by: string | null
          id: string
          org_id: string | null
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          created_at?: string
          granted_by?: string | null
          id?: string
          org_id?: string | null
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          created_at?: string
          granted_by?: string | null
          id?: string
          org_id?: string | null
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_roles_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
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
          url_hash: string | null
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
          url_hash?: string | null
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
          url_hash?: string | null
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
          country: string
          created_at: string
          created_by: string | null
          id: string
          language: string
          last_error: string | null
          last_run_at: string | null
          last_run_status: string | null
          last_started_at: string | null
          mention_count: number
          name: string
          org_id: string
          query: string
          subject_type: string
        }
        Insert: {
          active?: boolean
          country?: string
          created_at?: string
          created_by?: string | null
          id?: string
          language?: string
          last_error?: string | null
          last_run_at?: string | null
          last_run_status?: string | null
          last_started_at?: string | null
          mention_count?: number
          name: string
          org_id: string
          query: string
          subject_type?: string
        }
        Update: {
          active?: boolean
          country?: string
          created_at?: string
          created_by?: string | null
          id?: string
          language?: string
          last_error?: string | null
          last_run_at?: string | null
          last_run_status?: string | null
          last_started_at?: string | null
          mention_count?: number
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
      contact_consent_status: {
        Row: {
          active: boolean | null
          consent_type: string | null
          contact_id: string | null
          granted_at: string | null
          method: string | null
          org_id: string | null
          revoked_at: string | null
        }
        Relationships: [
          {
            foreignKeyName: "contact_consents_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "contacts"
            referencedColumns: ["id"]
          },
        ]
      }
      territorial_units_detailed: {
        Row: {
          adults_18_plus: number | null
          centroid_lat: number | null
          centroid_lng: number | null
          created_at: string | null
          data_status: string | null
          demographics_source: string | null
          demographics_year: number | null
          district: number | null
          gender_other: number | null
          geometry: Json | null
          geometry_type: string | null
          has_demographics: boolean | null
          has_geometry: boolean | null
          households: number | null
          id: string | null
          localidad: string | null
          men: number | null
          municipio: string | null
          org_id: string | null
          pop_0_17: number | null
          pop_18_24: number | null
          pop_25_59: number | null
          pop_60_plus: number | null
          population: number | null
          section_code: string | null
          section_type: string | null
          women: number | null
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
      territorial_units_summary: {
        Row: {
          adults_18_plus: number | null
          centroid_lat: number | null
          centroid_lng: number | null
          created_at: string | null
          data_status: string | null
          demographics_source: string | null
          demographics_year: number | null
          district: number | null
          gender_other: number | null
          has_demographics: boolean | null
          has_geometry: boolean | null
          households: number | null
          id: string | null
          localidad: string | null
          men: number | null
          municipio: string | null
          org_id: string | null
          pop_0_17: number | null
          pop_18_24: number | null
          pop_25_59: number | null
          pop_60_plus: number | null
          population: number | null
          section_code: string | null
          section_type: string | null
          women: number | null
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
    }
    Functions: {
      can_admin: { Args: never; Returns: boolean }
      can_analyze: { Args: never; Returns: boolean }
      can_write: { Args: never; Returns: boolean }
      create_monitor: {
        Args: { _name: string; _query: string; _subject_type?: string }
        Returns: string
      }
      create_organization: {
        Args: { _name: string; _slug: string }
        Returns: string
      }
      current_org: { Args: never; Returns: string }
      has_org_role: {
        Args: { _roles: Database["public"]["Enums"]["app_role"][] }
        Returns: boolean
      }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      is_super_admin: { Args: never; Returns: boolean }
      record_consent: {
        Args: {
          _consent_type: string
          _contact_id: string
          _granted: boolean
          _method?: string
          _notes?: string
        }
        Returns: string
      }
      upsert_territorial_unit: {
        Args: {
          _data_status?: string
          _demographics: Json
          _district?: number
          _geometry: Json
          _localidad: string
          _municipio: string
          _section_code: string
          _section_type?: string
          _source: string
          _year: number
        }
        Returns: string
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
  graphql_public: {
    Enums: {},
  },
  public: {
    Enums: {
      app_role: ["SUPER_ADMIN", "ADMIN", "ANALYST", "VIEWER"],
      sentiment_label: ["positive", "neutral", "negative"],
    },
  },
} as const
