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
      audit_logs: {
        Row: {
          action: string
          created_at: string
          details: Json | null
          device_info: string | null
          entity: string
          entity_id: string | null
          id: string
          location_info: string | null
        }
        Insert: {
          action: string
          created_at?: string
          details?: Json | null
          device_info?: string | null
          entity: string
          entity_id?: string | null
          id?: string
          location_info?: string | null
        }
        Update: {
          action?: string
          created_at?: string
          details?: Json | null
          device_info?: string | null
          entity?: string
          entity_id?: string | null
          id?: string
          location_info?: string | null
        }
        Relationships: []
      }
      expenses: {
        Row: {
          amount: number
          category: string
          created_at: string
          entry_date: string
          id: string
          name: string
          serial_number: number
          updated_at: string
        }
        Insert: {
          amount?: number
          category?: string
          created_at?: string
          entry_date?: string
          id?: string
          name?: string
          serial_number?: number
          updated_at?: string
        }
        Update: {
          amount?: number
          category?: string
          created_at?: string
          entry_date?: string
          id?: string
          name?: string
          serial_number?: number
          updated_at?: string
        }
        Relationships: []
      }
      raw_materials: {
        Row: {
          created_at: string
          entry_date: string
          id: string
          manual_amount: number
          name: string
          payment: number
          quantity: number
          rate: number
          serial_number: number
          total_amount: number | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          entry_date?: string
          id?: string
          manual_amount?: number
          name?: string
          payment?: number
          quantity?: number
          rate?: number
          serial_number?: number
          total_amount?: number | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          entry_date?: string
          id?: string
          manual_amount?: number
          name?: string
          payment?: number
          quantity?: number
          rate?: number
          serial_number?: number
          total_amount?: number | null
          updated_at?: string
        }
        Relationships: []
      }
      sells: {
        Row: {
          created_at: string
          entry_date: string
          gadi_bhada: number
          id: string
          manual_amount: number
          name: string
          payment: number
          quantity: number
          rate: number
          serial_number: number
          total_amount: number | null
          updated_at: string
          vehicle_number: string
        }
        Insert: {
          created_at?: string
          entry_date?: string
          gadi_bhada?: number
          id?: string
          manual_amount?: number
          name?: string
          payment?: number
          quantity?: number
          rate?: number
          serial_number?: number
          total_amount?: number | null
          updated_at?: string
          vehicle_number?: string
        }
        Update: {
          created_at?: string
          entry_date?: string
          gadi_bhada?: number
          id?: string
          manual_amount?: number
          name?: string
          payment?: number
          quantity?: number
          rate?: number
          serial_number?: number
          total_amount?: number | null
          updated_at?: string
          vehicle_number?: string
        }
        Relationships: []
      }
      settings: {
        Row: {
          high_txn_threshold: number
          id: number
          lock_money: number
          low_money_threshold: number
          low_stock_threshold: number
          sell_money: number
          stock_adjustment: number
          total_money: number
          updated_at: string
        }
        Insert: {
          high_txn_threshold?: number
          id?: number
          lock_money?: number
          low_money_threshold?: number
          low_stock_threshold?: number
          sell_money?: number
          stock_adjustment?: number
          total_money?: number
          updated_at?: string
        }
        Update: {
          high_txn_threshold?: number
          id?: number
          lock_money?: number
          low_money_threshold?: number
          low_stock_threshold?: number
          sell_money?: number
          stock_adjustment?: number
          total_money?: number
          updated_at?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      is_admin: { Args: never; Returns: boolean }
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
