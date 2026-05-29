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
      account_statements: {
        Row: {
          business_account_id: string
          company_id: string
          created_at: string
          due_date: string | null
          id: string
          paid_amount: number
          statement_month: string
          status: string
          total_amount: number
          unpaid_amount: number
        }
        Insert: {
          business_account_id: string
          company_id?: string
          created_at?: string
          due_date?: string | null
          id?: string
          paid_amount?: number
          statement_month: string
          status?: string
          total_amount?: number
          unpaid_amount?: number
        }
        Update: {
          business_account_id?: string
          company_id?: string
          created_at?: string
          due_date?: string | null
          id?: string
          paid_amount?: number
          statement_month?: string
          status?: string
          total_amount?: number
          unpaid_amount?: number
        }
        Relationships: [
          {
            foreignKeyName: "account_statements_business_account_id_fkey"
            columns: ["business_account_id"]
            isOneToOne: false
            referencedRelation: "business_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "account_statements_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      accounts_payable: {
        Row: {
          bill_no: string
          company_id: string
          created_at: string
          due_date: string | null
          id: string
          notes: string | null
          paid_amount: number
          reference_po_id: string | null
          status: string
          total_amount: number
          updated_at: string
          vendor_id: string | null
          vendor_name: string
        }
        Insert: {
          bill_no: string
          company_id?: string
          created_at?: string
          due_date?: string | null
          id?: string
          notes?: string | null
          paid_amount?: number
          reference_po_id?: string | null
          status?: string
          total_amount?: number
          updated_at?: string
          vendor_id?: string | null
          vendor_name: string
        }
        Update: {
          bill_no?: string
          company_id?: string
          created_at?: string
          due_date?: string | null
          id?: string
          notes?: string | null
          paid_amount?: number
          reference_po_id?: string | null
          status?: string
          total_amount?: number
          updated_at?: string
          vendor_id?: string | null
          vendor_name?: string
        }
        Relationships: [
          {
            foreignKeyName: "accounts_payable_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "accounts_payable_vendor_id_fkey"
            columns: ["vendor_id"]
            isOneToOne: false
            referencedRelation: "vendors"
            referencedColumns: ["id"]
          },
        ]
      }
      accounts_receivable: {
        Row: {
          business_account_id: string | null
          company_id: string
          created_at: string
          customer_name: string
          due_date: string | null
          id: string
          invoice_no: string
          notes: string | null
          paid_amount: number
          reference_order_id: string | null
          status: string
          total_amount: number
          updated_at: string
        }
        Insert: {
          business_account_id?: string | null
          company_id?: string
          created_at?: string
          customer_name: string
          due_date?: string | null
          id?: string
          invoice_no: string
          notes?: string | null
          paid_amount?: number
          reference_order_id?: string | null
          status?: string
          total_amount?: number
          updated_at?: string
        }
        Update: {
          business_account_id?: string | null
          company_id?: string
          created_at?: string
          customer_name?: string
          due_date?: string | null
          id?: string
          invoice_no?: string
          notes?: string | null
          paid_amount?: number
          reference_order_id?: string | null
          status?: string
          total_amount?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "accounts_receivable_business_account_id_fkey"
            columns: ["business_account_id"]
            isOneToOne: false
            referencedRelation: "business_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "accounts_receivable_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      ai_logs: {
        Row: {
          analysis_result: Json
          created_at: string
          created_by: string | null
          id: string
          model: string | null
          module: string
          prompt: string | null
          tokens_used: number
        }
        Insert: {
          analysis_result?: Json
          created_at?: string
          created_by?: string | null
          id?: string
          model?: string | null
          module: string
          prompt?: string | null
          tokens_used?: number
        }
        Update: {
          analysis_result?: Json
          created_at?: string
          created_by?: string | null
          id?: string
          model?: string | null
          module?: string
          prompt?: string | null
          tokens_used?: number
        }
        Relationships: []
      }
      api_keys: {
        Row: {
          created_at: string
          created_by: string | null
          expires_at: string | null
          id: string
          key_hash: string
          key_prefix: string
          last_used_at: string | null
          name: string
          scopes: string[]
          status: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          expires_at?: string | null
          id?: string
          key_hash: string
          key_prefix: string
          last_used_at?: string | null
          name: string
          scopes?: string[]
          status?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          expires_at?: string | null
          id?: string
          key_hash?: string
          key_prefix?: string
          last_used_at?: string | null
          name?: string
          scopes?: string[]
          status?: string
        }
        Relationships: []
      }
      audit_logs: {
        Row: {
          action: string
          created_at: string
          entity: string
          entity_id: string | null
          id: string
          metadata: Json
          user_id: string | null
        }
        Insert: {
          action: string
          created_at?: string
          entity: string
          entity_id?: string | null
          id?: string
          metadata?: Json
          user_id?: string | null
        }
        Update: {
          action?: string
          created_at?: string
          entity?: string
          entity_id?: string | null
          id?: string
          metadata?: Json
          user_id?: string | null
        }
        Relationships: []
      }
      automation_runs: {
        Row: {
          error: string | null
          id: string
          ran_at: string
          result: Json
          status: string
          workflow_id: string
        }
        Insert: {
          error?: string | null
          id?: string
          ran_at?: string
          result?: Json
          status?: string
          workflow_id: string
        }
        Update: {
          error?: string | null
          id?: string
          ran_at?: string
          result?: Json
          status?: string
          workflow_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "automation_runs_workflow_id_fkey"
            columns: ["workflow_id"]
            isOneToOne: false
            referencedRelation: "automation_workflows"
            referencedColumns: ["id"]
          },
        ]
      }
      automation_workflows: {
        Row: {
          action_config: Json
          action_type: string
          created_at: string
          created_by: string | null
          description: string | null
          id: string
          last_run_at: string | null
          name: string
          run_count: number
          status: string
          trigger_config: Json
          trigger_type: string
          updated_at: string
        }
        Insert: {
          action_config?: Json
          action_type: string
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          last_run_at?: string | null
          name: string
          run_count?: number
          status?: string
          trigger_config?: Json
          trigger_type: string
          updated_at?: string
        }
        Update: {
          action_config?: Json
          action_type?: string
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          last_run_at?: string | null
          name?: string
          run_count?: number
          status?: string
          trigger_config?: Json
          trigger_type?: string
          updated_at?: string
        }
        Relationships: []
      }
      b2b_order_items: {
        Row: {
          b2b_order_id: string
          company_id: string
          created_at: string
          id: string
          product_id: string | null
          product_name: string
          quantity: number
          sku: string | null
          subtotal: number
          unit_price: number
        }
        Insert: {
          b2b_order_id: string
          company_id?: string
          created_at?: string
          id?: string
          product_id?: string | null
          product_name: string
          quantity?: number
          sku?: string | null
          subtotal?: number
          unit_price?: number
        }
        Update: {
          b2b_order_id?: string
          company_id?: string
          created_at?: string
          id?: string
          product_id?: string | null
          product_name?: string
          quantity?: number
          sku?: string | null
          subtotal?: number
          unit_price?: number
        }
        Relationships: [
          {
            foreignKeyName: "b2b_order_items_b2b_order_id_fkey"
            columns: ["b2b_order_id"]
            isOneToOne: false
            referencedRelation: "b2b_orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "b2b_order_items_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      b2b_orders: {
        Row: {
          business_account_id: string
          company_id: string
          created_at: string
          id: string
          notes: string | null
          order_no: string
          order_status: string
          payment_status: string
          payment_terms: number
          sales_rep_id: string | null
          subtotal: number
          tax_amount: number
          total_amount: number
          updated_at: string
        }
        Insert: {
          business_account_id: string
          company_id?: string
          created_at?: string
          id?: string
          notes?: string | null
          order_no: string
          order_status?: string
          payment_status?: string
          payment_terms?: number
          sales_rep_id?: string | null
          subtotal?: number
          tax_amount?: number
          total_amount?: number
          updated_at?: string
        }
        Update: {
          business_account_id?: string
          company_id?: string
          created_at?: string
          id?: string
          notes?: string | null
          order_no?: string
          order_status?: string
          payment_status?: string
          payment_terms?: number
          sales_rep_id?: string | null
          subtotal?: number
          tax_amount?: number
          total_amount?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "b2b_orders_business_account_id_fkey"
            columns: ["business_account_id"]
            isOneToOne: false
            referencedRelation: "business_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "b2b_orders_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      bank_accounts: {
        Row: {
          account_name: string
          account_no: string
          balance: number
          bank_name: string
          company_id: string
          created_at: string
          currency: string
          id: string
          notes: string | null
          status: string
          updated_at: string
        }
        Insert: {
          account_name: string
          account_no: string
          balance?: number
          bank_name: string
          company_id?: string
          created_at?: string
          currency?: string
          id?: string
          notes?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          account_name?: string
          account_no?: string
          balance?: number
          bank_name?: string
          company_id?: string
          created_at?: string
          currency?: string
          id?: string
          notes?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "bank_accounts_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      business_account_users: {
        Row: {
          business_account_id: string
          created_at: string
          id: string
          role: string
          user_id: string
        }
        Insert: {
          business_account_id: string
          created_at?: string
          id?: string
          role?: string
          user_id: string
        }
        Update: {
          business_account_id?: string
          created_at?: string
          id?: string
          role?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "business_account_users_business_account_id_fkey"
            columns: ["business_account_id"]
            isOneToOne: false
            referencedRelation: "business_accounts"
            referencedColumns: ["id"]
          },
        ]
      }
      business_accounts: {
        Row: {
          account_level: string
          address: string | null
          company_id: string
          company_name: string
          contact_name: string | null
          created_at: string
          credit_limit: number
          credit_used: number
          email: string | null
          id: string
          notes: string | null
          payment_terms: number
          phone: string | null
          sales_rep_id: string | null
          status: string
          tax_id: string | null
          updated_at: string
        }
        Insert: {
          account_level?: string
          address?: string | null
          company_id?: string
          company_name: string
          contact_name?: string | null
          created_at?: string
          credit_limit?: number
          credit_used?: number
          email?: string | null
          id?: string
          notes?: string | null
          payment_terms?: number
          phone?: string | null
          sales_rep_id?: string | null
          status?: string
          tax_id?: string | null
          updated_at?: string
        }
        Update: {
          account_level?: string
          address?: string | null
          company_id?: string
          company_name?: string
          contact_name?: string | null
          created_at?: string
          credit_limit?: number
          credit_used?: number
          email?: string | null
          id?: string
          notes?: string | null
          payment_terms?: number
          phone?: string | null
          sales_rep_id?: string | null
          status?: string
          tax_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "business_accounts_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      cart_items: {
        Row: {
          cart_id: string
          created_at: string
          id: string
          product_id: string
          quantity: number
        }
        Insert: {
          cart_id: string
          created_at?: string
          id?: string
          product_id: string
          quantity?: number
        }
        Update: {
          cart_id?: string
          created_at?: string
          id?: string
          product_id?: string
          quantity?: number
        }
        Relationships: [
          {
            foreignKeyName: "cart_items_cart_id_fkey"
            columns: ["cart_id"]
            isOneToOne: false
            referencedRelation: "carts"
            referencedColumns: ["id"]
          },
        ]
      }
      carts: {
        Row: {
          created_at: string
          id: string
          session_token: string | null
          updated_at: string
          user_id: string | null
        }
        Insert: {
          created_at?: string
          id?: string
          session_token?: string | null
          updated_at?: string
          user_id?: string | null
        }
        Update: {
          created_at?: string
          id?: string
          session_token?: string | null
          updated_at?: string
          user_id?: string | null
        }
        Relationships: []
      }
      categories: {
        Row: {
          company_id: string
          created_at: string
          id: string
          image: string | null
          name: string
          parent_id: string | null
          sort_order: number
          status: string
          updated_at: string
        }
        Insert: {
          company_id?: string
          created_at?: string
          id?: string
          image?: string | null
          name: string
          parent_id?: string | null
          sort_order?: number
          status?: string
          updated_at?: string
        }
        Update: {
          company_id?: string
          created_at?: string
          id?: string
          image?: string | null
          name?: string
          parent_id?: string | null
          sort_order?: number
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "categories_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "categories_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "categories"
            referencedColumns: ["id"]
          },
        ]
      }
      companies: {
        Row: {
          address: string | null
          company_name: string
          created_at: string
          email: string | null
          id: string
          invoice_show_tax_id: boolean
          invoice_tax_id_format: string
          invoice_title: string | null
          invoice_title_mode: string
          logo_url: string | null
          phone: string | null
          slug: string | null
          status: string
          tax_id: string | null
          updated_at: string
        }
        Insert: {
          address?: string | null
          company_name: string
          created_at?: string
          email?: string | null
          id?: string
          invoice_show_tax_id?: boolean
          invoice_tax_id_format?: string
          invoice_title?: string | null
          invoice_title_mode?: string
          logo_url?: string | null
          phone?: string | null
          slug?: string | null
          status?: string
          tax_id?: string | null
          updated_at?: string
        }
        Update: {
          address?: string | null
          company_name?: string
          created_at?: string
          email?: string | null
          id?: string
          invoice_show_tax_id?: boolean
          invoice_tax_id_format?: string
          invoice_title?: string | null
          invoice_title_mode?: string
          logo_url?: string | null
          phone?: string | null
          slug?: string | null
          status?: string
          tax_id?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      company_members: {
        Row: {
          company_id: string
          created_at: string
          id: string
          role: string
          user_id: string
        }
        Insert: {
          company_id: string
          created_at?: string
          id?: string
          role?: string
          user_id: string
        }
        Update: {
          company_id?: string
          created_at?: string
          id?: string
          role?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "company_members_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      coupons: {
        Row: {
          code: string
          company_id: string
          created_at: string
          expired_at: string | null
          id: string
          min_amount: number
          name: string
          status: string
          type: string
          updated_at: string
          usage_limit: number
          used_count: number
          value: number
        }
        Insert: {
          code: string
          company_id?: string
          created_at?: string
          expired_at?: string | null
          id?: string
          min_amount?: number
          name: string
          status?: string
          type?: string
          updated_at?: string
          usage_limit?: number
          used_count?: number
          value?: number
        }
        Update: {
          code?: string
          company_id?: string
          created_at?: string
          expired_at?: string | null
          id?: string
          min_amount?: number
          name?: string
          status?: string
          type?: string
          updated_at?: string
          usage_limit?: number
          used_count?: number
          value?: number
        }
        Relationships: [
          {
            foreignKeyName: "coupons_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      customer_addresses: {
        Row: {
          address: string
          city: string | null
          created_at: string
          id: string
          is_default: boolean
          phone: string
          postal_code: string | null
          receiver_name: string
          updated_at: string
          user_id: string
        }
        Insert: {
          address: string
          city?: string | null
          created_at?: string
          id?: string
          is_default?: boolean
          phone: string
          postal_code?: string | null
          receiver_name: string
          updated_at?: string
          user_id: string
        }
        Update: {
          address?: string
          city?: string | null
          created_at?: string
          id?: string
          is_default?: boolean
          phone?: string
          postal_code?: string | null
          receiver_name?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      customers: {
        Row: {
          company: string | null
          company_id: string
          created_at: string
          email: string | null
          id: string
          name: string
          notes: string | null
          phone: string | null
          updated_at: string
        }
        Insert: {
          company?: string | null
          company_id: string
          created_at?: string
          email?: string | null
          id?: string
          name: string
          notes?: string | null
          phone?: string | null
          updated_at?: string
        }
        Update: {
          company?: string | null
          company_id?: string
          created_at?: string
          email?: string | null
          id?: string
          name?: string
          notes?: string | null
          phone?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "customers_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      dealer_metrics: {
        Row: {
          current_pv: number
          direct_vip_count: number
          maintenance_expires_at: string | null
          maintenance_started_at: string | null
          monthly_income: number
          monthly_personal_points: number
          updated_at: string
          user_id: string
        }
        Insert: {
          current_pv?: number
          direct_vip_count?: number
          maintenance_expires_at?: string | null
          maintenance_started_at?: string | null
          monthly_income?: number
          monthly_personal_points?: number
          updated_at?: string
          user_id: string
        }
        Update: {
          current_pv?: number
          direct_vip_count?: number
          maintenance_expires_at?: string | null
          maintenance_started_at?: string | null
          monthly_income?: number
          monthly_personal_points?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      dealer_program_settings: {
        Row: {
          category: string
          description: string | null
          key: string
          label: string
          unit: string | null
          updated_at: string
          updated_by: string | null
          value: number
        }
        Insert: {
          category?: string
          description?: string | null
          key: string
          label: string
          unit?: string | null
          updated_at?: string
          updated_by?: string | null
          value?: number
        }
        Update: {
          category?: string
          description?: string | null
          key?: string
          label?: string
          unit?: string | null
          updated_at?: string
          updated_by?: string | null
          value?: number
        }
        Relationships: []
      }
      dealer_tier_history: {
        Row: {
          change_type: string
          created_at: string
          from_tier: string | null
          id: string
          metadata: Json
          reason: string | null
          to_tier: string | null
          triggered_by: string | null
          user_id: string
        }
        Insert: {
          change_type?: string
          created_at?: string
          from_tier?: string | null
          id?: string
          metadata?: Json
          reason?: string | null
          to_tier?: string | null
          triggered_by?: string | null
          user_id: string
        }
        Update: {
          change_type?: string
          created_at?: string
          from_tier?: string | null
          id?: string
          metadata?: Json
          reason?: string | null
          to_tier?: string | null
          triggered_by?: string | null
          user_id?: string
        }
        Relationships: []
      }
      dealer_tier_status: {
        Row: {
          current_tier: string | null
          maintenance_expires_at: string | null
          maintenance_new_vip_count: number
          maintenance_started_at: string | null
          monthly_new_vip_count: number
          promoted_at: string | null
          special_bonus_active: boolean
          special_bonus_month: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          current_tier?: string | null
          maintenance_expires_at?: string | null
          maintenance_new_vip_count?: number
          maintenance_started_at?: string | null
          monthly_new_vip_count?: number
          promoted_at?: string | null
          special_bonus_active?: boolean
          special_bonus_month?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          current_tier?: string | null
          maintenance_expires_at?: string | null
          maintenance_new_vip_count?: number
          maintenance_started_at?: string | null
          monthly_new_vip_count?: number
          promoted_at?: string | null
          special_bonus_active?: boolean
          special_bonus_month?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "dealer_tier_status_current_tier_fkey"
            columns: ["current_tier"]
            isOneToOne: false
            referencedRelation: "dealer_tiers"
            referencedColumns: ["code"]
          },
        ]
      }
      dealer_tiers: {
        Row: {
          code: string
          condition_logic: string
          description: string | null
          freeze_when_points_below: boolean
          global_bonus_income_threshold: number
          global_bonus_rate: number
          maintenance_required_new_e_store: number
          maintenance_required_vip: number
          maintenance_window_days: number
          monthly_points_required: number
          name: string
          operating_bonus_rate: number
          rebate_rate: number
          required_direct_vip: number
          required_mentor_count: number
          required_mentor_count_secondary: number
          required_mentor_tier: string | null
          required_mentor_tier_secondary: string | null
          required_pv: number
          sort_order: number
          special_bonus_label: string | null
          special_bonus_rate: number
          special_bonus_trigger_count: number
          status: string
          tier_type: string
          updated_at: string
          upgrade_bonus_cap: number
        }
        Insert: {
          code: string
          condition_logic?: string
          description?: string | null
          freeze_when_points_below?: boolean
          global_bonus_income_threshold?: number
          global_bonus_rate?: number
          maintenance_required_new_e_store?: number
          maintenance_required_vip?: number
          maintenance_window_days?: number
          monthly_points_required?: number
          name: string
          operating_bonus_rate?: number
          rebate_rate?: number
          required_direct_vip?: number
          required_mentor_count?: number
          required_mentor_count_secondary?: number
          required_mentor_tier?: string | null
          required_mentor_tier_secondary?: string | null
          required_pv?: number
          sort_order?: number
          special_bonus_label?: string | null
          special_bonus_rate?: number
          special_bonus_trigger_count?: number
          status?: string
          tier_type?: string
          updated_at?: string
          upgrade_bonus_cap?: number
        }
        Update: {
          code?: string
          condition_logic?: string
          description?: string | null
          freeze_when_points_below?: boolean
          global_bonus_income_threshold?: number
          global_bonus_rate?: number
          maintenance_required_new_e_store?: number
          maintenance_required_vip?: number
          maintenance_window_days?: number
          monthly_points_required?: number
          name?: string
          operating_bonus_rate?: number
          rebate_rate?: number
          required_direct_vip?: number
          required_mentor_count?: number
          required_mentor_count_secondary?: number
          required_mentor_tier?: string | null
          required_mentor_tier_secondary?: string | null
          required_pv?: number
          sort_order?: number
          special_bonus_label?: string | null
          special_bonus_rate?: number
          special_bonus_trigger_count?: number
          status?: string
          tier_type?: string
          updated_at?: string
          upgrade_bonus_cap?: number
        }
        Relationships: []
      }
      dealers: {
        Row: {
          address: string | null
          code: string
          company_id: string
          contact: string | null
          created_at: string
          credit_limit: number
          email: string | null
          id: string
          name: string
          notes: string | null
          phone: string | null
          status: string
          tier: string
          updated_at: string
        }
        Insert: {
          address?: string | null
          code: string
          company_id?: string
          contact?: string | null
          created_at?: string
          credit_limit?: number
          email?: string | null
          id?: string
          name: string
          notes?: string | null
          phone?: string | null
          status?: string
          tier?: string
          updated_at?: string
        }
        Update: {
          address?: string | null
          code?: string
          company_id?: string
          contact?: string | null
          created_at?: string
          credit_limit?: number
          email?: string | null
          id?: string
          name?: string
          notes?: string | null
          phone?: string | null
          status?: string
          tier?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "dealers_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      email_send_log: {
        Row: {
          created_at: string
          error_message: string | null
          id: string
          message_id: string | null
          metadata: Json | null
          recipient_email: string
          status: string
          template_name: string
        }
        Insert: {
          created_at?: string
          error_message?: string | null
          id?: string
          message_id?: string | null
          metadata?: Json | null
          recipient_email: string
          status: string
          template_name: string
        }
        Update: {
          created_at?: string
          error_message?: string | null
          id?: string
          message_id?: string | null
          metadata?: Json | null
          recipient_email?: string
          status?: string
          template_name?: string
        }
        Relationships: []
      }
      email_send_state: {
        Row: {
          auth_email_ttl_minutes: number
          batch_size: number
          id: number
          retry_after_until: string | null
          send_delay_ms: number
          transactional_email_ttl_minutes: number
          updated_at: string
        }
        Insert: {
          auth_email_ttl_minutes?: number
          batch_size?: number
          id?: number
          retry_after_until?: string | null
          send_delay_ms?: number
          transactional_email_ttl_minutes?: number
          updated_at?: string
        }
        Update: {
          auth_email_ttl_minutes?: number
          batch_size?: number
          id?: number
          retry_after_until?: string | null
          send_delay_ms?: number
          transactional_email_ttl_minutes?: number
          updated_at?: string
        }
        Relationships: []
      }
      email_unsubscribe_tokens: {
        Row: {
          created_at: string
          email: string
          id: string
          token: string
          used_at: string | null
        }
        Insert: {
          created_at?: string
          email: string
          id?: string
          token: string
          used_at?: string | null
        }
        Update: {
          created_at?: string
          email?: string
          id?: string
          token?: string
          used_at?: string | null
        }
        Relationships: []
      }
      finance_transactions: {
        Row: {
          amount: number
          bank_account_id: string | null
          category: string
          company_id: string
          created_at: string
          created_by: string | null
          description: string | null
          id: string
          occurred_at: string
          payment_method: string
          reference_no: string | null
          reference_type: string | null
          type: string
          updated_at: string
        }
        Insert: {
          amount?: number
          bank_account_id?: string | null
          category: string
          company_id?: string
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          occurred_at?: string
          payment_method?: string
          reference_no?: string | null
          reference_type?: string | null
          type: string
          updated_at?: string
        }
        Update: {
          amount?: number
          bank_account_id?: string | null
          category?: string
          company_id?: string
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          occurred_at?: string
          payment_method?: string
          reference_no?: string | null
          reference_type?: string | null
          type?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "finance_transactions_bank_account_id_fkey"
            columns: ["bank_account_id"]
            isOneToOne: false
            referencedRelation: "bank_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "finance_transactions_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      goods_receiving: {
        Row: {
          company_id: string
          created_at: string
          id: string
          notes: string | null
          purchase_order_id: string
          receipt_no: string
          received_by: string | null
          received_date: string
          status: string
          warehouse_id: string | null
        }
        Insert: {
          company_id?: string
          created_at?: string
          id?: string
          notes?: string | null
          purchase_order_id: string
          receipt_no: string
          received_by?: string | null
          received_date?: string
          status?: string
          warehouse_id?: string | null
        }
        Update: {
          company_id?: string
          created_at?: string
          id?: string
          notes?: string | null
          purchase_order_id?: string
          receipt_no?: string
          received_by?: string | null
          received_date?: string
          status?: string
          warehouse_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "goods_receiving_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "goods_receiving_purchase_order_id_fkey"
            columns: ["purchase_order_id"]
            isOneToOne: false
            referencedRelation: "purchase_orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "goods_receiving_warehouse_id_fkey"
            columns: ["warehouse_id"]
            isOneToOne: false
            referencedRelation: "warehouses"
            referencedColumns: ["id"]
          },
        ]
      }
      inventory_logs: {
        Row: {
          after_stock: number
          before_stock: number
          company_id: string
          created_at: string
          id: string
          operator_id: string | null
          product_id: string | null
          quantity: number
          reason: string | null
          type: string
        }
        Insert: {
          after_stock?: number
          before_stock?: number
          company_id: string
          created_at?: string
          id?: string
          operator_id?: string | null
          product_id?: string | null
          quantity: number
          reason?: string | null
          type: string
        }
        Update: {
          after_stock?: number
          before_stock?: number
          company_id?: string
          created_at?: string
          id?: string
          operator_id?: string | null
          product_id?: string | null
          quantity?: number
          reason?: string | null
          type?: string
        }
        Relationships: [
          {
            foreignKeyName: "inventory_logs_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventory_logs_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      inventory_transactions: {
        Row: {
          after_stock: number
          before_stock: number
          company_id: string
          created_at: string
          id: string
          operator_id: string | null
          product_id: string | null
          quantity: number
          reason: string | null
          reference_no: string | null
          type: string
          warehouse_id: string | null
        }
        Insert: {
          after_stock?: number
          before_stock?: number
          company_id: string
          created_at?: string
          id?: string
          operator_id?: string | null
          product_id?: string | null
          quantity?: number
          reason?: string | null
          reference_no?: string | null
          type: string
          warehouse_id?: string | null
        }
        Update: {
          after_stock?: number
          before_stock?: number
          company_id?: string
          created_at?: string
          id?: string
          operator_id?: string | null
          product_id?: string | null
          quantity?: number
          reason?: string | null
          reference_no?: string | null
          type?: string
          warehouse_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "inventory_transactions_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventory_transactions_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventory_transactions_warehouse_id_fkey"
            columns: ["warehouse_id"]
            isOneToOne: false
            referencedRelation: "warehouses"
            referencedColumns: ["id"]
          },
        ]
      }
      invoices: {
        Row: {
          amount: number
          buyer_name: string
          company_id: string
          created_at: string
          external_id: string | null
          id: string
          invoice_no: string
          invoice_type: string
          issued_at: string | null
          sales_order_id: string | null
          status: string
          tax_amount: number
          tax_id: string | null
          total_amount: number
          updated_at: string
          void_at: string | null
        }
        Insert: {
          amount?: number
          buyer_name: string
          company_id?: string
          created_at?: string
          external_id?: string | null
          id?: string
          invoice_no: string
          invoice_type?: string
          issued_at?: string | null
          sales_order_id?: string | null
          status?: string
          tax_amount?: number
          tax_id?: string | null
          total_amount?: number
          updated_at?: string
          void_at?: string | null
        }
        Update: {
          amount?: number
          buyer_name?: string
          company_id?: string
          created_at?: string
          external_id?: string | null
          id?: string
          invoice_no?: string
          invoice_type?: string
          issued_at?: string | null
          sales_order_id?: string | null
          status?: string
          tax_amount?: number
          tax_id?: string | null
          total_amount?: number
          updated_at?: string
          void_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "invoices_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoices_sales_order_id_fkey"
            columns: ["sales_order_id"]
            isOneToOne: false
            referencedRelation: "sales_orders"
            referencedColumns: ["id"]
          },
        ]
      }
      login_attempts: {
        Row: {
          created_at: string
          email: string | null
          failure_reason: string | null
          id: string
          ip_address: string | null
          success: boolean
          user_agent: string | null
          user_id: string | null
        }
        Insert: {
          created_at?: string
          email?: string | null
          failure_reason?: string | null
          id?: string
          ip_address?: string | null
          success?: boolean
          user_agent?: string | null
          user_id?: string | null
        }
        Update: {
          created_at?: string
          email?: string | null
          failure_reason?: string | null
          id?: string
          ip_address?: string | null
          success?: boolean
          user_agent?: string | null
          user_id?: string | null
        }
        Relationships: []
      }
      member_points_wallet: {
        Row: {
          discount_points: number
          reward_points: number
          shopping_points: number
          updated_at: string
          user_id: string
        }
        Insert: {
          discount_points?: number
          reward_points?: number
          shopping_points?: number
          updated_at?: string
          user_id: string
        }
        Update: {
          discount_points?: number
          reward_points?: number
          shopping_points?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      moq_rules: {
        Row: {
          carton_quantity: number
          company_id: string
          created_at: string
          id: string
          moq: number
          product_id: string
          updated_at: string
          volume_tiers: Json
        }
        Insert: {
          carton_quantity?: number
          company_id?: string
          created_at?: string
          id?: string
          moq?: number
          product_id: string
          updated_at?: string
          volume_tiers?: Json
        }
        Update: {
          carton_quantity?: number
          company_id?: string
          created_at?: string
          id?: string
          moq?: number
          product_id?: string
          updated_at?: string
          volume_tiers?: Json
        }
        Relationships: [
          {
            foreignKeyName: "moq_rules_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      notification_rules: {
        Row: {
          channels: string[]
          conditions: Json
          created_at: string
          id: string
          name: string
          rule_type: string
          status: string
          updated_at: string
        }
        Insert: {
          channels?: string[]
          conditions?: Json
          created_at?: string
          id?: string
          name: string
          rule_type: string
          status?: string
          updated_at?: string
        }
        Update: {
          channels?: string[]
          conditions?: Json
          created_at?: string
          id?: string
          name?: string
          rule_type?: string
          status?: string
          updated_at?: string
        }
        Relationships: []
      }
      notifications: {
        Row: {
          created_at: string
          id: string
          message: string | null
          read: boolean
          title: string
          type: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          message?: string | null
          read?: boolean
          title: string
          type?: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          message?: string | null
          read?: boolean
          title?: string
          type?: string
          user_id?: string
        }
        Relationships: []
      }
      orders: {
        Row: {
          company_id: string
          created_at: string
          customer_name: string
          id: string
          order_no: string
          status: string
          total_amount: number
        }
        Insert: {
          company_id?: string
          created_at?: string
          customer_name: string
          id?: string
          order_no: string
          status?: string
          total_amount?: number
        }
        Update: {
          company_id?: string
          created_at?: string
          customer_name?: string
          id?: string
          order_no?: string
          status?: string
          total_amount?: number
        }
        Relationships: [
          {
            foreignKeyName: "orders_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      payments: {
        Row: {
          amount: number
          company_id: string
          created_at: string
          id: string
          paid_at: string | null
          payment_method: string
          payment_status: string
          sales_order_id: string
          transaction_id: string | null
        }
        Insert: {
          amount?: number
          company_id: string
          created_at?: string
          id?: string
          paid_at?: string | null
          payment_method: string
          payment_status?: string
          sales_order_id: string
          transaction_id?: string | null
        }
        Update: {
          amount?: number
          company_id?: string
          created_at?: string
          id?: string
          paid_at?: string | null
          payment_method?: string
          payment_status?: string
          sales_order_id?: string
          transaction_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "payments_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payments_sales_order_id_fkey"
            columns: ["sales_order_id"]
            isOneToOne: false
            referencedRelation: "sales_orders"
            referencedColumns: ["id"]
          },
        ]
      }
      point_transactions: {
        Row: {
          amount: number
          balance_after: number
          created_at: string
          created_by: string | null
          id: string
          note: string | null
          point_type: string
          reference_id: string | null
          source: string
          user_id: string
        }
        Insert: {
          amount: number
          balance_after: number
          created_at?: string
          created_by?: string | null
          id?: string
          note?: string | null
          point_type: string
          reference_id?: string | null
          source: string
          user_id: string
        }
        Update: {
          amount?: number
          balance_after?: number
          created_at?: string
          created_by?: string | null
          id?: string
          note?: string | null
          point_type?: string
          reference_id?: string | null
          source?: string
          user_id?: string
        }
        Relationships: []
      }
      price_tiers: {
        Row: {
          account_level: string
          company_id: string
          created_at: string
          id: string
          min_quantity: number
          price: number
          product_id: string
        }
        Insert: {
          account_level: string
          company_id?: string
          created_at?: string
          id?: string
          min_quantity?: number
          price?: number
          product_id: string
        }
        Update: {
          account_level?: string
          company_id?: string
          created_at?: string
          id?: string
          min_quantity?: number
          price?: number
          product_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "price_tiers_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      product_images: {
        Row: {
          company_id: string
          created_at: string
          id: string
          image_url: string
          product_id: string
          sort_order: number
        }
        Insert: {
          company_id?: string
          created_at?: string
          id?: string
          image_url: string
          product_id: string
          sort_order?: number
        }
        Update: {
          company_id?: string
          created_at?: string
          id?: string
          image_url?: string
          product_id?: string
          sort_order?: number
        }
        Relationships: [
          {
            foreignKeyName: "product_images_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "product_images_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      products: {
        Row: {
          category: string | null
          category_id: string | null
          company_id: string
          cost_price: number
          created_at: string
          description: string | null
          discount_points_max: number
          featured: boolean
          id: string
          image: string | null
          name: string
          price: number
          reward_points: number
          safe_stock: number
          short_description: string | null
          sku: string
          status: string
          stock: number
          updated_at: string
          wholesale_price: number
        }
        Insert: {
          category?: string | null
          category_id?: string | null
          company_id: string
          cost_price?: number
          created_at?: string
          description?: string | null
          discount_points_max?: number
          featured?: boolean
          id?: string
          image?: string | null
          name: string
          price?: number
          reward_points?: number
          safe_stock?: number
          short_description?: string | null
          sku: string
          status?: string
          stock?: number
          updated_at?: string
          wholesale_price?: number
        }
        Update: {
          category?: string | null
          category_id?: string | null
          company_id?: string
          cost_price?: number
          created_at?: string
          description?: string | null
          discount_points_max?: number
          featured?: boolean
          id?: string
          image?: string | null
          name?: string
          price?: number
          reward_points?: number
          safe_stock?: number
          short_description?: string | null
          sku?: string
          status?: string
          stock?: number
          updated_at?: string
          wholesale_price?: number
        }
        Relationships: [
          {
            foreignKeyName: "products_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "products_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          avatar_url: string | null
          created_at: string
          current_company_id: string | null
          email: string | null
          id: string
          is_dealer: boolean
          is_vip: boolean
          marketing_slug: string | null
          member_no: string | null
          name: string | null
          phone: string | null
          referral_code: string | null
          referred_by: string | null
          vip_expires_at: string | null
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string
          current_company_id?: string | null
          email?: string | null
          id: string
          is_dealer?: boolean
          is_vip?: boolean
          marketing_slug?: string | null
          member_no?: string | null
          name?: string | null
          phone?: string | null
          referral_code?: string | null
          referred_by?: string | null
          vip_expires_at?: string | null
        }
        Update: {
          avatar_url?: string | null
          created_at?: string
          current_company_id?: string | null
          email?: string | null
          id?: string
          is_dealer?: boolean
          is_vip?: boolean
          marketing_slug?: string | null
          member_no?: string | null
          name?: string | null
          phone?: string | null
          referral_code?: string | null
          referred_by?: string | null
          vip_expires_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "profiles_current_company_id_fkey"
            columns: ["current_company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "profiles_referred_by_fkey"
            columns: ["referred_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      purchase_order_items: {
        Row: {
          company_id: string
          created_at: string
          id: string
          price: number
          product_id: string | null
          product_name: string
          purchase_order_id: string
          quantity: number
          received_quantity: number
          sku: string | null
          subtotal: number
          unit: string | null
        }
        Insert: {
          company_id?: string
          created_at?: string
          id?: string
          price?: number
          product_id?: string | null
          product_name: string
          purchase_order_id: string
          quantity?: number
          received_quantity?: number
          sku?: string | null
          subtotal?: number
          unit?: string | null
        }
        Update: {
          company_id?: string
          created_at?: string
          id?: string
          price?: number
          product_id?: string | null
          product_name?: string
          purchase_order_id?: string
          quantity?: number
          received_quantity?: number
          sku?: string | null
          subtotal?: number
          unit?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "purchase_order_items_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "purchase_order_items_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "purchase_order_items_purchase_order_id_fkey"
            columns: ["purchase_order_id"]
            isOneToOne: false
            referencedRelation: "purchase_orders"
            referencedColumns: ["id"]
          },
        ]
      }
      purchase_orders: {
        Row: {
          company_id: string
          created_at: string
          created_by: string | null
          expected_at: string | null
          id: string
          notes: string | null
          po_no: string
          status: string
          subtotal: number
          tax_amount: number
          total_amount: number
          updated_at: string
          vendor_id: string | null
          vendor_name: string
        }
        Insert: {
          company_id?: string
          created_at?: string
          created_by?: string | null
          expected_at?: string | null
          id?: string
          notes?: string | null
          po_no: string
          status?: string
          subtotal?: number
          tax_amount?: number
          total_amount?: number
          updated_at?: string
          vendor_id?: string | null
          vendor_name: string
        }
        Update: {
          company_id?: string
          created_at?: string
          created_by?: string | null
          expected_at?: string | null
          id?: string
          notes?: string | null
          po_no?: string
          status?: string
          subtotal?: number
          tax_amount?: number
          total_amount?: number
          updated_at?: string
          vendor_id?: string | null
          vendor_name?: string
        }
        Relationships: [
          {
            foreignKeyName: "purchase_orders_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      referral_logs: {
        Row: {
          base_amount: number
          buyer_id: string | null
          created_at: string
          id: string
          note: string | null
          order_id: string
          points: number
          rate_percent: number
          referrer_id: string
          status: string
        }
        Insert: {
          base_amount?: number
          buyer_id?: string | null
          created_at?: string
          id?: string
          note?: string | null
          order_id: string
          points?: number
          rate_percent?: number
          referrer_id: string
          status?: string
        }
        Update: {
          base_amount?: number
          buyer_id?: string | null
          created_at?: string
          id?: string
          note?: string | null
          order_id?: string
          points?: number
          rate_percent?: number
          referrer_id?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "referral_logs_buyer_id_fkey"
            columns: ["buyer_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "referral_logs_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: true
            referencedRelation: "sales_orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "referral_logs_referrer_id_fkey"
            columns: ["referrer_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      referrals: {
        Row: {
          created_at: string
          id: string
          referral_code: string
          referred_user_id: string
          referrer_id: string
          signup_reward_points: number
          signup_rewarded_at: string | null
        }
        Insert: {
          created_at?: string
          id?: string
          referral_code: string
          referred_user_id: string
          referrer_id: string
          signup_reward_points?: number
          signup_rewarded_at?: string | null
        }
        Update: {
          created_at?: string
          id?: string
          referral_code?: string
          referred_user_id?: string
          referrer_id?: string
          signup_reward_points?: number
          signup_rewarded_at?: string | null
        }
        Relationships: []
      }
      sales_order_items: {
        Row: {
          company_id: string
          created_at: string
          id: string
          image: string | null
          product_id: string | null
          product_name: string
          quantity: number
          sales_order_id: string
          sku: string | null
          subtotal: number
          unit_price: number
        }
        Insert: {
          company_id: string
          created_at?: string
          id?: string
          image?: string | null
          product_id?: string | null
          product_name: string
          quantity?: number
          sales_order_id: string
          sku?: string | null
          subtotal?: number
          unit_price?: number
        }
        Update: {
          company_id?: string
          created_at?: string
          id?: string
          image?: string | null
          product_id?: string | null
          product_name?: string
          quantity?: number
          sales_order_id?: string
          sku?: string | null
          subtotal?: number
          unit_price?: number
        }
        Relationships: [
          {
            foreignKeyName: "sales_order_items_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sales_order_items_sales_order_id_fkey"
            columns: ["sales_order_id"]
            isOneToOne: false
            referencedRelation: "sales_orders"
            referencedColumns: ["id"]
          },
        ]
      }
      sales_orders: {
        Row: {
          company_id: string
          coupon_code: string | null
          created_at: string
          customer_email: string | null
          customer_id: string | null
          customer_name: string
          customer_phone: string | null
          discount_amount: number
          id: string
          invoice_tax_id: string | null
          invoice_type: string | null
          notes: string | null
          order_no: string
          order_status: string
          payment_status: string
          receiver_name: string
          receiver_phone: string
          referrer_id: string | null
          shipping_address: string
          shipping_fee: number
          shipping_method: string
          shipping_status: string
          subtotal: number
          total_amount: number
          updated_at: string
          user_id: string | null
        }
        Insert: {
          company_id: string
          coupon_code?: string | null
          created_at?: string
          customer_email?: string | null
          customer_id?: string | null
          customer_name: string
          customer_phone?: string | null
          discount_amount?: number
          id?: string
          invoice_tax_id?: string | null
          invoice_type?: string | null
          notes?: string | null
          order_no: string
          order_status?: string
          payment_status?: string
          receiver_name: string
          receiver_phone: string
          referrer_id?: string | null
          shipping_address: string
          shipping_fee?: number
          shipping_method?: string
          shipping_status?: string
          subtotal?: number
          total_amount?: number
          updated_at?: string
          user_id?: string | null
        }
        Update: {
          company_id?: string
          coupon_code?: string | null
          created_at?: string
          customer_email?: string | null
          customer_id?: string | null
          customer_name?: string
          customer_phone?: string | null
          discount_amount?: number
          id?: string
          invoice_tax_id?: string | null
          invoice_type?: string | null
          notes?: string | null
          order_no?: string
          order_status?: string
          payment_status?: string
          receiver_name?: string
          receiver_phone?: string
          referrer_id?: string | null
          shipping_address?: string
          shipping_fee?: number
          shipping_method?: string
          shipping_status?: string
          subtotal?: number
          total_amount?: number
          updated_at?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "sales_orders_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sales_orders_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sales_orders_referrer_id_fkey"
            columns: ["referrer_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      sales_representatives: {
        Row: {
          commission_rate: number
          company_id: string
          created_at: string
          department: string | null
          id: string
          name: string
          status: string
          user_id: string
        }
        Insert: {
          commission_rate?: number
          company_id?: string
          created_at?: string
          department?: string | null
          id?: string
          name: string
          status?: string
          user_id: string
        }
        Update: {
          commission_rate?: number
          company_id?: string
          created_at?: string
          department?: string | null
          id?: string
          name?: string
          status?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "sales_representatives_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      shipments: {
        Row: {
          company_id: string
          created_at: string
          delivered_at: string | null
          id: string
          sales_order_id: string
          shipped_at: string | null
          shipping_company: string
          status: string
          tracking_no: string | null
          updated_at: string
        }
        Insert: {
          company_id?: string
          created_at?: string
          delivered_at?: string | null
          id?: string
          sales_order_id: string
          shipped_at?: string | null
          shipping_company: string
          status?: string
          tracking_no?: string | null
          updated_at?: string
        }
        Update: {
          company_id?: string
          created_at?: string
          delivered_at?: string | null
          id?: string
          sales_order_id?: string
          shipped_at?: string | null
          shipping_company?: string
          status?: string
          tracking_no?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "shipments_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "shipments_sales_order_id_fkey"
            columns: ["sales_order_id"]
            isOneToOne: false
            referencedRelation: "sales_orders"
            referencedColumns: ["id"]
          },
        ]
      }
      support_announcements: {
        Row: {
          content: string
          created_at: string
          created_by: string | null
          id: string
          is_active: boolean
          title: string
          updated_at: string
        }
        Insert: {
          content: string
          created_at?: string
          created_by?: string | null
          id?: string
          is_active?: boolean
          title: string
          updated_at?: string
        }
        Update: {
          content?: string
          created_at?: string
          created_by?: string | null
          id?: string
          is_active?: boolean
          title?: string
          updated_at?: string
        }
        Relationships: []
      }
      support_checkins: {
        Row: {
          checkin_date: string
          created_at: string
          id: string
          user_id: string
        }
        Insert: {
          checkin_date?: string
          created_at?: string
          id?: string
          user_id: string
        }
        Update: {
          checkin_date?: string
          created_at?: string
          id?: string
          user_id?: string
        }
        Relationships: []
      }
      support_messages: {
        Row: {
          content: string
          created_at: string
          id: string
          role: string
          thread_id: string
          user_id: string
        }
        Insert: {
          content: string
          created_at?: string
          id?: string
          role: string
          thread_id: string
          user_id: string
        }
        Update: {
          content?: string
          created_at?: string
          id?: string
          role?: string
          thread_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "support_messages_thread_id_fkey"
            columns: ["thread_id"]
            isOneToOne: false
            referencedRelation: "support_threads"
            referencedColumns: ["id"]
          },
        ]
      }
      support_threads: {
        Row: {
          created_at: string
          id: string
          title: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          title?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          title?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      suppressed_emails: {
        Row: {
          created_at: string
          email: string
          id: string
          metadata: Json | null
          reason: string
        }
        Insert: {
          created_at?: string
          email: string
          id?: string
          metadata?: Json | null
          reason: string
        }
        Update: {
          created_at?: string
          email?: string
          id?: string
          metadata?: Json | null
          reason?: string
        }
        Relationships: []
      }
      system_settings: {
        Row: {
          created_at: string
          description: string | null
          id: string
          key: string
          updated_at: string
          updated_by: string | null
          value: Json
        }
        Insert: {
          created_at?: string
          description?: string | null
          id?: string
          key: string
          updated_at?: string
          updated_by?: string | null
          value?: Json
        }
        Update: {
          created_at?: string
          description?: string | null
          id?: string
          key?: string
          updated_at?: string
          updated_by?: string | null
          value?: Json
        }
        Relationships: []
      }
      user_2fa: {
        Row: {
          backup_codes: string[]
          created_at: string
          enabled: boolean
          enrolled_at: string | null
          last_used_at: string | null
          secret: string
          updated_at: string
          user_id: string
        }
        Insert: {
          backup_codes?: string[]
          created_at?: string
          enabled?: boolean
          enrolled_at?: string | null
          last_used_at?: string | null
          secret: string
          updated_at?: string
          user_id: string
        }
        Update: {
          backup_codes?: string[]
          created_at?: string
          enabled?: boolean
          enrolled_at?: string | null
          last_used_at?: string | null
          secret?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
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
      user_sessions: {
        Row: {
          created_at: string
          device_label: string | null
          expires_at: string | null
          id: string
          ip_address: string | null
          last_active_at: string
          mfa_verified_at: string | null
          revoked_at: string | null
          session_token_hash: string
          user_agent: string | null
          user_id: string
        }
        Insert: {
          created_at?: string
          device_label?: string | null
          expires_at?: string | null
          id?: string
          ip_address?: string | null
          last_active_at?: string
          mfa_verified_at?: string | null
          revoked_at?: string | null
          session_token_hash: string
          user_agent?: string | null
          user_id: string
        }
        Update: {
          created_at?: string
          device_label?: string | null
          expires_at?: string | null
          id?: string
          ip_address?: string | null
          last_active_at?: string
          mfa_verified_at?: string | null
          revoked_at?: string | null
          session_token_hash?: string
          user_agent?: string | null
          user_id?: string
        }
        Relationships: []
      }
      vendors: {
        Row: {
          address: string | null
          bank_account: string | null
          code: string
          company_id: string
          contact: string | null
          created_at: string
          email: string | null
          id: string
          name: string
          notes: string | null
          payment_terms: string | null
          phone: string | null
          shipping_method: string | null
          status: string
          tax_id: string | null
          updated_at: string
        }
        Insert: {
          address?: string | null
          bank_account?: string | null
          code: string
          company_id?: string
          contact?: string | null
          created_at?: string
          email?: string | null
          id?: string
          name: string
          notes?: string | null
          payment_terms?: string | null
          phone?: string | null
          shipping_method?: string | null
          status?: string
          tax_id?: string | null
          updated_at?: string
        }
        Update: {
          address?: string | null
          bank_account?: string | null
          code?: string
          company_id?: string
          contact?: string | null
          created_at?: string
          email?: string | null
          id?: string
          name?: string
          notes?: string | null
          payment_terms?: string | null
          phone?: string | null
          shipping_method?: string | null
          status?: string
          tax_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "vendors_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      vip_memberships: {
        Row: {
          amount_paid: number
          created_at: string
          expires_at: string
          id: string
          notes: string | null
          plan_id: string | null
          source: string
          started_at: string
          user_id: string
        }
        Insert: {
          amount_paid?: number
          created_at?: string
          expires_at: string
          id?: string
          notes?: string | null
          plan_id?: string | null
          source?: string
          started_at?: string
          user_id: string
        }
        Update: {
          amount_paid?: number
          created_at?: string
          expires_at?: string
          id?: string
          notes?: string | null
          plan_id?: string | null
          source?: string
          started_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "vip_memberships_plan_id_fkey"
            columns: ["plan_id"]
            isOneToOne: false
            referencedRelation: "vip_plans"
            referencedColumns: ["id"]
          },
        ]
      }
      vip_plans: {
        Row: {
          bonus_points: number
          created_at: string
          description: string | null
          duration_days: number
          id: string
          name: string
          price: number
          referral_rate_percent: number
          sort_order: number
          status: string
          updated_at: string
        }
        Insert: {
          bonus_points?: number
          created_at?: string
          description?: string | null
          duration_days?: number
          id?: string
          name: string
          price?: number
          referral_rate_percent?: number
          sort_order?: number
          status?: string
          updated_at?: string
        }
        Update: {
          bonus_points?: number
          created_at?: string
          description?: string | null
          duration_days?: number
          id?: string
          name?: string
          price?: number
          referral_rate_percent?: number
          sort_order?: number
          status?: string
          updated_at?: string
        }
        Relationships: []
      }
      warehouse_inventory: {
        Row: {
          company_id: string
          id: string
          product_id: string
          stock: number
          updated_at: string
          warehouse_id: string
        }
        Insert: {
          company_id?: string
          id?: string
          product_id: string
          stock?: number
          updated_at?: string
          warehouse_id: string
        }
        Update: {
          company_id?: string
          id?: string
          product_id?: string
          stock?: number
          updated_at?: string
          warehouse_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "warehouse_inventory_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "warehouse_inventory_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "warehouse_inventory_warehouse_id_fkey"
            columns: ["warehouse_id"]
            isOneToOne: false
            referencedRelation: "warehouses"
            referencedColumns: ["id"]
          },
        ]
      }
      warehouses: {
        Row: {
          address: string | null
          company_id: string
          created_at: string
          id: string
          name: string
          notes: string | null
          status: string
          updated_at: string
          warehouse_code: string
        }
        Insert: {
          address?: string | null
          company_id?: string
          created_at?: string
          id?: string
          name: string
          notes?: string | null
          status?: string
          updated_at?: string
          warehouse_code: string
        }
        Update: {
          address?: string | null
          company_id?: string
          created_at?: string
          id?: string
          name?: string
          notes?: string | null
          status?: string
          updated_at?: string
          warehouse_code?: string
        }
        Relationships: [
          {
            foreignKeyName: "warehouses_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      wishlist: {
        Row: {
          created_at: string
          id: string
          product_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          product_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          product_id?: string
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      create_sales_order_with_items: {
        Args: { _items: Json; _order: Json; _payments?: Json }
        Returns: {
          company_id: string
          coupon_code: string | null
          created_at: string
          customer_email: string | null
          customer_id: string | null
          customer_name: string
          customer_phone: string | null
          discount_amount: number
          id: string
          invoice_tax_id: string | null
          invoice_type: string | null
          notes: string | null
          order_no: string
          order_status: string
          payment_status: string
          receiver_name: string
          receiver_phone: string
          referrer_id: string | null
          shipping_address: string
          shipping_fee: number
          shipping_method: string
          shipping_status: string
          subtotal: number
          total_amount: number
          updated_at: string
          user_id: string | null
        }
        SetofOptions: {
          from: "*"
          to: "sales_orders"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      current_company_id: { Args: never; Returns: string }
      delete_email: {
        Args: { message_id: number; queue_name: string }
        Returns: boolean
      }
      enqueue_email: {
        Args: { payload: Json; queue_name: string }
        Returns: number
      }
      generate_member_no: { Args: never; Returns: string }
      generate_po_no: { Args: never; Returns: string }
      generate_receipt_no: { Args: never; Returns: string }
      generate_referral_code: { Args: never; Returns: string }
      generate_so_no: { Args: never; Returns: string }
      get_company_by_slug: {
        Args: { _slug: string }
        Returns: {
          company_name: string
          id: string
          logo_url: string
          slug: string
        }[]
      }
      get_public_companies: {
        Args: never
        Returns: {
          company_name: string
          id: string
          logo_url: string
          slug: string
        }[]
      }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      is_company_member: {
        Args: { _company_id: string; _user_id: string }
        Returns: boolean
      }
      move_to_dlq: {
        Args: {
          dlq_name: string
          message_id: number
          payload: Json
          source_queue: string
        }
        Returns: number
      }
      read_email_batch: {
        Args: { batch_size: number; queue_name: string; vt: number }
        Returns: {
          message: Json
          msg_id: number
          read_ct: number
        }[]
      }
      set_default_address: { Args: { _address_id: string }; Returns: undefined }
      slugify_company_name: { Args: { _name: string }; Returns: string }
    }
    Enums: {
      app_role:
        | "super_admin"
        | "finance"
        | "warehouse"
        | "sales"
        | "vendor"
        | "member"
        | "admin"
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
      app_role: [
        "super_admin",
        "finance",
        "warehouse",
        "sales",
        "vendor",
        "member",
        "admin",
      ],
    },
  },
} as const
