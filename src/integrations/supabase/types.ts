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
        ]
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
      b2b_order_items: {
        Row: {
          b2b_order_id: string
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
        ]
      }
      b2b_orders: {
        Row: {
          business_account_id: string
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
        Relationships: []
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
            foreignKeyName: "categories_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "categories"
            referencedColumns: ["id"]
          },
        ]
      }
      coupons: {
        Row: {
          code: string
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
        Relationships: []
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
          created_at?: string
          email?: string | null
          id?: string
          name?: string
          notes?: string | null
          phone?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      dealers: {
        Row: {
          address: string | null
          code: string
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
        Relationships: []
      }
      goods_receiving: {
        Row: {
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
      moq_rules: {
        Row: {
          carton_quantity: number
          created_at: string
          id: string
          moq: number
          product_id: string
          updated_at: string
          volume_tiers: Json
        }
        Insert: {
          carton_quantity?: number
          created_at?: string
          id?: string
          moq?: number
          product_id: string
          updated_at?: string
          volume_tiers?: Json
        }
        Update: {
          carton_quantity?: number
          created_at?: string
          id?: string
          moq?: number
          product_id?: string
          updated_at?: string
          volume_tiers?: Json
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
          created_at: string
          customer_name: string
          id: string
          order_no: string
          status: string
          total_amount: number
        }
        Insert: {
          created_at?: string
          customer_name: string
          id?: string
          order_no: string
          status?: string
          total_amount?: number
        }
        Update: {
          created_at?: string
          customer_name?: string
          id?: string
          order_no?: string
          status?: string
          total_amount?: number
        }
        Relationships: []
      }
      payments: {
        Row: {
          amount: number
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
            foreignKeyName: "payments_sales_order_id_fkey"
            columns: ["sales_order_id"]
            isOneToOne: false
            referencedRelation: "sales_orders"
            referencedColumns: ["id"]
          },
        ]
      }
      price_tiers: {
        Row: {
          account_level: string
          created_at: string
          id: string
          min_quantity: number
          price: number
          product_id: string
        }
        Insert: {
          account_level: string
          created_at?: string
          id?: string
          min_quantity?: number
          price?: number
          product_id: string
        }
        Update: {
          account_level?: string
          created_at?: string
          id?: string
          min_quantity?: number
          price?: number
          product_id?: string
        }
        Relationships: []
      }
      product_images: {
        Row: {
          created_at: string
          id: string
          image_url: string
          product_id: string
          sort_order: number
        }
        Insert: {
          created_at?: string
          id?: string
          image_url: string
          product_id: string
          sort_order?: number
        }
        Update: {
          created_at?: string
          id?: string
          image_url?: string
          product_id?: string
          sort_order?: number
        }
        Relationships: [
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
          cost_price: number
          created_at: string
          description: string | null
          featured: boolean
          id: string
          image: string | null
          name: string
          price: number
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
          cost_price?: number
          created_at?: string
          description?: string | null
          featured?: boolean
          id?: string
          image?: string | null
          name: string
          price?: number
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
          cost_price?: number
          created_at?: string
          description?: string | null
          featured?: boolean
          id?: string
          image?: string | null
          name?: string
          price?: number
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
        ]
      }
      profiles: {
        Row: {
          avatar_url: string | null
          created_at: string
          email: string | null
          id: string
          name: string | null
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string
          email?: string | null
          id: string
          name?: string | null
        }
        Update: {
          avatar_url?: string | null
          created_at?: string
          email?: string | null
          id?: string
          name?: string | null
        }
        Relationships: []
      }
      purchase_order_items: {
        Row: {
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
        Relationships: []
      }
      sales_order_items: {
        Row: {
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
          coupon_code: string | null
          created_at: string
          customer_email: string | null
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
          coupon_code?: string | null
          created_at?: string
          customer_email?: string | null
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
          coupon_code?: string | null
          created_at?: string
          customer_email?: string | null
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
          shipping_address?: string
          shipping_fee?: number
          shipping_method?: string
          shipping_status?: string
          subtotal?: number
          total_amount?: number
          updated_at?: string
          user_id?: string | null
        }
        Relationships: []
      }
      sales_representatives: {
        Row: {
          commission_rate: number
          created_at: string
          department: string | null
          id: string
          name: string
          status: string
          user_id: string
        }
        Insert: {
          commission_rate?: number
          created_at?: string
          department?: string | null
          id?: string
          name: string
          status?: string
          user_id: string
        }
        Update: {
          commission_rate?: number
          created_at?: string
          department?: string | null
          id?: string
          name?: string
          status?: string
          user_id?: string
        }
        Relationships: []
      }
      shipments: {
        Row: {
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
            foreignKeyName: "shipments_sales_order_id_fkey"
            columns: ["sales_order_id"]
            isOneToOne: false
            referencedRelation: "sales_orders"
            referencedColumns: ["id"]
          },
        ]
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
      vendors: {
        Row: {
          address: string | null
          bank_account: string | null
          code: string
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
        Relationships: []
      }
      warehouse_inventory: {
        Row: {
          id: string
          product_id: string
          stock: number
          updated_at: string
          warehouse_id: string
        }
        Insert: {
          id?: string
          product_id: string
          stock?: number
          updated_at?: string
          warehouse_id: string
        }
        Update: {
          id?: string
          product_id?: string
          stock?: number
          updated_at?: string
          warehouse_id?: string
        }
        Relationships: [
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
          created_at?: string
          id?: string
          name?: string
          notes?: string | null
          status?: string
          updated_at?: string
          warehouse_code?: string
        }
        Relationships: []
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
      generate_po_no: { Args: never; Returns: string }
      generate_receipt_no: { Args: never; Returns: string }
      generate_so_no: { Args: never; Returns: string }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      is_account_member: {
        Args: { _account_id: string; _user_id: string }
        Returns: boolean
      }
      set_default_address: { Args: { _address_id: string }; Returns: undefined }
    }
    Enums: {
      app_role:
        | "super_admin"
        | "finance"
        | "warehouse"
        | "sales"
        | "vendor"
        | "member"
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
      ],
    },
  },
} as const
