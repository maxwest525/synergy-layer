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
      activity_events: {
        Row: {
          actor_id: string | null
          actor_kind: string
          id: string
          occurred_at: string
          payload: Json
          subject_id: string | null
          subject_kind: string | null
          summary: string
          tenant_id: string | null
          verb: string
        }
        Insert: {
          actor_id?: string | null
          actor_kind?: string
          id?: string
          occurred_at?: string
          payload?: Json
          subject_id?: string | null
          subject_kind?: string | null
          summary: string
          tenant_id?: string | null
          verb: string
        }
        Update: {
          actor_id?: string | null
          actor_kind?: string
          id?: string
          occurred_at?: string
          payload?: Json
          subject_id?: string | null
          subject_kind?: string | null
          summary?: string
          tenant_id?: string | null
          verb?: string
        }
        Relationships: [
          {
            foreignKeyName: "activity_events_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      ad_advertiser_candidates: {
        Row: {
          ad_funded_by: string | null
          advertiser_id: string
          advertiser_name: string | null
          created_at: string
          evidence: Json
          id: string
          match_confidence: number | null
          query_text: string
          review_state: string
          reviewed_at: string | null
          reviewed_by: string | null
          source_url: string | null
          tenant_id: string
          watchlist_id: string | null
        }
        Insert: {
          ad_funded_by?: string | null
          advertiser_id: string
          advertiser_name?: string | null
          created_at?: string
          evidence?: Json
          id?: string
          match_confidence?: number | null
          query_text: string
          review_state?: string
          reviewed_at?: string | null
          reviewed_by?: string | null
          source_url?: string | null
          tenant_id: string
          watchlist_id?: string | null
        }
        Update: {
          ad_funded_by?: string | null
          advertiser_id?: string
          advertiser_name?: string | null
          created_at?: string
          evidence?: Json
          id?: string
          match_confidence?: number | null
          query_text?: string
          review_state?: string
          reviewed_at?: string | null
          reviewed_by?: string | null
          source_url?: string | null
          tenant_id?: string
          watchlist_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "ad_advertiser_candidates_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ad_advertiser_candidates_watchlist_id_fkey"
            columns: ["watchlist_id"]
            isOneToOne: false
            referencedRelation: "ad_vendor_watchlist"
            referencedColumns: ["id"]
          },
        ]
      }
      ad_advertisers: {
        Row: {
          ad_funded_by: string | null
          advertiser_id: string
          advertiser_name: string | null
          confirmed_at: string | null
          confirmed_by: string | null
          created_at: string
          id: string
          is_verified: boolean
          source_url: string | null
          tenant_id: string
          updated_at: string
          vendor_domain: string | null
        }
        Insert: {
          ad_funded_by?: string | null
          advertiser_id: string
          advertiser_name?: string | null
          confirmed_at?: string | null
          confirmed_by?: string | null
          created_at?: string
          id?: string
          is_verified?: boolean
          source_url?: string | null
          tenant_id: string
          updated_at?: string
          vendor_domain?: string | null
        }
        Update: {
          ad_funded_by?: string | null
          advertiser_id?: string
          advertiser_name?: string | null
          confirmed_at?: string | null
          confirmed_by?: string | null
          created_at?: string
          id?: string
          is_verified?: boolean
          source_url?: string | null
          tenant_id?: string
          updated_at?: string
          vendor_domain?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "ad_advertisers_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      ad_creative_families: {
        Row: {
          advertiser_fk: string | null
          family_key: string
          first_detected_at: string
          id: string
          label: string | null
          last_detected_at: string
          member_count: number
          member_creative_ids: string[]
          representative_creative_fk: string | null
          retired_at: string | null
          similarity_method: string
          tenant_id: string
        }
        Insert: {
          advertiser_fk?: string | null
          family_key: string
          first_detected_at?: string
          id?: string
          label?: string | null
          last_detected_at?: string
          member_count?: number
          member_creative_ids?: string[]
          representative_creative_fk?: string | null
          retired_at?: string | null
          similarity_method?: string
          tenant_id: string
        }
        Update: {
          advertiser_fk?: string | null
          family_key?: string
          first_detected_at?: string
          id?: string
          label?: string | null
          last_detected_at?: string
          member_count?: number
          member_creative_ids?: string[]
          representative_creative_fk?: string | null
          retired_at?: string | null
          similarity_method?: string
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "ad_creative_families_advertiser_fk_fkey"
            columns: ["advertiser_fk"]
            isOneToOne: false
            referencedRelation: "ad_advertisers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ad_creative_families_representative_creative_fk_fkey"
            columns: ["representative_creative_fk"]
            isOneToOne: false
            referencedRelation: "ad_creatives"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ad_creative_families_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      ad_creatives: {
        Row: {
          ad_creative_id: string
          advertiser_fk: string
          call_to_action: string | null
          content_checksum: string
          family_key: string | null
          first_detected_at: string
          first_shown: string | null
          format: string | null
          headline: string | null
          id: string
          image_ref: string | null
          last_detected_at: string
          last_shown: string | null
          link: string | null
          long_headline: string | null
          messaging: Json
          raw_payload: Json
          regions: Json
          retired_at: string | null
          retrieved_at: string
          sitelinks: Json
          snippet: string | null
          source_url: string | null
          target_domain: string | null
          tenant_id: string
          total_days_shown: number | null
          video_ref: string | null
        }
        Insert: {
          ad_creative_id: string
          advertiser_fk: string
          call_to_action?: string | null
          content_checksum: string
          family_key?: string | null
          first_detected_at?: string
          first_shown?: string | null
          format?: string | null
          headline?: string | null
          id?: string
          image_ref?: string | null
          last_detected_at?: string
          last_shown?: string | null
          link?: string | null
          long_headline?: string | null
          messaging?: Json
          raw_payload?: Json
          regions?: Json
          retired_at?: string | null
          retrieved_at?: string
          sitelinks?: Json
          snippet?: string | null
          source_url?: string | null
          target_domain?: string | null
          tenant_id: string
          total_days_shown?: number | null
          video_ref?: string | null
        }
        Update: {
          ad_creative_id?: string
          advertiser_fk?: string
          call_to_action?: string | null
          content_checksum?: string
          family_key?: string | null
          first_detected_at?: string
          first_shown?: string | null
          format?: string | null
          headline?: string | null
          id?: string
          image_ref?: string | null
          last_detected_at?: string
          last_shown?: string | null
          link?: string | null
          long_headline?: string | null
          messaging?: Json
          raw_payload?: Json
          regions?: Json
          retired_at?: string | null
          retrieved_at?: string
          sitelinks?: Json
          snippet?: string | null
          source_url?: string | null
          target_domain?: string | null
          tenant_id?: string
          total_days_shown?: number | null
          video_ref?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "ad_creatives_advertiser_fk_fkey"
            columns: ["advertiser_fk"]
            isOneToOne: false
            referencedRelation: "ad_advertisers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ad_creatives_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      ad_destination_pages: {
        Row: {
          creative_fk: string | null
          dom_hash: string | null
          fetch_error: string | null
          fetched_at: string
          final_url: string | null
          id: string
          observations: Json
          redirect_chain: Json
          tenant_id: string
          url: string
        }
        Insert: {
          creative_fk?: string | null
          dom_hash?: string | null
          fetch_error?: string | null
          fetched_at?: string
          final_url?: string | null
          id?: string
          observations?: Json
          redirect_chain?: Json
          tenant_id: string
          url: string
        }
        Update: {
          creative_fk?: string | null
          dom_hash?: string | null
          fetch_error?: string | null
          fetched_at?: string
          final_url?: string | null
          id?: string
          observations?: Json
          redirect_chain?: Json
          tenant_id?: string
          url?: string
        }
        Relationships: [
          {
            foreignKeyName: "ad_destination_pages_creative_fk_fkey"
            columns: ["creative_fk"]
            isOneToOne: false
            referencedRelation: "ad_creatives"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ad_destination_pages_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      ad_live_serp_observations: {
        Row: {
          ad_count: number
          ads_payload: Json
          cost_usd: number
          device: string
          gl: string
          hl: string
          id: string
          keyword: string
          location: string | null
          observed_at: string
          reporting_date: string
          request_fingerprint: string
          source_url: string | null
          tenant_id: string
        }
        Insert: {
          ad_count?: number
          ads_payload?: Json
          cost_usd?: number
          device?: string
          gl?: string
          hl?: string
          id?: string
          keyword: string
          location?: string | null
          observed_at?: string
          reporting_date?: string
          request_fingerprint: string
          source_url?: string | null
          tenant_id: string
        }
        Update: {
          ad_count?: number
          ads_payload?: Json
          cost_usd?: number
          device?: string
          gl?: string
          hl?: string
          id?: string
          keyword?: string
          location?: string | null
          observed_at?: string
          reporting_date?: string
          request_fingerprint?: string
          source_url?: string | null
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "ad_live_serp_observations_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      ad_vendor_advertisers: {
        Row: {
          advertiser_fk: string
          candidate_id: string | null
          created_at: string
          id: string
          linked_at: string
          linked_by: string | null
          tenant_id: string
          watchlist_id: string
        }
        Insert: {
          advertiser_fk: string
          candidate_id?: string | null
          created_at?: string
          id?: string
          linked_at?: string
          linked_by?: string | null
          tenant_id: string
          watchlist_id: string
        }
        Update: {
          advertiser_fk?: string
          candidate_id?: string | null
          created_at?: string
          id?: string
          linked_at?: string
          linked_by?: string | null
          tenant_id?: string
          watchlist_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "ad_vendor_advertisers_advertiser_fk_fkey"
            columns: ["advertiser_fk"]
            isOneToOne: false
            referencedRelation: "ad_advertisers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ad_vendor_advertisers_candidate_id_fkey"
            columns: ["candidate_id"]
            isOneToOne: false
            referencedRelation: "ad_advertiser_candidates"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ad_vendor_advertisers_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ad_vendor_advertisers_watchlist_id_fkey"
            columns: ["watchlist_id"]
            isOneToOne: false
            referencedRelation: "ad_vendor_watchlist"
            referencedColumns: ["id"]
          },
        ]
      }
      ad_vendor_watchlist: {
        Row: {
          active: boolean
          created_at: string
          domain: string
          id: string
          label: string | null
          note: string | null
          resolution_state: string
          tenant_id: string
        }
        Insert: {
          active?: boolean
          created_at?: string
          domain: string
          id?: string
          label?: string | null
          note?: string | null
          resolution_state?: string
          tenant_id: string
        }
        Update: {
          active?: boolean
          created_at?: string
          domain?: string
          id?: string
          label?: string | null
          note?: string | null
          resolution_state?: string
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "ad_vendor_watchlist_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      agent_capabilities: {
        Row: {
          agent_id: string
          capability_id: string
          grant_scope: string
          id: string
        }
        Insert: {
          agent_id: string
          capability_id: string
          grant_scope?: string
          id?: string
        }
        Update: {
          agent_id?: string
          capability_id?: string
          grant_scope?: string
          id?: string
        }
        Relationships: [
          {
            foreignKeyName: "agent_capabilities_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "agents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agent_capabilities_capability_id_fkey"
            columns: ["capability_id"]
            isOneToOne: false
            referencedRelation: "capabilities"
            referencedColumns: ["id"]
          },
        ]
      }
      agent_knowledge: {
        Row: {
          access: string
          agent_id: string
          collection_id: string
          id: string
        }
        Insert: {
          access?: string
          agent_id: string
          collection_id: string
          id?: string
        }
        Update: {
          access?: string
          agent_id?: string
          collection_id?: string
          id?: string
        }
        Relationships: [
          {
            foreignKeyName: "agent_knowledge_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "agents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agent_knowledge_collection_id_fkey"
            columns: ["collection_id"]
            isOneToOne: false
            referencedRelation: "knowledge_collections"
            referencedColumns: ["id"]
          },
        ]
      }
      agents: {
        Row: {
          assigned_workflow_id: string | null
          created_at: string
          current_objective: string | null
          current_task: string | null
          description: string | null
          health: Database["public"]["Enums"]["health_state"]
          id: string
          key: string
          last_result: Json | null
          last_run_at: string | null
          memory_scope: Database["public"]["Enums"]["memory_scope"]
          metadata: Json
          model: string | null
          name: string
          permissions: Json
          purpose: string | null
          status: Database["public"]["Enums"]["entity_status"]
          updated_at: string
        }
        Insert: {
          assigned_workflow_id?: string | null
          created_at?: string
          current_objective?: string | null
          current_task?: string | null
          description?: string | null
          health?: Database["public"]["Enums"]["health_state"]
          id?: string
          key: string
          last_result?: Json | null
          last_run_at?: string | null
          memory_scope?: Database["public"]["Enums"]["memory_scope"]
          metadata?: Json
          model?: string | null
          name: string
          permissions?: Json
          purpose?: string | null
          status?: Database["public"]["Enums"]["entity_status"]
          updated_at?: string
        }
        Update: {
          assigned_workflow_id?: string | null
          created_at?: string
          current_objective?: string | null
          current_task?: string | null
          description?: string | null
          health?: Database["public"]["Enums"]["health_state"]
          id?: string
          key?: string
          last_result?: Json | null
          last_run_at?: string | null
          memory_scope?: Database["public"]["Enums"]["memory_scope"]
          metadata?: Json
          model?: string | null
          name?: string
          permissions?: Json
          purpose?: string | null
          status?: Database["public"]["Enums"]["entity_status"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "agents_assigned_workflow_id_fkey"
            columns: ["assigned_workflow_id"]
            isOneToOne: false
            referencedRelation: "workflows"
            referencedColumns: ["id"]
          },
        ]
      }
      assets: {
        Row: {
          config: Json
          created_at: string
          description: string | null
          external_ref: string | null
          health: Database["public"]["Enums"]["health_state"]
          id: string
          kind: Database["public"]["Enums"]["asset_kind"]
          metadata: Json
          name: string
          owner_label: string | null
          status: Database["public"]["Enums"]["entity_status"]
          tenant_id: string
          updated_at: string
        }
        Insert: {
          config?: Json
          created_at?: string
          description?: string | null
          external_ref?: string | null
          health?: Database["public"]["Enums"]["health_state"]
          id?: string
          kind: Database["public"]["Enums"]["asset_kind"]
          metadata?: Json
          name: string
          owner_label?: string | null
          status?: Database["public"]["Enums"]["entity_status"]
          tenant_id: string
          updated_at?: string
        }
        Update: {
          config?: Json
          created_at?: string
          description?: string | null
          external_ref?: string | null
          health?: Database["public"]["Enums"]["health_state"]
          id?: string
          kind?: Database["public"]["Enums"]["asset_kind"]
          metadata?: Json
          name?: string
          owner_label?: string | null
          status?: Database["public"]["Enums"]["entity_status"]
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "assets_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      authority_actions: {
        Row: {
          action_key: string
          change_request_id: string | null
          created_at: string
          finding_id: string
          id: string
          label: string
          rationale: string
          requires_exact_change: boolean
          state: string
          tenant_id: string
          updated_at: string
        }
        Insert: {
          action_key: string
          change_request_id?: string | null
          created_at?: string
          finding_id: string
          id?: string
          label: string
          rationale: string
          requires_exact_change: boolean
          state?: string
          tenant_id: string
          updated_at?: string
        }
        Update: {
          action_key?: string
          change_request_id?: string | null
          created_at?: string
          finding_id?: string
          id?: string
          label?: string
          rationale?: string
          requires_exact_change?: boolean
          state?: string
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "authority_actions_change_request_id_fkey"
            columns: ["change_request_id"]
            isOneToOne: false
            referencedRelation: "change_requests"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "authority_actions_finding_id_tenant_id_fkey"
            columns: ["finding_id", "tenant_id"]
            isOneToOne: false
            referencedRelation: "authority_findings"
            referencedColumns: ["id", "tenant_id"]
          },
          {
            foreignKeyName: "authority_actions_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      authority_finding_evidence: {
        Row: {
          content_sha256: string
          created_at: string
          finding_id: string
          id: string
          observed_at: string
          payload: Json
          source_kind: string
          source_ref: string
          tenant_id: string
        }
        Insert: {
          content_sha256: string
          created_at?: string
          finding_id: string
          id?: string
          observed_at: string
          payload: Json
          source_kind: string
          source_ref: string
          tenant_id: string
        }
        Update: {
          content_sha256?: string
          created_at?: string
          finding_id?: string
          id?: string
          observed_at?: string
          payload?: Json
          source_kind?: string
          source_ref?: string
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "authority_finding_evidence_finding_id_tenant_id_fkey"
            columns: ["finding_id", "tenant_id"]
            isOneToOne: false
            referencedRelation: "authority_findings"
            referencedColumns: ["id", "tenant_id"]
          },
          {
            foreignKeyName: "authority_finding_evidence_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      authority_findings: {
        Row: {
          confidence: string
          created_at: string
          detected_at: string
          fingerprint: string
          id: string
          knowledge_chunk_ids: string[]
          missing_evidence: string[]
          observed: Json
          query_class: string
          rule_key: string
          severity: string
          target_url: string
          tenant_id: string
        }
        Insert: {
          confidence: string
          created_at?: string
          detected_at?: string
          fingerprint: string
          id?: string
          knowledge_chunk_ids?: string[]
          missing_evidence?: string[]
          observed?: Json
          query_class: string
          rule_key: string
          severity: string
          target_url: string
          tenant_id: string
        }
        Update: {
          confidence?: string
          created_at?: string
          detected_at?: string
          fingerprint?: string
          id?: string
          knowledge_chunk_ids?: string[]
          missing_evidence?: string[]
          observed?: Json
          query_class?: string
          rule_key?: string
          severity?: string
          target_url?: string
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "authority_findings_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      authorized_operators: {
        Row: {
          created_at: string
          email_normalized: string
          granted_at: string
          granted_by: string | null
          id: string
          note: string | null
          revoked_at: string | null
          role: Database["public"]["Enums"]["app_role"]
          tenant_id: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          email_normalized: string
          granted_at?: string
          granted_by?: string | null
          id?: string
          note?: string | null
          revoked_at?: string | null
          role?: Database["public"]["Enums"]["app_role"]
          tenant_id?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          email_normalized?: string
          granted_at?: string
          granted_by?: string | null
          id?: string
          note?: string | null
          revoked_at?: string | null
          role?: Database["public"]["Enums"]["app_role"]
          tenant_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "authorized_operators_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      automation_jobs: {
        Row: {
          created_at: string
          id: string
          key: string
          last_created_count: number
          last_error: string | null
          last_run_at: string | null
          last_state: string | null
          lease_until: string | null
          paused: boolean
          paused_at: string | null
          paused_reason: string | null
          run_count: number
          tenant_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          key: string
          last_created_count?: number
          last_error?: string | null
          last_run_at?: string | null
          last_state?: string | null
          lease_until?: string | null
          paused?: boolean
          paused_at?: string | null
          paused_reason?: string | null
          run_count?: number
          tenant_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          key?: string
          last_created_count?: number
          last_error?: string | null
          last_run_at?: string | null
          last_state?: string | null
          lease_until?: string | null
          paused?: boolean
          paused_at?: string | null
          paused_reason?: string | null
          run_count?: number
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "automation_jobs_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      capabilities: {
        Row: {
          auth_kind: string | null
          category: string | null
          config: Json
          created_at: string
          description: string | null
          health: Database["public"]["Enums"]["health_state"]
          id: string
          integration_state: string
          key: string
          kind: Database["public"]["Enums"]["capability_kind"]
          last_run_at: string | null
          metadata: Json
          name: string
          operations: Json
          status: Database["public"]["Enums"]["entity_status"]
          updated_at: string
        }
        Insert: {
          auth_kind?: string | null
          category?: string | null
          config?: Json
          created_at?: string
          description?: string | null
          health?: Database["public"]["Enums"]["health_state"]
          id?: string
          integration_state?: string
          key: string
          kind: Database["public"]["Enums"]["capability_kind"]
          last_run_at?: string | null
          metadata?: Json
          name: string
          operations?: Json
          status?: Database["public"]["Enums"]["entity_status"]
          updated_at?: string
        }
        Update: {
          auth_kind?: string | null
          category?: string | null
          config?: Json
          created_at?: string
          description?: string | null
          health?: Database["public"]["Enums"]["health_state"]
          id?: string
          integration_state?: string
          key?: string
          kind?: Database["public"]["Enums"]["capability_kind"]
          last_run_at?: string | null
          metadata?: Json
          name?: string
          operations?: Json
          status?: Database["public"]["Enums"]["entity_status"]
          updated_at?: string
        }
        Relationships: []
      }
      capability_dependencies: {
        Row: {
          capability_id: string
          depends_on_capability_id: string
          id: string
        }
        Insert: {
          capability_id: string
          depends_on_capability_id: string
          id?: string
        }
        Update: {
          capability_id?: string
          depends_on_capability_id?: string
          id?: string
        }
        Relationships: [
          {
            foreignKeyName: "capability_dependencies_capability_id_fkey"
            columns: ["capability_id"]
            isOneToOne: false
            referencedRelation: "capabilities"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "capability_dependencies_depends_on_capability_id_fkey"
            columns: ["depends_on_capability_id"]
            isOneToOne: false
            referencedRelation: "capabilities"
            referencedColumns: ["id"]
          },
        ]
      }
      change_measurement_cycles: {
        Row: {
          approval_snapshot: Json
          approved_at: string
          baseline_frozen_at: string
          change_request_id: string
          created_at: string
          gsc_property: string | null
          id: string
          live_at: string | null
          target_url: string
          tenant_id: string
        }
        Insert: {
          approval_snapshot: Json
          approved_at: string
          baseline_frozen_at?: string
          change_request_id: string
          created_at?: string
          gsc_property?: string | null
          id?: string
          live_at?: string | null
          target_url: string
          tenant_id: string
        }
        Update: {
          approval_snapshot?: Json
          approved_at?: string
          baseline_frozen_at?: string
          change_request_id?: string
          created_at?: string
          gsc_property?: string | null
          id?: string
          live_at?: string | null
          target_url?: string
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "change_measurement_cycles_change_tenant_fkey"
            columns: ["change_request_id", "tenant_id"]
            isOneToOne: false
            referencedRelation: "change_requests"
            referencedColumns: ["id", "tenant_id"]
          },
          {
            foreignKeyName: "change_measurement_cycles_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      change_measurement_observations: {
        Row: {
          captured_at: string
          cycle_id: string
          id: string
          payload: Json
          provenance: Json
          provider: string
          revision_number: number
          source_refs: Json
          source_role: string
          status: string
          supersedes_id: string | null
          tenant_id: string
          window_id: string
        }
        Insert: {
          captured_at?: string
          cycle_id: string
          id?: string
          payload?: Json
          provenance?: Json
          provider: string
          revision_number: number
          source_refs?: Json
          source_role: string
          status: string
          supersedes_id?: string | null
          tenant_id: string
          window_id: string
        }
        Update: {
          captured_at?: string
          cycle_id?: string
          id?: string
          payload?: Json
          provenance?: Json
          provider?: string
          revision_number?: number
          source_refs?: Json
          source_role?: string
          status?: string
          supersedes_id?: string | null
          tenant_id?: string
          window_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "change_measurement_observations_cycle_tenant_fkey"
            columns: ["cycle_id", "tenant_id"]
            isOneToOne: false
            referencedRelation: "change_measurement_cycles"
            referencedColumns: ["id", "tenant_id"]
          },
          {
            foreignKeyName: "change_measurement_observations_supersedes_id_fkey"
            columns: ["supersedes_id"]
            isOneToOne: false
            referencedRelation: "change_measurement_observations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "change_measurement_observations_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "change_measurement_observations_window_tenant_fkey"
            columns: ["window_id", "tenant_id"]
            isOneToOne: false
            referencedRelation: "change_measurement_windows"
            referencedColumns: ["id", "tenant_id"]
          },
        ]
      }
      change_measurement_revisions: {
        Row: {
          actor_id: string | null
          created_at: string
          cycle_id: string
          detail: Json
          id: string
          kind: string
          summary: string
          tenant_id: string
          window_id: string | null
        }
        Insert: {
          actor_id?: string | null
          created_at?: string
          cycle_id: string
          detail?: Json
          id?: string
          kind: string
          summary: string
          tenant_id: string
          window_id?: string | null
        }
        Update: {
          actor_id?: string | null
          created_at?: string
          cycle_id?: string
          detail?: Json
          id?: string
          kind?: string
          summary?: string
          tenant_id?: string
          window_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "change_measurement_revisions_cycle_tenant_fkey"
            columns: ["cycle_id", "tenant_id"]
            isOneToOne: false
            referencedRelation: "change_measurement_cycles"
            referencedColumns: ["id", "tenant_id"]
          },
          {
            foreignKeyName: "change_measurement_revisions_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "change_measurement_revisions_window_tenant_fkey"
            columns: ["window_id", "tenant_id"]
            isOneToOne: false
            referencedRelation: "change_measurement_windows"
            referencedColumns: ["id", "tenant_id"]
          },
        ]
      }
      change_measurement_windows: {
        Row: {
          anchor_kind: string
          available_after_pt: string
          created_at: string
          cycle_id: string
          id: string
          period_end_pt: string
          period_start_pt: string
          tenant_id: string
          window_days: number
        }
        Insert: {
          anchor_kind: string
          available_after_pt: string
          created_at?: string
          cycle_id: string
          id?: string
          period_end_pt: string
          period_start_pt: string
          tenant_id: string
          window_days: number
        }
        Update: {
          anchor_kind?: string
          available_after_pt?: string
          created_at?: string
          cycle_id?: string
          id?: string
          period_end_pt?: string
          period_start_pt?: string
          tenant_id?: string
          window_days?: number
        }
        Relationships: [
          {
            foreignKeyName: "change_measurement_windows_cycle_tenant_fkey"
            columns: ["cycle_id", "tenant_id"]
            isOneToOne: false
            referencedRelation: "change_measurement_cycles"
            referencedColumns: ["id", "tenant_id"]
          },
          {
            foreignKeyName: "change_measurement_windows_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      change_request_executions: {
        Row: {
          actor_id: string | null
          change_request_id: string
          commit_sha: string | null
          commit_url: string | null
          created_at: string
          detail: Json
          error: string | null
          id: string
          kind: string
          status: string
          tenant_id: string
        }
        Insert: {
          actor_id?: string | null
          change_request_id: string
          commit_sha?: string | null
          commit_url?: string | null
          created_at?: string
          detail?: Json
          error?: string | null
          id?: string
          kind: string
          status: string
          tenant_id: string
        }
        Update: {
          actor_id?: string | null
          change_request_id?: string
          commit_sha?: string | null
          commit_url?: string | null
          created_at?: string
          detail?: Json
          error?: string | null
          id?: string
          kind?: string
          status?: string
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "change_request_executions_change_request_id_fkey"
            columns: ["change_request_id"]
            isOneToOne: false
            referencedRelation: "change_requests"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "change_request_executions_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      change_request_versions: {
        Row: {
          change_request_id: string
          changes: Json
          created_at: string
          created_by: string
          evidence: Json
          evidence_limitations: string
          evidence_summary: string
          generation_context: Json
          id: string
          rationale: string
          revision_kind: string
          risk_note: string | null
          source_revision_before: string
          tenant_id: string
          version_number: number
        }
        Insert: {
          change_request_id: string
          changes: Json
          created_at?: string
          created_by: string
          evidence: Json
          evidence_limitations: string
          evidence_summary: string
          generation_context?: Json
          id?: string
          rationale: string
          revision_kind: string
          risk_note?: string | null
          source_revision_before: string
          tenant_id: string
          version_number: number
        }
        Update: {
          change_request_id?: string
          changes?: Json
          created_at?: string
          created_by?: string
          evidence?: Json
          evidence_limitations?: string
          evidence_summary?: string
          generation_context?: Json
          id?: string
          rationale?: string
          revision_kind?: string
          risk_note?: string | null
          source_revision_before?: string
          tenant_id?: string
          version_number?: number
        }
        Relationships: [
          {
            foreignKeyName: "change_request_versions_change_request_id_fkey"
            columns: ["change_request_id"]
            isOneToOne: false
            referencedRelation: "change_requests"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "change_request_versions_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      change_requests: {
        Row: {
          applied_at: string | null
          applied_by: string | null
          applied_notes: string | null
          approved_at: string | null
          approved_by: string | null
          asset_id: string | null
          changes: Json
          created_at: string
          evidence: Json
          evidence_limitations: string
          evidence_summary: string
          generation_context: Json
          id: string
          idempotency_key: string
          implementation_method: string
          inbox_item_id: string | null
          live_at: string | null
          proposal_type: string
          proposed_at: string
          published_proof_at: string | null
          published_proof_notes: string | null
          rationale: string
          recommendation_id: string | null
          rejected_at: string | null
          rejected_by: string | null
          revision_count: number
          risk_note: string | null
          rollback_notes: string | null
          rolled_back_at: string | null
          rolled_back_by: string | null
          source_branch: string | null
          source_commit_sha: string | null
          source_commit_url: string | null
          source_committed_at: string | null
          source_file: string | null
          source_project_id: string | null
          source_project_name: string | null
          source_project_url: string | null
          source_repo: string | null
          source_revision_after: string | null
          source_revision_before: string | null
          state: string
          target_url: string
          tenant_id: string
          title: string
          updated_at: string
          verification_baseline: Json
          verification_followup: string | null
          verification_notes: string | null
          verified_at: string | null
          verified_by: string | null
        }
        Insert: {
          applied_at?: string | null
          applied_by?: string | null
          applied_notes?: string | null
          approved_at?: string | null
          approved_by?: string | null
          asset_id?: string | null
          changes?: Json
          created_at?: string
          evidence?: Json
          evidence_limitations?: string
          evidence_summary?: string
          generation_context?: Json
          id?: string
          idempotency_key: string
          implementation_method?: string
          inbox_item_id?: string | null
          live_at?: string | null
          proposal_type?: string
          proposed_at?: string
          published_proof_at?: string | null
          published_proof_notes?: string | null
          rationale: string
          recommendation_id?: string | null
          rejected_at?: string | null
          rejected_by?: string | null
          revision_count?: number
          risk_note?: string | null
          rollback_notes?: string | null
          rolled_back_at?: string | null
          rolled_back_by?: string | null
          source_branch?: string | null
          source_commit_sha?: string | null
          source_commit_url?: string | null
          source_committed_at?: string | null
          source_file?: string | null
          source_project_id?: string | null
          source_project_name?: string | null
          source_project_url?: string | null
          source_repo?: string | null
          source_revision_after?: string | null
          source_revision_before?: string | null
          state?: string
          target_url: string
          tenant_id: string
          title: string
          updated_at?: string
          verification_baseline?: Json
          verification_followup?: string | null
          verification_notes?: string | null
          verified_at?: string | null
          verified_by?: string | null
        }
        Update: {
          applied_at?: string | null
          applied_by?: string | null
          applied_notes?: string | null
          approved_at?: string | null
          approved_by?: string | null
          asset_id?: string | null
          changes?: Json
          created_at?: string
          evidence?: Json
          evidence_limitations?: string
          evidence_summary?: string
          generation_context?: Json
          id?: string
          idempotency_key?: string
          implementation_method?: string
          inbox_item_id?: string | null
          live_at?: string | null
          proposal_type?: string
          proposed_at?: string
          published_proof_at?: string | null
          published_proof_notes?: string | null
          rationale?: string
          recommendation_id?: string | null
          rejected_at?: string | null
          rejected_by?: string | null
          revision_count?: number
          risk_note?: string | null
          rollback_notes?: string | null
          rolled_back_at?: string | null
          rolled_back_by?: string | null
          source_branch?: string | null
          source_commit_sha?: string | null
          source_commit_url?: string | null
          source_committed_at?: string | null
          source_file?: string | null
          source_project_id?: string | null
          source_project_name?: string | null
          source_project_url?: string | null
          source_repo?: string | null
          source_revision_after?: string | null
          source_revision_before?: string | null
          state?: string
          target_url?: string
          tenant_id?: string
          title?: string
          updated_at?: string
          verification_baseline?: Json
          verification_followup?: string | null
          verification_notes?: string | null
          verified_at?: string | null
          verified_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "change_requests_asset_id_fkey"
            columns: ["asset_id"]
            isOneToOne: false
            referencedRelation: "assets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "change_requests_inbox_item_id_fkey"
            columns: ["inbox_item_id"]
            isOneToOne: false
            referencedRelation: "inbox_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "change_requests_recommendation_id_fkey"
            columns: ["recommendation_id"]
            isOneToOne: false
            referencedRelation: "recommendations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "change_requests_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      competitor_candidates: {
        Row: {
          classification_updated_at: string | null
          classification_updated_by: string | null
          company_classification: string | null
          created_at: string
          discovered_at: string
          domain: string
          domain_class: string
          id: string
          metrics: Json
          review_state: string
          reviewed_at: string | null
          reviewed_by: string | null
          seed_domain: string
          snapshot_id: string | null
          source: string
          tenant_id: string
        }
        Insert: {
          classification_updated_at?: string | null
          classification_updated_by?: string | null
          company_classification?: string | null
          created_at?: string
          discovered_at?: string
          domain: string
          domain_class?: string
          id?: string
          metrics?: Json
          review_state?: string
          reviewed_at?: string | null
          reviewed_by?: string | null
          seed_domain: string
          snapshot_id?: string | null
          source: string
          tenant_id: string
        }
        Update: {
          classification_updated_at?: string | null
          classification_updated_by?: string | null
          company_classification?: string | null
          created_at?: string
          discovered_at?: string
          domain?: string
          domain_class?: string
          id?: string
          metrics?: Json
          review_state?: string
          reviewed_at?: string | null
          reviewed_by?: string | null
          seed_domain?: string
          snapshot_id?: string | null
          source?: string
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "competitor_candidates_snapshot_id_fkey"
            columns: ["snapshot_id"]
            isOneToOne: false
            referencedRelation: "dataforseo_snapshots"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "competitor_candidates_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      ai_gateway_budgets: {
        Row: {
          alerts_fired: Json
          ceiling_usd: number
          created_at: string
          hard_stop: boolean
          id: string
          period_month: string
          spent_usd: number
          tenant_id: string
          updated_at: string
        }
        Insert: {
          alerts_fired?: Json
          ceiling_usd?: number
          created_at?: string
          hard_stop?: boolean
          id?: string
          period_month: string
          spent_usd?: number
          tenant_id: string
          updated_at?: string
        }
        Update: {
          alerts_fired?: Json
          ceiling_usd?: number
          created_at?: string
          hard_stop?: boolean
          id?: string
          period_month?: string
          spent_usd?: number
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "ai_gateway_budgets_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      ai_gateway_requests: {
        Row: {
          cost_usd: number
          created_at: string
          id: string
          input_tokens: number
          model: string
          output_tokens: number
          priced: boolean
          surface: string
          tenant_id: string
        }
        Insert: {
          cost_usd?: number
          created_at?: string
          id?: string
          input_tokens?: number
          model: string
          output_tokens?: number
          priced?: boolean
          surface: string
          tenant_id: string
        }
        Update: {
          cost_usd?: number
          created_at?: string
          id?: string
          input_tokens?: number
          model?: string
          output_tokens?: number
          priced?: boolean
          surface?: string
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "ai_gateway_requests_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      dataforseo_budgets: {
        Row: {
          alerts_fired: Json
          ceiling_usd: number
          created_at: string
          hard_stop: boolean
          id: string
          period_month: string
          spent_usd: number
          tenant_id: string
          updated_at: string
        }
        Insert: {
          alerts_fired?: Json
          ceiling_usd?: number
          created_at?: string
          hard_stop?: boolean
          id?: string
          period_month: string
          spent_usd?: number
          tenant_id: string
          updated_at?: string
        }
        Update: {
          alerts_fired?: Json
          ceiling_usd?: number
          created_at?: string
          hard_stop?: boolean
          id?: string
          period_month?: string
          spent_usd?: number
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "dataforseo_budgets_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      dataforseo_requests: {
        Row: {
          capability_key: string
          cost_usd: number
          created_at: string
          duration_ms: number | null
          endpoint: string
          error: string | null
          family: string
          http_status: number | null
          id: string
          mode: string
          outcome: string
          provider_status_code: number | null
          provider_status_message: string | null
          rate_limit: Json
          request_fingerprint: string
          returned_row_count: number
          task_count: number
          tenant_id: string
          workflow_key: string | null
          workflow_run_id: string | null
        }
        Insert: {
          capability_key: string
          cost_usd?: number
          created_at?: string
          duration_ms?: number | null
          endpoint: string
          error?: string | null
          family: string
          http_status?: number | null
          id?: string
          mode?: string
          outcome?: string
          provider_status_code?: number | null
          provider_status_message?: string | null
          rate_limit?: Json
          request_fingerprint: string
          returned_row_count?: number
          task_count?: number
          tenant_id: string
          workflow_key?: string | null
          workflow_run_id?: string | null
        }
        Update: {
          capability_key?: string
          cost_usd?: number
          created_at?: string
          duration_ms?: number | null
          endpoint?: string
          error?: string | null
          family?: string
          http_status?: number | null
          id?: string
          mode?: string
          outcome?: string
          provider_status_code?: number | null
          provider_status_message?: string | null
          rate_limit?: Json
          request_fingerprint?: string
          returned_row_count?: number
          task_count?: number
          tenant_id?: string
          workflow_key?: string | null
          workflow_run_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "dataforseo_requests_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "dataforseo_requests_workflow_run_id_fkey"
            columns: ["workflow_run_id"]
            isOneToOne: false
            referencedRelation: "workflow_runs"
            referencedColumns: ["id"]
          },
        ]
      }
      dataforseo_serp_tasks: {
        Row: {
          created_at: string
          endpoint: string
          error: string | null
          id: string
          keyword: string
          language_code: string | null
          location_code: number | null
          postback_token_hash: string | null
          posted_at: string
          priority: string
          provider_task_id: string
          received_at: string | null
          request_fingerprint: string
          request_params: Json
          snapshot_id: string | null
          state: string
          tag: string
          tenant_id: string
        }
        Insert: {
          created_at?: string
          endpoint: string
          error?: string | null
          id?: string
          keyword: string
          language_code?: string | null
          location_code?: number | null
          postback_token_hash?: string | null
          posted_at?: string
          priority?: string
          provider_task_id: string
          received_at?: string | null
          request_fingerprint: string
          request_params?: Json
          snapshot_id?: string | null
          state?: string
          tag: string
          tenant_id: string
        }
        Update: {
          created_at?: string
          endpoint?: string
          error?: string | null
          id?: string
          keyword?: string
          language_code?: string | null
          location_code?: number | null
          postback_token_hash?: string | null
          posted_at?: string
          priority?: string
          provider_task_id?: string
          received_at?: string | null
          request_fingerprint?: string
          request_params?: Json
          snapshot_id?: string | null
          state?: string
          tag?: string
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "dataforseo_serp_tasks_snapshot_id_fkey"
            columns: ["snapshot_id"]
            isOneToOne: false
            referencedRelation: "dataforseo_snapshots"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "dataforseo_serp_tasks_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      dataforseo_snapshots: {
        Row: {
          api_version: string
          capability_key: string
          checksum: string
          collected_at: string
          created_at: string
          endpoint: string
          family: string
          id: string
          kind: string
          mode: string
          payload: Json
          possibly_truncated: boolean
          provider_cost_usd: number
          provider_meta: Json
          provider_status_code: number | null
          provider_task_id: string | null
          reporting_date: string
          request_fingerprint: string
          request_id: string | null
          request_params: Json
          returned_row_count: number
          target: string
          tenant_id: string
          totals: Json
        }
        Insert: {
          api_version?: string
          capability_key: string
          checksum: string
          collected_at?: string
          created_at?: string
          endpoint: string
          family: string
          id?: string
          kind: string
          mode?: string
          payload?: Json
          possibly_truncated?: boolean
          provider_cost_usd?: number
          provider_meta?: Json
          provider_status_code?: number | null
          provider_task_id?: string | null
          reporting_date: string
          request_fingerprint: string
          request_id?: string | null
          request_params?: Json
          returned_row_count?: number
          target: string
          tenant_id: string
          totals?: Json
        }
        Update: {
          api_version?: string
          capability_key?: string
          checksum?: string
          collected_at?: string
          created_at?: string
          endpoint?: string
          family?: string
          id?: string
          kind?: string
          mode?: string
          payload?: Json
          possibly_truncated?: boolean
          provider_cost_usd?: number
          provider_meta?: Json
          provider_status_code?: number | null
          provider_task_id?: string | null
          reporting_date?: string
          request_fingerprint?: string
          request_id?: string | null
          request_params?: Json
          returned_row_count?: number
          target?: string
          tenant_id?: string
          totals?: Json
        }
        Relationships: [
          {
            foreignKeyName: "dataforseo_snapshots_request_id_fkey"
            columns: ["request_id"]
            isOneToOne: false
            referencedRelation: "dataforseo_requests"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "dataforseo_snapshots_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      domain_ownership_candidates: {
        Row: {
          created_at: string
          domain_a: string
          domain_b: string
          evidence: Json
          id: string
          matched_fields: Json
          review_state: string
          reviewed_at: string | null
          reviewed_by: string | null
          rule: string
          tenant_id: string
        }
        Insert: {
          created_at?: string
          domain_a: string
          domain_b: string
          evidence?: Json
          id?: string
          matched_fields?: Json
          review_state?: string
          reviewed_at?: string | null
          reviewed_by?: string | null
          rule: string
          tenant_id: string
        }
        Update: {
          created_at?: string
          domain_a?: string
          domain_b?: string
          evidence?: Json
          id?: string
          matched_fields?: Json
          review_state?: string
          reviewed_at?: string | null
          reviewed_by?: string | null
          rule?: string
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "domain_ownership_candidates_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      essential_concern_evaluations: {
        Row: {
          concern_id: string
          derived_from: Json
          evaluated_at: string
          id: string
          limitation: string | null
          status: string
          summary: string
          tenant_id: string
        }
        Insert: {
          concern_id: string
          derived_from?: Json
          evaluated_at?: string
          id?: string
          limitation?: string | null
          status: string
          summary: string
          tenant_id: string
        }
        Update: {
          concern_id?: string
          derived_from?: Json
          evaluated_at?: string
          id?: string
          limitation?: string | null
          status?: string
          summary?: string
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "essential_concern_evaluations_concern_id_fkey"
            columns: ["concern_id"]
            isOneToOne: false
            referencedRelation: "essential_concerns"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "essential_concern_evaluations_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      essential_concern_templates: {
        Row: {
          created_at: string
          description: string
          key: string
          phase: string
          sort_order: number
          task: string
        }
        Insert: {
          created_at?: string
          description: string
          key: string
          phase: string
          sort_order?: number
          task: string
        }
        Update: {
          created_at?: string
          description?: string
          key?: string
          phase?: string
          sort_order?: number
          task?: string
        }
        Relationships: []
      }
      essential_concerns: {
        Row: {
          created_at: string
          description: string
          evidence_source: string | null
          id: string
          key: string
          origin: string
          owner_name: string | null
          phase: string
          priority: number
          retired_at: string | null
          sort_order: number
          target_date: string | null
          task: string
          tenant_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          description: string
          evidence_source?: string | null
          id?: string
          key: string
          origin?: string
          owner_name?: string | null
          phase: string
          priority?: number
          retired_at?: string | null
          sort_order?: number
          target_date?: string | null
          task: string
          tenant_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          description?: string
          evidence_source?: string | null
          id?: string
          key?: string
          origin?: string
          owner_name?: string | null
          phase?: string
          priority?: number
          retired_at?: string | null
          sort_order?: number
          target_date?: string | null
          task?: string
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "essential_concerns_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      ga4_observations: {
        Row: {
          created_at: string
          evidence: Json
          id: string
          issue_fingerprint: string
          observation_fingerprint: string
          period_end: string
          period_start: string
          property: string
          recommendation_id: string | null
          rule: string
          snapshot_id: string
          target: string
          tenant_id: string
        }
        Insert: {
          created_at?: string
          evidence?: Json
          id?: string
          issue_fingerprint: string
          observation_fingerprint: string
          period_end: string
          period_start: string
          property: string
          recommendation_id?: string | null
          rule: string
          snapshot_id: string
          target: string
          tenant_id: string
        }
        Update: {
          created_at?: string
          evidence?: Json
          id?: string
          issue_fingerprint?: string
          observation_fingerprint?: string
          period_end?: string
          period_start?: string
          property?: string
          recommendation_id?: string | null
          rule?: string
          snapshot_id?: string
          target?: string
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "ga4_observations_recommendation_id_fkey"
            columns: ["recommendation_id"]
            isOneToOne: false
            referencedRelation: "recommendations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ga4_observations_snapshot_id_fkey"
            columns: ["snapshot_id"]
            isOneToOne: false
            referencedRelation: "ga4_snapshots"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ga4_observations_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      ga4_snapshots: {
        Row: {
          collected_at: string
          end_date: string
          id: string
          metrics: Json
          property: string
          provenance: Json
          quota: Json
          run_id: string
          start_date: string
          tenant_id: string
        }
        Insert: {
          collected_at?: string
          end_date: string
          id?: string
          metrics?: Json
          property: string
          provenance?: Json
          quota?: Json
          run_id: string
          start_date: string
          tenant_id: string
        }
        Update: {
          collected_at?: string
          end_date?: string
          id?: string
          metrics?: Json
          property?: string
          provenance?: Json
          quota?: Json
          run_id?: string
          start_date?: string
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "ga4_snapshots_run_id_fkey"
            columns: ["run_id"]
            isOneToOne: false
            referencedRelation: "measurement_runs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ga4_snapshots_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      google_ads_snapshots: {
        Row: {
          advertising_channel_type: string | null
          campaign_id: string
          campaign_name: string
          campaign_status: string
          clicks: number
          collected_at: string
          conversions: number
          conversions_value: number
          cost_micros: number
          customer_id: string
          id: string
          impressions: number
          segment_date: string
          tenant_id: string
        }
        Insert: {
          advertising_channel_type?: string | null
          campaign_id: string
          campaign_name: string
          campaign_status: string
          clicks?: number
          collected_at?: string
          conversions?: number
          conversions_value?: number
          cost_micros?: number
          customer_id: string
          id?: string
          impressions?: number
          segment_date: string
          tenant_id: string
        }
        Update: {
          advertising_channel_type?: string | null
          campaign_id?: string
          campaign_name?: string
          campaign_status?: string
          clicks?: number
          collected_at?: string
          conversions?: number
          conversions_value?: number
          cost_micros?: number
          customer_id?: string
          id?: string
          impressions?: number
          segment_date?: string
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "google_ads_snapshots_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      inbox_items: {
        Row: {
          actions: Json
          assignee_label: string | null
          cleared_by: string | null
          cleared_from_lane: Database["public"]["Enums"]["inbox_lane"] | null
          created_at: string
          due_at: string | null
          id: string
          lane: Database["public"]["Enums"]["inbox_lane"]
          metadata: Json
          priority: number
          resolved_at: string | null
          source_module: string
          subject_id: string | null
          subject_kind: string | null
          summary: string | null
          tenant_id: string
          title: string
          updated_at: string
        }
        Insert: {
          actions?: Json
          assignee_label?: string | null
          cleared_by?: string | null
          cleared_from_lane?: Database["public"]["Enums"]["inbox_lane"] | null
          created_at?: string
          due_at?: string | null
          id?: string
          lane?: Database["public"]["Enums"]["inbox_lane"]
          metadata?: Json
          priority?: number
          resolved_at?: string | null
          source_module: string
          subject_id?: string | null
          subject_kind?: string | null
          summary?: string | null
          tenant_id: string
          title: string
          updated_at?: string
        }
        Update: {
          actions?: Json
          assignee_label?: string | null
          cleared_by?: string | null
          cleared_from_lane?: Database["public"]["Enums"]["inbox_lane"] | null
          created_at?: string
          due_at?: string | null
          id?: string
          lane?: Database["public"]["Enums"]["inbox_lane"]
          metadata?: Json
          priority?: number
          resolved_at?: string | null
          source_module?: string
          subject_id?: string | null
          subject_kind?: string | null
          summary?: string | null
          tenant_id?: string
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "inbox_items_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      keyword_candidates: {
        Row: {
          created_at: string
          id: string
          keyword: string
          language_code: string
          location_code: number
          metrics: Json
          review_state: string
          reviewed_at: string | null
          reviewed_by: string | null
          seed: string | null
          snapshot_id: string | null
          source: string
          tenant_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          keyword: string
          language_code?: string
          location_code?: number
          metrics?: Json
          review_state?: string
          reviewed_at?: string | null
          reviewed_by?: string | null
          seed?: string | null
          snapshot_id?: string | null
          source: string
          tenant_id: string
        }
        Update: {
          created_at?: string
          id?: string
          keyword?: string
          language_code?: string
          location_code?: number
          metrics?: Json
          review_state?: string
          reviewed_at?: string | null
          reviewed_by?: string | null
          seed?: string | null
          snapshot_id?: string | null
          source?: string
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "keyword_candidates_snapshot_id_fkey"
            columns: ["snapshot_id"]
            isOneToOne: false
            referencedRelation: "dataforseo_snapshots"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "keyword_candidates_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      knowledge_chunks: {
        Row: {
          body: string
          content_sha256: string
          created_at: string
          embedding: string
          heading_path: string[]
          id: string
          metadata: Json
          ordinal: number
          source_version_id: string
          tenant_id: string
          title: string
          token_estimate: number
        }
        Insert: {
          body: string
          content_sha256: string
          created_at?: string
          embedding: string
          heading_path?: string[]
          id?: string
          metadata?: Json
          ordinal: number
          source_version_id: string
          tenant_id: string
          title: string
          token_estimate: number
        }
        Update: {
          body?: string
          content_sha256?: string
          created_at?: string
          embedding?: string
          heading_path?: string[]
          id?: string
          metadata?: Json
          ordinal?: number
          source_version_id?: string
          tenant_id?: string
          title?: string
          token_estimate?: number
        }
        Relationships: [
          {
            foreignKeyName: "knowledge_chunks_source_version_id_fkey"
            columns: ["source_version_id"]
            isOneToOne: false
            referencedRelation: "knowledge_source_versions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "knowledge_chunks_source_version_id_tenant_id_fkey"
            columns: ["source_version_id", "tenant_id"]
            isOneToOne: false
            referencedRelation: "knowledge_source_versions"
            referencedColumns: ["id", "tenant_id"]
          },
          {
            foreignKeyName: "knowledge_chunks_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      knowledge_collections: {
        Row: {
          created_at: string
          description: string | null
          health: Database["public"]["Enums"]["health_state"]
          id: string
          key: string
          kind: Database["public"]["Enums"]["knowledge_kind"]
          metadata: Json
          name: string
          scope: string
          status: Database["public"]["Enums"]["entity_status"]
          tenant_id: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          health?: Database["public"]["Enums"]["health_state"]
          id?: string
          key: string
          kind: Database["public"]["Enums"]["knowledge_kind"]
          metadata?: Json
          name: string
          scope?: string
          status?: Database["public"]["Enums"]["entity_status"]
          tenant_id?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          description?: string | null
          health?: Database["public"]["Enums"]["health_state"]
          id?: string
          key?: string
          kind?: Database["public"]["Enums"]["knowledge_kind"]
          metadata?: Json
          name?: string
          scope?: string
          status?: Database["public"]["Enums"]["entity_status"]
          tenant_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "knowledge_collections_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      knowledge_entries: {
        Row: {
          body: string | null
          collection_id: string
          created_at: string
          embedding_ref: string | null
          id: string
          metadata: Json
          source_ref: string | null
          status: Database["public"]["Enums"]["entity_status"]
          tags: string[]
          tenant_id: string
          title: string
          updated_at: string
        }
        Insert: {
          body?: string | null
          collection_id: string
          created_at?: string
          embedding_ref?: string | null
          id?: string
          metadata?: Json
          source_ref?: string | null
          status?: Database["public"]["Enums"]["entity_status"]
          tags?: string[]
          tenant_id: string
          title: string
          updated_at?: string
        }
        Update: {
          body?: string | null
          collection_id?: string
          created_at?: string
          embedding_ref?: string | null
          id?: string
          metadata?: Json
          source_ref?: string | null
          status?: Database["public"]["Enums"]["entity_status"]
          tags?: string[]
          tenant_id?: string
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "knowledge_entries_collection_id_fkey"
            columns: ["collection_id"]
            isOneToOne: false
            referencedRelation: "knowledge_collections"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "knowledge_entries_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      knowledge_source_versions: {
        Row: {
          activated_at: string | null
          content_sha256: string
          content_text: string
          created_at: string
          deactivated_at: string | null
          embedding_dimensions: number
          embedding_model: string
          id: string
          metadata: Json
          parser_version: string
          source_id: string
          source_size_bytes: number
          status: string
          tenant_id: string
          updated_at: string
          version_label: string
        }
        Insert: {
          activated_at?: string | null
          content_sha256: string
          content_text: string
          created_at?: string
          deactivated_at?: string | null
          embedding_dimensions?: number
          embedding_model?: string
          id?: string
          metadata?: Json
          parser_version: string
          source_id: string
          source_size_bytes: number
          status?: string
          tenant_id: string
          updated_at?: string
          version_label: string
        }
        Update: {
          activated_at?: string | null
          content_sha256?: string
          content_text?: string
          created_at?: string
          deactivated_at?: string | null
          embedding_dimensions?: number
          embedding_model?: string
          id?: string
          metadata?: Json
          parser_version?: string
          source_id?: string
          source_size_bytes?: number
          status?: string
          tenant_id?: string
          updated_at?: string
          version_label?: string
        }
        Relationships: [
          {
            foreignKeyName: "knowledge_source_versions_source_id_fkey"
            columns: ["source_id"]
            isOneToOne: false
            referencedRelation: "knowledge_sources"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "knowledge_source_versions_source_id_tenant_id_fkey"
            columns: ["source_id", "tenant_id"]
            isOneToOne: false
            referencedRelation: "knowledge_sources"
            referencedColumns: ["id", "tenant_id"]
          },
          {
            foreignKeyName: "knowledge_source_versions_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      knowledge_sources: {
        Row: {
          created_at: string
          description: string | null
          id: string
          metadata: Json
          source_ref: string
          source_type: string
          stable_key: string
          status: Database["public"]["Enums"]["entity_status"]
          tenant_id: string
          title: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          id?: string
          metadata?: Json
          source_ref: string
          source_type: string
          stable_key: string
          status?: Database["public"]["Enums"]["entity_status"]
          tenant_id: string
          title: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          description?: string | null
          id?: string
          metadata?: Json
          source_ref?: string
          source_type?: string
          stable_key?: string
          status?: Database["public"]["Enums"]["entity_status"]
          tenant_id?: string
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "knowledge_sources_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      measurement_runs: {
        Row: {
          actor_id: string | null
          cost_usd: number
          created_at: string
          duration_ms: number | null
          error: string | null
          finished_at: string | null
          http_status: number | null
          id: string
          provider: string
          quota: Json
          started_at: string
          status: string
          strategy: string | null
          target: string
          tenant_id: string
        }
        Insert: {
          actor_id?: string | null
          cost_usd?: number
          created_at?: string
          duration_ms?: number | null
          error?: string | null
          finished_at?: string | null
          http_status?: number | null
          id?: string
          provider: string
          quota?: Json
          started_at?: string
          status?: string
          strategy?: string | null
          target: string
          tenant_id: string
        }
        Update: {
          actor_id?: string | null
          cost_usd?: number
          created_at?: string
          duration_ms?: number | null
          error?: string | null
          finished_at?: string | null
          http_status?: number | null
          id?: string
          provider?: string
          quota?: Json
          started_at?: string
          status?: string
          strategy?: string | null
          target?: string
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "measurement_runs_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      openai_ads_connections: {
        Row: {
          allowed_origins: string[]
          bridge_secret_name: string
          canonical_origin: string
          created_at: string
          delivery_mode: string
          enabled: boolean
          id: string
          match_email_sha256: boolean
          match_external_id_sha256: boolean
          match_geo: boolean
          match_ip_address: boolean
          match_user_agent: boolean
          max_delivery_attempts: number
          pixel_id: string
          request_timeout_ms: number
          secret_name: string
          source_project: string
          tenant_id: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          allowed_origins?: string[]
          bridge_secret_name?: string
          canonical_origin: string
          created_at?: string
          delivery_mode?: string
          enabled?: boolean
          id?: string
          match_email_sha256?: boolean
          match_external_id_sha256?: boolean
          match_geo?: boolean
          match_ip_address?: boolean
          match_user_agent?: boolean
          max_delivery_attempts?: number
          pixel_id: string
          request_timeout_ms?: number
          secret_name?: string
          source_project: string
          tenant_id: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          allowed_origins?: string[]
          bridge_secret_name?: string
          canonical_origin?: string
          created_at?: string
          delivery_mode?: string
          enabled?: boolean
          id?: string
          match_email_sha256?: boolean
          match_external_id_sha256?: boolean
          match_geo?: boolean
          match_ip_address?: boolean
          match_user_agent?: boolean
          max_delivery_attempts?: number
          pixel_id?: string
          request_timeout_ms?: number
          secret_name?: string
          source_project?: string
          tenant_id?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "openai_ads_connections_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      openai_ads_deliveries: {
        Row: {
          attempt_count: number
          created_at: string
          custom_event_name: string
          error_category: string | null
          event_id: string
          event_type: string
          first_attempt_at: string
          http_status: number | null
          id: string
          last_attempt_at: string
          pixel_id: string
          status: string
          tenant_id: string
          validate_only: boolean
        }
        Insert: {
          attempt_count?: number
          created_at?: string
          custom_event_name?: string
          error_category?: string | null
          event_id: string
          event_type: string
          first_attempt_at?: string
          http_status?: number | null
          id?: string
          last_attempt_at?: string
          pixel_id: string
          status: string
          tenant_id: string
          validate_only?: boolean
        }
        Update: {
          attempt_count?: number
          created_at?: string
          custom_event_name?: string
          error_category?: string | null
          event_id?: string
          event_type?: string
          first_attempt_at?: string
          http_status?: number | null
          id?: string
          last_attempt_at?: string
          pixel_id?: string
          status?: string
          tenant_id?: string
          validate_only?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "openai_ads_deliveries_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      openai_ads_event_rules: {
        Row: {
          action_source: string
          browser_enabled: boolean
          capi_enabled: boolean
          created_at: string
          custom_event_name: string
          enabled: boolean
          event_type: string
          id: string
          success_boundary: string
          tenant_id: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          action_source?: string
          browser_enabled?: boolean
          capi_enabled?: boolean
          created_at?: string
          custom_event_name?: string
          enabled?: boolean
          event_type: string
          id?: string
          success_boundary?: string
          tenant_id: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          action_source?: string
          browser_enabled?: boolean
          capi_enabled?: boolean
          created_at?: string
          custom_event_name?: string
          enabled?: boolean
          event_type?: string
          id?: string
          success_boundary?: string
          tenant_id?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "openai_ads_event_rules_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      openai_ads_events: {
        Row: {
          attribution_source: string | null
          created_at: string
          delivery_error: string | null
          delivery_status: string
          event_id: string
          event_name: string
          id: string
          occurred_at: string
          oppref: string | null
          payload: Json
          pixel_id: string
          received_at: string
          source_path: string | null
          source_project: string | null
          tenant_id: string
          transport: string
        }
        Insert: {
          attribution_source?: string | null
          created_at?: string
          delivery_error?: string | null
          delivery_status?: string
          event_id: string
          event_name: string
          id?: string
          occurred_at: string
          oppref?: string | null
          payload?: Json
          pixel_id: string
          received_at?: string
          source_path?: string | null
          source_project?: string | null
          tenant_id: string
          transport: string
        }
        Update: {
          attribution_source?: string | null
          created_at?: string
          delivery_error?: string | null
          delivery_status?: string
          event_id?: string
          event_name?: string
          id?: string
          occurred_at?: string
          oppref?: string | null
          payload?: Json
          pixel_id?: string
          received_at?: string
          source_path?: string | null
          source_project?: string | null
          tenant_id?: string
          transport?: string
        }
        Relationships: [
          {
            foreignKeyName: "openai_ads_events_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      openseo_tool_runs: {
        Row: {
          arguments: Json
          classification: string
          completed_at: string
          cost_model: string
          created_at: string
          credits_charged: number | null
          credits_remaining: number | null
          duration_ms: number
          error_code: string | null
          id: string
          mcp_version: string
          openseo_version: string
          operator_id: string
          result: Json
          source_endpoint: string
          started_at: string
          status: string
          tenant_id: string
          tool_name: string
        }
        Insert: {
          arguments?: Json
          classification: string
          completed_at: string
          cost_model: string
          created_at?: string
          credits_charged?: number | null
          credits_remaining?: number | null
          duration_ms: number
          error_code?: string | null
          id?: string
          mcp_version: string
          openseo_version: string
          operator_id: string
          result?: Json
          source_endpoint: string
          started_at: string
          status: string
          tenant_id: string
          tool_name: string
        }
        Update: {
          arguments?: Json
          classification?: string
          completed_at?: string
          cost_model?: string
          created_at?: string
          credits_charged?: number | null
          credits_remaining?: number | null
          duration_ms?: number
          error_code?: string | null
          id?: string
          mcp_version?: string
          openseo_version?: string
          operator_id?: string
          result?: Json
          source_endpoint?: string
          started_at?: string
          status?: string
          tenant_id?: string
          tool_name?: string
        }
        Relationships: [
          {
            foreignKeyName: "openseo_tool_runs_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      operator_notes: {
        Row: {
          author_id: string
          body: string
          created_at: string
          id: string
          linked_url: string | null
          pinned: boolean
          tenant_id: string
          title: string
          updated_at: string
        }
        Insert: {
          author_id?: string
          body?: string
          created_at?: string
          id?: string
          linked_url?: string | null
          pinned?: boolean
          tenant_id: string
          title?: string
          updated_at?: string
        }
        Update: {
          author_id?: string
          body?: string
          created_at?: string
          id?: string
          linked_url?: string | null
          pinned?: boolean
          tenant_id?: string
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "operator_notes_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      page_metadata_observations: {
        Row: {
          details: Json | null
          error: string | null
          final_url: string | null
          h1: string | null
          id: string
          observed_at: string
          property: string
          rendered_by: string | null
          requested_by: string | null
          tenant_id: string
          title: string | null
          url: string
        }
        Insert: {
          details?: Json | null
          error?: string | null
          final_url?: string | null
          h1?: string | null
          id?: string
          observed_at?: string
          property: string
          rendered_by?: string | null
          requested_by?: string | null
          tenant_id: string
          title?: string | null
          url: string
        }
        Update: {
          details?: Json | null
          error?: string | null
          final_url?: string | null
          h1?: string | null
          id?: string
          observed_at?: string
          property?: string
          rendered_by?: string | null
          requested_by?: string | null
          tenant_id?: string
          title?: string | null
          url?: string
        }
        Relationships: [
          {
            foreignKeyName: "page_metadata_observations_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      pagespeed_snapshots: {
        Row: {
          analysis_timestamp: string | null
          cls: number | null
          collected_at: string
          fcp_ms: number | null
          final_url: string | null
          id: string
          lcp_ms: number | null
          lighthouse_version: string | null
          opportunities: Json
          performance_score: number | null
          provenance: Json
          run_id: string
          seo_score: number | null
          speed_index_ms: number | null
          strategy: string
          tbt_ms: number | null
          tenant_id: string
          url: string
        }
        Insert: {
          analysis_timestamp?: string | null
          cls?: number | null
          collected_at?: string
          fcp_ms?: number | null
          final_url?: string | null
          id?: string
          lcp_ms?: number | null
          lighthouse_version?: string | null
          opportunities?: Json
          performance_score?: number | null
          provenance?: Json
          run_id: string
          seo_score?: number | null
          speed_index_ms?: number | null
          strategy: string
          tbt_ms?: number | null
          tenant_id: string
          url: string
        }
        Update: {
          analysis_timestamp?: string | null
          cls?: number | null
          collected_at?: string
          fcp_ms?: number | null
          final_url?: string | null
          id?: string
          lcp_ms?: number | null
          lighthouse_version?: string | null
          opportunities?: Json
          performance_score?: number | null
          provenance?: Json
          run_id?: string
          seo_score?: number | null
          speed_index_ms?: number | null
          strategy?: string
          tbt_ms?: number | null
          tenant_id?: string
          url?: string
        }
        Relationships: [
          {
            foreignKeyName: "pagespeed_snapshots_run_id_fkey"
            columns: ["run_id"]
            isOneToOne: false
            referencedRelation: "measurement_runs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pagespeed_snapshots_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          active_tenant_id: string | null
          avatar_url: string | null
          created_at: string
          display_name: string | null
          email: string | null
          email_normalized: string | null
          id: string
          updated_at: string
        }
        Insert: {
          active_tenant_id?: string | null
          avatar_url?: string | null
          created_at?: string
          display_name?: string | null
          email?: string | null
          email_normalized?: string | null
          id: string
          updated_at?: string
        }
        Update: {
          active_tenant_id?: string | null
          avatar_url?: string | null
          created_at?: string
          display_name?: string | null
          email?: string | null
          email_normalized?: string | null
          id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "profiles_active_tenant_id_fkey"
            columns: ["active_tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      recommendation_dependencies: {
        Row: {
          depends_on_recommendation_id: string
          id: string
          recommendation_id: string
        }
        Insert: {
          depends_on_recommendation_id: string
          id?: string
          recommendation_id: string
        }
        Update: {
          depends_on_recommendation_id?: string
          id?: string
          recommendation_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "recommendation_dependencies_depends_on_recommendation_id_fkey"
            columns: ["depends_on_recommendation_id"]
            isOneToOne: false
            referencedRelation: "recommendations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "recommendation_dependencies_recommendation_id_fkey"
            columns: ["recommendation_id"]
            isOneToOne: false
            referencedRelation: "recommendations"
            referencedColumns: ["id"]
          },
        ]
      }
      recommendation_targets: {
        Row: {
          id: string
          recommendation_id: string
          subject_id: string
          subject_kind: string
        }
        Insert: {
          id?: string
          recommendation_id: string
          subject_id: string
          subject_kind: string
        }
        Update: {
          id?: string
          recommendation_id?: string
          subject_id?: string
          subject_kind?: string
        }
        Relationships: [
          {
            foreignKeyName: "recommendation_targets_recommendation_id_fkey"
            columns: ["recommendation_id"]
            isOneToOne: false
            referencedRelation: "recommendations"
            referencedColumns: ["id"]
          },
        ]
      }
      recommendations: {
        Row: {
          approved_at: string | null
          approved_by: string | null
          business_impact: Database["public"]["Enums"]["impact_level"]
          confidence: number
          created_at: string
          description: string | null
          id: string
          issue_fingerprint: string | null
          metadata: Json
          reasoning: string | null
          requires_approval: boolean
          revenue_impact: Database["public"]["Enums"]["impact_level"]
          risk: Database["public"]["Enums"]["impact_level"]
          run_id: string | null
          source_module: string
          state: Database["public"]["Enums"]["recommendation_state"]
          suggested_action: Json
          tenant_id: string
          time_saved_minutes: number
          title: string
          traffic_impact: Database["public"]["Enums"]["impact_level"]
          updated_at: string
        }
        Insert: {
          approved_at?: string | null
          approved_by?: string | null
          business_impact?: Database["public"]["Enums"]["impact_level"]
          confidence?: number
          created_at?: string
          description?: string | null
          id?: string
          issue_fingerprint?: string | null
          metadata?: Json
          reasoning?: string | null
          requires_approval?: boolean
          revenue_impact?: Database["public"]["Enums"]["impact_level"]
          risk?: Database["public"]["Enums"]["impact_level"]
          run_id?: string | null
          source_module?: string
          state?: Database["public"]["Enums"]["recommendation_state"]
          suggested_action?: Json
          tenant_id: string
          time_saved_minutes?: number
          title: string
          traffic_impact?: Database["public"]["Enums"]["impact_level"]
          updated_at?: string
        }
        Update: {
          approved_at?: string | null
          approved_by?: string | null
          business_impact?: Database["public"]["Enums"]["impact_level"]
          confidence?: number
          created_at?: string
          description?: string | null
          id?: string
          issue_fingerprint?: string | null
          metadata?: Json
          reasoning?: string | null
          requires_approval?: boolean
          revenue_impact?: Database["public"]["Enums"]["impact_level"]
          risk?: Database["public"]["Enums"]["impact_level"]
          run_id?: string | null
          source_module?: string
          state?: Database["public"]["Enums"]["recommendation_state"]
          suggested_action?: Json
          tenant_id?: string
          time_saved_minutes?: number
          title?: string
          traffic_impact?: Database["public"]["Enums"]["impact_level"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "recommendations_run_id_fkey"
            columns: ["run_id"]
            isOneToOne: false
            referencedRelation: "workflow_runs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "recommendations_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      roadmap_comments: {
        Row: {
          author_id: string | null
          body: string
          created_at: string
          id: string
          item_id: string
          tenant_id: string
        }
        Insert: {
          author_id?: string | null
          body: string
          created_at?: string
          id?: string
          item_id: string
          tenant_id: string
        }
        Update: {
          author_id?: string | null
          body?: string
          created_at?: string
          id?: string
          item_id?: string
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "roadmap_comments_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "roadmap_items"
            referencedColumns: ["id"]
          },
        ]
      }
      roadmap_items: {
        Row: {
          created_at: string
          created_by: string | null
          detail: string
          id: string
          linked_url: string | null
          priority: Database["public"]["Enums"]["roadmap_priority"]
          shipped_note: string | null
          sort_order: number
          status: Database["public"]["Enums"]["roadmap_status"]
          tenant_id: string
          title: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          detail?: string
          id?: string
          linked_url?: string | null
          priority?: Database["public"]["Enums"]["roadmap_priority"]
          shipped_note?: string | null
          sort_order?: number
          status?: Database["public"]["Enums"]["roadmap_status"]
          tenant_id: string
          title: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          detail?: string
          id?: string
          linked_url?: string | null
          priority?: Database["public"]["Enums"]["roadmap_priority"]
          shipped_note?: string | null
          sort_order?: number
          status?: Database["public"]["Enums"]["roadmap_status"]
          tenant_id?: string
          title?: string
          updated_at?: string
        }
        Relationships: []
      }
      schedule_dependencies: {
        Row: {
          condition: Database["public"]["Enums"]["dependency_condition"]
          depends_on_schedule_id: string
          id: string
          schedule_id: string
        }
        Insert: {
          condition?: Database["public"]["Enums"]["dependency_condition"]
          depends_on_schedule_id: string
          id?: string
          schedule_id: string
        }
        Update: {
          condition?: Database["public"]["Enums"]["dependency_condition"]
          depends_on_schedule_id?: string
          id?: string
          schedule_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "schedule_dependencies_depends_on_schedule_id_fkey"
            columns: ["depends_on_schedule_id"]
            isOneToOne: false
            referencedRelation: "schedules"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "schedule_dependencies_schedule_id_fkey"
            columns: ["schedule_id"]
            isOneToOne: false
            referencedRelation: "schedules"
            referencedColumns: ["id"]
          },
        ]
      }
      schedule_runs: {
        Row: {
          created_at: string
          duration_ms: number | null
          error: string | null
          finished_at: string
          fired_at: string
          fired_by: string
          id: string
          result: Json
          schedule_id: string
          schedule_key: string
          state: string
          tenant_id: string | null
        }
        Insert: {
          created_at?: string
          duration_ms?: number | null
          error?: string | null
          finished_at?: string
          fired_at: string
          fired_by: string
          id?: string
          result?: Json
          schedule_id: string
          schedule_key: string
          state: string
          tenant_id?: string | null
        }
        Update: {
          created_at?: string
          duration_ms?: number | null
          error?: string | null
          finished_at?: string
          fired_at?: string
          fired_by?: string
          id?: string
          result?: Json
          schedule_id?: string
          schedule_key?: string
          state?: string
          tenant_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "schedule_runs_schedule_id_fkey"
            columns: ["schedule_id"]
            isOneToOne: false
            referencedRelation: "schedules"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "schedule_runs_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      schedules: {
        Row: {
          created_at: string
          cron: string
          description: string | null
          enabled: boolean
          failure_count: number
          health: Database["public"]["Enums"]["health_state"]
          id: string
          key: string
          last_duration_ms: number | null
          last_run_at: string | null
          last_state: Database["public"]["Enums"]["run_state"] | null
          metadata: Json
          name: string
          next_run_at: string | null
          status: Database["public"]["Enums"]["entity_status"]
          target_id: string | null
          target_kind: string
          tenant_id: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          cron: string
          description?: string | null
          enabled?: boolean
          failure_count?: number
          health?: Database["public"]["Enums"]["health_state"]
          id?: string
          key: string
          last_duration_ms?: number | null
          last_run_at?: string | null
          last_state?: Database["public"]["Enums"]["run_state"] | null
          metadata?: Json
          name: string
          next_run_at?: string | null
          status?: Database["public"]["Enums"]["entity_status"]
          target_id?: string | null
          target_kind?: string
          tenant_id?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          cron?: string
          description?: string | null
          enabled?: boolean
          failure_count?: number
          health?: Database["public"]["Enums"]["health_state"]
          id?: string
          key?: string
          last_duration_ms?: number | null
          last_run_at?: string | null
          last_state?: Database["public"]["Enums"]["run_state"] | null
          metadata?: Json
          name?: string
          next_run_at?: string | null
          status?: Database["public"]["Enums"]["entity_status"]
          target_id?: string | null
          target_kind?: string
          tenant_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "schedules_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      search_console_observations: {
        Row: {
          created_at: string
          evidence: Json
          id: string
          issue_fingerprint: string
          observation_fingerprint: string
          period_end_pt: string
          period_start_pt: string
          property: string
          recommendation_id: string | null
          rule: string
          snapshot_id: string
          target: string
          tenant_id: string
        }
        Insert: {
          created_at?: string
          evidence?: Json
          id?: string
          issue_fingerprint: string
          observation_fingerprint: string
          period_end_pt: string
          period_start_pt: string
          property: string
          recommendation_id?: string | null
          rule: string
          snapshot_id: string
          target: string
          tenant_id: string
        }
        Update: {
          created_at?: string
          evidence?: Json
          id?: string
          issue_fingerprint?: string
          observation_fingerprint?: string
          period_end_pt?: string
          period_start_pt?: string
          property?: string
          recommendation_id?: string | null
          rule?: string
          snapshot_id?: string
          target?: string
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "search_console_observations_recommendation_id_fkey"
            columns: ["recommendation_id"]
            isOneToOne: false
            referencedRelation: "recommendations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "search_console_observations_snapshot_id_fkey"
            columns: ["snapshot_id"]
            isOneToOne: false
            referencedRelation: "search_console_snapshots"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "search_console_observations_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      search_console_properties: {
        Row: {
          asset_id: string | null
          created_at: string
          eligible: boolean
          id: string
          last_observed_at: string | null
          metadata: Json
          permission_level: string
          selected: boolean
          site_url: string
          tenant_id: string
          updated_at: string
        }
        Insert: {
          asset_id?: string | null
          created_at?: string
          eligible?: boolean
          id?: string
          last_observed_at?: string | null
          metadata?: Json
          permission_level: string
          selected?: boolean
          site_url: string
          tenant_id: string
          updated_at?: string
        }
        Update: {
          asset_id?: string | null
          created_at?: string
          eligible?: boolean
          id?: string
          last_observed_at?: string | null
          metadata?: Json
          permission_level?: string
          selected?: boolean
          site_url?: string
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "search_console_properties_asset_id_fkey"
            columns: ["asset_id"]
            isOneToOne: false
            referencedRelation: "assets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "search_console_properties_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      search_console_sitemap_submissions: {
        Row: {
          failure_reason: string | null
          id: string
          property: string
          requested_by: string | null
          sitemap_url: string
          status: string
          submitted_at: string
          tenant_id: string
        }
        Insert: {
          failure_reason?: string | null
          id?: string
          property: string
          requested_by?: string | null
          sitemap_url: string
          status: string
          submitted_at?: string
          tenant_id: string
        }
        Update: {
          failure_reason?: string | null
          id?: string
          property?: string
          requested_by?: string | null
          sitemap_url?: string
          status?: string
          submitted_at?: string
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "search_console_sitemap_submissions_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      search_console_snapshots: {
        Row: {
          aggregation_type: string
          api_query_version: string
          checksum: string
          collected_at: string
          created_at: string
          data_state: string
          dimensions: string[]
          filters: Json
          id: string
          kind: string
          paginated_request_count: number
          payload: Json
          period_end_pt: string
          period_start_pt: string
          possibly_truncated: boolean
          property: string
          reporting_timezone: string
          response_aggregation_type: string | null
          returned_row_count: number
          row_limit: number
          search_type: string
          tenant_id: string
          totals: Json
          updated_at: string
        }
        Insert: {
          aggregation_type?: string
          api_query_version?: string
          checksum: string
          collected_at?: string
          created_at?: string
          data_state?: string
          dimensions?: string[]
          filters?: Json
          id?: string
          kind: string
          paginated_request_count?: number
          payload?: Json
          period_end_pt: string
          period_start_pt: string
          possibly_truncated?: boolean
          property: string
          reporting_timezone?: string
          response_aggregation_type?: string | null
          returned_row_count?: number
          row_limit?: number
          search_type?: string
          tenant_id: string
          totals?: Json
          updated_at?: string
        }
        Update: {
          aggregation_type?: string
          api_query_version?: string
          checksum?: string
          collected_at?: string
          created_at?: string
          data_state?: string
          dimensions?: string[]
          filters?: Json
          id?: string
          kind?: string
          paginated_request_count?: number
          payload?: Json
          period_end_pt?: string
          period_start_pt?: string
          possibly_truncated?: boolean
          property?: string
          reporting_timezone?: string
          response_aggregation_type?: string | null
          returned_row_count?: number
          row_limit?: number
          search_type?: string
          tenant_id?: string
          totals?: Json
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "search_console_snapshots_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      search_console_url_inspections: {
        Row: {
          coverage_state: string | null
          crawled_as: string | null
          google_canonical: string | null
          id: string
          indexing_state: string | null
          inspected_at: string
          inspected_url: string
          inspection_result_link: string | null
          last_crawl_time: string | null
          mobile_usability_verdict: string | null
          page_fetch_state: string | null
          property: string
          raw_payload: Json
          referring_urls: string[]
          requested_by: string | null
          rich_results_verdict: string | null
          robots_txt_state: string | null
          sitemaps: string[]
          tenant_id: string
          user_canonical: string | null
          verdict: string
        }
        Insert: {
          coverage_state?: string | null
          crawled_as?: string | null
          google_canonical?: string | null
          id?: string
          indexing_state?: string | null
          inspected_at?: string
          inspected_url: string
          inspection_result_link?: string | null
          last_crawl_time?: string | null
          mobile_usability_verdict?: string | null
          page_fetch_state?: string | null
          property: string
          raw_payload?: Json
          referring_urls?: string[]
          requested_by?: string | null
          rich_results_verdict?: string | null
          robots_txt_state?: string | null
          sitemaps?: string[]
          tenant_id: string
          user_canonical?: string | null
          verdict?: string
        }
        Update: {
          coverage_state?: string | null
          crawled_as?: string | null
          google_canonical?: string | null
          id?: string
          indexing_state?: string | null
          inspected_at?: string
          inspected_url?: string
          inspection_result_link?: string | null
          last_crawl_time?: string | null
          mobile_usability_verdict?: string | null
          page_fetch_state?: string | null
          property?: string
          raw_payload?: Json
          referring_urls?: string[]
          requested_by?: string | null
          rich_results_verdict?: string | null
          robots_txt_state?: string | null
          sitemaps?: string[]
          tenant_id?: string
          user_canonical?: string | null
          verdict?: string
        }
        Relationships: [
          {
            foreignKeyName: "search_console_url_inspections_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      seo_run_events: {
        Row: {
          actor_id: string | null
          created_at: string
          event_key: string
          id: string
          occurred_at: string
          payload: Json
          run_id: string
          state: string
          summary: string
          tenant_id: string
        }
        Insert: {
          actor_id?: string | null
          created_at?: string
          event_key: string
          id?: string
          occurred_at?: string
          payload?: Json
          run_id: string
          state: string
          summary: string
          tenant_id: string
        }
        Update: {
          actor_id?: string | null
          created_at?: string
          event_key?: string
          id?: string
          occurred_at?: string
          payload?: Json
          run_id?: string
          state?: string
          summary?: string
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "seo_run_events_run_id_tenant_id_fkey"
            columns: ["run_id", "tenant_id"]
            isOneToOne: false
            referencedRelation: "seo_runs"
            referencedColumns: ["id", "tenant_id"]
          },
          {
            foreignKeyName: "seo_run_events_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      seo_runs: {
        Row: {
          authority_finding_ids: string[]
          change_request_id: string | null
          change_type: string
          completed_at: string | null
          connector_snapshot: Json
          created_at: string
          created_by: string | null
          evidence_snapshot: Json
          failure_reason: string | null
          id: string
          idempotency_key: string
          knowledge_chunk_ids: string[]
          query_class: string
          started_at: string | null
          state: string
          target_url: string
          tenant_id: string
          updated_at: string
        }
        Insert: {
          authority_finding_ids?: string[]
          change_request_id?: string | null
          change_type?: string
          completed_at?: string | null
          connector_snapshot?: Json
          created_at?: string
          created_by?: string | null
          evidence_snapshot?: Json
          failure_reason?: string | null
          id?: string
          idempotency_key: string
          knowledge_chunk_ids?: string[]
          query_class: string
          started_at?: string | null
          state?: string
          target_url: string
          tenant_id: string
          updated_at?: string
        }
        Update: {
          authority_finding_ids?: string[]
          change_request_id?: string | null
          change_type?: string
          completed_at?: string | null
          connector_snapshot?: Json
          created_at?: string
          created_by?: string | null
          evidence_snapshot?: Json
          failure_reason?: string | null
          id?: string
          idempotency_key?: string
          knowledge_chunk_ids?: string[]
          query_class?: string
          started_at?: string | null
          state?: string
          target_url?: string
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "seo_runs_change_request_id_fkey"
            columns: ["change_request_id"]
            isOneToOne: false
            referencedRelation: "change_requests"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "seo_runs_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      serpapi_requests: {
        Row: {
          account_searches_left_after: number | null
          account_searches_left_before: number | null
          charged_credits: number
          created_at: string
          duration_ms: number | null
          engine: string
          failure_reason: string | null
          finished_at: string | null
          id: string
          module: string
          provider_search_id: string | null
          provider_status: string | null
          query_text: string | null
          request_fingerprint: string
          reserved_credits: number
          run_key: string
          source_url: string | null
          started_at: string
          state: string
          tenant_id: string
        }
        Insert: {
          account_searches_left_after?: number | null
          account_searches_left_before?: number | null
          charged_credits?: number
          created_at?: string
          duration_ms?: number | null
          engine: string
          failure_reason?: string | null
          finished_at?: string | null
          id?: string
          module: string
          provider_search_id?: string | null
          provider_status?: string | null
          query_text?: string | null
          request_fingerprint: string
          reserved_credits?: number
          run_key: string
          source_url?: string | null
          started_at?: string
          state?: string
          tenant_id: string
        }
        Update: {
          account_searches_left_after?: number | null
          account_searches_left_before?: number | null
          charged_credits?: number
          created_at?: string
          duration_ms?: number | null
          engine?: string
          failure_reason?: string | null
          finished_at?: string | null
          id?: string
          module?: string
          provider_search_id?: string | null
          provider_status?: string | null
          query_text?: string | null
          request_fingerprint?: string
          reserved_credits?: number
          run_key?: string
          source_url?: string | null
          started_at?: string
          state?: string
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "serpapi_requests_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      site_audit_snapshots: {
        Row: {
          facts: Json
          id: string
          observed_at: string
          origin: string
          property: string
          requested_by: string | null
          tenant_id: string
        }
        Insert: {
          facts: Json
          id?: string
          observed_at?: string
          origin: string
          property: string
          requested_by?: string | null
          tenant_id: string
        }
        Update: {
          facts?: Json
          id?: string
          observed_at?: string
          origin?: string
          property?: string
          requested_by?: string | null
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "site_audit_snapshots_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      suggestion_suppressions: {
        Row: {
          created_at: string
          fingerprint: string
          id: string
          suppressed_by: string | null
          tenant_id: string
        }
        Insert: {
          created_at?: string
          fingerprint: string
          id?: string
          suppressed_by?: string | null
          tenant_id: string
        }
        Update: {
          created_at?: string
          fingerprint?: string
          id?: string
          suppressed_by?: string | null
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "suggestion_suppressions_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      tenant_connections: {
        Row: {
          capability_key: string
          config: Json
          created_at: string
          health: Database["public"]["Enums"]["health_state"]
          id: string
          integration_state: string
          last_checked_at: string | null
          provider: string
          secret_name: string | null
          tenant_id: string
          updated_at: string
        }
        Insert: {
          capability_key: string
          config?: Json
          created_at?: string
          health?: Database["public"]["Enums"]["health_state"]
          id?: string
          integration_state?: string
          last_checked_at?: string | null
          provider: string
          secret_name?: string | null
          tenant_id: string
          updated_at?: string
        }
        Update: {
          capability_key?: string
          config?: Json
          created_at?: string
          health?: Database["public"]["Enums"]["health_state"]
          id?: string
          integration_state?: string
          last_checked_at?: string | null
          provider?: string
          secret_name?: string | null
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "tenant_connections_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      tenant_members: {
        Row: {
          created_at: string
          id: string
          role: Database["public"]["Enums"]["app_role"]
          tenant_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          tenant_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          tenant_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "tenant_members_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      tenants: {
        Row: {
          created_at: string
          description: string | null
          id: string
          metadata: Json
          name: string
          slug: string
          status: Database["public"]["Enums"]["entity_status"]
          updated_at: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          id?: string
          metadata?: Json
          name: string
          slug: string
          status?: Database["public"]["Enums"]["entity_status"]
          updated_at?: string
        }
        Update: {
          created_at?: string
          description?: string | null
          id?: string
          metadata?: Json
          name?: string
          slug?: string
          status?: Database["public"]["Enums"]["entity_status"]
          updated_at?: string
        }
        Relationships: []
      }
      tool_aliases: {
        Row: {
          alias_key: string
          alias_kind: string
          alias_label: string
          created_at: string
          id: string
          note: string | null
          registered_in: string | null
          system_id: string
          tenant_id: string
        }
        Insert: {
          alias_key: string
          alias_kind?: string
          alias_label: string
          created_at?: string
          id?: string
          note?: string | null
          registered_in?: string | null
          system_id: string
          tenant_id: string
        }
        Update: {
          alias_key?: string
          alias_kind?: string
          alias_label?: string
          created_at?: string
          id?: string
          note?: string | null
          registered_in?: string | null
          system_id?: string
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "tool_aliases_system_id_fkey"
            columns: ["system_id"]
            isOneToOne: false
            referencedRelation: "tool_systems"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tool_aliases_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      tool_operations: {
        Row: {
          cost_model: string
          created_at: string
          display_name: string
          http_method: string | null
          id: string
          mcp_tool_name: string | null
          metadata: Json
          mutates_external_state: boolean
          notes: string | null
          operation_key: string
          operation_mode: string
          source_reference: string | null
          system_id: string
          tenant_id: string
          updated_at: string
        }
        Insert: {
          cost_model?: string
          created_at?: string
          display_name: string
          http_method?: string | null
          id?: string
          mcp_tool_name?: string | null
          metadata?: Json
          mutates_external_state?: boolean
          notes?: string | null
          operation_key: string
          operation_mode: string
          source_reference?: string | null
          system_id: string
          tenant_id: string
          updated_at?: string
        }
        Update: {
          cost_model?: string
          created_at?: string
          display_name?: string
          http_method?: string | null
          id?: string
          mcp_tool_name?: string | null
          metadata?: Json
          mutates_external_state?: boolean
          notes?: string | null
          operation_key?: string
          operation_mode?: string
          source_reference?: string | null
          system_id?: string
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "tool_operations_system_id_fkey"
            columns: ["system_id"]
            isOneToOne: false
            referencedRelation: "tool_systems"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tool_operations_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      tool_systems: {
        Row: {
          aoos_connection_state: string
          available_state: string
          created_at: string
          credential_state: string
          discovered_from: string | null
          enabled_state: string
          execution_location: string
          id: string
          implemented_state: string
          installed_state: string
          is_essential: boolean
          kind: string
          last_verified_at: string | null
          metadata: Json
          name: string
          provider: string | null
          source_reference: string | null
          stable_key: string
          summary: string | null
          tenant_id: string
          updated_at: string
          verification_state: string
          version: string | null
          visible_in_aoos: boolean
        }
        Insert: {
          aoos_connection_state?: string
          available_state?: string
          created_at?: string
          credential_state?: string
          discovered_from?: string | null
          enabled_state?: string
          execution_location?: string
          id?: string
          implemented_state?: string
          installed_state?: string
          is_essential?: boolean
          kind: string
          last_verified_at?: string | null
          metadata?: Json
          name: string
          provider?: string | null
          source_reference?: string | null
          stable_key: string
          summary?: string | null
          tenant_id: string
          updated_at?: string
          verification_state?: string
          version?: string | null
          visible_in_aoos?: boolean
        }
        Update: {
          aoos_connection_state?: string
          available_state?: string
          created_at?: string
          credential_state?: string
          discovered_from?: string | null
          enabled_state?: string
          execution_location?: string
          id?: string
          implemented_state?: string
          installed_state?: string
          is_essential?: boolean
          kind?: string
          last_verified_at?: string | null
          metadata?: Json
          name?: string
          provider?: string | null
          source_reference?: string | null
          stable_key?: string
          summary?: string | null
          tenant_id?: string
          updated_at?: string
          verification_state?: string
          version?: string | null
          visible_in_aoos?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "tool_systems_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      tracked_competitors: {
        Row: {
          active: boolean
          approved_at: string
          approved_by: string | null
          candidate_id: string | null
          created_at: string
          domain: string
          id: string
          label: string | null
          notes: string | null
          tenant_id: string
        }
        Insert: {
          active?: boolean
          approved_at?: string
          approved_by?: string | null
          candidate_id?: string | null
          created_at?: string
          domain: string
          id?: string
          label?: string | null
          notes?: string | null
          tenant_id: string
        }
        Update: {
          active?: boolean
          approved_at?: string
          approved_by?: string | null
          candidate_id?: string | null
          created_at?: string
          domain?: string
          id?: string
          label?: string | null
          notes?: string | null
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "tracked_competitors_candidate_id_fkey"
            columns: ["candidate_id"]
            isOneToOne: false
            referencedRelation: "competitor_candidates"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tracked_competitors_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      tracked_keywords: {
        Row: {
          active: boolean
          approved_at: string
          approved_by: string | null
          candidate_id: string | null
          created_at: string
          id: string
          keyword: string
          label: string | null
          language_code: string
          location_code: number
          tenant_id: string
        }
        Insert: {
          active?: boolean
          approved_at?: string
          approved_by?: string | null
          candidate_id?: string | null
          created_at?: string
          id?: string
          keyword: string
          label?: string | null
          language_code?: string
          location_code?: number
          tenant_id: string
        }
        Update: {
          active?: boolean
          approved_at?: string
          approved_by?: string | null
          candidate_id?: string | null
          created_at?: string
          id?: string
          keyword?: string
          label?: string | null
          language_code?: string
          location_code?: number
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "tracked_keywords_candidate_id_fkey"
            columns: ["candidate_id"]
            isOneToOne: false
            referencedRelation: "keyword_candidates"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tracked_keywords_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      umami_snapshots: {
        Row: {
          base_url: string
          collected_at: string
          id: string
          metric: string
          payload: Json
          period_end: string
          period_start: string
          provenance: Json
          returned_row_count: number
          run_id: string | null
          tenant_id: string
          totals: Json
          website_id: string
          website_name: string | null
        }
        Insert: {
          base_url: string
          collected_at?: string
          id?: string
          metric: string
          payload?: Json
          period_end: string
          period_start: string
          provenance?: Json
          returned_row_count?: number
          run_id?: string | null
          tenant_id: string
          totals?: Json
          website_id: string
          website_name?: string | null
        }
        Update: {
          base_url?: string
          collected_at?: string
          id?: string
          metric?: string
          payload?: Json
          period_end?: string
          period_start?: string
          provenance?: Json
          returned_row_count?: number
          run_id?: string | null
          tenant_id?: string
          totals?: Json
          website_id?: string
          website_name?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "umami_snapshots_run_id_fkey"
            columns: ["run_id"]
            isOneToOne: false
            referencedRelation: "measurement_runs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "umami_snapshots_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      user_roles: {
        Row: {
          created_at: string
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
      workflow_runs: {
        Row: {
          cancelled_at: string | null
          cancelled_by: string | null
          context: Json
          created_at: string
          cursor: number
          duration_ms: number | null
          error: string | null
          finished_at: string | null
          id: string
          last_advanced_at: string | null
          last_advanced_by: string | null
          mode: string
          started_at: string | null
          state: Database["public"]["Enums"]["run_state"]
          step_outputs: Json
          tenant_id: string
          total_steps: number
          trigger_source: string
          updated_at: string
          workflow_id: string
        }
        Insert: {
          cancelled_at?: string | null
          cancelled_by?: string | null
          context?: Json
          created_at?: string
          cursor?: number
          duration_ms?: number | null
          error?: string | null
          finished_at?: string | null
          id?: string
          last_advanced_at?: string | null
          last_advanced_by?: string | null
          mode?: string
          started_at?: string | null
          state?: Database["public"]["Enums"]["run_state"]
          step_outputs?: Json
          tenant_id: string
          total_steps?: number
          trigger_source?: string
          updated_at?: string
          workflow_id: string
        }
        Update: {
          cancelled_at?: string | null
          cancelled_by?: string | null
          context?: Json
          created_at?: string
          cursor?: number
          duration_ms?: number | null
          error?: string | null
          finished_at?: string | null
          id?: string
          last_advanced_at?: string | null
          last_advanced_by?: string | null
          mode?: string
          started_at?: string | null
          state?: Database["public"]["Enums"]["run_state"]
          step_outputs?: Json
          tenant_id?: string
          total_steps?: number
          trigger_source?: string
          updated_at?: string
          workflow_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "workflow_runs_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "workflow_runs_workflow_id_fkey"
            columns: ["workflow_id"]
            isOneToOne: false
            referencedRelation: "workflows"
            referencedColumns: ["id"]
          },
        ]
      }
      workflow_steps: {
        Row: {
          created_at: string
          duration_ms: number | null
          error: string | null
          finished_at: string | null
          id: string
          input: Json
          node_key: string
          node_kind: string
          output: Json | null
          ref: string | null
          run_id: string
          sequence: number
          started_at: string | null
          state: Database["public"]["Enums"]["run_state"]
          tenant_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          duration_ms?: number | null
          error?: string | null
          finished_at?: string | null
          id?: string
          input?: Json
          node_key: string
          node_kind: string
          output?: Json | null
          ref?: string | null
          run_id: string
          sequence?: number
          started_at?: string | null
          state?: Database["public"]["Enums"]["run_state"]
          tenant_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          duration_ms?: number | null
          error?: string | null
          finished_at?: string | null
          id?: string
          input?: Json
          node_key?: string
          node_kind?: string
          output?: Json | null
          ref?: string | null
          run_id?: string
          sequence?: number
          started_at?: string | null
          state?: Database["public"]["Enums"]["run_state"]
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "workflow_steps_run_id_fkey"
            columns: ["run_id"]
            isOneToOne: false
            referencedRelation: "workflow_runs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "workflow_steps_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      workflows: {
        Row: {
          created_at: string
          description: string | null
          graph: Json
          health: Database["public"]["Enums"]["health_state"]
          id: string
          key: string
          metadata: Json
          name: string
          status: Database["public"]["Enums"]["entity_status"]
          trigger_kind: string
          updated_at: string
          version: number
        }
        Insert: {
          created_at?: string
          description?: string | null
          graph?: Json
          health?: Database["public"]["Enums"]["health_state"]
          id?: string
          key: string
          metadata?: Json
          name: string
          status?: Database["public"]["Enums"]["entity_status"]
          trigger_kind?: string
          updated_at?: string
          version?: number
        }
        Update: {
          created_at?: string
          description?: string | null
          graph?: Json
          health?: Database["public"]["Enums"]["health_state"]
          id?: string
          key?: string
          metadata?: Json
          name?: string
          status?: Database["public"]["Enums"]["entity_status"]
          trigger_kind?: string
          updated_at?: string
          version?: number
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      activate_knowledge_version: {
        Args: { _tenant_id: string; _version_id: string }
        Returns: {
          activated_at: string | null
          content_sha256: string
          content_text: string
          created_at: string
          deactivated_at: string | null
          embedding_dimensions: number
          embedding_model: string
          id: string
          metadata: Json
          parser_version: string
          source_id: string
          source_size_bytes: number
          status: string
          tenant_id: string
          updated_at: string
          version_label: string
        }
        SetofOptions: {
          from: "*"
          to: "knowledge_source_versions"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      append_change_measurement_observation: {
        Args: {
          _cycle_id: string
          _payload: Json
          _provenance: Json
          _provider: string
          _source_refs: Json
          _source_role: string
          _status: string
          _window_id: string
        }
        Returns: string
      }
      append_change_measurement_revision: {
        Args: {
          _actor_id: string
          _cycle_id: string
          _detail: Json
          _kind: string
          _summary: string
          _window_id: string
        }
        Returns: string
      }
      apply_change_request_rendered_proof: {
        Args: {
          _actor: string
          _id: string
          _notes: string
          _proof: Json
          _revision: string
        }
        Returns: Json
      }
      assert_admin_remains: {
        Args: { _excluding_user: string }
        Returns: undefined
      }
      claim_workflow_run_step: {
        Args: { p_actor: string; p_run_id: string }
        Returns: {
          run_id: string
          step_cursor: number
          total_steps: number
        }[]
      }
      clear_inbox_item: {
        Args: { _item_id: string }
        Returns: {
          actions: Json
          assignee_label: string | null
          cleared_by: string | null
          cleared_from_lane: Database["public"]["Enums"]["inbox_lane"] | null
          created_at: string
          due_at: string | null
          id: string
          lane: Database["public"]["Enums"]["inbox_lane"]
          metadata: Json
          priority: number
          resolved_at: string | null
          source_module: string
          subject_id: string | null
          subject_kind: string | null
          summary: string | null
          tenant_id: string
          title: string
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "inbox_items"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      command_center_overview: { Args: { _tenant_id: string }; Returns: Json }
      create_governed_proposal: {
        Args: {
          _actor: string
          _changes: Json
          _evidence: Json
          _evidence_limitations: string
          _evidence_summary: string
          _generation_context: Json
          _idempotency_key: string
          _proposal_type: string
          _rationale: string
          _risk_note: string
          _source_branch: string
          _source_file: string
          _source_project_id: string
          _source_repo: string
          _source_revision_before: string
          _target_url: string
          _tenant_id: string
          _title: string
        }
        Returns: Json
      }
      create_page_wording_proposal: {
        Args: {
          _actor: string
          _changes: Json
          _evidence: Json
          _evidence_limitations: string
          _evidence_summary: string
          _generation_context: Json
          _idempotency_key: string
          _rationale: string
          _risk_note: string
          _source_branch: string
          _source_file: string
          _source_project_id: string
          _source_repo: string
          _source_revision_before: string
          _target_url: string
          _tenant_id: string
          _title: string
        }
        Returns: Json
      }
      create_title_h1_proposal: {
        Args: {
          _actor: string
          _changes: Json
          _evidence: Json
          _evidence_limitations: string
          _evidence_summary: string
          _generation_context: Json
          _idempotency_key: string
          _rationale: string
          _risk_note: string
          _source_branch: string
          _source_file: string
          _source_project_id: string
          _source_repo: string
          _source_revision_before: string
          _target_url: string
          _tenant_id: string
          _title: string
        }
        Returns: Json
      }
      decide_ad_advertiser_candidate: {
        Args: { _candidate_id: string; _decision: string }
        Returns: Json
      }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      is_operator: { Args: never; Returns: boolean }
      is_tenant_admin: { Args: { _tenant_id: string }; Returns: boolean }
      is_tenant_member: { Args: { _tenant_id: string }; Returns: boolean }
      match_knowledge_chunks: {
        Args: {
          _limit?: number
          _query_embedding: string
          _query_text: string
          _tenant_id: string
        }
        Returns: {
          body: string
          content_sha256: string
          heading_path: string[]
          id: string
          lexical_score: number
          score: number
          semantic_score: number
          source_id: string
          source_key: string
          source_ref: string
          source_title: string
          source_version_id: string
          title: string
          version_label: string
        }[]
      }
      normalize_email: { Args: { _email: string }; Returns: string }
      page_wording_field_is_owned: {
        Args: { _field: string }
        Returns: boolean
      }
      provider_spend_summary: { Args: { _tenant_id: string }; Returns: Json }
      provision_operator_from_allowlist: {
        Args: { _auth_user_id: string }
        Returns: string
      }
      reopen_inbox_item: {
        Args: { _item_id: string }
        Returns: {
          actions: Json
          assignee_label: string | null
          cleared_by: string | null
          cleared_from_lane: Database["public"]["Enums"]["inbox_lane"] | null
          created_at: string
          due_at: string | null
          id: string
          lane: Database["public"]["Enums"]["inbox_lane"]
          metadata: Json
          priority: number
          resolved_at: string | null
          source_module: string
          subject_id: string | null
          subject_kind: string | null
          summary: string | null
          tenant_id: string
          title: string
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "inbox_items"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      revise_page_wording_proposal: {
        Args: {
          _actor: string
          _changes: Json
          _evidence: Json
          _evidence_limitations: string
          _evidence_summary: string
          _generation_context: Json
          _id: string
          _rationale: string
          _revision_kind: string
          _risk_note: string
          _source_revision_before: string
        }
        Returns: Json
      }
      revise_title_h1_proposal: {
        Args: {
          _actor: string
          _changes: Json
          _evidence: Json
          _evidence_limitations: string
          _evidence_summary: string
          _generation_context: Json
          _id: string
          _rationale: string
          _revision_kind: string
          _risk_note: string
          _source_revision_before: string
        }
        Returns: Json
      }
      revoke_operator: { Args: { _email: string }; Returns: string }
      seed_essential_concerns_for_tenant: {
        Args: { p_tenant_id: string }
        Returns: number
      }
      seed_tool_estate_for_tenant: {
        Args: { target_tenant: string }
        Returns: undefined
      }
      set_concern_ownership: {
        Args: {
          p_concern_id: string
          p_owner_name: string
          p_target_date: string
        }
        Returns: {
          created_at: string
          description: string
          evidence_source: string | null
          id: string
          key: string
          origin: string
          owner_name: string | null
          phase: string
          priority: number
          retired_at: string | null
          sort_order: number
          target_date: string | null
          task: string
          tenant_id: string
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "essential_concerns"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      transition_change_request: {
        Args: {
          _acknowledge_in_flight?: boolean
          _action: string
          _id: string
          _notes?: string
          _revision?: string
        }
        Returns: Json
      }
      verify_scheduler_hook_token: {
        Args: { _token: string }
        Returns: boolean
      }
    }
    Enums: {
      app_role: "admin" | "operator" | "viewer"
      asset_kind:
        | "website"
        | "landing_page"
        | "research_dataset"
        | "blog"
        | "google_ads_account"
        | "google_business_profile"
        | "github_repository"
        | "supabase_project"
        | "domain"
        | "workflow"
        | "knowledge_collection"
        | "prompt"
        | "email_campaign"
        | "social_account"
      capability_kind:
        | "mcp"
        | "api"
        | "connector"
        | "skill"
        | "repository"
        | "model"
        | "internal_module"
        | "service"
      dependency_condition: "on_success" | "on_complete"
      entity_status: "draft" | "active" | "paused" | "archived" | "error"
      health_state: "unknown" | "healthy" | "degraded" | "failing"
      impact_level: "none" | "low" | "medium" | "high" | "critical"
      inbox_lane:
        | "needs_attention"
        | "pending_approval"
        | "scheduled"
        | "completed"
        | "fyi"
      knowledge_kind:
        | "documents"
        | "repositories"
        | "skills"
        | "prompts"
        | "playbooks"
        | "research"
        | "design_systems"
        | "best_practices"
        | "agent_knowledge"
        | "memory"
        | "vector_collection"
      memory_scope: "none" | "task" | "asset" | "global"
      recommendation_state:
        | "draft"
        | "proposed"
        | "under_review"
        | "approved"
        | "rejected"
        | "scheduled"
        | "applied"
        | "verified"
        | "failed"
        | "rolled_back"
        | "observed"
      roadmap_priority: "now" | "next" | "later"
      roadmap_status: "requested" | "in_progress" | "shipped" | "parked"
      run_state:
        | "queued"
        | "running"
        | "awaiting_approval"
        | "succeeded"
        | "failed"
        | "cancelled"
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
      app_role: ["admin", "operator", "viewer"],
      asset_kind: [
        "website",
        "landing_page",
        "research_dataset",
        "blog",
        "google_ads_account",
        "google_business_profile",
        "github_repository",
        "supabase_project",
        "domain",
        "workflow",
        "knowledge_collection",
        "prompt",
        "email_campaign",
        "social_account",
      ],
      capability_kind: [
        "mcp",
        "api",
        "connector",
        "skill",
        "repository",
        "model",
        "internal_module",
        "service",
      ],
      dependency_condition: ["on_success", "on_complete"],
      entity_status: ["draft", "active", "paused", "archived", "error"],
      health_state: ["unknown", "healthy", "degraded", "failing"],
      impact_level: ["none", "low", "medium", "high", "critical"],
      inbox_lane: [
        "needs_attention",
        "pending_approval",
        "scheduled",
        "completed",
        "fyi",
      ],
      knowledge_kind: [
        "documents",
        "repositories",
        "skills",
        "prompts",
        "playbooks",
        "research",
        "design_systems",
        "best_practices",
        "agent_knowledge",
        "memory",
        "vector_collection",
      ],
      memory_scope: ["none", "task", "asset", "global"],
      recommendation_state: [
        "draft",
        "proposed",
        "under_review",
        "approved",
        "rejected",
        "scheduled",
        "applied",
        "verified",
        "failed",
        "rolled_back",
        "observed",
      ],
      roadmap_priority: ["now", "next", "later"],
      roadmap_status: ["requested", "in_progress", "shipped", "parked"],
      run_state: [
        "queued",
        "running",
        "awaiting_approval",
        "succeeded",
        "failed",
        "cancelled",
      ],
    },
  },
} as const
