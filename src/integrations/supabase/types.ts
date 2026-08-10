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
          updated_at?: string
        }
        Relationships: []
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
      competitor_candidates: {
        Row: {
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
      inbox_items: {
        Row: {
          actions: Json
          assignee_label: string | null
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
          context: Json
          created_at: string
          duration_ms: number | null
          error: string | null
          finished_at: string | null
          id: string
          started_at: string | null
          state: Database["public"]["Enums"]["run_state"]
          tenant_id: string
          trigger_source: string
          updated_at: string
          workflow_id: string
        }
        Insert: {
          context?: Json
          created_at?: string
          duration_ms?: number | null
          error?: string | null
          finished_at?: string | null
          id?: string
          started_at?: string | null
          state?: Database["public"]["Enums"]["run_state"]
          tenant_id: string
          trigger_source?: string
          updated_at?: string
          workflow_id: string
        }
        Update: {
          context?: Json
          created_at?: string
          duration_ms?: number | null
          error?: string | null
          finished_at?: string | null
          id?: string
          started_at?: string | null
          state?: Database["public"]["Enums"]["run_state"]
          tenant_id?: string
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
      assert_admin_remains: {
        Args: { _excluding_user: string }
        Returns: undefined
      }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      is_operator: { Args: never; Returns: boolean }
      is_tenant_member: { Args: { _tenant_id: string }; Returns: boolean }
      normalize_email: { Args: { _email: string }; Returns: string }
      provision_operator_from_allowlist: {
        Args: { _auth_user_id: string }
        Returns: string
      }
      revoke_operator: { Args: { _email: string }; Returns: string }
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
      ],
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
