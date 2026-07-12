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
      annual_fee_upgrade_logs: {
        Row: {
          created_at: string
          gift_product_id: string | null
          gift_quantity: number | null
          id: string
          notes: string | null
          rule_id: string | null
          sales_order_id: string
          sku: string
          status: string
          upgrade_days: number
          user_id: string
          vip_expires_after: string
          vip_expires_before: string | null
        }
        Insert: {
          created_at?: string
          gift_product_id?: string | null
          gift_quantity?: number | null
          id?: string
          notes?: string | null
          rule_id?: string | null
          sales_order_id: string
          sku: string
          status?: string
          upgrade_days: number
          user_id: string
          vip_expires_after: string
          vip_expires_before?: string | null
        }
        Update: {
          created_at?: string
          gift_product_id?: string | null
          gift_quantity?: number | null
          id?: string
          notes?: string | null
          rule_id?: string | null
          sales_order_id?: string
          sku?: string
          status?: string
          upgrade_days?: number
          user_id?: string
          vip_expires_after?: string
          vip_expires_before?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "annual_fee_upgrade_logs_rule_id_fkey"
            columns: ["rule_id"]
            isOneToOne: false
            referencedRelation: "annual_fee_vip_rules"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "annual_fee_upgrade_logs_sales_order_id_fkey"
            columns: ["sales_order_id"]
            isOneToOne: false
            referencedRelation: "sales_orders"
            referencedColumns: ["id"]
          },
        ]
      }
      annual_fee_vip_rules: {
        Row: {
          company_id: string | null
          created_at: string
          gift_product_id: string | null
          gift_quantity: number
          id: string
          is_active: boolean
          notes: string | null
          reward_points: number
          show_on_vip_upgrade_page: boolean
          sku: string
          sort_order: number
          target_tier_code: string | null
          updated_at: string
          upgrade_days: number
        }
        Insert: {
          company_id?: string | null
          created_at?: string
          gift_product_id?: string | null
          gift_quantity?: number
          id?: string
          is_active?: boolean
          notes?: string | null
          reward_points?: number
          show_on_vip_upgrade_page?: boolean
          sku: string
          sort_order?: number
          target_tier_code?: string | null
          updated_at?: string
          upgrade_days?: number
        }
        Update: {
          company_id?: string | null
          created_at?: string
          gift_product_id?: string | null
          gift_quantity?: number
          id?: string
          is_active?: boolean
          notes?: string | null
          reward_points?: number
          show_on_vip_upgrade_page?: boolean
          sku?: string
          sort_order?: number
          target_tier_code?: string | null
          updated_at?: string
          upgrade_days?: number
        }
        Relationships: [
          {
            foreignKeyName: "annual_fee_vip_rules_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "annual_fee_vip_rules_gift_product_id_fkey"
            columns: ["gift_product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
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
      bonus_records: {
        Row: {
          base_amount: number
          bonus_points: number
          bonus_rate: number
          bonus_type: string
          created_at: string
          fail_reason: string | null
          failed_at: string | null
          generation_level: number | null
          id: string
          layer_level: number | null
          member_id: string
          original_member_id: string | null
          release_attempts: number
          release_date: string | null
          release_redirect_reason: string | null
          release_source: string | null
          released_at: string | null
          released_member_id: string | null
          required_points_checked: boolean
          required_points_passed: boolean
          settlement_batch_id: string | null
          settlement_date: string | null
          source_member_id: string | null
          source_order_id: string | null
          status: string
          updated_at: string
        }
        Insert: {
          base_amount?: number
          bonus_points?: number
          bonus_rate?: number
          bonus_type: string
          created_at?: string
          fail_reason?: string | null
          failed_at?: string | null
          generation_level?: number | null
          id?: string
          layer_level?: number | null
          member_id: string
          original_member_id?: string | null
          release_attempts?: number
          release_date?: string | null
          release_redirect_reason?: string | null
          release_source?: string | null
          released_at?: string | null
          released_member_id?: string | null
          required_points_checked?: boolean
          required_points_passed?: boolean
          settlement_batch_id?: string | null
          settlement_date?: string | null
          source_member_id?: string | null
          source_order_id?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          base_amount?: number
          bonus_points?: number
          bonus_rate?: number
          bonus_type?: string
          created_at?: string
          fail_reason?: string | null
          failed_at?: string | null
          generation_level?: number | null
          id?: string
          layer_level?: number | null
          member_id?: string
          original_member_id?: string | null
          release_attempts?: number
          release_date?: string | null
          release_redirect_reason?: string | null
          release_source?: string | null
          released_at?: string | null
          released_member_id?: string | null
          required_points_checked?: boolean
          required_points_passed?: boolean
          settlement_batch_id?: string | null
          settlement_date?: string | null
          source_member_id?: string | null
          source_order_id?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "bonus_records_settlement_batch_id_fkey"
            columns: ["settlement_batch_id"]
            isOneToOne: false
            referencedRelation: "bonus_settlement_batches"
            referencedColumns: ["id"]
          },
        ]
      }
      bonus_settings: {
        Row: {
          created_at: string
          daily_bonus_auto_enabled: boolean
          daily_bonus_cycle_days: number
          daily_next_settlement_at: string
          id: string
          monthly_bonus_mode: string
          monthly_bonus_settlement_day: number
          reward_release_days: number
          reward_release_mode: string
          singleton: boolean
          updated_at: string
          vip_required_points: number
        }
        Insert: {
          created_at?: string
          daily_bonus_auto_enabled?: boolean
          daily_bonus_cycle_days?: number
          daily_next_settlement_at?: string
          id?: string
          monthly_bonus_mode?: string
          monthly_bonus_settlement_day?: number
          reward_release_days?: number
          reward_release_mode?: string
          singleton?: boolean
          updated_at?: string
          vip_required_points?: number
        }
        Update: {
          created_at?: string
          daily_bonus_auto_enabled?: boolean
          daily_bonus_cycle_days?: number
          daily_next_settlement_at?: string
          id?: string
          monthly_bonus_mode?: string
          monthly_bonus_settlement_day?: number
          reward_release_days?: number
          reward_release_mode?: string
          singleton?: boolean
          updated_at?: string
          vip_required_points?: number
        }
        Relationships: []
      }
      bonus_settlement_batches: {
        Row: {
          completed_at: string | null
          created_at: string
          created_by: string | null
          id: string
          notes: string | null
          settlement_period_end: string
          settlement_period_start: string
          settlement_type: string
          source: string | null
          status: string
          total_bonus_points: number
          total_members: number
        }
        Insert: {
          completed_at?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          notes?: string | null
          settlement_period_end: string
          settlement_period_start: string
          settlement_type: string
          source?: string | null
          status?: string
          total_bonus_points?: number
          total_members?: number
        }
        Update: {
          completed_at?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          notes?: string | null
          settlement_period_end?: string
          settlement_period_start?: string
          settlement_type?: string
          source?: string | null
          status?: string
          total_bonus_points?: number
          total_members?: number
        }
        Relationships: []
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
          {
            foreignKeyName: "cart_items_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
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
      cash_transactions: {
        Row: {
          amount: number
          balance_after: number | null
          bank_info: string | null
          created_at: string
          created_by: string | null
          id: string
          note: string | null
          payment_method: string | null
          processed_at: string | null
          processed_by: string | null
          reference_id: string | null
          related_point_amount: number | null
          status: string
          tx_type: string
          user_id: string
        }
        Insert: {
          amount: number
          balance_after?: number | null
          bank_info?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          note?: string | null
          payment_method?: string | null
          processed_at?: string | null
          processed_by?: string | null
          reference_id?: string | null
          related_point_amount?: number | null
          status?: string
          tx_type: string
          user_id: string
        }
        Update: {
          amount?: number
          balance_after?: number | null
          bank_info?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          note?: string | null
          payment_method?: string | null
          processed_at?: string | null
          processed_by?: string | null
          reference_id?: string | null
          related_point_amount?: number | null
          status?: string
          tx_type?: string
          user_id?: string
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
      cooperation_applications: {
        Row: {
          address: string | null
          admin_note: string | null
          application_type: string
          audience_size: string | null
          city: string | null
          company_name: string | null
          contact_name: string | null
          created_at: string
          email: string
          expected_monthly_volume: string | null
          has_referrer: boolean | null
          id: string
          interested_products: string | null
          interested_topics: string[] | null
          line_id: string | null
          note: string | null
          owner_name: string | null
          phone: string
          referrer_info: string | null
          sales_channels: string[] | null
          sales_platform_url: string | null
          status: string
          tax_id: string | null
          updated_at: string
        }
        Insert: {
          address?: string | null
          admin_note?: string | null
          application_type: string
          audience_size?: string | null
          city?: string | null
          company_name?: string | null
          contact_name?: string | null
          created_at?: string
          email: string
          expected_monthly_volume?: string | null
          has_referrer?: boolean | null
          id?: string
          interested_products?: string | null
          interested_topics?: string[] | null
          line_id?: string | null
          note?: string | null
          owner_name?: string | null
          phone: string
          referrer_info?: string | null
          sales_channels?: string[] | null
          sales_platform_url?: string | null
          status?: string
          tax_id?: string | null
          updated_at?: string
        }
        Update: {
          address?: string | null
          admin_note?: string | null
          application_type?: string
          audience_size?: string | null
          city?: string | null
          company_name?: string | null
          contact_name?: string | null
          created_at?: string
          email?: string
          expected_monthly_volume?: string | null
          has_referrer?: boolean | null
          id?: string
          interested_products?: string | null
          interested_topics?: string[] | null
          line_id?: string | null
          note?: string | null
          owner_name?: string | null
          phone?: string
          referrer_info?: string | null
          sales_channels?: string[] | null
          sales_platform_url?: string | null
          status?: string
          tax_id?: string | null
          updated_at?: string
        }
        Relationships: []
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
          customer_no: string | null
          email: string | null
          id: string
          name: string
          notes: string | null
          phone: string | null
          shipping_address: string | null
          source: string | null
          updated_at: string
        }
        Insert: {
          company?: string | null
          company_id: string
          created_at?: string
          customer_no?: string | null
          email?: string | null
          id?: string
          name: string
          notes?: string | null
          phone?: string | null
          shipping_address?: string | null
          source?: string | null
          updated_at?: string
        }
        Update: {
          company?: string | null
          company_id?: string
          created_at?: string
          customer_no?: string | null
          email?: string | null
          id?: string
          name?: string
          notes?: string | null
          phone?: string | null
          shipping_address?: string | null
          source?: string | null
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
          {
            foreignKeyName: "dealer_tier_status_current_tier_fkey"
            columns: ["current_tier"]
            isOneToOne: false
            referencedRelation: "dealer_tiers_public_summary"
            referencedColumns: ["code"]
          },
        ]
      }
      dealer_tiers: {
        Row: {
          code: string
          condition_logic: string
          daily_referral_rate: number
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
          upgrade_referral_rate: number
        }
        Insert: {
          code: string
          condition_logic?: string
          daily_referral_rate?: number
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
          upgrade_referral_rate?: number
        }
        Update: {
          code?: string
          condition_logic?: string
          daily_referral_rate?: number
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
          upgrade_referral_rate?: number
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
      group_buy_orders: {
        Row: {
          cash_amount: number
          created_at: string
          group_buy_id: string
          id: string
          paid_at: string | null
          payment_method: string
          points_used: number
          quantity: number
          sales_order_id: string | null
          status: string
          subtotal: number
          unit_price: number
          user_id: string
        }
        Insert: {
          cash_amount?: number
          created_at?: string
          group_buy_id: string
          id?: string
          paid_at?: string | null
          payment_method?: string
          points_used?: number
          quantity?: number
          sales_order_id?: string | null
          status?: string
          subtotal: number
          unit_price: number
          user_id: string
        }
        Update: {
          cash_amount?: number
          created_at?: string
          group_buy_id?: string
          id?: string
          paid_at?: string | null
          payment_method?: string
          points_used?: number
          quantity?: number
          sales_order_id?: string | null
          status?: string
          subtotal?: number
          unit_price?: number
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "group_buy_orders_group_buy_id_fkey"
            columns: ["group_buy_id"]
            isOneToOne: false
            referencedRelation: "group_buys"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "group_buy_orders_sales_order_id_fkey"
            columns: ["sales_order_id"]
            isOneToOne: false
            referencedRelation: "sales_orders"
            referencedColumns: ["id"]
          },
        ]
      }
      group_buy_settings: {
        Row: {
          auto_refund_hours: number | null
          company_id: string
          created_at: string
          default_duration_days: number
          id: string
          initiator_reward_pct: number
          max_orders_per_user: number
          target_count: number
          updated_at: string
          winner_reward_pct: number
        }
        Insert: {
          auto_refund_hours?: number | null
          company_id: string
          created_at?: string
          default_duration_days?: number
          id?: string
          initiator_reward_pct?: number
          max_orders_per_user?: number
          target_count?: number
          updated_at?: string
          winner_reward_pct?: number
        }
        Update: {
          auto_refund_hours?: number | null
          company_id?: string
          created_at?: string
          default_duration_days?: number
          id?: string
          initiator_reward_pct?: number
          max_orders_per_user?: number
          target_count?: number
          updated_at?: string
          winner_reward_pct?: number
        }
        Relationships: [
          {
            foreignKeyName: "group_buy_settings_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: true
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      group_buys: {
        Row: {
          company_id: string
          completed_at: string | null
          created_at: string
          current_count: number
          expires_at: string
          id: string
          initiator_id: string
          product_id: string
          started_at: string
          status: string
          target_count: number
          unit_price: number
          updated_at: string
          winner_id: string | null
          winner_picked_at: string | null
        }
        Insert: {
          company_id: string
          completed_at?: string | null
          created_at?: string
          current_count?: number
          expires_at: string
          id?: string
          initiator_id: string
          product_id: string
          started_at?: string
          status?: string
          target_count?: number
          unit_price: number
          updated_at?: string
          winner_id?: string | null
          winner_picked_at?: string | null
        }
        Update: {
          company_id?: string
          completed_at?: string | null
          created_at?: string
          current_count?: number
          expires_at?: string
          id?: string
          initiator_id?: string
          product_id?: string
          started_at?: string
          status?: string
          target_count?: number
          unit_price?: number
          updated_at?: string
          winner_id?: string | null
          winner_picked_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "group_buys_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "group_buys_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      guest_signup_otps: {
        Row: {
          attempts: number
          code_hash: string
          consumed_at: string | null
          created_at: string
          email: string
          expires_at: string
          id: string
          ip: string | null
          phone: string
        }
        Insert: {
          attempts?: number
          code_hash: string
          consumed_at?: string | null
          created_at?: string
          email: string
          expires_at: string
          id?: string
          ip?: string | null
          phone: string
        }
        Update: {
          attempts?: number
          code_hash?: string
          consumed_at?: string | null
          created_at?: string
          email?: string
          expires_at?: string
          id?: string
          ip?: string | null
          phone?: string
        }
        Relationships: []
      }
      homepage_featured_products: {
        Row: {
          company_id: string | null
          created_at: string
          created_by: string | null
          id: string
          is_active: boolean
          note: string | null
          product_id: string
          sort_order: number
          updated_at: string
        }
        Insert: {
          company_id?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          is_active?: boolean
          note?: string | null
          product_id: string
          sort_order?: number
          updated_at?: string
        }
        Update: {
          company_id?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          is_active?: boolean
          note?: string | null
          product_id?: string
          sort_order?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "homepage_featured_products_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "homepage_featured_products_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      homepage_section_products: {
        Row: {
          company_id: string | null
          config_json: Json
          created_at: string
          ends_at: string | null
          id: string
          is_active: boolean
          product_id: string
          section_id: string
          sort_order: number
          starts_at: string | null
          updated_at: string
        }
        Insert: {
          company_id?: string | null
          config_json?: Json
          created_at?: string
          ends_at?: string | null
          id?: string
          is_active?: boolean
          product_id: string
          section_id: string
          sort_order?: number
          starts_at?: string | null
          updated_at?: string
        }
        Update: {
          company_id?: string | null
          config_json?: Json
          created_at?: string
          ends_at?: string | null
          id?: string
          is_active?: boolean
          product_id?: string
          section_id?: string
          sort_order?: number
          starts_at?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "homepage_section_products_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "homepage_section_products_section_id_fkey"
            columns: ["section_id"]
            isOneToOne: false
            referencedRelation: "homepage_sections"
            referencedColumns: ["id"]
          },
        ]
      }
      homepage_sections: {
        Row: {
          company_id: string | null
          config_json: Json
          created_at: string
          display_limit: number
          id: string
          is_active: boolean
          section_type: string
          sort_order: number
          subtitle: string | null
          title: string
          updated_at: string
        }
        Insert: {
          company_id?: string | null
          config_json?: Json
          created_at?: string
          display_limit?: number
          id?: string
          is_active?: boolean
          section_type: string
          sort_order?: number
          subtitle?: string | null
          title: string
          updated_at?: string
        }
        Update: {
          company_id?: string | null
          config_json?: Json
          created_at?: string
          display_limit?: number
          id?: string
          is_active?: boolean
          section_type?: string
          sort_order?: number
          subtitle?: string | null
          title?: string
          updated_at?: string
        }
        Relationships: []
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
      member_custom_products: {
        Row: {
          created_at: string
          description: string | null
          id: string
          image_url: string | null
          is_active: boolean
          member_id: string
          purchase_url: string | null
          title: string
          updated_at: string
          video_url: string | null
        }
        Insert: {
          created_at?: string
          description?: string | null
          id?: string
          image_url?: string | null
          is_active?: boolean
          member_id: string
          purchase_url?: string | null
          title: string
          updated_at?: string
          video_url?: string | null
        }
        Update: {
          created_at?: string
          description?: string | null
          id?: string
          image_url?: string | null
          is_active?: boolean
          member_id?: string
          purchase_url?: string | null
          title?: string
          updated_at?: string
          video_url?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "member_custom_products_member_id_fkey"
            columns: ["member_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "member_custom_products_member_id_fkey"
            columns: ["member_id"]
            isOneToOne: false
            referencedRelation: "profiles_public_safe"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "member_custom_products_member_id_fkey"
            columns: ["member_id"]
            isOneToOne: false
            referencedRelation: "public_member_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      member_featured_products: {
        Row: {
          created_at: string
          id: string
          member_id: string
          product_id: string
          sort_order: number
        }
        Insert: {
          created_at?: string
          id?: string
          member_id: string
          product_id: string
          sort_order?: number
        }
        Update: {
          created_at?: string
          id?: string
          member_id?: string
          product_id?: string
          sort_order?: number
        }
        Relationships: [
          {
            foreignKeyName: "member_featured_products_member_id_fkey"
            columns: ["member_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "member_featured_products_member_id_fkey"
            columns: ["member_id"]
            isOneToOne: false
            referencedRelation: "profiles_public_safe"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "member_featured_products_member_id_fkey"
            columns: ["member_id"]
            isOneToOne: false
            referencedRelation: "public_member_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "member_featured_products_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      member_points_wallet: {
        Row: {
          cash_balance: number
          discount_points: number
          reward_points: number
          shopping_points: number
          updated_at: string
          user_id: string
        }
        Insert: {
          cash_balance?: number
          discount_points?: number
          reward_points?: number
          shopping_points?: number
          updated_at?: string
          user_id: string
        }
        Update: {
          cash_balance?: number
          discount_points?: number
          reward_points?: number
          shopping_points?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      member_storefront_custom_templates: {
        Row: {
          content_json: Json
          cover_image: string | null
          created_at: string
          description: string | null
          id: string
          is_active: boolean
          member_id: string
          name: string
          sort_order: number
          updated_at: string
        }
        Insert: {
          content_json?: Json
          cover_image?: string | null
          created_at?: string
          description?: string | null
          id?: string
          is_active?: boolean
          member_id: string
          name: string
          sort_order?: number
          updated_at?: string
        }
        Update: {
          content_json?: Json
          cover_image?: string | null
          created_at?: string
          description?: string | null
          id?: string
          is_active?: boolean
          member_id?: string
          name?: string
          sort_order?: number
          updated_at?: string
        }
        Relationships: []
      }
      member_storefront_pages: {
        Row: {
          applied_template_id: string | null
          content_json: Json
          created_at: string
          id: string
          member_id: string
          published_at: string | null
          updated_at: string
        }
        Insert: {
          applied_template_id?: string | null
          content_json?: Json
          created_at?: string
          id?: string
          member_id: string
          published_at?: string | null
          updated_at?: string
        }
        Update: {
          applied_template_id?: string | null
          content_json?: Json
          created_at?: string
          id?: string
          member_id?: string
          published_at?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "member_storefront_pages_applied_template_id_fkey"
            columns: ["applied_template_id"]
            isOneToOne: false
            referencedRelation: "member_storefront_templates"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "member_storefront_pages_member_id_fkey"
            columns: ["member_id"]
            isOneToOne: true
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "member_storefront_pages_member_id_fkey"
            columns: ["member_id"]
            isOneToOne: true
            referencedRelation: "profiles_public_safe"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "member_storefront_pages_member_id_fkey"
            columns: ["member_id"]
            isOneToOne: true
            referencedRelation: "public_member_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      member_storefront_templates: {
        Row: {
          content_json: Json
          cover_image: string | null
          created_at: string
          description: string | null
          id: string
          is_active: boolean
          is_default: boolean
          name: string
          sort_order: number
          updated_at: string
        }
        Insert: {
          content_json?: Json
          cover_image?: string | null
          created_at?: string
          description?: string | null
          id?: string
          is_active?: boolean
          is_default?: boolean
          name: string
          sort_order?: number
          updated_at?: string
        }
        Update: {
          content_json?: Json
          cover_image?: string | null
          created_at?: string
          description?: string | null
          id?: string
          is_active?: boolean
          is_default?: boolean
          name?: string
          sort_order?: number
          updated_at?: string
        }
        Relationships: []
      }
      member_videos: {
        Row: {
          created_at: string
          id: string
          member_id: string
          sort_order: number
          title: string
          updated_at: string
          video_url: string
        }
        Insert: {
          created_at?: string
          id?: string
          member_id: string
          sort_order?: number
          title: string
          updated_at?: string
          video_url: string
        }
        Update: {
          created_at?: string
          id?: string
          member_id?: string
          sort_order?: number
          title?: string
          updated_at?: string
          video_url?: string
        }
        Relationships: [
          {
            foreignKeyName: "member_videos_member_id_fkey"
            columns: ["member_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "member_videos_member_id_fkey"
            columns: ["member_id"]
            isOneToOne: false
            referencedRelation: "profiles_public_safe"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "member_videos_member_id_fkey"
            columns: ["member_id"]
            isOneToOne: false
            referencedRelation: "public_member_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      monthly_responsibility_points: {
        Row: {
          created_at: string
          id: string
          member_id: string
          points: number
          source_order_ids: string[]
          updated_at: string
          ym: string
        }
        Insert: {
          created_at?: string
          id?: string
          member_id: string
          points?: number
          source_order_ids?: string[]
          updated_at?: string
          ym: string
        }
        Update: {
          created_at?: string
          id?: string
          member_id?: string
          points?: number
          source_order_ids?: string[]
          updated_at?: string
          ym?: string
        }
        Relationships: [
          {
            foreignKeyName: "monthly_responsibility_points_member_id_fkey"
            columns: ["member_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "monthly_responsibility_points_member_id_fkey"
            columns: ["member_id"]
            isOneToOne: false
            referencedRelation: "profiles_public_safe"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "monthly_responsibility_points_member_id_fkey"
            columns: ["member_id"]
            isOneToOne: false
            referencedRelation: "public_member_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      monthly_tier_bonus_settings: {
        Row: {
          bonus_rate: number
          created_at: string
          enabled: boolean
          id: string
          sort_order: number
          threshold_points: number
          updated_at: string
        }
        Insert: {
          bonus_rate: number
          created_at?: string
          enabled?: boolean
          id?: string
          sort_order?: number
          threshold_points: number
          updated_at?: string
        }
        Update: {
          bonus_rate?: number
          created_at?: string
          enabled?: boolean
          id?: string
          sort_order?: number
          threshold_points?: number
          updated_at?: string
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
      operation_ai_summaries: {
        Row: {
          content: Json
          created_at: string
          generated_by: string | null
          id: string
          summary_date: string
          summary_type: string
        }
        Insert: {
          content?: Json
          created_at?: string
          generated_by?: string | null
          id?: string
          summary_date?: string
          summary_type?: string
        }
        Update: {
          content?: Json
          created_at?: string
          generated_by?: string | null
          id?: string
          summary_date?: string
          summary_type?: string
        }
        Relationships: []
      }
      operation_attendance_logs: {
        Row: {
          created_at: string
          id: string
          ip_address: string | null
          log_type: Database["public"]["Enums"]["operation_attendance_type"]
          logged_at: string
          metadata: Json
          note: string | null
          user_agent: string | null
          user_id: string
          work_date: string
        }
        Insert: {
          created_at?: string
          id?: string
          ip_address?: string | null
          log_type: Database["public"]["Enums"]["operation_attendance_type"]
          logged_at?: string
          metadata?: Json
          note?: string | null
          user_agent?: string | null
          user_id: string
          work_date?: string
        }
        Update: {
          created_at?: string
          id?: string
          ip_address?: string | null
          log_type?: Database["public"]["Enums"]["operation_attendance_type"]
          logged_at?: string
          metadata?: Json
          note?: string | null
          user_agent?: string | null
          user_id?: string
          work_date?: string
        }
        Relationships: []
      }
      operation_participants: {
        Row: {
          company_id: string | null
          created_at: string
          department: string | null
          granted_by: string | null
          id: string
          is_active: boolean
          notes: string | null
          op_role: Database["public"]["Enums"]["operation_role"]
          updated_at: string
          user_id: string
        }
        Insert: {
          company_id?: string | null
          created_at?: string
          department?: string | null
          granted_by?: string | null
          id?: string
          is_active?: boolean
          notes?: string | null
          op_role?: Database["public"]["Enums"]["operation_role"]
          updated_at?: string
          user_id: string
        }
        Update: {
          company_id?: string | null
          created_at?: string
          department?: string | null
          granted_by?: string | null
          id?: string
          is_active?: boolean
          notes?: string | null
          op_role?: Database["public"]["Enums"]["operation_role"]
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      operation_task_reports: {
        Row: {
          attachments: Json
          content: string
          created_at: string
          id: string
          reporter_id: string
          status_snapshot:
            | Database["public"]["Enums"]["operation_task_status"]
            | null
          task_id: string
        }
        Insert: {
          attachments?: Json
          content: string
          created_at?: string
          id?: string
          reporter_id: string
          status_snapshot?:
            | Database["public"]["Enums"]["operation_task_status"]
            | null
          task_id: string
        }
        Update: {
          attachments?: Json
          content?: string
          created_at?: string
          id?: string
          reporter_id?: string
          status_snapshot?:
            | Database["public"]["Enums"]["operation_task_status"]
            | null
          task_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "operation_task_reports_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "operation_tasks"
            referencedColumns: ["id"]
          },
        ]
      }
      operation_tasks: {
        Row: {
          assignee_id: string | null
          company_id: string | null
          completed_at: string | null
          created_at: string
          created_by: string | null
          department: string | null
          description: string | null
          due_at: string | null
          id: string
          metadata: Json
          priority: Database["public"]["Enums"]["operation_task_priority"]
          status: Database["public"]["Enums"]["operation_task_status"]
          title: string
          updated_at: string
        }
        Insert: {
          assignee_id?: string | null
          company_id?: string | null
          completed_at?: string | null
          created_at?: string
          created_by?: string | null
          department?: string | null
          description?: string | null
          due_at?: string | null
          id?: string
          metadata?: Json
          priority?: Database["public"]["Enums"]["operation_task_priority"]
          status?: Database["public"]["Enums"]["operation_task_status"]
          title: string
          updated_at?: string
        }
        Update: {
          assignee_id?: string | null
          company_id?: string | null
          completed_at?: string | null
          created_at?: string
          created_by?: string | null
          department?: string | null
          description?: string | null
          due_at?: string | null
          id?: string
          metadata?: Json
          priority?: Database["public"]["Enums"]["operation_task_priority"]
          status?: Database["public"]["Enums"]["operation_task_status"]
          title?: string
          updated_at?: string
        }
        Relationships: []
      }
      order_point_payments: {
        Row: {
          amount_offset: number
          created_at: string
          created_by: string | null
          dedupe_key: string
          id: string
          member_id: string
          note: string | null
          point_transaction_id: string | null
          point_type: string
          points_used: number
          sales_order_id: string
          status: string
          updated_at: string
        }
        Insert: {
          amount_offset?: number
          created_at?: string
          created_by?: string | null
          dedupe_key: string
          id?: string
          member_id: string
          note?: string | null
          point_transaction_id?: string | null
          point_type: string
          points_used: number
          sales_order_id: string
          status?: string
          updated_at?: string
        }
        Update: {
          amount_offset?: number
          created_at?: string
          created_by?: string | null
          dedupe_key?: string
          id?: string
          member_id?: string
          note?: string | null
          point_transaction_id?: string | null
          point_type?: string
          points_used?: number
          sales_order_id?: string
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "order_point_payments_point_transaction_id_fkey"
            columns: ["point_transaction_id"]
            isOneToOne: false
            referencedRelation: "point_transactions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "order_point_payments_sales_order_id_fkey"
            columns: ["sales_order_id"]
            isOneToOne: false
            referencedRelation: "sales_orders"
            referencedColumns: ["id"]
          },
        ]
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
      product_wholesale_tiers: {
        Row: {
          created_at: string
          id: string
          max_qty: number | null
          min_qty: number
          product_id: string
          sort_order: number
          unit_price: number
          unit_reward_points: number
          updated_at: string
          visibility: string
        }
        Insert: {
          created_at?: string
          id?: string
          max_qty?: number | null
          min_qty: number
          product_id: string
          sort_order?: number
          unit_price?: number
          unit_reward_points?: number
          updated_at?: string
          visibility?: string
        }
        Update: {
          created_at?: string
          id?: string
          max_qty?: number | null
          min_qty?: number
          product_id?: string
          sort_order?: number
          unit_price?: number
          unit_reward_points?: number
          updated_at?: string
          visibility?: string
        }
        Relationships: [
          {
            foreignKeyName: "product_wholesale_tiers_product_id_fkey"
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
          display_priority: number
          featured: boolean
          id: string
          image: string | null
          name: string
          price: number
          reward_points: number
          safe_stock: number
          short_description: string | null
          sku: string
          specs: Json
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
          display_priority?: number
          featured?: boolean
          id?: string
          image?: string | null
          name: string
          price?: number
          reward_points?: number
          safe_stock?: number
          short_description?: string | null
          sku: string
          specs?: Json
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
          display_priority?: number
          featured?: boolean
          id?: string
          image?: string | null
          name?: string
          price?: number
          reward_points?: number
          safe_stock?: number
          short_description?: string | null
          sku?: string
          specs?: Json
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
          addr_home: string | null
          addr_mail: string | null
          apply_date: string | null
          avatar_url: string | null
          birthday: string | null
          brand_intro: string | null
          brand_name: string | null
          created_at: string
          current_company_id: string | null
          display_name: string | null
          email: string | null
          facebook_url: string | null
          frozen_code: string | null
          id: string
          id_no: string | null
          instagram_url: string | null
          is_dealer: boolean
          is_vip: boolean
          legacy_bonus_total: number
          legacy_rank: string | null
          line_url: string | null
          marketing_slug: string | null
          member_no: string | null
          member_status: string | null
          name: string | null
          nation: string | null
          page_template: string
          phone: string | null
          placement_id: string | null
          profile_avatar: string | null
          profile_cover: string | null
          referral_code: string | null
          referred_by: string | null
          sex: string | null
          tel: string | null
          vip_expires_at: string | null
          vip_tier: string | null
          youtube_url: string | null
          zip_home: string | null
          zip_mail: string | null
        }
        Insert: {
          addr_home?: string | null
          addr_mail?: string | null
          apply_date?: string | null
          avatar_url?: string | null
          birthday?: string | null
          brand_intro?: string | null
          brand_name?: string | null
          created_at?: string
          current_company_id?: string | null
          display_name?: string | null
          email?: string | null
          facebook_url?: string | null
          frozen_code?: string | null
          id: string
          id_no?: string | null
          instagram_url?: string | null
          is_dealer?: boolean
          is_vip?: boolean
          legacy_bonus_total?: number
          legacy_rank?: string | null
          line_url?: string | null
          marketing_slug?: string | null
          member_no?: string | null
          member_status?: string | null
          name?: string | null
          nation?: string | null
          page_template?: string
          phone?: string | null
          placement_id?: string | null
          profile_avatar?: string | null
          profile_cover?: string | null
          referral_code?: string | null
          referred_by?: string | null
          sex?: string | null
          tel?: string | null
          vip_expires_at?: string | null
          vip_tier?: string | null
          youtube_url?: string | null
          zip_home?: string | null
          zip_mail?: string | null
        }
        Update: {
          addr_home?: string | null
          addr_mail?: string | null
          apply_date?: string | null
          avatar_url?: string | null
          birthday?: string | null
          brand_intro?: string | null
          brand_name?: string | null
          created_at?: string
          current_company_id?: string | null
          display_name?: string | null
          email?: string | null
          facebook_url?: string | null
          frozen_code?: string | null
          id?: string
          id_no?: string | null
          instagram_url?: string | null
          is_dealer?: boolean
          is_vip?: boolean
          legacy_bonus_total?: number
          legacy_rank?: string | null
          line_url?: string | null
          marketing_slug?: string | null
          member_no?: string | null
          member_status?: string | null
          name?: string | null
          nation?: string | null
          page_template?: string
          phone?: string | null
          placement_id?: string | null
          profile_avatar?: string | null
          profile_cover?: string | null
          referral_code?: string | null
          referred_by?: string | null
          sex?: string | null
          tel?: string | null
          vip_expires_at?: string | null
          vip_tier?: string | null
          youtube_url?: string | null
          zip_home?: string | null
          zip_mail?: string | null
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
            foreignKeyName: "profiles_placement_id_fkey"
            columns: ["placement_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "profiles_placement_id_fkey"
            columns: ["placement_id"]
            isOneToOne: false
            referencedRelation: "profiles_public_safe"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "profiles_placement_id_fkey"
            columns: ["placement_id"]
            isOneToOne: false
            referencedRelation: "public_member_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "profiles_referred_by_fkey"
            columns: ["referred_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "profiles_referred_by_fkey"
            columns: ["referred_by"]
            isOneToOne: false
            referencedRelation: "profiles_public_safe"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "profiles_referred_by_fkey"
            columns: ["referred_by"]
            isOneToOne: false
            referencedRelation: "public_member_profiles"
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
      quote_bank_accounts: {
        Row: {
          account_name: string
          account_number: string
          bank_code: string | null
          bank_name: string
          branch_name: string | null
          company_id: string
          created_at: string
          id: string
          is_active: boolean
          is_default: boolean
          notes: string | null
          updated_at: string
        }
        Insert: {
          account_name: string
          account_number: string
          bank_code?: string | null
          bank_name: string
          branch_name?: string | null
          company_id: string
          created_at?: string
          id?: string
          is_active?: boolean
          is_default?: boolean
          notes?: string | null
          updated_at?: string
        }
        Update: {
          account_name?: string
          account_number?: string
          bank_code?: string | null
          bank_name?: string
          branch_name?: string | null
          company_id?: string
          created_at?: string
          id?: string
          is_active?: boolean
          is_default?: boolean
          notes?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "quote_bank_accounts_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      quote_company_settings: {
        Row: {
          address: string | null
          company_id: string
          company_name: string
          company_name_en: string | null
          created_at: string
          email: string | null
          fax: string | null
          footer_text: string | null
          header_note: string | null
          id: string
          line_id: string | null
          logo_url: string | null
          phone: string | null
          representative: string | null
          tax_id: string | null
          updated_at: string
          website: string | null
        }
        Insert: {
          address?: string | null
          company_id: string
          company_name: string
          company_name_en?: string | null
          created_at?: string
          email?: string | null
          fax?: string | null
          footer_text?: string | null
          header_note?: string | null
          id?: string
          line_id?: string | null
          logo_url?: string | null
          phone?: string | null
          representative?: string | null
          tax_id?: string | null
          updated_at?: string
          website?: string | null
        }
        Update: {
          address?: string | null
          company_id?: string
          company_name?: string
          company_name_en?: string | null
          created_at?: string
          email?: string | null
          fax?: string | null
          footer_text?: string | null
          header_note?: string | null
          id?: string
          line_id?: string | null
          logo_url?: string | null
          phone?: string | null
          representative?: string | null
          tax_id?: string | null
          updated_at?: string
          website?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "quote_company_settings_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: true
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      quote_items: {
        Row: {
          created_at: string
          discount: number
          id: string
          item_name: string
          product_id: string | null
          quantity: number
          quote_id: string
          sort_order: number
          spec: string | null
          subtotal: number
          unit_price: number
        }
        Insert: {
          created_at?: string
          discount?: number
          id?: string
          item_name: string
          product_id?: string | null
          quantity?: number
          quote_id: string
          sort_order?: number
          spec?: string | null
          subtotal?: number
          unit_price?: number
        }
        Update: {
          created_at?: string
          discount?: number
          id?: string
          item_name?: string
          product_id?: string | null
          quantity?: number
          quote_id?: string
          sort_order?: number
          spec?: string | null
          subtotal?: number
          unit_price?: number
        }
        Relationships: [
          {
            foreignKeyName: "quote_items_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "quote_items_quote_id_fkey"
            columns: ["quote_id"]
            isOneToOne: false
            referencedRelation: "quotes"
            referencedColumns: ["id"]
          },
        ]
      }
      quotes: {
        Row: {
          bank_account_id: string | null
          bank_snapshot: Json
          company_id: string
          company_snapshot: Json
          converted_at: string | null
          converted_order_id: string | null
          created_at: string
          created_by: string | null
          customer_address: string | null
          customer_email: string | null
          customer_name: string
          customer_phone: string | null
          discount_amount: number
          id: string
          notes: string | null
          payment_terms: string | null
          public_token: string | null
          quote_date: string
          quote_no: string
          salesperson_id: string | null
          salesperson_name: string | null
          status: string
          subtotal: number
          tax_amount: number
          total_amount: number
          updated_at: string
          valid_until: string | null
        }
        Insert: {
          bank_account_id?: string | null
          bank_snapshot?: Json
          company_id: string
          company_snapshot?: Json
          converted_at?: string | null
          converted_order_id?: string | null
          created_at?: string
          created_by?: string | null
          customer_address?: string | null
          customer_email?: string | null
          customer_name: string
          customer_phone?: string | null
          discount_amount?: number
          id?: string
          notes?: string | null
          payment_terms?: string | null
          public_token?: string | null
          quote_date?: string
          quote_no: string
          salesperson_id?: string | null
          salesperson_name?: string | null
          status?: string
          subtotal?: number
          tax_amount?: number
          total_amount?: number
          updated_at?: string
          valid_until?: string | null
        }
        Update: {
          bank_account_id?: string | null
          bank_snapshot?: Json
          company_id?: string
          company_snapshot?: Json
          converted_at?: string | null
          converted_order_id?: string | null
          created_at?: string
          created_by?: string | null
          customer_address?: string | null
          customer_email?: string | null
          customer_name?: string
          customer_phone?: string | null
          discount_amount?: number
          id?: string
          notes?: string | null
          payment_terms?: string | null
          public_token?: string | null
          quote_date?: string
          quote_no?: string
          salesperson_id?: string | null
          salesperson_name?: string | null
          status?: string
          subtotal?: number
          tax_amount?: number
          total_amount?: number
          updated_at?: string
          valid_until?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "quotes_bank_account_id_fkey"
            columns: ["bank_account_id"]
            isOneToOne: false
            referencedRelation: "quote_bank_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "quotes_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      rank_rebate_settings: {
        Row: {
          created_at: string
          enabled: boolean
          exceeded_rebate_rate: number
          id: string
          rank_code: string
          rank_name: string
          required_points: number
          sort_order: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          enabled?: boolean
          exceeded_rebate_rate?: number
          id?: string
          rank_code: string
          rank_name: string
          required_points?: number
          sort_order?: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          enabled?: boolean
          exceeded_rebate_rate?: number
          id?: string
          rank_code?: string
          rank_name?: string
          required_points?: number
          sort_order?: number
          updated_at?: string
        }
        Relationships: []
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
            foreignKeyName: "referral_logs_buyer_id_fkey"
            columns: ["buyer_id"]
            isOneToOne: false
            referencedRelation: "profiles_public_safe"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "referral_logs_buyer_id_fkey"
            columns: ["buyer_id"]
            isOneToOne: false
            referencedRelation: "public_member_profiles"
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
          {
            foreignKeyName: "referral_logs_referrer_id_fkey"
            columns: ["referrer_id"]
            isOneToOne: false
            referencedRelation: "profiles_public_safe"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "referral_logs_referrer_id_fkey"
            columns: ["referrer_id"]
            isOneToOne: false
            referencedRelation: "public_member_profiles"
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
      repurchase_bonus_settings: {
        Row: {
          bonus_rate: number
          created_at: string
          enabled: boolean
          generation_level: number
          id: string
          updated_at: string
        }
        Insert: {
          bonus_rate?: number
          created_at?: string
          enabled?: boolean
          generation_level: number
          id?: string
          updated_at?: string
        }
        Update: {
          bonus_rate?: number
          created_at?: string
          enabled?: boolean
          generation_level?: number
          id?: string
          updated_at?: string
        }
        Relationships: []
      }
      retail_reward_splits: {
        Row: {
          base_reward_points: number
          buyer_id: string
          buyer_points: number
          buyer_share_pct: number
          buyer_tier: string | null
          company_id: string | null
          created_at: string
          created_by: string | null
          dedupe_key: string
          id: string
          notes: string | null
          referrer_id: string | null
          referrer_points: number
          referrer_share_pct: number
          referrer_tier: string | null
          referrer_withheld: boolean
          sales_order_id: string
          sales_order_item_id: string | null
          status: string
          updated_at: string
          withheld_reason: string | null
        }
        Insert: {
          base_reward_points?: number
          buyer_id: string
          buyer_points?: number
          buyer_share_pct?: number
          buyer_tier?: string | null
          company_id?: string | null
          created_at?: string
          created_by?: string | null
          dedupe_key: string
          id?: string
          notes?: string | null
          referrer_id?: string | null
          referrer_points?: number
          referrer_share_pct?: number
          referrer_tier?: string | null
          referrer_withheld?: boolean
          sales_order_id: string
          sales_order_item_id?: string | null
          status?: string
          updated_at?: string
          withheld_reason?: string | null
        }
        Update: {
          base_reward_points?: number
          buyer_id?: string
          buyer_points?: number
          buyer_share_pct?: number
          buyer_tier?: string | null
          company_id?: string | null
          created_at?: string
          created_by?: string | null
          dedupe_key?: string
          id?: string
          notes?: string | null
          referrer_id?: string | null
          referrer_points?: number
          referrer_share_pct?: number
          referrer_tier?: string | null
          referrer_withheld?: boolean
          sales_order_id?: string
          sales_order_item_id?: string | null
          status?: string
          updated_at?: string
          withheld_reason?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "retail_reward_splits_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "retail_reward_splits_sales_order_id_fkey"
            columns: ["sales_order_id"]
            isOneToOne: false
            referencedRelation: "sales_orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "retail_reward_splits_sales_order_item_id_fkey"
            columns: ["sales_order_item_id"]
            isOneToOne: false
            referencedRelation: "sales_order_items"
            referencedColumns: ["id"]
          },
        ]
      }
      reward_wallet_logs: {
        Row: {
          bonus_record_id: string | null
          created_at: string
          description: string | null
          id: string
          member_id: string
          points: number
          status: string
          type: string
        }
        Insert: {
          bonus_record_id?: string | null
          created_at?: string
          description?: string | null
          id?: string
          member_id: string
          points: number
          status?: string
          type: string
        }
        Update: {
          bonus_record_id?: string | null
          created_at?: string
          description?: string | null
          id?: string
          member_id?: string
          points?: number
          status?: string
          type?: string
        }
        Relationships: [
          {
            foreignKeyName: "reward_wallet_logs_bonus_record_id_fkey"
            columns: ["bonus_record_id"]
            isOneToOne: false
            referencedRelation: "bonus_records"
            referencedColumns: ["id"]
          },
        ]
      }
      sales_order_items: {
        Row: {
          company_id: string
          created_at: string
          id: string
          image: string | null
          original_unit_price: number | null
          pricing_tier_visibility: string | null
          product_id: string | null
          product_name: string
          quantity: number
          sales_order_id: string
          sku: string | null
          subtotal: number
          tier_max_qty: number | null
          tier_min_qty: number | null
          tier_reward_points: number | null
          unit_price: number
        }
        Insert: {
          company_id: string
          created_at?: string
          id?: string
          image?: string | null
          original_unit_price?: number | null
          pricing_tier_visibility?: string | null
          product_id?: string | null
          product_name: string
          quantity?: number
          sales_order_id: string
          sku?: string | null
          subtotal?: number
          tier_max_qty?: number | null
          tier_min_qty?: number | null
          tier_reward_points?: number | null
          unit_price?: number
        }
        Update: {
          company_id?: string
          created_at?: string
          id?: string
          image?: string | null
          original_unit_price?: number | null
          pricing_tier_visibility?: string | null
          product_id?: string | null
          product_name?: string
          quantity?: number
          sales_order_id?: string
          sku?: string | null
          subtotal?: number
          tier_max_qty?: number | null
          tier_min_qty?: number | null
          tier_reward_points?: number | null
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
          created_by_id: string | null
          created_by_name: string | null
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
          order_source: string | null
          order_status: string
          order_type: string
          payment_status: string
          receiver_name: string
          receiver_phone: string
          referrer_id: string | null
          salesperson_id: string | null
          salesperson_name: string | null
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
          created_by_id?: string | null
          created_by_name?: string | null
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
          order_source?: string | null
          order_status?: string
          order_type?: string
          payment_status?: string
          receiver_name: string
          receiver_phone: string
          referrer_id?: string | null
          salesperson_id?: string | null
          salesperson_name?: string | null
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
          created_by_id?: string | null
          created_by_name?: string | null
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
          order_source?: string | null
          order_status?: string
          order_type?: string
          payment_status?: string
          receiver_name?: string
          receiver_phone?: string
          referrer_id?: string | null
          salesperson_id?: string | null
          salesperson_name?: string | null
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
            foreignKeyName: "sales_orders_created_by_id_fkey"
            columns: ["created_by_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sales_orders_created_by_id_fkey"
            columns: ["created_by_id"]
            isOneToOne: false
            referencedRelation: "profiles_public_safe"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sales_orders_created_by_id_fkey"
            columns: ["created_by_id"]
            isOneToOne: false
            referencedRelation: "public_member_profiles"
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
          {
            foreignKeyName: "sales_orders_referrer_id_fkey"
            columns: ["referrer_id"]
            isOneToOne: false
            referencedRelation: "profiles_public_safe"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sales_orders_referrer_id_fkey"
            columns: ["referrer_id"]
            isOneToOne: false
            referencedRelation: "public_member_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sales_orders_salesperson_id_fkey"
            columns: ["salesperson_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sales_orders_salesperson_id_fkey"
            columns: ["salesperson_id"]
            isOneToOne: false
            referencedRelation: "profiles_public_safe"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sales_orders_salesperson_id_fkey"
            columns: ["salesperson_id"]
            isOneToOne: false
            referencedRelation: "public_member_profiles"
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
      shop_content_pages: {
        Row: {
          content_html: string | null
          content_json: Json
          cover_image: string | null
          created_at: string
          created_by: string | null
          external_url: string | null
          id: string
          images: Json
          is_published: boolean
          published_at: string | null
          section_type: string
          slug: string
          sort_order: number
          summary: string | null
          title: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          content_html?: string | null
          content_json?: Json
          cover_image?: string | null
          created_at?: string
          created_by?: string | null
          external_url?: string | null
          id?: string
          images?: Json
          is_published?: boolean
          published_at?: string | null
          section_type: string
          slug: string
          sort_order?: number
          summary?: string | null
          title: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          content_html?: string | null
          content_json?: Json
          cover_image?: string | null
          created_at?: string
          created_by?: string | null
          external_url?: string | null
          id?: string
          images?: Json
          is_published?: boolean
          published_at?: string | null
          section_type?: string
          slug?: string
          sort_order?: number
          summary?: string | null
          title?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: []
      }
      shop_content_questions: {
        Row: {
          author_name: string | null
          content: string
          created_at: string
          id: string
          is_hidden: boolean
          page_id: string
          replied_at: string | null
          replied_by: string | null
          reply: string | null
          user_id: string | null
        }
        Insert: {
          author_name?: string | null
          content: string
          created_at?: string
          id?: string
          is_hidden?: boolean
          page_id: string
          replied_at?: string | null
          replied_by?: string | null
          reply?: string | null
          user_id?: string | null
        }
        Update: {
          author_name?: string | null
          content?: string
          created_at?: string
          id?: string
          is_hidden?: boolean
          page_id?: string
          replied_at?: string | null
          replied_by?: string | null
          reply?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "shop_content_questions_page_id_fkey"
            columns: ["page_id"]
            isOneToOne: false
            referencedRelation: "shop_content_pages"
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
      vip_bonus_pool_payouts: {
        Row: {
          bonus_amount: number
          bonus_rate: number
          cap_amount: number | null
          capped_amount: number
          created_at: string
          created_by: string | null
          daily_total_reward_points: number
          eligible_member_count: number
          id: string
          member_id: string | null
          notes: string | null
          payable_amount: number
          payout_date: string
          pool_amount: number
          pool_id: string
          status: string
          tier_code: string | null
          total_after: number
          total_before: number
        }
        Insert: {
          bonus_amount?: number
          bonus_rate?: number
          cap_amount?: number | null
          capped_amount?: number
          created_at?: string
          created_by?: string | null
          daily_total_reward_points?: number
          eligible_member_count?: number
          id?: string
          member_id?: string | null
          notes?: string | null
          payable_amount?: number
          payout_date: string
          pool_amount?: number
          pool_id: string
          status: string
          tier_code?: string | null
          total_after?: number
          total_before?: number
        }
        Update: {
          bonus_amount?: number
          bonus_rate?: number
          cap_amount?: number | null
          capped_amount?: number
          created_at?: string
          created_by?: string | null
          daily_total_reward_points?: number
          eligible_member_count?: number
          id?: string
          member_id?: string | null
          notes?: string | null
          payable_amount?: number
          payout_date?: string
          pool_amount?: number
          pool_id?: string
          status?: string
          tier_code?: string | null
          total_after?: number
          total_before?: number
        }
        Relationships: [
          {
            foreignKeyName: "vip_bonus_pool_payouts_pool_id_fkey"
            columns: ["pool_id"]
            isOneToOne: false
            referencedRelation: "vip_bonus_pools"
            referencedColumns: ["id"]
          },
        ]
      }
      vip_bonus_pools: {
        Row: {
          apply_total_income_cap: boolean
          bonus_rate: number
          code: string | null
          created_at: string
          created_by: string | null
          description: string | null
          distribution_method: string
          id: string
          name: string
          sort_order: number
          status: string
          tier_codes: string[]
          total_income_cap_amount: number | null
          updated_at: string
        }
        Insert: {
          apply_total_income_cap?: boolean
          bonus_rate?: number
          code?: string | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          distribution_method?: string
          id?: string
          name: string
          sort_order?: number
          status?: string
          tier_codes?: string[]
          total_income_cap_amount?: number | null
          updated_at?: string
        }
        Update: {
          apply_total_income_cap?: boolean
          bonus_rate?: number
          code?: string | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          distribution_method?: string
          id?: string
          name?: string
          sort_order?: number
          status?: string
          tier_codes?: string[]
          total_income_cap_amount?: number | null
          updated_at?: string
        }
        Relationships: []
      }
      vip_business_bonus_ledger: {
        Row: {
          bonus_amount: number
          bonus_record_id: string | null
          cap_amount: number
          capped_amount: number
          created_at: string
          created_by: string | null
          dedupe_key: string | null
          id: string
          member_id: string
          notes: string | null
          payable_amount: number
          source_member_id: string | null
          source_order_id: string | null
          status: string
          tier_code: string
          total_after: number
          total_before: number
          updated_at: string
        }
        Insert: {
          bonus_amount?: number
          bonus_record_id?: string | null
          cap_amount?: number
          capped_amount?: number
          created_at?: string
          created_by?: string | null
          dedupe_key?: string | null
          id?: string
          member_id: string
          notes?: string | null
          payable_amount?: number
          source_member_id?: string | null
          source_order_id?: string | null
          status: string
          tier_code: string
          total_after?: number
          total_before?: number
          updated_at?: string
        }
        Update: {
          bonus_amount?: number
          bonus_record_id?: string | null
          cap_amount?: number
          capped_amount?: number
          created_at?: string
          created_by?: string | null
          dedupe_key?: string | null
          id?: string
          member_id?: string
          notes?: string | null
          payable_amount?: number
          source_member_id?: string | null
          source_order_id?: string | null
          status?: string
          tier_code?: string
          total_after?: number
          total_before?: number
          updated_at?: string
        }
        Relationships: []
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
      vip_package_upgrade_logs: {
        Row: {
          bonus_points: number
          created_at: string
          id: string
          new_tier: string | null
          notes: string | null
          package_id: string
          previous_tier: string | null
          sales_order_id: string
          status: string
          tier_code: string
          upgraded: boolean
          user_id: string
          vip_expires_after: string | null
          vip_expires_before: string | null
        }
        Insert: {
          bonus_points?: number
          created_at?: string
          id?: string
          new_tier?: string | null
          notes?: string | null
          package_id: string
          previous_tier?: string | null
          sales_order_id: string
          status?: string
          tier_code: string
          upgraded?: boolean
          user_id: string
          vip_expires_after?: string | null
          vip_expires_before?: string | null
        }
        Update: {
          bonus_points?: number
          created_at?: string
          id?: string
          new_tier?: string | null
          notes?: string | null
          package_id?: string
          previous_tier?: string | null
          sales_order_id?: string
          status?: string
          tier_code?: string
          upgraded?: boolean
          user_id?: string
          vip_expires_after?: string | null
          vip_expires_before?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "vip_package_upgrade_logs_package_id_fkey"
            columns: ["package_id"]
            isOneToOne: false
            referencedRelation: "vip_upgrade_packages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vip_package_upgrade_logs_sales_order_id_fkey"
            columns: ["sales_order_id"]
            isOneToOne: false
            referencedRelation: "sales_orders"
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
      vip_tiers: {
        Row: {
          business_bonus_cap_amount: number
          business_bonus_rate: number
          cashback_rate: number
          code: string
          created_at: string
          description: string | null
          extra_config: Json
          id: string
          name: string
          renewal_required_new_vip: number
          renewal_window_days: number
          required_direct_vip: number
          required_mentor_count: number
          required_mentor_tier: string | null
          required_reward_points: number
          revenue_share_rate: number
          sort_order: number
          status: string
          updated_at: string
          upgrade_bonus_cap: number
          upgrade_bonus_cap_amount: number | null
          upgrade_bonus_cap_basis: string
          upgrade_total_earnings_cap_amount: number
        }
        Insert: {
          business_bonus_cap_amount?: number
          business_bonus_rate?: number
          cashback_rate?: number
          code: string
          created_at?: string
          description?: string | null
          extra_config?: Json
          id?: string
          name: string
          renewal_required_new_vip?: number
          renewal_window_days?: number
          required_direct_vip?: number
          required_mentor_count?: number
          required_mentor_tier?: string | null
          required_reward_points?: number
          revenue_share_rate?: number
          sort_order?: number
          status?: string
          updated_at?: string
          upgrade_bonus_cap?: number
          upgrade_bonus_cap_amount?: number | null
          upgrade_bonus_cap_basis?: string
          upgrade_total_earnings_cap_amount?: number
        }
        Update: {
          business_bonus_cap_amount?: number
          business_bonus_rate?: number
          cashback_rate?: number
          code?: string
          created_at?: string
          description?: string | null
          extra_config?: Json
          id?: string
          name?: string
          renewal_required_new_vip?: number
          renewal_window_days?: number
          required_direct_vip?: number
          required_mentor_count?: number
          required_mentor_tier?: string | null
          required_reward_points?: number
          revenue_share_rate?: number
          sort_order?: number
          status?: string
          updated_at?: string
          upgrade_bonus_cap?: number
          upgrade_bonus_cap_amount?: number | null
          upgrade_bonus_cap_basis?: string
          upgrade_total_earnings_cap_amount?: number
        }
        Relationships: []
      }
      vip_upgrade_bonus_ledger: {
        Row: {
          bonus_amount: number
          bonus_record_id: string | null
          cap_amount: number
          capped_amount: number
          created_at: string
          created_by: string | null
          dedupe_key: string | null
          id: string
          member_id: string
          notes: string | null
          payable_amount: number
          source_member_id: string | null
          source_order_id: string | null
          status: string
          tier_code: string
          total_after: number
          total_before: number
          updated_at: string
        }
        Insert: {
          bonus_amount: number
          bonus_record_id?: string | null
          cap_amount: number
          capped_amount: number
          created_at?: string
          created_by?: string | null
          dedupe_key?: string | null
          id?: string
          member_id: string
          notes?: string | null
          payable_amount: number
          source_member_id?: string | null
          source_order_id?: string | null
          status: string
          tier_code: string
          total_after: number
          total_before: number
          updated_at?: string
        }
        Update: {
          bonus_amount?: number
          bonus_record_id?: string | null
          cap_amount?: number
          capped_amount?: number
          created_at?: string
          created_by?: string | null
          dedupe_key?: string | null
          id?: string
          member_id?: string
          notes?: string | null
          payable_amount?: number
          source_member_id?: string | null
          source_order_id?: string | null
          status?: string
          tier_code?: string
          total_after?: number
          total_before?: number
          updated_at?: string
        }
        Relationships: []
      }
      vip_upgrade_bonus_total_earnings_ledger: {
        Row: {
          cap_amount: number
          cap_basis: string
          capped_amount: number
          created_at: string
          created_by: string | null
          dedupe_key: string | null
          id: string
          included_types: Json
          member_id: string
          member_total_earnings_after: number
          member_total_earnings_before: number
          notes: string | null
          original_bonus_amount: number
          payable_amount: number
          source_ref: string | null
          status: string
          tier_code: string
          updated_at: string
        }
        Insert: {
          cap_amount?: number
          cap_basis?: string
          capped_amount?: number
          created_at?: string
          created_by?: string | null
          dedupe_key?: string | null
          id?: string
          included_types?: Json
          member_id: string
          member_total_earnings_after?: number
          member_total_earnings_before?: number
          notes?: string | null
          original_bonus_amount?: number
          payable_amount?: number
          source_ref?: string | null
          status: string
          tier_code: string
          updated_at?: string
        }
        Update: {
          cap_amount?: number
          cap_basis?: string
          capped_amount?: number
          created_at?: string
          created_by?: string | null
          dedupe_key?: string | null
          id?: string
          included_types?: Json
          member_id?: string
          member_total_earnings_after?: number
          member_total_earnings_before?: number
          notes?: string | null
          original_bonus_amount?: number
          payable_amount?: number
          source_ref?: string | null
          status?: string
          tier_code?: string
          updated_at?: string
        }
        Relationships: []
      }
      vip_upgrade_orders: {
        Row: {
          amount: number
          applied_at: string | null
          bonus_points: number
          created_at: string
          id: string
          new_tier: string | null
          notes: string | null
          package_id: string | null
          paid_at: string | null
          payment_method: string | null
          payment_status: string
          previous_tier: string | null
          sales_order_id: string | null
          tier_code: string
          updated_at: string
          user_id: string
        }
        Insert: {
          amount?: number
          applied_at?: string | null
          bonus_points?: number
          created_at?: string
          id?: string
          new_tier?: string | null
          notes?: string | null
          package_id?: string | null
          paid_at?: string | null
          payment_method?: string | null
          payment_status?: string
          previous_tier?: string | null
          sales_order_id?: string | null
          tier_code: string
          updated_at?: string
          user_id: string
        }
        Update: {
          amount?: number
          applied_at?: string | null
          bonus_points?: number
          created_at?: string
          id?: string
          new_tier?: string | null
          notes?: string | null
          package_id?: string | null
          paid_at?: string | null
          payment_method?: string | null
          payment_status?: string
          previous_tier?: string | null
          sales_order_id?: string | null
          tier_code?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "vip_upgrade_orders_package_id_fkey"
            columns: ["package_id"]
            isOneToOne: false
            referencedRelation: "vip_upgrade_packages"
            referencedColumns: ["id"]
          },
        ]
      }
      vip_upgrade_package_products: {
        Row: {
          created_at: string
          id: string
          package_id: string
          product_id: string
          quantity: number
          sort_order: number
        }
        Insert: {
          created_at?: string
          id?: string
          package_id: string
          product_id: string
          quantity?: number
          sort_order?: number
        }
        Update: {
          created_at?: string
          id?: string
          package_id?: string
          product_id?: string
          quantity?: number
          sort_order?: number
        }
        Relationships: [
          {
            foreignKeyName: "vip_upgrade_package_products_package_id_fkey"
            columns: ["package_id"]
            isOneToOne: false
            referencedRelation: "vip_upgrade_packages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vip_upgrade_package_products_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      vip_upgrade_packages: {
        Row: {
          bonus_points: number
          created_at: string
          description: string | null
          duration_days: number
          id: string
          name: string
          package_product_id: string | null
          price: number
          product_id: string | null
          sort_order: number
          status: string
          tier_code: string
          updated_at: string
        }
        Insert: {
          bonus_points?: number
          created_at?: string
          description?: string | null
          duration_days?: number
          id?: string
          name: string
          package_product_id?: string | null
          price?: number
          product_id?: string | null
          sort_order?: number
          status?: string
          tier_code: string
          updated_at?: string
        }
        Update: {
          bonus_points?: number
          created_at?: string
          description?: string | null
          duration_days?: number
          id?: string
          name?: string
          package_product_id?: string | null
          price?: number
          product_id?: string | null
          sort_order?: number
          status?: string
          tier_code?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "vip_upgrade_packages_package_product_id_fkey"
            columns: ["package_product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vip_upgrade_packages_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vip_upgrade_packages_tier_code_fkey"
            columns: ["tier_code"]
            isOneToOne: false
            referencedRelation: "vip_tiers"
            referencedColumns: ["code"]
          },
          {
            foreignKeyName: "vip_upgrade_packages_tier_code_fkey"
            columns: ["tier_code"]
            isOneToOne: false
            referencedRelation: "vip_tiers_public"
            referencedColumns: ["code"]
          },
        ]
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
      webhook_deliveries: {
        Row: {
          attempts: number
          delivered_at: string
          endpoint_id: string
          error: string | null
          event: string
          id: string
          payload: Json
          response_body: string | null
          status_code: number | null
        }
        Insert: {
          attempts?: number
          delivered_at?: string
          endpoint_id: string
          error?: string | null
          event: string
          id?: string
          payload: Json
          response_body?: string | null
          status_code?: number | null
        }
        Update: {
          attempts?: number
          delivered_at?: string
          endpoint_id?: string
          error?: string | null
          event?: string
          id?: string
          payload?: Json
          response_body?: string | null
          status_code?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "webhook_deliveries_endpoint_id_fkey"
            columns: ["endpoint_id"]
            isOneToOne: false
            referencedRelation: "webhook_endpoints"
            referencedColumns: ["id"]
          },
        ]
      }
      webhook_endpoints: {
        Row: {
          active: boolean
          bearer_token: string
          company_id: string
          created_at: string
          events: string[]
          id: string
          name: string
          updated_at: string
          url: string
        }
        Insert: {
          active?: boolean
          bearer_token?: string
          company_id: string
          created_at?: string
          events?: string[]
          id?: string
          name: string
          updated_at?: string
          url: string
        }
        Update: {
          active?: boolean
          bearer_token?: string
          company_id?: string
          created_at?: string
          events?: string[]
          id?: string
          name?: string
          updated_at?: string
          url?: string
        }
        Relationships: [
          {
            foreignKeyName: "webhook_endpoints_company_id_fkey"
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
      dealer_tiers_public_summary: {
        Row: {
          code: string | null
          description: string | null
          name: string | null
          sort_order: number | null
          status: string | null
          tier_type: string | null
        }
        Insert: {
          code?: string | null
          description?: string | null
          name?: string | null
          sort_order?: number | null
          status?: string | null
          tier_type?: string | null
        }
        Update: {
          code?: string | null
          description?: string | null
          name?: string | null
          sort_order?: number | null
          status?: string | null
          tier_type?: string | null
        }
        Relationships: []
      }
      profiles_public_safe: {
        Row: {
          brand_intro: string | null
          brand_name: string | null
          display_name: string | null
          facebook_url: string | null
          id: string | null
          instagram_url: string | null
          line_url: string | null
          marketing_slug: string | null
          member_no: string | null
          page_template: string | null
          profile_avatar: string | null
          profile_cover: string | null
          youtube_url: string | null
        }
        Insert: {
          brand_intro?: string | null
          brand_name?: string | null
          display_name?: string | null
          facebook_url?: string | null
          id?: string | null
          instagram_url?: string | null
          line_url?: string | null
          marketing_slug?: string | null
          member_no?: string | null
          page_template?: string | null
          profile_avatar?: string | null
          profile_cover?: string | null
          youtube_url?: string | null
        }
        Update: {
          brand_intro?: string | null
          brand_name?: string | null
          display_name?: string | null
          facebook_url?: string | null
          id?: string | null
          instagram_url?: string | null
          line_url?: string | null
          marketing_slug?: string | null
          member_no?: string | null
          page_template?: string | null
          profile_avatar?: string | null
          profile_cover?: string | null
          youtube_url?: string | null
        }
        Relationships: []
      }
      public_member_profiles: {
        Row: {
          avatar_url: string | null
          brand_intro: string | null
          brand_name: string | null
          display_name: string | null
          facebook_url: string | null
          id: string | null
          instagram_url: string | null
          is_vip: boolean | null
          line_url: string | null
          marketing_slug: string | null
          member_no: string | null
          name: string | null
          page_template: string | null
          profile_avatar: string | null
          profile_cover: string | null
          referral_code: string | null
          youtube_url: string | null
        }
        Insert: {
          avatar_url?: string | null
          brand_intro?: string | null
          brand_name?: string | null
          display_name?: string | null
          facebook_url?: string | null
          id?: string | null
          instagram_url?: string | null
          is_vip?: boolean | null
          line_url?: string | null
          marketing_slug?: string | null
          member_no?: string | null
          name?: string | null
          page_template?: string | null
          profile_avatar?: string | null
          profile_cover?: string | null
          referral_code?: string | null
          youtube_url?: string | null
        }
        Update: {
          avatar_url?: string | null
          brand_intro?: string | null
          brand_name?: string | null
          display_name?: string | null
          facebook_url?: string | null
          id?: string | null
          instagram_url?: string | null
          is_vip?: boolean | null
          line_url?: string | null
          marketing_slug?: string | null
          member_no?: string | null
          name?: string | null
          page_template?: string | null
          profile_avatar?: string | null
          profile_cover?: string | null
          referral_code?: string | null
          youtube_url?: string | null
        }
        Relationships: []
      }
      vip_tiers_public: {
        Row: {
          business_bonus_cap_amount: number | null
          business_bonus_rate: number | null
          cashback_rate: number | null
          code: string | null
          id: string | null
          name: string | null
          revenue_share_rate: number | null
          sort_order: number | null
          status: string | null
          upgrade_bonus_cap: number | null
          upgrade_bonus_cap_amount: number | null
          upgrade_bonus_cap_basis: string | null
          upgrade_total_earnings_cap_amount: number | null
        }
        Insert: {
          business_bonus_cap_amount?: number | null
          business_bonus_rate?: number | null
          cashback_rate?: number | null
          code?: string | null
          id?: string | null
          name?: string | null
          revenue_share_rate?: number | null
          sort_order?: number | null
          status?: string | null
          upgrade_bonus_cap?: number | null
          upgrade_bonus_cap_amount?: number | null
          upgrade_bonus_cap_basis?: string | null
          upgrade_total_earnings_cap_amount?: number | null
        }
        Update: {
          business_bonus_cap_amount?: number | null
          business_bonus_rate?: number | null
          cashback_rate?: number | null
          code?: string | null
          id?: string | null
          name?: string | null
          revenue_share_rate?: number | null
          sort_order?: number | null
          status?: string | null
          upgrade_bonus_cap?: number | null
          upgrade_bonus_cap_amount?: number | null
          upgrade_bonus_cap_basis?: string | null
          upgrade_total_earnings_cap_amount?: number | null
        }
        Relationships: []
      }
    }
    Functions: {
      adjust_cash_balance: {
        Args: { _delta: number; _user_id: string }
        Returns: number
      }
      calc_business_bonus_release: {
        Args: { _bonus_amount: number; _member_id: string; _tier_code: string }
        Returns: {
          bonus_amount: number
          cap_amount: number
          capped_amount: number
          payable_amount: number
          status: string
          total_after: number
          total_before: number
        }[]
      }
      calc_upgrade_bonus_release: {
        Args: { _bonus_amount: number; _member_id: string; _tier_code: string }
        Returns: {
          bonus_amount: number
          cap_amount: number
          capped_amount: number
          payable_amount: number
          status: string
          total_after: number
          total_before: number
        }[]
      }
      calc_upgrade_bonus_total_earnings_release: {
        Args: { _bonus_amount: number; _member_id: string; _tier_code: string }
        Returns: {
          cap_amount: number
          cap_basis: string
          capped_amount: number
          member_total_earnings_after: number
          member_total_earnings_before: number
          original_bonus_amount: number
          payable_amount: number
          status: string
        }[]
      }
      calc_vip_bonus_pool_daily: {
        Args: {
          _daily_total_reward_points: number
          _eligible_member_count: number
          _pool_id: string
        }
        Returns: {
          bonus_rate: number
          eligible_member_count: number
          per_member_amount: number
          pool_amount: number
          pool_id: string
          status: string
        }[]
      }
      check_guest_signup_rate_limit: {
        Args: { _ip: string; _phone: string }
        Returns: undefined
      }
      create_sales_order_with_items: {
        Args: { _items: Json; _order: Json; _payments?: Json }
        Returns: {
          company_id: string
          coupon_code: string | null
          created_at: string
          created_by_id: string | null
          created_by_name: string | null
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
          order_source: string | null
          order_status: string
          order_type: string
          payment_status: string
          receiver_name: string
          receiver_phone: string
          referrer_id: string | null
          salesperson_id: string | null
          salesperson_name: string | null
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
      create_sales_order_with_point_payments: {
        Args: {
          _items: Json
          _order: Json
          _payments?: Json
          _point_payments?: Json
        }
        Returns: {
          company_id: string
          coupon_code: string | null
          created_at: string
          created_by_id: string | null
          created_by_name: string | null
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
          order_source: string | null
          order_status: string
          order_type: string
          payment_status: string
          receiver_name: string
          receiver_phone: string
          referrer_id: string | null
          salesperson_id: string | null
          salesperson_name: string | null
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
      email_queue_dispatch: { Args: never; Returns: undefined }
      enqueue_email: {
        Args: { payload: Json; queue_name: string }
        Returns: number
      }
      generate_customer_no: { Args: never; Returns: string }
      generate_member_no: { Args: never; Returns: string }
      generate_po_no: { Args: never; Returns: string }
      generate_quote_no: { Args: never; Returns: string }
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
      get_member_business_bonus_cap: {
        Args: { _member_id: string }
        Returns: number
      }
      get_member_business_bonus_rate: {
        Args: { _member_id: string }
        Returns: number
      }
      get_member_business_bonus_total: {
        Args: { _member_id: string }
        Returns: number
      }
      get_member_total_earnings: {
        Args: { _member_id: string }
        Returns: number
      }
      get_member_upgrade_bonus_cap: {
        Args: { _member_id: string }
        Returns: number
      }
      get_member_upgrade_bonus_total: {
        Args: { _member_id: string }
        Returns: number
      }
      get_member_vip_tier_code: {
        Args: { _member_id: string }
        Returns: string
      }
      get_operation_role: {
        Args: { _user_id: string }
        Returns: Database["public"]["Enums"]["operation_role"]
      }
      get_product_costs: {
        Args: { _ids: string[] }
        Returns: {
          cost_price: number
          id: string
        }[]
      }
      get_product_wholesale_prices: {
        Args: { _ids: string[] }
        Returns: {
          id: string
          wholesale_price: number
        }[]
      }
      get_profile_id_no: { Args: { _user_id: string }; Returns: string }
      get_public_companies: {
        Args: never
        Returns: {
          company_name: string
          id: string
          logo_url: string
          slug: string
        }[]
      }
      get_quote_by_public_token: {
        Args: { _token: string }
        Returns: {
          bank_snapshot: Json
          company_snapshot: Json
          customer_address: string
          customer_email: string
          customer_name: string
          customer_phone: string
          discount_amount: number
          id: string
          items: Json
          notes: string
          payment_terms: string
          quote_date: string
          quote_no: string
          salesperson_name: string
          status: string
          subtotal: number
          tax_amount: number
          total_amount: number
          valid_until: string
        }[]
      }
      get_tier_upgrade_total_earnings_cap: {
        Args: { _tier_code: string }
        Returns: number
      }
      get_upgrade_bonus_total_earnings_types: { Args: never; Returns: string[] }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      is_active_dealer: { Args: { _user_id: string }; Returns: boolean }
      is_active_vip: { Args: { _user_id: string }; Returns: boolean }
      is_company_member: {
        Args: { _company_id: string; _user_id: string }
        Returns: boolean
      }
      is_operation_participant: { Args: { _user_id: string }; Returns: boolean }
      map_legacy_rank_to_code: { Args: { _legacy: string }; Returns: string }
      move_to_dlq: {
        Args: {
          dlq_name: string
          message_id: number
          payload: Json
          source_queue: string
        }
        Returns: number
      }
      process_paid_order_upgrades: {
        Args: { p_operator?: string; p_order_id: string }
        Returns: Json
      }
      profile_sensitive_unchanged: {
        Args: {
          _new: Database["public"]["Tables"]["profiles"]["Row"]
          _old: Database["public"]["Tables"]["profiles"]["Row"]
        }
        Returns: boolean
      }
      quote_retail_prices: {
        Args: { _items: Json }
        Returns: {
          applied: boolean
          base_price: number
          line_subtotal: number
          product_id: string
          requested_qty: number
          tier_max_qty: number
          tier_min_qty: number
          unit_price: number
          unit_reward_points: number
          visibility: string
        }[]
      }
      quote_wholesale_price: {
        Args: { _product_id: string; _qty: number }
        Returns: {
          applied: boolean
          tier_max_qty: number
          tier_min_qty: number
          unit_price: number
          unit_reward_points: number
          visibility: string
        }[]
      }
      read_email_batch: {
        Args: { batch_size: number; queue_name: string; vt: number }
        Returns: {
          message: Json
          msg_id: number
          read_ct: number
        }[]
      }
      record_business_bonus_release: {
        Args: {
          _bonus_amount: number
          _bonus_record_id?: string
          _dedupe_key?: string
          _member_id: string
          _notes?: string
          _source_member_id?: string
          _source_order_id?: string
          _tier_code?: string
        }
        Returns: {
          bonus_amount: number
          bonus_record_id: string | null
          cap_amount: number
          capped_amount: number
          created_at: string
          created_by: string | null
          dedupe_key: string | null
          id: string
          member_id: string
          notes: string | null
          payable_amount: number
          source_member_id: string | null
          source_order_id: string | null
          status: string
          tier_code: string
          total_after: number
          total_before: number
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "vip_business_bonus_ledger"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      record_upgrade_bonus_release: {
        Args: {
          _bonus_amount: number
          _bonus_record_id?: string
          _dedupe_key?: string
          _member_id: string
          _notes?: string
          _source_member_id?: string
          _source_order_id?: string
          _tier_code?: string
        }
        Returns: {
          bonus_amount: number
          bonus_record_id: string | null
          cap_amount: number
          capped_amount: number
          created_at: string
          created_by: string | null
          dedupe_key: string | null
          id: string
          member_id: string
          notes: string | null
          payable_amount: number
          source_member_id: string | null
          source_order_id: string | null
          status: string
          tier_code: string
          total_after: number
          total_before: number
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "vip_upgrade_bonus_ledger"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      release_bonus_rewards: {
        Args: { _limit?: number; _record_ids?: string[] }
        Returns: Json
      }
      resolve_bonus_reward_recipient: {
        Args: { _member_id: string }
        Returns: Json
      }
      set_default_address: { Args: { _address_id: string }; Returns: undefined }
      settle_daily_bonus: {
        Args: { _advance_next?: boolean; _created_by?: string }
        Returns: Json
      }
      settle_monthly_bonus: {
        Args: { _created_by?: string; _source?: string; _yyyymm?: string }
        Returns: Json
      }
      slugify_company_name: { Args: { _name: string }; Returns: string }
      spend_cash_balance: {
        Args: { _amount: number; _user_id: string }
        Returns: number
      }
      spend_shopping_points: {
        Args: { _amount: number; _user_id: string }
        Returns: number
      }
      verify_guest_signup_otp: {
        Args: { _code_hash: string; _email: string; _phone: string }
        Returns: boolean
      }
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
      operation_attendance_type: "check_in" | "check_out"
      operation_role: "manager" | "staff" | "assistant" | "collaborator"
      operation_task_priority: "low" | "normal" | "high" | "urgent"
      operation_task_status:
        | "pending"
        | "in_progress"
        | "submitted"
        | "completed"
        | "cancelled"
        | "overdue"
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
      operation_attendance_type: ["check_in", "check_out"],
      operation_role: ["manager", "staff", "assistant", "collaborator"],
      operation_task_priority: ["low", "normal", "high", "urgent"],
      operation_task_status: [
        "pending",
        "in_progress",
        "submitted",
        "completed",
        "cancelled",
        "overdue",
      ],
    },
  },
} as const
