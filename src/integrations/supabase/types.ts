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
      attendance: {
        Row: {
          check_in_at: string
          created_at: string
          date: string
          employee_id: string
          face_id_confirmed: boolean
          id: string
          source: string
          updated_at: string
        }
        Insert: {
          check_in_at?: string
          created_at?: string
          date: string
          employee_id: string
          face_id_confirmed?: boolean
          id?: string
          source?: string
          updated_at?: string
        }
        Update: {
          check_in_at?: string
          created_at?: string
          date?: string
          employee_id?: string
          face_id_confirmed?: boolean
          id?: string
          source?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "attendance_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
        ]
      }
      companies: {
        Row: {
          created_at: string
          id: string
          name: string
        }
        Insert: {
          created_at?: string
          id?: string
          name: string
        }
        Update: {
          created_at?: string
          id?: string
          name?: string
        }
        Relationships: []
      }
      contract_payments: {
        Row: {
          amount: number
          contract_id: string
          created_at: string
          created_by: string | null
          currency: string
          id: string
          method: string | null
          note: string | null
          paid_at: string
          updated_at: string
        }
        Insert: {
          amount?: number
          contract_id: string
          created_at?: string
          created_by?: string | null
          currency?: string
          id?: string
          method?: string | null
          note?: string | null
          paid_at?: string
          updated_at?: string
        }
        Update: {
          amount?: number
          contract_id?: string
          created_at?: string
          created_by?: string | null
          currency?: string
          id?: string
          method?: string | null
          note?: string | null
          paid_at?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "contract_payments_contract_id_fkey"
            columns: ["contract_id"]
            isOneToOne: false
            referencedRelation: "contracts"
            referencedColumns: ["id"]
          },
        ]
      }
      contract_types: {
        Row: {
          created_at: string
          id: string
          name: string
        }
        Insert: {
          created_at?: string
          id?: string
          name: string
        }
        Update: {
          created_at?: string
          id?: string
          name?: string
        }
        Relationships: []
      }
      contracts: {
        Row: {
          back_office_manager: string | null
          call_centre: string | null
          client_name: string
          client_photo_url: string | null
          commission: number
          company: string | null
          contract_date: string | null
          contract_no: string | null
          contract_pdf_url: string | null
          contract_type: string | null
          created_at: string
          created_by: string | null
          docs_usd: number
          id: string
          month: string | null
          note: string | null
          payment: string | null
          people: number
          phone: string | null
          price_usd: number
          price_uzs: number
          sales_manager: string | null
          updated_at: string
          visa_result: string | null
          year: string | null
        }
        Insert: {
          back_office_manager?: string | null
          call_centre?: string | null
          client_name: string
          client_photo_url?: string | null
          commission?: number
          company?: string | null
          contract_date?: string | null
          contract_no?: string | null
          contract_pdf_url?: string | null
          contract_type?: string | null
          created_at?: string
          created_by?: string | null
          docs_usd?: number
          id?: string
          month?: string | null
          note?: string | null
          payment?: string | null
          people?: number
          phone?: string | null
          price_usd?: number
          price_uzs?: number
          sales_manager?: string | null
          updated_at?: string
          visa_result?: string | null
          year?: string | null
        }
        Update: {
          back_office_manager?: string | null
          call_centre?: string | null
          client_name?: string
          client_photo_url?: string | null
          commission?: number
          company?: string | null
          contract_date?: string | null
          contract_no?: string | null
          contract_pdf_url?: string | null
          contract_type?: string | null
          created_at?: string
          created_by?: string | null
          docs_usd?: number
          id?: string
          month?: string | null
          note?: string | null
          payment?: string | null
          people?: number
          phone?: string | null
          price_usd?: number
          price_uzs?: number
          sales_manager?: string | null
          updated_at?: string
          visa_result?: string | null
          year?: string | null
        }
        Relationships: []
      }
      employee_schedules: {
        Row: {
          created_at: string
          employee_id: string
          id: string
          is_working: boolean
          start_time: string
          updated_at: string
          weekday: number
        }
        Insert: {
          created_at?: string
          employee_id: string
          id?: string
          is_working?: boolean
          start_time?: string
          updated_at?: string
          weekday: number
        }
        Update: {
          created_at?: string
          employee_id?: string
          id?: string
          is_working?: boolean
          start_time?: string
          updated_at?: string
          weekday?: number
        }
        Relationships: [
          {
            foreignKeyName: "employee_schedules_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
        ]
      }
      employee_telegram: {
        Row: {
          created_at: string
          employee_id: string | null
          first_name: string | null
          id: string
          last_name: string | null
          linked_at: string | null
          telegram_id: number
          telegram_username: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          employee_id?: string | null
          first_name?: string | null
          id?: string
          last_name?: string | null
          linked_at?: string | null
          telegram_id: number
          telegram_username?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          employee_id?: string | null
          first_name?: string | null
          id?: string
          last_name?: string | null
          linked_at?: string | null
          telegram_id?: number
          telegram_username?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "employee_telegram_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
        ]
      }
      employees: {
        Row: {
          avatar_url: string | null
          created_at: string
          created_by: string | null
          full_name: string
          hired_at: string | null
          id: string
          note: string | null
          phone: string | null
          position: string | null
          terminated_at: string | null
          updated_at: string
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string
          created_by?: string | null
          full_name: string
          hired_at?: string | null
          id?: string
          note?: string | null
          phone?: string | null
          position?: string | null
          terminated_at?: string | null
          updated_at?: string
        }
        Update: {
          avatar_url?: string | null
          created_at?: string
          created_by?: string | null
          full_name?: string
          hired_at?: string | null
          id?: string
          note?: string | null
          phone?: string | null
          position?: string | null
          terminated_at?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      expense_categories: {
        Row: {
          created_at: string
          id: string
          name: string
        }
        Insert: {
          created_at?: string
          id?: string
          name: string
        }
        Update: {
          created_at?: string
          id?: string
          name?: string
        }
        Relationships: []
      }
      expense_payments: {
        Row: {
          amount: number
          created_at: string
          expense_id: string
          id: string
          note: string | null
          paid_at: string
          payment_method: string | null
        }
        Insert: {
          amount: number
          created_at?: string
          expense_id: string
          id?: string
          note?: string | null
          paid_at?: string
          payment_method?: string | null
        }
        Update: {
          amount?: number
          created_at?: string
          expense_id?: string
          id?: string
          note?: string | null
          paid_at?: string
          payment_method?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "expense_payments_expense_id_fkey"
            columns: ["expense_id"]
            isOneToOne: false
            referencedRelation: "expenses"
            referencedColumns: ["id"]
          },
        ]
      }
      expenses: {
        Row: {
          category: string
          created_at: string
          created_by: string | null
          currency: string
          expense_date: string
          id: string
          notes: string | null
          status: string
          title: string
          total_amount: number
          vendor: string | null
        }
        Insert: {
          category: string
          created_at?: string
          created_by?: string | null
          currency?: string
          expense_date?: string
          id?: string
          notes?: string | null
          status?: string
          title: string
          total_amount: number
          vendor?: string | null
        }
        Update: {
          category?: string
          created_at?: string
          created_by?: string | null
          currency?: string
          expense_date?: string
          id?: string
          notes?: string | null
          status?: string
          title?: string
          total_amount?: number
          vendor?: string | null
        }
        Relationships: []
      }
      fine_rules: {
        Row: {
          amount_uzs: number
          created_at: string
          id: string
          label: string | null
          max_minutes: number | null
          min_minutes: number
          updated_at: string
        }
        Insert: {
          amount_uzs: number
          created_at?: string
          id?: string
          label?: string | null
          max_minutes?: number | null
          min_minutes: number
          updated_at?: string
        }
        Update: {
          amount_uzs?: number
          created_at?: string
          id?: string
          label?: string | null
          max_minutes?: number | null
          min_minutes?: number
          updated_at?: string
        }
        Relationships: []
      }
      fines: {
        Row: {
          amount_uzs: number
          created_at: string
          date: string
          employee_id: string
          id: string
          minutes_late: number
          note: string | null
          reason: string
          updated_at: string
        }
        Insert: {
          amount_uzs?: number
          created_at?: string
          date: string
          employee_id: string
          id?: string
          minutes_late?: number
          note?: string | null
          reason?: string
          updated_at?: string
        }
        Update: {
          amount_uzs?: number
          created_at?: string
          date?: string
          employee_id?: string
          id?: string
          minutes_late?: number
          note?: string | null
          reason?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "fines_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
        ]
      }
      operators: {
        Row: {
          created_at: string
          created_by: string | null
          id: string
          kind: string
          name: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          id?: string
          kind: string
          name: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          id?: string
          kind?: string
          name?: string
          updated_at?: string
        }
        Relationships: []
      }
      profiles: {
        Row: {
          avatar_url: string | null
          created_at: string
          display_name: string | null
          id: string
          updated_at: string
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string
          display_name?: string | null
          id: string
          updated_at?: string
        }
        Update: {
          avatar_url?: string | null
          created_at?: string
          display_name?: string | null
          id?: string
          updated_at?: string
        }
        Relationships: []
      }
      salaries: {
        Row: {
          created_at: string
          created_by: string | null
          employee_name: string
          fixed_amount: number
          id: string
          kpi_amount: number
          month: number
          note: string | null
          penalty_amount: number
          updated_at: string
          year: number
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          employee_name: string
          fixed_amount?: number
          id?: string
          kpi_amount?: number
          month: number
          note?: string | null
          penalty_amount?: number
          updated_at?: string
          year: number
        }
        Update: {
          created_at?: string
          created_by?: string | null
          employee_name?: string
          fixed_amount?: number
          id?: string
          kpi_amount?: number
          month?: number
          note?: string | null
          penalty_amount?: number
          updated_at?: string
          year?: number
        }
        Relationships: []
      }
      usd_rates: {
        Row: {
          created_at: string
          id: string
          month: number
          rate: number
          updated_at: string
          year: number
        }
        Insert: {
          created_at?: string
          id?: string
          month: number
          rate: number
          updated_at?: string
          year: number
        }
        Update: {
          created_at?: string
          id?: string
          month?: number
          rate?: number
          updated_at?: string
          year?: number
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
      widget_permissions: {
        Row: {
          created_at: string
          id: string
          user_id: string
          widget_key: string
        }
        Insert: {
          created_at?: string
          id?: string
          user_id: string
          widget_key: string
        }
        Update: {
          created_at?: string
          id?: string
          user_id?: string
          widget_key?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      recompute_expense_status: {
        Args: { _expense_id: string }
        Returns: undefined
      }
    }
    Enums: {
      app_role: "admin" | "user" | "owner_ceo" | "financier"
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
      app_role: ["admin", "user", "owner_ceo", "financier"],
    },
  },
} as const
