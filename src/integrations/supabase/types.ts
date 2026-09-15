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
      appointments: {
        Row: {
          appointment_type: string
          consultation_reasons: string[] | null
          consultation_type: string | null
          created_at: string
          created_by: string | null
          end_time: string
          id: string
          is_recurring: boolean | null
          owner_id: string | null
          parent_appointment_id: string | null
          patient_id: string | null
          patient_name: string | null
          problem_area_ids: string[] | null
          reason_for_consultation: string | null
          recurrence_end_date: string | null
          recurrence_pattern: string | null
          service: string
          sf_id: string | null
          source: string | null
          staff_id: string | null
          start_time: string
          status: string
          survey_template_id: string | null
          updated_at: string
          updated_by: string | null
          visit_status: string | null
        }
        Insert: {
          appointment_type?: string
          consultation_reasons?: string[] | null
          consultation_type?: string | null
          created_at?: string
          created_by?: string | null
          end_time: string
          id?: string
          is_recurring?: boolean | null
          owner_id?: string | null
          parent_appointment_id?: string | null
          patient_id?: string | null
          patient_name?: string | null
          problem_area_ids?: string[] | null
          reason_for_consultation?: string | null
          recurrence_end_date?: string | null
          recurrence_pattern?: string | null
          service: string
          sf_id?: string | null
          source?: string | null
          staff_id?: string | null
          start_time: string
          status?: string
          survey_template_id?: string | null
          updated_at?: string
          updated_by?: string | null
          visit_status?: string | null
        }
        Update: {
          appointment_type?: string
          consultation_reasons?: string[] | null
          consultation_type?: string | null
          created_at?: string
          created_by?: string | null
          end_time?: string
          id?: string
          is_recurring?: boolean | null
          owner_id?: string | null
          parent_appointment_id?: string | null
          patient_id?: string | null
          patient_name?: string | null
          problem_area_ids?: string[] | null
          reason_for_consultation?: string | null
          recurrence_end_date?: string | null
          recurrence_pattern?: string | null
          service?: string
          sf_id?: string | null
          source?: string | null
          staff_id?: string | null
          start_time?: string
          status?: string
          survey_template_id?: string | null
          updated_at?: string
          updated_by?: string | null
          visit_status?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "appointments_parent_appointment_id_fkey"
            columns: ["parent_appointment_id"]
            isOneToOne: false
            referencedRelation: "appointments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "appointments_patient_id_fkey"
            columns: ["patient_id"]
            isOneToOne: false
            referencedRelation: "patients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "appointments_staff_id_fkey"
            columns: ["staff_id"]
            isOneToOne: false
            referencedRelation: "staff"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "appointments_survey_template_id_fkey"
            columns: ["survey_template_id"]
            isOneToOne: false
            referencedRelation: "survey_templates"
            referencedColumns: ["id"]
          },
        ]
      }
      asset_issues: {
        Row: {
          asset_id: string
          cost: number | null
          created_at: string
          description: string | null
          id: string
          priority: string
          reported_by: string | null
          reported_date: string
          resolution_notes: string | null
          resolved_date: string | null
          status: string
          title: string
          updated_at: string
          vendor_id: string | null
        }
        Insert: {
          asset_id: string
          cost?: number | null
          created_at?: string
          description?: string | null
          id?: string
          priority?: string
          reported_by?: string | null
          reported_date?: string
          resolution_notes?: string | null
          resolved_date?: string | null
          status?: string
          title: string
          updated_at?: string
          vendor_id?: string | null
        }
        Update: {
          asset_id?: string
          cost?: number | null
          created_at?: string
          description?: string | null
          id?: string
          priority?: string
          reported_by?: string | null
          reported_date?: string
          resolution_notes?: string | null
          resolved_date?: string | null
          status?: string
          title?: string
          updated_at?: string
          vendor_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "asset_issues_asset_id_fkey"
            columns: ["asset_id"]
            isOneToOne: false
            referencedRelation: "assets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "asset_issues_vendor_id_fkey"
            columns: ["vendor_id"]
            isOneToOne: false
            referencedRelation: "vendors"
            referencedColumns: ["id"]
          },
        ]
      }
      asset_service_links: {
        Row: {
          asset_id: string
          created_at: string
          id: string
          is_required: boolean | null
          notes: string | null
          service_id: string
          time_taken: number | null
          usage_guideline: string | null
        }
        Insert: {
          asset_id: string
          created_at?: string
          id?: string
          is_required?: boolean | null
          notes?: string | null
          service_id: string
          time_taken?: number | null
          usage_guideline?: string | null
        }
        Update: {
          asset_id?: string
          created_at?: string
          id?: string
          is_required?: boolean | null
          notes?: string | null
          service_id?: string
          time_taken?: number | null
          usage_guideline?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "asset_service_links_asset_id_fkey"
            columns: ["asset_id"]
            isOneToOne: false
            referencedRelation: "assets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "asset_service_links_service_id_fkey"
            columns: ["service_id"]
            isOneToOne: false
            referencedRelation: "services"
            referencedColumns: ["id"]
          },
        ]
      }
      assets: {
        Row: {
          amc_cost: number | null
          amc_end_date: string | null
          amc_start_date: string | null
          amc_terms: string | null
          amc_vendor_id: string | null
          asset_code: string | null
          category: string
          condition: string | null
          created_at: string
          created_by: string | null
          description: string | null
          id: string
          invoice_number: string | null
          location: string | null
          manufacturer: string | null
          model_number: string | null
          name: string
          notes: string | null
          purchase_date: string | null
          purchase_price: number | null
          serial_number: string | null
          status: string
          updated_at: string
          updated_by: string | null
          vendor_id: string | null
          warranty_end_date: string | null
          warranty_start_date: string | null
          warranty_terms: string | null
        }
        Insert: {
          amc_cost?: number | null
          amc_end_date?: string | null
          amc_start_date?: string | null
          amc_terms?: string | null
          amc_vendor_id?: string | null
          asset_code?: string | null
          category?: string
          condition?: string | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          invoice_number?: string | null
          location?: string | null
          manufacturer?: string | null
          model_number?: string | null
          name: string
          notes?: string | null
          purchase_date?: string | null
          purchase_price?: number | null
          serial_number?: string | null
          status?: string
          updated_at?: string
          updated_by?: string | null
          vendor_id?: string | null
          warranty_end_date?: string | null
          warranty_start_date?: string | null
          warranty_terms?: string | null
        }
        Update: {
          amc_cost?: number | null
          amc_end_date?: string | null
          amc_start_date?: string | null
          amc_terms?: string | null
          amc_vendor_id?: string | null
          asset_code?: string | null
          category?: string
          condition?: string | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          invoice_number?: string | null
          location?: string | null
          manufacturer?: string | null
          model_number?: string | null
          name?: string
          notes?: string | null
          purchase_date?: string | null
          purchase_price?: number | null
          serial_number?: string | null
          status?: string
          updated_at?: string
          updated_by?: string | null
          vendor_id?: string | null
          warranty_end_date?: string | null
          warranty_start_date?: string | null
          warranty_terms?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "assets_amc_vendor_id_fkey"
            columns: ["amc_vendor_id"]
            isOneToOne: false
            referencedRelation: "vendors"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "assets_vendor_id_fkey"
            columns: ["vendor_id"]
            isOneToOne: false
            referencedRelation: "vendors"
            referencedColumns: ["id"]
          },
        ]
      }
      attendance_records: {
        Row: {
          check_in_photo: string | null
          check_in_time: string | null
          check_out_photo: string | null
          check_out_time: string | null
          created_at: string
          date: string
          id: string
          staff_id: string
          status: string
          updated_at: string
        }
        Insert: {
          check_in_photo?: string | null
          check_in_time?: string | null
          check_out_photo?: string | null
          check_out_time?: string | null
          created_at?: string
          date?: string
          id?: string
          staff_id: string
          status?: string
          updated_at?: string
        }
        Update: {
          check_in_photo?: string | null
          check_in_time?: string | null
          check_out_photo?: string | null
          check_out_time?: string | null
          created_at?: string
          date?: string
          id?: string
          staff_id?: string
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "attendance_records_staff_id_fkey"
            columns: ["staff_id"]
            isOneToOne: false
            referencedRelation: "staff"
            referencedColumns: ["id"]
          },
        ]
      }
      bolna_booking_logs: {
        Row: {
          appointment_id: string | null
          created_at: string
          doctor_name: string | null
          error: string | null
          id: string
          message: string | null
          patient_id: string | null
          patient_name: string | null
          patient_phone: string | null
          request_payload: Json
          requested_end: string | null
          requested_start: string | null
          service_name: string | null
          staff_id: string | null
          status_code: number | null
          success: boolean
        }
        Insert: {
          appointment_id?: string | null
          created_at?: string
          doctor_name?: string | null
          error?: string | null
          id?: string
          message?: string | null
          patient_id?: string | null
          patient_name?: string | null
          patient_phone?: string | null
          request_payload: Json
          requested_end?: string | null
          requested_start?: string | null
          service_name?: string | null
          staff_id?: string | null
          status_code?: number | null
          success?: boolean
        }
        Update: {
          appointment_id?: string | null
          created_at?: string
          doctor_name?: string | null
          error?: string | null
          id?: string
          message?: string | null
          patient_id?: string | null
          patient_name?: string | null
          patient_phone?: string | null
          request_payload?: Json
          requested_end?: string | null
          requested_start?: string | null
          service_name?: string | null
          staff_id?: string | null
          status_code?: number | null
          success?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "bolna_booking_logs_appointment_id_fkey"
            columns: ["appointment_id"]
            isOneToOne: false
            referencedRelation: "appointments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bolna_booking_logs_patient_id_fkey"
            columns: ["patient_id"]
            isOneToOne: false
            referencedRelation: "patients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bolna_booking_logs_staff_id_fkey"
            columns: ["staff_id"]
            isOneToOne: false
            referencedRelation: "staff"
            referencedColumns: ["id"]
          },
        ]
      }
      campaign_updates: {
        Row: {
          campaign_id: string
          created_at: string
          created_by: string | null
          id: string
          note: string
        }
        Insert: {
          campaign_id: string
          created_at?: string
          created_by?: string | null
          id?: string
          note: string
        }
        Update: {
          campaign_id?: string
          created_at?: string
          created_by?: string | null
          id?: string
          note?: string
        }
        Relationships: [
          {
            foreignKeyName: "campaign_updates_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "campaigns"
            referencedColumns: ["id"]
          },
        ]
      }
      campaigns: {
        Row: {
          amount_spent: number
          budget: number
          created_at: string
          created_by: string | null
          end_date: string | null
          goals: string | null
          id: string
          name: string
          start_date: string | null
          status: string
          target_audience: string | null
          type: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          amount_spent?: number
          budget?: number
          created_at?: string
          created_by?: string | null
          end_date?: string | null
          goals?: string | null
          id?: string
          name: string
          start_date?: string | null
          status?: string
          target_audience?: string | null
          type?: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          amount_spent?: number
          budget?: number
          created_at?: string
          created_by?: string | null
          end_date?: string | null
          goals?: string | null
          id?: string
          name?: string
          start_date?: string | null
          status?: string
          target_audience?: string | null
          type?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: []
      }
      cart_items: {
        Row: {
          created_at: string
          id: string
          patient_id: string
          product_id: string
          quantity: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          patient_id: string
          product_id: string
          quantity?: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          patient_id?: string
          product_id?: string
          quantity?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "cart_items_patient_id_fkey"
            columns: ["patient_id"]
            isOneToOne: false
            referencedRelation: "patients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cart_items_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "pharma_products"
            referencedColumns: ["id"]
          },
        ]
      }
      category_master: {
        Row: {
          created_at: string
          description: string | null
          id: string
          is_active: boolean
          name: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          id?: string
          is_active?: boolean
          name: string
        }
        Update: {
          created_at?: string
          description?: string | null
          id?: string
          is_active?: boolean
          name?: string
        }
        Relationships: []
      }
      clinic_settings: {
        Row: {
          address: string | null
          city: string | null
          created_at: string
          email: string | null
          gst_number: string | null
          id: string
          logo_url: string | null
          name: string
          phone: string | null
          pincode: string | null
          state: string | null
          updated_at: string
          website: string | null
        }
        Insert: {
          address?: string | null
          city?: string | null
          created_at?: string
          email?: string | null
          gst_number?: string | null
          id?: string
          logo_url?: string | null
          name?: string
          phone?: string | null
          pincode?: string | null
          state?: string | null
          updated_at?: string
          website?: string | null
        }
        Update: {
          address?: string | null
          city?: string | null
          created_at?: string
          email?: string | null
          gst_number?: string | null
          id?: string
          logo_url?: string | null
          name?: string
          phone?: string | null
          pincode?: string | null
          state?: string | null
          updated_at?: string
          website?: string | null
        }
        Relationships: []
      }
      currency_settings: {
        Row: {
          abbreviate: boolean
          created_at: string
          decimal_digits: number
          id: boolean
          number_style: string
          show_decimals: boolean
          symbol: string
          updated_at: string
        }
        Insert: {
          abbreviate?: boolean
          created_at?: string
          decimal_digits?: number
          id?: boolean
          number_style?: string
          show_decimals?: boolean
          symbol?: string
          updated_at?: string
        }
        Update: {
          abbreviate?: boolean
          created_at?: string
          decimal_digits?: number
          id?: boolean
          number_style?: string
          show_decimals?: boolean
          symbol?: string
          updated_at?: string
        }
        Relationships: []
      }
      custom_field_sections: {
        Row: {
          column_count: number
          created_at: string
          description: string | null
          display_order: number
          id: string
          name: string
          object_key: string
          updated_at: string
        }
        Insert: {
          column_count?: number
          created_at?: string
          description?: string | null
          display_order?: number
          id?: string
          name: string
          object_key: string
          updated_at?: string
        }
        Update: {
          column_count?: number
          created_at?: string
          description?: string | null
          display_order?: number
          id?: string
          name?: string
          object_key?: string
          updated_at?: string
        }
        Relationships: []
      }
      custom_fields: {
        Row: {
          column_name: string
          created_at: string
          decimal_places: number | null
          default_value: string | null
          display_order: number
          field_type: string
          help_text: string | null
          id: string
          is_active: boolean
          is_required: boolean
          label: string
          max_length: number | null
          object_key: string
          options: Json
          placeholder: string | null
          section_id: string | null
          updated_at: string
        }
        Insert: {
          column_name: string
          created_at?: string
          decimal_places?: number | null
          default_value?: string | null
          display_order?: number
          field_type: string
          help_text?: string | null
          id?: string
          is_active?: boolean
          is_required?: boolean
          label: string
          max_length?: number | null
          object_key: string
          options?: Json
          placeholder?: string | null
          section_id?: string | null
          updated_at?: string
        }
        Update: {
          column_name?: string
          created_at?: string
          decimal_places?: number | null
          default_value?: string | null
          display_order?: number
          field_type?: string
          help_text?: string | null
          id?: string
          is_active?: boolean
          is_required?: boolean
          label?: string
          max_length?: number | null
          object_key?: string
          options?: Json
          placeholder?: string | null
          section_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "custom_fields_section_id_fkey"
            columns: ["section_id"]
            isOneToOne: false
            referencedRelation: "custom_field_sections"
            referencedColumns: ["id"]
          },
        ]
      }
      dashboard_components: {
        Row: {
          chart_type: string | null
          config: Json
          created_at: string
          dashboard_id: string
          height: string
          id: string
          position: number
          report_id: string
          title: string | null
          updated_at: string
          width: string
        }
        Insert: {
          chart_type?: string | null
          config?: Json
          created_at?: string
          dashboard_id: string
          height?: string
          id?: string
          position?: number
          report_id: string
          title?: string | null
          updated_at?: string
          width?: string
        }
        Update: {
          chart_type?: string | null
          config?: Json
          created_at?: string
          dashboard_id?: string
          height?: string
          id?: string
          position?: number
          report_id?: string
          title?: string | null
          updated_at?: string
          width?: string
        }
        Relationships: [
          {
            foreignKeyName: "dashboard_components_dashboard_id_fkey"
            columns: ["dashboard_id"]
            isOneToOne: false
            referencedRelation: "dashboards"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "dashboard_components_report_id_fkey"
            columns: ["report_id"]
            isOneToOne: false
            referencedRelation: "saved_reports"
            referencedColumns: ["id"]
          },
        ]
      }
      dashboard_pins: {
        Row: {
          created_at: string
          id: string
          position: number
          report_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          position?: number
          report_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          position?: number
          report_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "dashboard_pins_report_id_fkey"
            columns: ["report_id"]
            isOneToOne: false
            referencedRelation: "saved_reports"
            referencedColumns: ["id"]
          },
        ]
      }
      dashboards: {
        Row: {
          created_at: string
          description: string | null
          id: string
          is_shared: boolean
          name: string
          owner_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          id?: string
          is_shared?: boolean
          name: string
          owner_id?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          description?: string | null
          id?: string
          is_shared?: boolean
          name?: string
          owner_id?: string
          updated_at?: string
        }
        Relationships: []
      }
      doctors: {
        Row: {
          created_at: string
          created_by: string | null
          email: string | null
          id: string
          name: string
          phone: string | null
          role_id: string | null
          specialization: string | null
          status: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          email?: string | null
          id?: string
          name: string
          phone?: string | null
          role_id?: string | null
          specialization?: string | null
          status?: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          created_at?: string
          created_by?: string | null
          email?: string | null
          id?: string
          name?: string
          phone?: string | null
          role_id?: string | null
          specialization?: string | null
          status?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "doctors_role_id_fkey"
            columns: ["role_id"]
            isOneToOne: false
            referencedRelation: "user_roles_config"
            referencedColumns: ["id"]
          },
        ]
      }
      duplicate_alerts: {
        Row: {
          created_at: string
          id: string
          match_record_id: string
          match_record_label: string | null
          matched_fields: Json
          message: string | null
          object_key: string
          record_id: string
          record_label: string | null
          resolved_at: string | null
          resolved_by: string | null
          rule_id: string | null
          rule_name: string | null
          severity: string
          status: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          match_record_id: string
          match_record_label?: string | null
          matched_fields?: Json
          message?: string | null
          object_key: string
          record_id: string
          record_label?: string | null
          resolved_at?: string | null
          resolved_by?: string | null
          rule_id?: string | null
          rule_name?: string | null
          severity?: string
          status?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          match_record_id?: string
          match_record_label?: string | null
          matched_fields?: Json
          message?: string | null
          object_key?: string
          record_id?: string
          record_label?: string | null
          resolved_at?: string | null
          resolved_by?: string | null
          rule_id?: string | null
          rule_name?: string | null
          severity?: string
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "duplicate_alerts_rule_id_fkey"
            columns: ["rule_id"]
            isOneToOne: false
            referencedRelation: "duplicate_rules"
            referencedColumns: ["id"]
          },
        ]
      }
      duplicate_rules: {
        Row: {
          actions: Json
          created_at: string
          description: string | null
          id: string
          is_active: boolean
          match_fields: Json
          name: string
          notification: Json
          object_key: string
          updated_at: string
        }
        Insert: {
          actions?: Json
          created_at?: string
          description?: string | null
          id?: string
          is_active?: boolean
          match_fields?: Json
          name: string
          notification?: Json
          object_key: string
          updated_at?: string
        }
        Update: {
          actions?: Json
          created_at?: string
          description?: string | null
          id?: string
          is_active?: boolean
          match_fields?: Json
          name?: string
          notification?: Json
          object_key?: string
          updated_at?: string
        }
        Relationships: []
      }
      expense_categories: {
        Row: {
          created_at: string
          description: string | null
          id: string
          is_active: boolean
          name: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          id?: string
          is_active?: boolean
          name: string
        }
        Update: {
          created_at?: string
          description?: string | null
          id?: string
          is_active?: boolean
          name?: string
        }
        Relationships: []
      }
      expenses: {
        Row: {
          amount: number
          attachment_name: string | null
          attachment_url: string | null
          category_id: string | null
          created_at: string
          created_by: string | null
          description: string | null
          expense_date: string
          id: string
          notes: string | null
          payment_mode: string | null
          reference_number: string | null
          title: string
          updated_at: string
          updated_by: string | null
          vendor_name: string | null
        }
        Insert: {
          amount?: number
          attachment_name?: string | null
          attachment_url?: string | null
          category_id?: string | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          expense_date?: string
          id?: string
          notes?: string | null
          payment_mode?: string | null
          reference_number?: string | null
          title: string
          updated_at?: string
          updated_by?: string | null
          vendor_name?: string | null
        }
        Update: {
          amount?: number
          attachment_name?: string | null
          attachment_url?: string | null
          category_id?: string | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          expense_date?: string
          id?: string
          notes?: string | null
          payment_mode?: string | null
          reference_number?: string | null
          title?: string
          updated_at?: string
          updated_by?: string | null
          vendor_name?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "expenses_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "expense_categories"
            referencedColumns: ["id"]
          },
        ]
      }
      external_doctors: {
        Row: {
          clinic_name: string | null
          created_at: string
          email: string | null
          id: string
          name: string
          phone: string | null
          specialization: string | null
          updated_at: string
        }
        Insert: {
          clinic_name?: string | null
          created_at?: string
          email?: string | null
          id?: string
          name: string
          phone?: string | null
          specialization?: string | null
          updated_at?: string
        }
        Update: {
          clinic_name?: string | null
          created_at?: string
          email?: string | null
          id?: string
          name?: string
          phone?: string | null
          specialization?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      field_history: {
        Row: {
          changed_at: string
          changed_by: string | null
          changed_by_name: string | null
          created_at: string
          field_name: string
          id: string
          new_value: string | null
          object_type: string
          old_value: string | null
          record_id: string
        }
        Insert: {
          changed_at?: string
          changed_by?: string | null
          changed_by_name?: string | null
          created_at?: string
          field_name: string
          id?: string
          new_value?: string | null
          object_type: string
          old_value?: string | null
          record_id: string
        }
        Update: {
          changed_at?: string
          changed_by?: string | null
          changed_by_name?: string | null
          created_at?: string
          field_name?: string
          id?: string
          new_value?: string | null
          object_type?: string
          old_value?: string | null
          record_id?: string
        }
        Relationships: []
      }
      history_tracking_config: {
        Row: {
          created_at: string
          is_enabled: boolean
          object_key: string
          tracked_fields: string[]
          updated_at: string
        }
        Insert: {
          created_at?: string
          is_enabled?: boolean
          object_key: string
          tracked_fields?: string[]
          updated_at?: string
        }
        Update: {
          created_at?: string
          is_enabled?: boolean
          object_key?: string
          tracked_fields?: string[]
          updated_at?: string
        }
        Relationships: []
      }
      hsn_tax_master: {
        Row: {
          active_from: string | null
          cgst: number
          created_at: string
          created_by: string | null
          hsn_code: string
          id: string
          igst: number
          inactive_from: string | null
          is_active: boolean | null
          sgst: number
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          active_from?: string | null
          cgst?: number
          created_at?: string
          created_by?: string | null
          hsn_code: string
          id?: string
          igst?: number
          inactive_from?: string | null
          is_active?: boolean | null
          sgst?: number
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          active_from?: string | null
          cgst?: number
          created_at?: string
          created_by?: string | null
          hsn_code?: string
          id?: string
          igst?: number
          inactive_from?: string | null
          is_active?: boolean | null
          sgst?: number
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: []
      }
      invoices: {
        Row: {
          appointment_id: string | null
          cancellation_reason: string | null
          cancelled_at: string | null
          cancelled_by_name: string | null
          cgst_amount: number | null
          created_at: string
          created_by: string | null
          doctor_id: string | null
          due_date: string | null
          id: string
          igst_amount: number | null
          installment_count: number | null
          installment_number: number | null
          invoice_number: string
          line_items: Json | null
          merged_into_invoice_id: string | null
          notes: string | null
          owner_id: string | null
          paid_amount: number
          patient_id: string | null
          patient_name: string | null
          payment_mode: string | null
          payment_splits: Json | null
          payment_type: string
          pdf_url: string | null
          recurring_group_id: string | null
          services: string[]
          sf_id: string | null
          sgst_amount: number | null
          status: string
          tax_amount: number | null
          tax_id: string | null
          tax_rate: number | null
          total_amount: number
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          appointment_id?: string | null
          cancellation_reason?: string | null
          cancelled_at?: string | null
          cancelled_by_name?: string | null
          cgst_amount?: number | null
          created_at?: string
          created_by?: string | null
          doctor_id?: string | null
          due_date?: string | null
          id?: string
          igst_amount?: number | null
          installment_count?: number | null
          installment_number?: number | null
          invoice_number: string
          line_items?: Json | null
          merged_into_invoice_id?: string | null
          notes?: string | null
          owner_id?: string | null
          paid_amount?: number
          patient_id?: string | null
          patient_name?: string | null
          payment_mode?: string | null
          payment_splits?: Json | null
          payment_type?: string
          pdf_url?: string | null
          recurring_group_id?: string | null
          services?: string[]
          sf_id?: string | null
          sgst_amount?: number | null
          status?: string
          tax_amount?: number | null
          tax_id?: string | null
          tax_rate?: number | null
          total_amount?: number
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          appointment_id?: string | null
          cancellation_reason?: string | null
          cancelled_at?: string | null
          cancelled_by_name?: string | null
          cgst_amount?: number | null
          created_at?: string
          created_by?: string | null
          doctor_id?: string | null
          due_date?: string | null
          id?: string
          igst_amount?: number | null
          installment_count?: number | null
          installment_number?: number | null
          invoice_number?: string
          line_items?: Json | null
          merged_into_invoice_id?: string | null
          notes?: string | null
          owner_id?: string | null
          paid_amount?: number
          patient_id?: string | null
          patient_name?: string | null
          payment_mode?: string | null
          payment_splits?: Json | null
          payment_type?: string
          pdf_url?: string | null
          recurring_group_id?: string | null
          services?: string[]
          sf_id?: string | null
          sgst_amount?: number | null
          status?: string
          tax_amount?: number | null
          tax_id?: string | null
          tax_rate?: number | null
          total_amount?: number
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "invoices_appointment_id_fkey"
            columns: ["appointment_id"]
            isOneToOne: false
            referencedRelation: "appointments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoices_doctor_id_fkey"
            columns: ["doctor_id"]
            isOneToOne: false
            referencedRelation: "staff"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoices_merged_into_invoice_id_fkey"
            columns: ["merged_into_invoice_id"]
            isOneToOne: false
            referencedRelation: "invoices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoices_patient_id_fkey"
            columns: ["patient_id"]
            isOneToOne: false
            referencedRelation: "patients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoices_tax_id_fkey"
            columns: ["tax_id"]
            isOneToOne: false
            referencedRelation: "tax_master"
            referencedColumns: ["id"]
          },
        ]
      }
      leave_applications: {
        Row: {
          approved_by: string | null
          created_at: string
          days: number
          end_date: string
          id: string
          leave_type_id: string
          reason: string | null
          staff_id: string
          start_date: string
          status: string
          updated_at: string
        }
        Insert: {
          approved_by?: string | null
          created_at?: string
          days?: number
          end_date: string
          id?: string
          leave_type_id: string
          reason?: string | null
          staff_id: string
          start_date: string
          status?: string
          updated_at?: string
        }
        Update: {
          approved_by?: string | null
          created_at?: string
          days?: number
          end_date?: string
          id?: string
          leave_type_id?: string
          reason?: string | null
          staff_id?: string
          start_date?: string
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "leave_applications_approved_by_fkey"
            columns: ["approved_by"]
            isOneToOne: false
            referencedRelation: "staff"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "leave_applications_leave_type_id_fkey"
            columns: ["leave_type_id"]
            isOneToOne: false
            referencedRelation: "leave_types"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "leave_applications_staff_id_fkey"
            columns: ["staff_id"]
            isOneToOne: false
            referencedRelation: "staff"
            referencedColumns: ["id"]
          },
        ]
      }
      leave_types: {
        Row: {
          created_at: string
          default_days_per_year: number
          description: string | null
          id: string
          is_active: boolean
          name: string
        }
        Insert: {
          created_at?: string
          default_days_per_year?: number
          description?: string | null
          id?: string
          is_active?: boolean
          name: string
        }
        Update: {
          created_at?: string
          default_days_per_year?: number
          description?: string | null
          id?: string
          is_active?: boolean
          name?: string
        }
        Relationships: []
      }
      list_views: {
        Row: {
          charts: Json
          created_at: string
          display_fields: string[]
          filter_match: string
          filters: Json
          id: string
          is_default: boolean
          is_shared: boolean | null
          name: string
          section: string
          shared_with: string[] | null
          sort_by: string
          sort_direction: string
          updated_at: string
          user_id: string
          visibility: string
        }
        Insert: {
          charts?: Json
          created_at?: string
          display_fields: string[]
          filter_match?: string
          filters?: Json
          id?: string
          is_default?: boolean
          is_shared?: boolean | null
          name: string
          section: string
          shared_with?: string[] | null
          sort_by?: string
          sort_direction?: string
          updated_at?: string
          user_id: string
          visibility?: string
        }
        Update: {
          charts?: Json
          created_at?: string
          display_fields?: string[]
          filter_match?: string
          filters?: Json
          id?: string
          is_default?: boolean
          is_shared?: boolean | null
          name?: string
          section?: string
          shared_with?: string[] | null
          sort_by?: string
          sort_direction?: string
          updated_at?: string
          user_id?: string
          visibility?: string
        }
        Relationships: []
      }
      notifications: {
        Row: {
          body: string | null
          created_at: string
          created_by: string | null
          id: string
          is_read: boolean
          link: string | null
          object_type: string | null
          record_id: string | null
          title: string
          updated_at: string
          user_id: string
        }
        Insert: {
          body?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          is_read?: boolean
          link?: string | null
          object_type?: string | null
          record_id?: string | null
          title: string
          updated_at?: string
          user_id: string
        }
        Update: {
          body?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          is_read?: boolean
          link?: string | null
          object_type?: string | null
          record_id?: string | null
          title?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      patient_campaigns: {
        Row: {
          campaign_id: string
          created_at: string
          id: string
          linked_by: string | null
          linked_date: string
          notes: string | null
          patient_id: string
        }
        Insert: {
          campaign_id: string
          created_at?: string
          id?: string
          linked_by?: string | null
          linked_date?: string
          notes?: string | null
          patient_id: string
        }
        Update: {
          campaign_id?: string
          created_at?: string
          id?: string
          linked_by?: string | null
          linked_date?: string
          notes?: string | null
          patient_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "patient_campaigns_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "campaigns"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "patient_campaigns_patient_id_fkey"
            columns: ["patient_id"]
            isOneToOne: false
            referencedRelation: "patients"
            referencedColumns: ["id"]
          },
        ]
      }
      patient_family_members: {
        Row: {
          city: string | null
          created_at: string
          email: string | null
          id: string
          is_primary_contact: boolean | null
          name: string | null
          notes: string | null
          patient_id: string
          phone: string | null
          related_patient_id: string | null
          relationship: string
          state: string | null
        }
        Insert: {
          city?: string | null
          created_at?: string
          email?: string | null
          id?: string
          is_primary_contact?: boolean | null
          name?: string | null
          notes?: string | null
          patient_id: string
          phone?: string | null
          related_patient_id?: string | null
          relationship: string
          state?: string | null
        }
        Update: {
          city?: string | null
          created_at?: string
          email?: string | null
          id?: string
          is_primary_contact?: boolean | null
          name?: string | null
          notes?: string | null
          patient_id?: string
          phone?: string | null
          related_patient_id?: string | null
          relationship?: string
          state?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "patient_family_members_patient_id_fkey"
            columns: ["patient_id"]
            isOneToOne: false
            referencedRelation: "patients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "patient_family_members_related_patient_id_fkey"
            columns: ["related_patient_id"]
            isOneToOne: false
            referencedRelation: "patients"
            referencedColumns: ["id"]
          },
        ]
      }
      patient_feedback: {
        Row: {
          appointment_id: string
          comments: string | null
          created_at: string
          id: string
          nps_score: number
          patient_id: string
          patient_name: string | null
          service_rating: number
        }
        Insert: {
          appointment_id: string
          comments?: string | null
          created_at?: string
          id?: string
          nps_score: number
          patient_id: string
          patient_name?: string | null
          service_rating: number
        }
        Update: {
          appointment_id?: string
          comments?: string | null
          created_at?: string
          id?: string
          nps_score?: number
          patient_id?: string
          patient_name?: string | null
          service_rating?: number
        }
        Relationships: [
          {
            foreignKeyName: "patient_feedback_appointment_id_fkey"
            columns: ["appointment_id"]
            isOneToOne: true
            referencedRelation: "appointments"
            referencedColumns: ["id"]
          },
        ]
      }
      patient_pharma_requests: {
        Row: {
          created_at: string | null
          id: string
          notes: string | null
          patient_id: string
          product_id: string | null
          product_name: string
          quantity: number | null
          status: string | null
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          id?: string
          notes?: string | null
          patient_id: string
          product_id?: string | null
          product_name: string
          quantity?: number | null
          status?: string | null
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          id?: string
          notes?: string | null
          patient_id?: string
          product_id?: string | null
          product_name?: string
          quantity?: number | null
          status?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "patient_pharma_requests_patient_id_fkey"
            columns: ["patient_id"]
            isOneToOne: false
            referencedRelation: "patients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "patient_pharma_requests_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "pharma_products"
            referencedColumns: ["id"]
          },
        ]
      }
      patient_photos: {
        Row: {
          appointment_id: string | null
          created_at: string
          id: string
          notes: string | null
          patient_id: string
          photo_type: string
          photo_url: string
          procedure_id: string | null
          sf_id: string | null
          taken_at: string
        }
        Insert: {
          appointment_id?: string | null
          created_at?: string
          id?: string
          notes?: string | null
          patient_id: string
          photo_type?: string
          photo_url: string
          procedure_id?: string | null
          sf_id?: string | null
          taken_at?: string
        }
        Update: {
          appointment_id?: string | null
          created_at?: string
          id?: string
          notes?: string | null
          patient_id?: string
          photo_type?: string
          photo_url?: string
          procedure_id?: string | null
          sf_id?: string | null
          taken_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "patient_photos_appointment_id_fkey"
            columns: ["appointment_id"]
            isOneToOne: false
            referencedRelation: "appointments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "patient_photos_patient_id_fkey"
            columns: ["patient_id"]
            isOneToOne: false
            referencedRelation: "patients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "patient_photos_procedure_id_fkey"
            columns: ["procedure_id"]
            isOneToOne: false
            referencedRelation: "procedures"
            referencedColumns: ["id"]
          },
        ]
      }
      patient_portal_otps: {
        Row: {
          created_at: string
          expires_at: string
          id: string
          otp_hash: string
          patient_id: string
          used: boolean
        }
        Insert: {
          created_at?: string
          expires_at: string
          id?: string
          otp_hash: string
          patient_id: string
          used?: boolean
        }
        Update: {
          created_at?: string
          expires_at?: string
          id?: string
          otp_hash?: string
          patient_id?: string
          used?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "patient_portal_otps_patient_id_fkey"
            columns: ["patient_id"]
            isOneToOne: false
            referencedRelation: "patients"
            referencedColumns: ["id"]
          },
        ]
      }
      patient_portal_tokens: {
        Row: {
          created_at: string | null
          expires_at: string
          id: string
          is_used: boolean | null
          otp_code: string
          patient_id: string
          phone: string | null
          session_token: string | null
        }
        Insert: {
          created_at?: string | null
          expires_at: string
          id?: string
          is_used?: boolean | null
          otp_code: string
          patient_id: string
          phone?: string | null
          session_token?: string | null
        }
        Update: {
          created_at?: string | null
          expires_at?: string
          id?: string
          is_used?: boolean | null
          otp_code?: string
          patient_id?: string
          phone?: string | null
          session_token?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "patient_portal_tokens_patient_id_fkey"
            columns: ["patient_id"]
            isOneToOne: false
            referencedRelation: "patients"
            referencedColumns: ["id"]
          },
        ]
      }
      patients: {
        Row: {
          address: string | null
          allergies: string | null
          auth_user_id: string | null
          blood_group: string | null
          city: string | null
          created_at: string
          created_by: string | null
          current_medications: string | null
          date_of_birth: string | null
          days_since_last_visit: number | null
          doctor_id: string | null
          email: string | null
          emergency_contact_name: string | null
          emergency_contact_phone: string | null
          engagement_compliance: number | null
          engagement_retention_signal: number | null
          engagement_revenue_value: number | null
          engagement_score: number | null
          engagement_tier: string | null
          engagement_treatment_depth: number | null
          engagement_updated_at: string | null
          engagement_visit_frequency: number | null
          facebook_url: string | null
          first_name: string
          follows_facebook: boolean | null
          follows_instagram: boolean | null
          gender: string | null
          id: string
          instagram_url: string | null
          last_name: string
          last_visit_date: string | null
          lifetime_value: number | null
          medical_history: string | null
          notes: string | null
          owner_id: string | null
          phone: string | null
          pincode: string | null
          portal_pin_failed_attempts: number
          portal_pin_hash: string | null
          portal_pin_locked_until: string | null
          previous_treatments: string | null
          sf_attachments_synced_at: string | null
          sf_clinical_synced_at: string | null
          sf_id: string | null
          sf_pictures_synced_at: string | null
          skin_concerns: string | null
          skin_type: string | null
          source: string | null
          source_ad_details: string | null
          source_other_text: string | null
          source_referral_doctor: string | null
          state: string | null
          status: string
          total_visits: number | null
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          address?: string | null
          allergies?: string | null
          auth_user_id?: string | null
          blood_group?: string | null
          city?: string | null
          created_at?: string
          created_by?: string | null
          current_medications?: string | null
          date_of_birth?: string | null
          days_since_last_visit?: number | null
          doctor_id?: string | null
          email?: string | null
          emergency_contact_name?: string | null
          emergency_contact_phone?: string | null
          engagement_compliance?: number | null
          engagement_retention_signal?: number | null
          engagement_revenue_value?: number | null
          engagement_score?: number | null
          engagement_tier?: string | null
          engagement_treatment_depth?: number | null
          engagement_updated_at?: string | null
          engagement_visit_frequency?: number | null
          facebook_url?: string | null
          first_name: string
          follows_facebook?: boolean | null
          follows_instagram?: boolean | null
          gender?: string | null
          id?: string
          instagram_url?: string | null
          last_name: string
          last_visit_date?: string | null
          lifetime_value?: number | null
          medical_history?: string | null
          notes?: string | null
          owner_id?: string | null
          phone?: string | null
          pincode?: string | null
          portal_pin_failed_attempts?: number
          portal_pin_hash?: string | null
          portal_pin_locked_until?: string | null
          previous_treatments?: string | null
          sf_attachments_synced_at?: string | null
          sf_clinical_synced_at?: string | null
          sf_id?: string | null
          sf_pictures_synced_at?: string | null
          skin_concerns?: string | null
          skin_type?: string | null
          source?: string | null
          source_ad_details?: string | null
          source_other_text?: string | null
          source_referral_doctor?: string | null
          state?: string | null
          status?: string
          total_visits?: number | null
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          address?: string | null
          allergies?: string | null
          auth_user_id?: string | null
          blood_group?: string | null
          city?: string | null
          created_at?: string
          created_by?: string | null
          current_medications?: string | null
          date_of_birth?: string | null
          days_since_last_visit?: number | null
          doctor_id?: string | null
          email?: string | null
          emergency_contact_name?: string | null
          emergency_contact_phone?: string | null
          engagement_compliance?: number | null
          engagement_retention_signal?: number | null
          engagement_revenue_value?: number | null
          engagement_score?: number | null
          engagement_tier?: string | null
          engagement_treatment_depth?: number | null
          engagement_updated_at?: string | null
          engagement_visit_frequency?: number | null
          facebook_url?: string | null
          first_name?: string
          follows_facebook?: boolean | null
          follows_instagram?: boolean | null
          gender?: string | null
          id?: string
          instagram_url?: string | null
          last_name?: string
          last_visit_date?: string | null
          lifetime_value?: number | null
          medical_history?: string | null
          notes?: string | null
          owner_id?: string | null
          phone?: string | null
          pincode?: string | null
          portal_pin_failed_attempts?: number
          portal_pin_hash?: string | null
          portal_pin_locked_until?: string | null
          previous_treatments?: string | null
          sf_attachments_synced_at?: string | null
          sf_clinical_synced_at?: string | null
          sf_id?: string | null
          sf_pictures_synced_at?: string | null
          skin_concerns?: string | null
          skin_type?: string | null
          source?: string | null
          source_ad_details?: string | null
          source_other_text?: string | null
          source_referral_doctor?: string | null
          state?: string | null
          status?: string
          total_visits?: number | null
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "patients_doctor_id_fkey"
            columns: ["doctor_id"]
            isOneToOne: false
            referencedRelation: "doctors"
            referencedColumns: ["id"]
          },
        ]
      }
      pharma_bill_items: {
        Row: {
          batch_number: string | null
          bill_id: string
          created_at: string
          id: string
          inventory_id: string | null
          product_id: string | null
          product_name: string
          quantity: number
          total_price: number
          unit_price: number
          uom: string | null
          uom_conversion: number
        }
        Insert: {
          batch_number?: string | null
          bill_id: string
          created_at?: string
          id?: string
          inventory_id?: string | null
          product_id?: string | null
          product_name: string
          quantity?: number
          total_price?: number
          unit_price?: number
          uom?: string | null
          uom_conversion?: number
        }
        Update: {
          batch_number?: string | null
          bill_id?: string
          created_at?: string
          id?: string
          inventory_id?: string | null
          product_id?: string | null
          product_name?: string
          quantity?: number
          total_price?: number
          unit_price?: number
          uom?: string | null
          uom_conversion?: number
        }
        Relationships: [
          {
            foreignKeyName: "pharma_bill_items_bill_id_fkey"
            columns: ["bill_id"]
            isOneToOne: false
            referencedRelation: "pharma_bills"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pharma_bill_items_inventory_id_fkey"
            columns: ["inventory_id"]
            isOneToOne: false
            referencedRelation: "pharma_inventory"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pharma_bill_items_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "pharma_products"
            referencedColumns: ["id"]
          },
        ]
      }
      pharma_bills: {
        Row: {
          bill_number: string
          cgst_amount: number | null
          created_at: string
          created_by: string | null
          discount: number
          id: string
          igst_amount: number | null
          net_amount: number
          owner_id: string | null
          patient_id: string | null
          patient_name: string | null
          payment_mode: string
          sgst_amount: number | null
          status: string
          tax_amount: number | null
          tax_id: string | null
          tax_rate: number | null
          total_amount: number
          updated_by: string | null
        }
        Insert: {
          bill_number: string
          cgst_amount?: number | null
          created_at?: string
          created_by?: string | null
          discount?: number
          id?: string
          igst_amount?: number | null
          net_amount?: number
          owner_id?: string | null
          patient_id?: string | null
          patient_name?: string | null
          payment_mode?: string
          sgst_amount?: number | null
          status?: string
          tax_amount?: number | null
          tax_id?: string | null
          tax_rate?: number | null
          total_amount?: number
          updated_by?: string | null
        }
        Update: {
          bill_number?: string
          cgst_amount?: number | null
          created_at?: string
          created_by?: string | null
          discount?: number
          id?: string
          igst_amount?: number | null
          net_amount?: number
          owner_id?: string | null
          patient_id?: string | null
          patient_name?: string | null
          payment_mode?: string
          sgst_amount?: number | null
          status?: string
          tax_amount?: number | null
          tax_id?: string | null
          tax_rate?: number | null
          total_amount?: number
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "pharma_bills_patient_id_fkey"
            columns: ["patient_id"]
            isOneToOne: false
            referencedRelation: "patients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pharma_bills_tax_id_fkey"
            columns: ["tax_id"]
            isOneToOne: false
            referencedRelation: "tax_master"
            referencedColumns: ["id"]
          },
        ]
      }
      pharma_inventory: {
        Row: {
          batch_number: string
          cgst_percent: number
          created_at: string
          expiry_date: string
          gst_percent: number
          hsn_code: string | null
          id: string
          igst_percent: number
          invoice_number: string | null
          mrp: number
          product_id: string
          purchase_price: number
          purchase_quantity: number | null
          purchase_unit: string | null
          quantity: number
          received_date: string
          selling_price: number
          supplier: string | null
        }
        Insert: {
          batch_number: string
          cgst_percent?: number
          created_at?: string
          expiry_date: string
          gst_percent?: number
          hsn_code?: string | null
          id?: string
          igst_percent?: number
          invoice_number?: string | null
          mrp?: number
          product_id: string
          purchase_price?: number
          purchase_quantity?: number | null
          purchase_unit?: string | null
          quantity?: number
          received_date?: string
          selling_price?: number
          supplier?: string | null
        }
        Update: {
          batch_number?: string
          cgst_percent?: number
          created_at?: string
          expiry_date?: string
          gst_percent?: number
          hsn_code?: string | null
          id?: string
          igst_percent?: number
          invoice_number?: string | null
          mrp?: number
          product_id?: string
          purchase_price?: number
          purchase_quantity?: number | null
          purchase_unit?: string | null
          quantity?: number
          received_date?: string
          selling_price?: number
          supplier?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "pharma_inventory_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "pharma_products"
            referencedColumns: ["id"]
          },
        ]
      }
      pharma_product_units: {
        Row: {
          conversion_value: number
          created_at: string
          id: string
          is_active: boolean
          is_default: boolean
          product_id: string
          sort_order: number
          sub_unit: string
          updated_at: string
        }
        Insert: {
          conversion_value?: number
          created_at?: string
          id?: string
          is_active?: boolean
          is_default?: boolean
          product_id: string
          sort_order?: number
          sub_unit: string
          updated_at?: string
        }
        Update: {
          conversion_value?: number
          created_at?: string
          id?: string
          is_active?: boolean
          is_default?: boolean
          product_id?: string
          sort_order?: number
          sub_unit?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "pharma_product_units_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "pharma_products"
            referencedColumns: ["id"]
          },
        ]
      }
      pharma_products: {
        Row: {
          base_unit: string | null
          category: string
          cgst_percent: number
          conversion_value: number
          created_at: string
          created_by: string | null
          default_duration: string | null
          default_frequency: string | null
          default_instructions: string | null
          duration: string | null
          expiry_date: string | null
          generic_name: string | null
          gst_percent: number
          hsn_code: string | null
          id: string
          igst_percent: number
          image_url: string | null
          instructions: string | null
          manufacturer: string | null
          mrp: number
          name: string
          purchase_unit: string | null
          qty_per_unit: number | null
          reorder_level: number
          sale_unit: string | null
          salesforce_id: string | null
          selling_price: number
          side_effects: string | null
          storage_instructions: string | null
          sub_unit: string | null
          unit: string
          updated_at: string
          updated_by: string | null
          vendor_id: string | null
        }
        Insert: {
          base_unit?: string | null
          category?: string
          cgst_percent?: number
          conversion_value?: number
          created_at?: string
          created_by?: string | null
          default_duration?: string | null
          default_frequency?: string | null
          default_instructions?: string | null
          duration?: string | null
          expiry_date?: string | null
          generic_name?: string | null
          gst_percent?: number
          hsn_code?: string | null
          id?: string
          igst_percent?: number
          image_url?: string | null
          instructions?: string | null
          manufacturer?: string | null
          mrp?: number
          name: string
          purchase_unit?: string | null
          qty_per_unit?: number | null
          reorder_level?: number
          sale_unit?: string | null
          salesforce_id?: string | null
          selling_price?: number
          side_effects?: string | null
          storage_instructions?: string | null
          sub_unit?: string | null
          unit?: string
          updated_at?: string
          updated_by?: string | null
          vendor_id?: string | null
        }
        Update: {
          base_unit?: string | null
          category?: string
          cgst_percent?: number
          conversion_value?: number
          created_at?: string
          created_by?: string | null
          default_duration?: string | null
          default_frequency?: string | null
          default_instructions?: string | null
          duration?: string | null
          expiry_date?: string | null
          generic_name?: string | null
          gst_percent?: number
          hsn_code?: string | null
          id?: string
          igst_percent?: number
          image_url?: string | null
          instructions?: string | null
          manufacturer?: string | null
          mrp?: number
          name?: string
          purchase_unit?: string | null
          qty_per_unit?: number | null
          reorder_level?: number
          sale_unit?: string | null
          salesforce_id?: string | null
          selling_price?: number
          side_effects?: string | null
          storage_instructions?: string | null
          sub_unit?: string | null
          unit?: string
          updated_at?: string
          updated_by?: string | null
          vendor_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "pharma_products_vendor_id_fkey"
            columns: ["vendor_id"]
            isOneToOne: false
            referencedRelation: "vendors"
            referencedColumns: ["id"]
          },
        ]
      }
      portal_order_items: {
        Row: {
          created_at: string
          id: string
          order_id: string
          product_id: string | null
          product_name: string
          quantity: number
          total_price: number
          unit_price: number
        }
        Insert: {
          created_at?: string
          id?: string
          order_id: string
          product_id?: string | null
          product_name: string
          quantity?: number
          total_price?: number
          unit_price?: number
        }
        Update: {
          created_at?: string
          id?: string
          order_id?: string
          product_id?: string | null
          product_name?: string
          quantity?: number
          total_price?: number
          unit_price?: number
        }
        Relationships: [
          {
            foreignKeyName: "portal_order_items_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "portal_orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "portal_order_items_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "pharma_products"
            referencedColumns: ["id"]
          },
        ]
      }
      portal_orders: {
        Row: {
          address: string | null
          city: string | null
          created_at: string
          delivery_method: string
          id: string
          notes: string | null
          patient_id: string
          patient_name: string | null
          payment_mode: string | null
          payment_status: string
          phone: string | null
          pincode: string | null
          state: string | null
          status: string
          total_amount: number
          tracking_number: string | null
          updated_at: string
        }
        Insert: {
          address?: string | null
          city?: string | null
          created_at?: string
          delivery_method?: string
          id?: string
          notes?: string | null
          patient_id: string
          patient_name?: string | null
          payment_mode?: string | null
          payment_status?: string
          phone?: string | null
          pincode?: string | null
          state?: string | null
          status?: string
          total_amount?: number
          tracking_number?: string | null
          updated_at?: string
        }
        Update: {
          address?: string | null
          city?: string | null
          created_at?: string
          delivery_method?: string
          id?: string
          notes?: string | null
          patient_id?: string
          patient_name?: string | null
          payment_mode?: string | null
          payment_status?: string
          phone?: string | null
          pincode?: string | null
          state?: string | null
          status?: string
          total_amount?: number
          tracking_number?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "portal_orders_patient_id_fkey"
            columns: ["patient_id"]
            isOneToOne: false
            referencedRelation: "patients"
            referencedColumns: ["id"]
          },
        ]
      }
      portal_sessions: {
        Row: {
          created_at: string
          expires_at: string
          id: string
          last_used_at: string | null
          patient_id: string
          token_hash: string
        }
        Insert: {
          created_at?: string
          expires_at: string
          id?: string
          last_used_at?: string | null
          patient_id: string
          token_hash: string
        }
        Update: {
          created_at?: string
          expires_at?: string
          id?: string
          last_used_at?: string | null
          patient_id?: string
          token_hash?: string
        }
        Relationships: [
          {
            foreignKeyName: "portal_sessions_patient_id_fkey"
            columns: ["patient_id"]
            isOneToOne: false
            referencedRelation: "patients"
            referencedColumns: ["id"]
          },
        ]
      }
      portal_settings: {
        Row: {
          ai_bot_enabled: boolean
          appointments_booking_enabled: boolean
          appointments_reschedule_enabled: boolean
          bills_enabled: boolean
          clinic_hours_enabled: boolean
          clinical_photos_enabled: boolean
          created_at: string
          expiring_threshold_days: number
          hide_expiring_products: boolean
          id: string
          low_stock_threshold: number | null
          our_team_enabled: boolean
          out_of_stock_behavior: string
          outstanding_balance_enabled: boolean
          procedure_history_enabled: boolean
          quick_action_order_medicine_enabled: boolean
          quick_action_request_appointment_enabled: boolean
          shop_enabled: boolean
          surveys_enabled: boolean
          treatment_history_enabled: boolean
          updated_at: string
        }
        Insert: {
          ai_bot_enabled?: boolean
          appointments_booking_enabled?: boolean
          appointments_reschedule_enabled?: boolean
          bills_enabled?: boolean
          clinic_hours_enabled?: boolean
          clinical_photos_enabled?: boolean
          created_at?: string
          expiring_threshold_days?: number
          hide_expiring_products?: boolean
          id?: string
          low_stock_threshold?: number | null
          our_team_enabled?: boolean
          out_of_stock_behavior?: string
          outstanding_balance_enabled?: boolean
          procedure_history_enabled?: boolean
          quick_action_order_medicine_enabled?: boolean
          quick_action_request_appointment_enabled?: boolean
          shop_enabled?: boolean
          surveys_enabled?: boolean
          treatment_history_enabled?: boolean
          updated_at?: string
        }
        Update: {
          ai_bot_enabled?: boolean
          appointments_booking_enabled?: boolean
          appointments_reschedule_enabled?: boolean
          bills_enabled?: boolean
          clinic_hours_enabled?: boolean
          clinical_photos_enabled?: boolean
          created_at?: string
          expiring_threshold_days?: number
          hide_expiring_products?: boolean
          id?: string
          low_stock_threshold?: number | null
          our_team_enabled?: boolean
          out_of_stock_behavior?: string
          outstanding_balance_enabled?: boolean
          procedure_history_enabled?: boolean
          quick_action_order_medicine_enabled?: boolean
          quick_action_request_appointment_enabled?: boolean
          shop_enabled?: boolean
          surveys_enabled?: boolean
          treatment_history_enabled?: boolean
          updated_at?: string
        }
        Relationships: []
      }
      prescriptions: {
        Row: {
          created_at: string
          created_by: string | null
          dosage: string | null
          duration: string | null
          frequency: string | null
          id: string
          instructions: string | null
          medicine_name: string
          procedure_id: string | null
          product_id: string | null
          quantity: number
          survey_response_id: string | null
          updated_by: string | null
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          dosage?: string | null
          duration?: string | null
          frequency?: string | null
          id?: string
          instructions?: string | null
          medicine_name: string
          procedure_id?: string | null
          product_id?: string | null
          quantity?: number
          survey_response_id?: string | null
          updated_by?: string | null
        }
        Update: {
          created_at?: string
          created_by?: string | null
          dosage?: string | null
          duration?: string | null
          frequency?: string | null
          id?: string
          instructions?: string | null
          medicine_name?: string
          procedure_id?: string | null
          product_id?: string | null
          quantity?: number
          survey_response_id?: string | null
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "prescriptions_procedure_id_fkey"
            columns: ["procedure_id"]
            isOneToOne: false
            referencedRelation: "procedures"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "prescriptions_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "pharma_products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "prescriptions_survey_response_id_fkey"
            columns: ["survey_response_id"]
            isOneToOne: false
            referencedRelation: "survey_responses"
            referencedColumns: ["id"]
          },
        ]
      }
      problem_areas: {
        Row: {
          created_at: string
          description: string | null
          id: string
          is_active: boolean
          name: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          id?: string
          is_active?: boolean
          name: string
        }
        Update: {
          created_at?: string
          description?: string | null
          id?: string
          is_active?: boolean
          name?: string
        }
        Relationships: []
      }
      procedure_attachments: {
        Row: {
          appointment_id: string | null
          created_at: string
          document_type: string | null
          file_name: string
          file_url: string
          id: string
          notes: string | null
          patient_id: string
          procedure_id: string | null
          sf_id: string | null
        }
        Insert: {
          appointment_id?: string | null
          created_at?: string
          document_type?: string | null
          file_name: string
          file_url: string
          id?: string
          notes?: string | null
          patient_id: string
          procedure_id?: string | null
          sf_id?: string | null
        }
        Update: {
          appointment_id?: string | null
          created_at?: string
          document_type?: string | null
          file_name?: string
          file_url?: string
          id?: string
          notes?: string | null
          patient_id?: string
          procedure_id?: string | null
          sf_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "procedure_attachments_appointment_id_fkey"
            columns: ["appointment_id"]
            isOneToOne: false
            referencedRelation: "appointments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "procedure_attachments_patient_id_fkey"
            columns: ["patient_id"]
            isOneToOne: false
            referencedRelation: "patients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "procedure_attachments_procedure_id_fkey"
            columns: ["procedure_id"]
            isOneToOne: false
            referencedRelation: "procedures"
            referencedColumns: ["id"]
          },
        ]
      }
      procedure_services: {
        Row: {
          created_at: string
          id: string
          material_percent: number | null
          procedure_id: string
          procedure_notes: string | null
          recommendations: string | null
          service_id: string | null
          service_name: string
          sort_order: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          material_percent?: number | null
          procedure_id: string
          procedure_notes?: string | null
          recommendations?: string | null
          service_id?: string | null
          service_name: string
          sort_order?: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          material_percent?: number | null
          procedure_id?: string
          procedure_notes?: string | null
          recommendations?: string | null
          service_id?: string | null
          service_name?: string
          sort_order?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "procedure_services_procedure_id_fkey"
            columns: ["procedure_id"]
            isOneToOne: false
            referencedRelation: "procedures"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "procedure_services_service_id_fkey"
            columns: ["service_id"]
            isOneToOne: false
            referencedRelation: "services"
            referencedColumns: ["id"]
          },
        ]
      }
      procedure_sticky_notes: {
        Row: {
          content: string
          created_at: string
          created_by: string | null
          id: string
          procedure_id: string
          title: string | null
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          content?: string
          created_at?: string
          created_by?: string | null
          id?: string
          procedure_id: string
          title?: string | null
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          content?: string
          created_at?: string
          created_by?: string | null
          id?: string
          procedure_id?: string
          title?: string | null
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "procedure_sticky_notes_procedure_id_fkey"
            columns: ["procedure_id"]
            isOneToOne: false
            referencedRelation: "procedures"
            referencedColumns: ["id"]
          },
        ]
      }
      procedures: {
        Row: {
          appointment_id: string | null
          assisted_by: string | null
          assisted_by_ids: string[]
          cf_test: string | null
          consultation_notes: string | null
          created_at: string
          created_by: string | null
          diagnosis: string | null
          id: string
          lab_tests: string | null
          owner_id: string | null
          patient_id: string
          procedure_date: string
          procedure_notes: string | null
          recommendations: string | null
          recurring_count: number | null
          recurring_dates: string[] | null
          review_notes: string | null
          service_name: string
          sf_id: string | null
          staff_id: string | null
          status: string
          survey_response_id: string | null
          symptoms: string | null
          updated_at: string
          updated_by: string | null
          visit_type: string
        }
        Insert: {
          appointment_id?: string | null
          assisted_by?: string | null
          assisted_by_ids?: string[]
          cf_test?: string | null
          consultation_notes?: string | null
          created_at?: string
          created_by?: string | null
          diagnosis?: string | null
          id?: string
          lab_tests?: string | null
          owner_id?: string | null
          patient_id: string
          procedure_date?: string
          procedure_notes?: string | null
          recommendations?: string | null
          recurring_count?: number | null
          recurring_dates?: string[] | null
          review_notes?: string | null
          service_name: string
          sf_id?: string | null
          staff_id?: string | null
          status?: string
          survey_response_id?: string | null
          symptoms?: string | null
          updated_at?: string
          updated_by?: string | null
          visit_type?: string
        }
        Update: {
          appointment_id?: string | null
          assisted_by?: string | null
          assisted_by_ids?: string[]
          cf_test?: string | null
          consultation_notes?: string | null
          created_at?: string
          created_by?: string | null
          diagnosis?: string | null
          id?: string
          lab_tests?: string | null
          owner_id?: string | null
          patient_id?: string
          procedure_date?: string
          procedure_notes?: string | null
          recommendations?: string | null
          recurring_count?: number | null
          recurring_dates?: string[] | null
          review_notes?: string | null
          service_name?: string
          sf_id?: string | null
          staff_id?: string | null
          status?: string
          survey_response_id?: string | null
          symptoms?: string | null
          updated_at?: string
          updated_by?: string | null
          visit_type?: string
        }
        Relationships: [
          {
            foreignKeyName: "procedures_appointment_id_fkey"
            columns: ["appointment_id"]
            isOneToOne: false
            referencedRelation: "appointments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "procedures_assisted_by_fkey"
            columns: ["assisted_by"]
            isOneToOne: false
            referencedRelation: "staff"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "procedures_patient_id_fkey"
            columns: ["patient_id"]
            isOneToOne: false
            referencedRelation: "patients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "procedures_staff_id_fkey"
            columns: ["staff_id"]
            isOneToOne: false
            referencedRelation: "staff"
            referencedColumns: ["id"]
          },
        ]
      }
      product_prices: {
        Row: {
          created_at: string
          effective_from: string
          effective_to: string | null
          gst_percent: number
          id: string
          is_active: boolean
          mrp: number
          notes: string | null
          product_id: string
          purchase_price: number
          selling_price: number
        }
        Insert: {
          created_at?: string
          effective_from?: string
          effective_to?: string | null
          gst_percent?: number
          id?: string
          is_active?: boolean
          mrp?: number
          notes?: string | null
          product_id: string
          purchase_price?: number
          selling_price?: number
        }
        Update: {
          created_at?: string
          effective_from?: string
          effective_to?: string | null
          gst_percent?: number
          id?: string
          is_active?: boolean
          mrp?: number
          notes?: string | null
          product_id?: string
          purchase_price?: number
          selling_price?: number
        }
        Relationships: [
          {
            foreignKeyName: "product_prices_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "pharma_products"
            referencedColumns: ["id"]
          },
        ]
      }
      report_folders: {
        Row: {
          created_at: string
          description: string | null
          id: string
          name: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          id?: string
          name: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          description?: string | null
          id?: string
          name?: string
          updated_at?: string
        }
        Relationships: []
      }
      role_module_permissions: {
        Row: {
          can_create: boolean
          can_delete: boolean
          can_edit: boolean
          can_view: boolean
          created_at: string
          id: string
          module_key: string
          role_id: string
        }
        Insert: {
          can_create?: boolean
          can_delete?: boolean
          can_edit?: boolean
          can_view?: boolean
          created_at?: string
          id?: string
          module_key: string
          role_id: string
        }
        Update: {
          can_create?: boolean
          can_delete?: boolean
          can_edit?: boolean
          can_view?: boolean
          created_at?: string
          id?: string
          module_key?: string
          role_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "role_module_permissions_role_id_fkey"
            columns: ["role_id"]
            isOneToOne: false
            referencedRelation: "user_roles_config"
            referencedColumns: ["id"]
          },
        ]
      }
      saved_reports: {
        Row: {
          chart_type: string
          columns: Json
          created_at: string
          description: string | null
          display_options: Json | null
          filters: Json
          folder_id: string | null
          group_columns: Json
          group_rows: Json
          id: string
          name: string
          primary_object: string
          related_object: string | null
          updated_at: string
        }
        Insert: {
          chart_type?: string
          columns?: Json
          created_at?: string
          description?: string | null
          display_options?: Json | null
          filters?: Json
          folder_id?: string | null
          group_columns?: Json
          group_rows?: Json
          id?: string
          name: string
          primary_object: string
          related_object?: string | null
          updated_at?: string
        }
        Update: {
          chart_type?: string
          columns?: Json
          created_at?: string
          description?: string | null
          display_options?: Json | null
          filters?: Json
          folder_id?: string | null
          group_columns?: Json
          group_rows?: Json
          id?: string
          name?: string
          primary_object?: string
          related_object?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "saved_reports_folder_id_fkey"
            columns: ["folder_id"]
            isOneToOne: false
            referencedRelation: "report_folders"
            referencedColumns: ["id"]
          },
        ]
      }
      service_medicines: {
        Row: {
          created_at: string
          duration: string | null
          frequency: string | null
          id: string
          instructions: string | null
          product_id: string
          service_id: string
        }
        Insert: {
          created_at?: string
          duration?: string | null
          frequency?: string | null
          id?: string
          instructions?: string | null
          product_id: string
          service_id: string
        }
        Update: {
          created_at?: string
          duration?: string | null
          frequency?: string | null
          id?: string
          instructions?: string | null
          product_id?: string
          service_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "service_medicines_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "pharma_products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "service_medicines_service_id_fkey"
            columns: ["service_id"]
            isOneToOne: false
            referencedRelation: "services"
            referencedColumns: ["id"]
          },
        ]
      }
      services: {
        Row: {
          category: string
          created_at: string
          created_by: string | null
          diagnosis: string | null
          duration: number
          gst_percent: number
          hsn_code: string | null
          id: string
          material_percent: number | null
          name: string
          price: number
          problem_area_ids: string[]
          procedure_notes: string | null
          recommendations: string[] | null
          salesforce_id: string | null
          symptoms: string | null
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          category?: string
          created_at?: string
          created_by?: string | null
          diagnosis?: string | null
          duration?: number
          gst_percent?: number
          hsn_code?: string | null
          id?: string
          material_percent?: number | null
          name: string
          price?: number
          problem_area_ids?: string[]
          procedure_notes?: string | null
          recommendations?: string[] | null
          salesforce_id?: string | null
          symptoms?: string | null
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          category?: string
          created_at?: string
          created_by?: string | null
          diagnosis?: string | null
          duration?: number
          gst_percent?: number
          hsn_code?: string | null
          id?: string
          material_percent?: number | null
          name?: string
          price?: number
          problem_area_ids?: string[]
          procedure_notes?: string | null
          recommendations?: string[] | null
          salesforce_id?: string | null
          symptoms?: string | null
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: []
      }
      staff: {
        Row: {
          auth_user_id: string | null
          consultation_fee: number
          consultation_hsn: string | null
          created_at: string
          created_by: string | null
          email: string | null
          first_name: string
          force_password_change: boolean | null
          id: string
          is_active: boolean | null
          last_name: string
          phone: string | null
          photo_url: string | null
          report_period_limit: string
          role: string
          role_id: string | null
          specialization: string | null
          theme_preference: string
          updated_at: string
          updated_by: string | null
          work_end_time: string | null
          work_start_time: string | null
        }
        Insert: {
          auth_user_id?: string | null
          consultation_fee?: number
          consultation_hsn?: string | null
          created_at?: string
          created_by?: string | null
          email?: string | null
          first_name: string
          force_password_change?: boolean | null
          id?: string
          is_active?: boolean | null
          last_name: string
          phone?: string | null
          photo_url?: string | null
          report_period_limit?: string
          role: string
          role_id?: string | null
          specialization?: string | null
          theme_preference?: string
          updated_at?: string
          updated_by?: string | null
          work_end_time?: string | null
          work_start_time?: string | null
        }
        Update: {
          auth_user_id?: string | null
          consultation_fee?: number
          consultation_hsn?: string | null
          created_at?: string
          created_by?: string | null
          email?: string | null
          first_name?: string
          force_password_change?: boolean | null
          id?: string
          is_active?: boolean | null
          last_name?: string
          phone?: string | null
          photo_url?: string | null
          report_period_limit?: string
          role?: string
          role_id?: string | null
          specialization?: string | null
          theme_preference?: string
          updated_at?: string
          updated_by?: string | null
          work_end_time?: string | null
          work_start_time?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "staff_role_id_fkey"
            columns: ["role_id"]
            isOneToOne: false
            referencedRelation: "user_roles_config"
            referencedColumns: ["id"]
          },
        ]
      }
      staff_aspirations: {
        Row: {
          created_at: string
          description: string | null
          id: string
          staff_id: string
          status: string
          target_date: string | null
          title: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          id?: string
          staff_id: string
          status?: string
          target_date?: string | null
          title: string
        }
        Update: {
          created_at?: string
          description?: string | null
          id?: string
          staff_id?: string
          status?: string
          target_date?: string | null
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "staff_aspirations_staff_id_fkey"
            columns: ["staff_id"]
            isOneToOne: false
            referencedRelation: "staff"
            referencedColumns: ["id"]
          },
        ]
      }
      staff_education: {
        Row: {
          created_at: string
          degree: string
          end_year: number | null
          field_of_study: string | null
          id: string
          institution: string
          notes: string | null
          staff_id: string
          start_year: number | null
        }
        Insert: {
          created_at?: string
          degree: string
          end_year?: number | null
          field_of_study?: string | null
          id?: string
          institution: string
          notes?: string | null
          staff_id: string
          start_year?: number | null
        }
        Update: {
          created_at?: string
          degree?: string
          end_year?: number | null
          field_of_study?: string | null
          id?: string
          institution?: string
          notes?: string | null
          staff_id?: string
          start_year?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "staff_education_staff_id_fkey"
            columns: ["staff_id"]
            isOneToOne: false
            referencedRelation: "staff"
            referencedColumns: ["id"]
          },
        ]
      }
      staff_experience: {
        Row: {
          company: string
          created_at: string
          end_date: string | null
          id: string
          notes: string | null
          staff_id: string
          start_date: string | null
          title: string
        }
        Insert: {
          company: string
          created_at?: string
          end_date?: string | null
          id?: string
          notes?: string | null
          staff_id: string
          start_date?: string | null
          title: string
        }
        Update: {
          company?: string
          created_at?: string
          end_date?: string | null
          id?: string
          notes?: string | null
          staff_id?: string
          start_date?: string | null
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "staff_experience_staff_id_fkey"
            columns: ["staff_id"]
            isOneToOne: false
            referencedRelation: "staff"
            referencedColumns: ["id"]
          },
        ]
      }
      staff_leave_balances: {
        Row: {
          created_at: string
          id: string
          leave_type_id: string
          opening_balance: number
          staff_id: string
          updated_at: string
          used: number
          year: number
        }
        Insert: {
          created_at?: string
          id?: string
          leave_type_id: string
          opening_balance?: number
          staff_id: string
          updated_at?: string
          used?: number
          year?: number
        }
        Update: {
          created_at?: string
          id?: string
          leave_type_id?: string
          opening_balance?: number
          staff_id?: string
          updated_at?: string
          used?: number
          year?: number
        }
        Relationships: [
          {
            foreignKeyName: "staff_leave_balances_leave_type_id_fkey"
            columns: ["leave_type_id"]
            isOneToOne: false
            referencedRelation: "leave_types"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "staff_leave_balances_staff_id_fkey"
            columns: ["staff_id"]
            isOneToOne: false
            referencedRelation: "staff"
            referencedColumns: ["id"]
          },
        ]
      }
      staff_requests: {
        Row: {
          created_at: string
          description: string | null
          id: string
          priority: string
          resolved_at: string | null
          staff_id: string
          status: string
          title: string
          type: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          id?: string
          priority?: string
          resolved_at?: string | null
          staff_id: string
          status?: string
          title: string
          type?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          description?: string | null
          id?: string
          priority?: string
          resolved_at?: string | null
          staff_id?: string
          status?: string
          title?: string
          type?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "staff_requests_staff_id_fkey"
            columns: ["staff_id"]
            isOneToOne: false
            referencedRelation: "staff"
            referencedColumns: ["id"]
          },
        ]
      }
      staff_roles: {
        Row: {
          created_at: string
          description: string | null
          id: string
          is_active: boolean
          name: string
          permissions: string[] | null
        }
        Insert: {
          created_at?: string
          description?: string | null
          id?: string
          is_active?: boolean
          name: string
          permissions?: string[] | null
        }
        Update: {
          created_at?: string
          description?: string | null
          id?: string
          is_active?: boolean
          name?: string
          permissions?: string[] | null
        }
        Relationships: []
      }
      survey_assignments: {
        Row: {
          assigned_by: string | null
          created_at: string
          id: string
          notes: string | null
          patient_id: string
          response_id: string | null
          status: string
          template_id: string
          updated_at: string
        }
        Insert: {
          assigned_by?: string | null
          created_at?: string
          id?: string
          notes?: string | null
          patient_id: string
          response_id?: string | null
          status?: string
          template_id: string
          updated_at?: string
        }
        Update: {
          assigned_by?: string | null
          created_at?: string
          id?: string
          notes?: string | null
          patient_id?: string
          response_id?: string | null
          status?: string
          template_id?: string
          updated_at?: string
        }
        Relationships: []
      }
      survey_questions: {
        Row: {
          created_at: string
          id: string
          ideal_answer: Json | null
          options: Json | null
          question_text: string
          question_type: string
          sort_order: number
          template_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          ideal_answer?: Json | null
          options?: Json | null
          question_text: string
          question_type?: string
          sort_order?: number
          template_id: string
        }
        Update: {
          created_at?: string
          id?: string
          ideal_answer?: Json | null
          options?: Json | null
          question_text?: string
          question_type?: string
          sort_order?: number
          template_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "survey_questions_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "survey_templates"
            referencedColumns: ["id"]
          },
        ]
      }
      survey_responses: {
        Row: {
          ai_products: Json | null
          ai_recommendation: Json | null
          ai_services: Json | null
          answers: Json | null
          appointment_id: string | null
          created_at: string
          created_by: string | null
          dr_notes: string | null
          dr_status: string
          id: string
          patient_id: string
          reviewed_at: string | null
          reviewed_by: string | null
          selected_products: Json | null
          selected_services: Json | null
          template_id: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          ai_products?: Json | null
          ai_recommendation?: Json | null
          ai_services?: Json | null
          answers?: Json | null
          appointment_id?: string | null
          created_at?: string
          created_by?: string | null
          dr_notes?: string | null
          dr_status?: string
          id?: string
          patient_id: string
          reviewed_at?: string | null
          reviewed_by?: string | null
          selected_products?: Json | null
          selected_services?: Json | null
          template_id: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          ai_products?: Json | null
          ai_recommendation?: Json | null
          ai_services?: Json | null
          answers?: Json | null
          appointment_id?: string | null
          created_at?: string
          created_by?: string | null
          dr_notes?: string | null
          dr_status?: string
          id?: string
          patient_id?: string
          reviewed_at?: string | null
          reviewed_by?: string | null
          selected_products?: Json | null
          selected_services?: Json | null
          template_id?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "survey_responses_appointment_id_fkey"
            columns: ["appointment_id"]
            isOneToOne: false
            referencedRelation: "appointments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "survey_responses_patient_id_fkey"
            columns: ["patient_id"]
            isOneToOne: false
            referencedRelation: "patients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "survey_responses_reviewed_by_fkey"
            columns: ["reviewed_by"]
            isOneToOne: false
            referencedRelation: "staff"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "survey_responses_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "survey_templates"
            referencedColumns: ["id"]
          },
        ]
      }
      survey_template_products: {
        Row: {
          advice_text: string | null
          created_at: string
          dosage: string | null
          duration: string | null
          frequency: string | null
          id: string
          instructions: string | null
          product_id: string
          template_id: string
        }
        Insert: {
          advice_text?: string | null
          created_at?: string
          dosage?: string | null
          duration?: string | null
          frequency?: string | null
          id?: string
          instructions?: string | null
          product_id: string
          template_id: string
        }
        Update: {
          advice_text?: string | null
          created_at?: string
          dosage?: string | null
          duration?: string | null
          frequency?: string | null
          id?: string
          instructions?: string | null
          product_id?: string
          template_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "survey_template_products_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "pharma_products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "survey_template_products_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "survey_templates"
            referencedColumns: ["id"]
          },
        ]
      }
      survey_template_services: {
        Row: {
          advice_text: string | null
          created_at: string
          id: string
          service_id: string
          template_id: string
        }
        Insert: {
          advice_text?: string | null
          created_at?: string
          id?: string
          service_id: string
          template_id: string
        }
        Update: {
          advice_text?: string | null
          created_at?: string
          id?: string
          service_id?: string
          template_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "survey_template_services_service_id_fkey"
            columns: ["service_id"]
            isOneToOne: false
            referencedRelation: "services"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "survey_template_services_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "survey_templates"
            referencedColumns: ["id"]
          },
        ]
      }
      survey_templates: {
        Row: {
          age_range_max: number | null
          age_range_min: number | null
          approval_status: string
          created_at: string
          created_by: string | null
          description: string | null
          id: string
          is_active: boolean | null
          name: string
          problem_area_id: string | null
          service_id: string | null
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          age_range_max?: number | null
          age_range_min?: number | null
          approval_status?: string
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          is_active?: boolean | null
          name: string
          problem_area_id?: string | null
          service_id?: string | null
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          age_range_max?: number | null
          age_range_min?: number | null
          approval_status?: string
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          is_active?: boolean | null
          name?: string
          problem_area_id?: string | null
          service_id?: string | null
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "survey_templates_problem_area_id_fkey"
            columns: ["problem_area_id"]
            isOneToOne: false
            referencedRelation: "problem_areas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "survey_templates_service_id_fkey"
            columns: ["service_id"]
            isOneToOne: false
            referencedRelation: "services"
            referencedColumns: ["id"]
          },
        ]
      }
      tax_master: {
        Row: {
          cgst: number | null
          created_at: string
          created_by: string | null
          description: string | null
          id: string
          igst: number | null
          is_active: boolean
          name: string
          rate: number | null
          sgst: number | null
          updated_by: string | null
        }
        Insert: {
          cgst?: number | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          igst?: number | null
          is_active?: boolean
          name: string
          rate?: number | null
          sgst?: number | null
          updated_by?: string | null
        }
        Update: {
          cgst?: number | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          igst?: number | null
          is_active?: boolean
          name?: string
          rate?: number | null
          sgst?: number | null
          updated_by?: string | null
        }
        Relationships: []
      }
      tax_master_products: {
        Row: {
          created_at: string
          id: string
          is_active: boolean
          product_id: string
          tax_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          is_active?: boolean
          product_id: string
          tax_id: string
        }
        Update: {
          created_at?: string
          id?: string
          is_active?: boolean
          product_id?: string
          tax_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "tax_master_products_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "pharma_products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tax_master_products_tax_id_fkey"
            columns: ["tax_id"]
            isOneToOne: false
            referencedRelation: "tax_master"
            referencedColumns: ["id"]
          },
        ]
      }
      tax_master_services: {
        Row: {
          created_at: string
          id: string
          is_active: boolean
          service_id: string
          tax_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          is_active?: boolean
          service_id: string
          tax_id: string
        }
        Update: {
          created_at?: string
          id?: string
          is_active?: boolean
          service_id?: string
          tax_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "tax_master_services_service_id_fkey"
            columns: ["service_id"]
            isOneToOne: false
            referencedRelation: "services"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tax_master_services_tax_id_fkey"
            columns: ["tax_id"]
            isOneToOne: false
            referencedRelation: "tax_master"
            referencedColumns: ["id"]
          },
        ]
      }
      therapy_notes: {
        Row: {
          appointment_id: string
          created_at: string
          created_by: string | null
          created_by_name: string | null
          id: string
          note: string
          patient_id: string | null
          updated_at: string
        }
        Insert: {
          appointment_id: string
          created_at?: string
          created_by?: string | null
          created_by_name?: string | null
          id?: string
          note: string
          patient_id?: string | null
          updated_at?: string
        }
        Update: {
          appointment_id?: string
          created_at?: string
          created_by?: string | null
          created_by_name?: string | null
          id?: string
          note?: string
          patient_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "therapy_notes_appointment_id_fkey"
            columns: ["appointment_id"]
            isOneToOne: false
            referencedRelation: "appointments"
            referencedColumns: ["id"]
          },
        ]
      }
      trash_items: {
        Row: {
          created_at: string
          deleted_at: string
          deleted_by: string | null
          deleted_by_name: string | null
          id: string
          object_type: string
          purged_at: string | null
          purged_by: string | null
          record_data: Json
          record_id: string
          record_label: string | null
          restored_at: string | null
          restored_by: string | null
          status: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          deleted_at?: string
          deleted_by?: string | null
          deleted_by_name?: string | null
          id?: string
          object_type: string
          purged_at?: string | null
          purged_by?: string | null
          record_data: Json
          record_id: string
          record_label?: string | null
          restored_at?: string | null
          restored_by?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          deleted_at?: string
          deleted_by?: string | null
          deleted_by_name?: string | null
          id?: string
          object_type?: string
          purged_at?: string | null
          purged_by?: string | null
          record_data?: Json
          record_id?: string
          record_label?: string | null
          restored_at?: string | null
          restored_by?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: []
      }
      trash_settings: {
        Row: {
          auto_purge: boolean
          created_at: string
          id: boolean
          retention_days: number
          updated_at: string
        }
        Insert: {
          auto_purge?: boolean
          created_at?: string
          id?: boolean
          retention_days?: number
          updated_at?: string
        }
        Update: {
          auto_purge?: boolean
          created_at?: string
          id?: boolean
          retention_days?: number
          updated_at?: string
        }
        Relationships: []
      }
      unit_master: {
        Row: {
          conversion_qty: number | null
          created_at: string
          description: string | null
          id: string
          is_active: boolean
          name: string
          sub_unit_name: string | null
        }
        Insert: {
          conversion_qty?: number | null
          created_at?: string
          description?: string | null
          id?: string
          is_active?: boolean
          name: string
          sub_unit_name?: string | null
        }
        Update: {
          conversion_qty?: number | null
          created_at?: string
          description?: string | null
          id?: string
          is_active?: boolean
          name?: string
          sub_unit_name?: string | null
        }
        Relationships: []
      }
      user_roles_config: {
        Row: {
          created_at: string
          data_scope: string
          description: string | null
          id: string
          is_system: boolean
          name: string
        }
        Insert: {
          created_at?: string
          data_scope?: string
          description?: string | null
          id?: string
          is_system?: boolean
          name: string
        }
        Update: {
          created_at?: string
          data_scope?: string
          description?: string | null
          id?: string
          is_system?: boolean
          name?: string
        }
        Relationships: []
      }
      validation_rules: {
        Row: {
          config: Json
          created_at: string
          created_by: string | null
          description: string | null
          execute_when: string
          field_key: string
          id: string
          is_active: boolean
          name: string
          object_key: string
          updated_at: string
          validate_on: string
        }
        Insert: {
          config?: Json
          created_at?: string
          created_by?: string | null
          description?: string | null
          execute_when?: string
          field_key: string
          id?: string
          is_active?: boolean
          name: string
          object_key: string
          updated_at?: string
          validate_on?: string
        }
        Update: {
          config?: Json
          created_at?: string
          created_by?: string | null
          description?: string | null
          execute_when?: string
          field_key?: string
          id?: string
          is_active?: boolean
          name?: string
          object_key?: string
          updated_at?: string
          validate_on?: string
        }
        Relationships: []
      }
      vendor_contacts: {
        Row: {
          contact_name: string
          created_at: string
          email: string | null
          id: string
          phone: string | null
          vendor_id: string
        }
        Insert: {
          contact_name: string
          created_at?: string
          email?: string | null
          id?: string
          phone?: string | null
          vendor_id: string
        }
        Update: {
          contact_name?: string
          created_at?: string
          email?: string | null
          id?: string
          phone?: string | null
          vendor_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "vendor_contacts_vendor_id_fkey"
            columns: ["vendor_id"]
            isOneToOne: false
            referencedRelation: "vendors"
            referencedColumns: ["id"]
          },
        ]
      }
      vendors: {
        Row: {
          address: string | null
          category: string | null
          city: string | null
          contact_person: string | null
          created_at: string
          created_by: string | null
          email: string | null
          gst_number: string | null
          id: string
          is_active: boolean
          name: string
          notes: string | null
          phone: string | null
          state: string | null
          updated_at: string
          updated_by: string | null
          website: string | null
        }
        Insert: {
          address?: string | null
          category?: string | null
          city?: string | null
          contact_person?: string | null
          created_at?: string
          created_by?: string | null
          email?: string | null
          gst_number?: string | null
          id?: string
          is_active?: boolean
          name: string
          notes?: string | null
          phone?: string | null
          state?: string | null
          updated_at?: string
          updated_by?: string | null
          website?: string | null
        }
        Update: {
          address?: string | null
          category?: string | null
          city?: string | null
          contact_person?: string | null
          created_at?: string
          created_by?: string | null
          email?: string | null
          gst_number?: string | null
          id?: string
          is_active?: boolean
          name?: string
          notes?: string | null
          phone?: string | null
          state?: string | null
          updated_at?: string
          updated_by?: string | null
          website?: string | null
        }
        Relationships: []
      }
      whatsapp_conversations: {
        Row: {
          content: string
          created_at: string
          direction: string
          id: string
          message_sid: string | null
          patient_id: string | null
          phone: string
          role: string
        }
        Insert: {
          content: string
          created_at?: string
          direction: string
          id?: string
          message_sid?: string | null
          patient_id?: string | null
          phone: string
          role: string
        }
        Update: {
          content?: string
          created_at?: string
          direction?: string
          id?: string
          message_sid?: string | null
          patient_id?: string | null
          phone?: string
          role?: string
        }
        Relationships: [
          {
            foreignKeyName: "whatsapp_conversations_patient_id_fkey"
            columns: ["patient_id"]
            isOneToOne: false
            referencedRelation: "patients"
            referencedColumns: ["id"]
          },
        ]
      }
      working_hours: {
        Row: {
          break_end: string | null
          break_start: string | null
          close_time: string
          created_at: string
          day_of_week: number
          id: string
          is_open: boolean
          open_time: string
        }
        Insert: {
          break_end?: string | null
          break_start?: string | null
          close_time?: string
          created_at?: string
          day_of_week: number
          id?: string
          is_open?: boolean
          open_time?: string
        }
        Update: {
          break_end?: string | null
          break_start?: string | null
          close_time?: string
          created_at?: string
          day_of_week?: number
          id?: string
          is_open?: boolean
          open_time?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      add_custom_field_column: {
        Args: { _column: string; _sql_type: string; _table: string }
        Returns: undefined
      }
      can_see_procedure: { Args: { _procedure_id: string }; Returns: boolean }
      create_patient_portal_token: {
        Args: {
          _expires_at: string
          _otp_code: string
          _patient_id: string
          _phone: string
        }
        Returns: string
      }
      current_staff_id: { Args: never; Returns: string }
      drop_custom_field_column: {
        Args: { _column: string; _table: string }
        Returns: undefined
      }
      get_report_fields: {
        Args: never
        Returns: {
          column_name: string
          data_type: string
          table_name: string
        }[]
      }
      has_full_data_scope: { Args: never; Returns: boolean }
      move_to_trash: {
        Args: { _label?: string; _object_type: string; _record_id: string }
        Returns: string
      }
      purge_trash_item: { Args: { _trash_id: string }; Returns: undefined }
      recalc_patient_invoice_rollups: {
        Args: { _patient_id: string }
        Returns: undefined
      }
      recalc_patient_visit_rollups: {
        Args: { _patient_id: string }
        Returns: undefined
      }
      restore_from_trash: { Args: { _trash_id: string }; Returns: undefined }
      trash_allowed_object: { Args: { _object_type: string }; Returns: boolean }
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
