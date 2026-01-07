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
    PostgrestVersion: "14.1"
  }
  public: {
    Tables: {
      exams: {
        Row: {
          created_at: string
          degree: string
          examiner1_id: string | null
          examiner2_id: string | null
          id: string
          is_team: boolean
          kompetenzfeld: string
          student_email: string | null
          student_first_name: string
          student_last_name: string
          team_partner_first_name: string | null
          team_partner_last_name: string | null
          topic: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          degree: string
          examiner1_id?: string | null
          examiner2_id?: string | null
          id?: string
          is_team?: boolean
          kompetenzfeld: string
          student_email?: string | null
          student_first_name: string
          student_last_name: string
          team_partner_first_name?: string | null
          team_partner_last_name?: string | null
          topic: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          degree?: string
          examiner1_id?: string | null
          examiner2_id?: string | null
          id?: string
          is_team?: boolean
          kompetenzfeld?: string
          student_email?: string | null
          student_first_name?: string
          student_last_name?: string
          team_partner_first_name?: string | null
          team_partner_last_name?: string | null
          topic?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "exams_examiner1_id_fkey"
            columns: ["examiner1_id"]
            isOneToOne: false
            referencedRelation: "staff"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "exams_examiner2_id_fkey"
            columns: ["examiner2_id"]
            isOneToOne: false
            referencedRelation: "staff"
            referencedColumns: ["id"]
          },
        ]
      }
      room_mappings: {
        Row: {
          created_at: string
          degree_scope: string
          id: string
          kompetenzfeld: string
          room_names: string[]
          updated_at: string
        }
        Insert: {
          created_at?: string
          degree_scope: string
          id?: string
          kompetenzfeld: string
          room_names?: string[]
          updated_at?: string
        }
        Update: {
          created_at?: string
          degree_scope?: string
          id?: string
          kompetenzfeld?: string
          room_names?: string[]
          updated_at?: string
        }
        Relationships: []
      }
      rooms: {
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
      schedule_config: {
        Row: {
          ba_slot_minutes: number
          created_at: string
          days: string[]
          end_time: string
          id: string
          ma_slot_minutes: number
          start_time: string
          updated_at: string
        }
        Insert: {
          ba_slot_minutes?: number
          created_at?: string
          days?: string[]
          end_time?: string
          id?: string
          ma_slot_minutes?: number
          start_time?: string
          updated_at?: string
        }
        Update: {
          ba_slot_minutes?: number
          created_at?: string
          days?: string[]
          end_time?: string
          id?: string
          ma_slot_minutes?: number
          start_time?: string
          updated_at?: string
        }
        Relationships: []
      }
      schedule_versions: {
        Row: {
          created_at: string
          id: string
          notes: string | null
          status: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          notes?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          notes?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: []
      }
      scheduled_events: {
        Row: {
          cancellation_reason: string | null
          created_at: string
          day_date: string
          end_time: string
          exam_id: string
          id: string
          protocolist_id: string | null
          room: string
          schedule_version_id: string
          start_time: string
          status: string
          updated_at: string
        }
        Insert: {
          cancellation_reason?: string | null
          created_at?: string
          day_date: string
          end_time: string
          exam_id: string
          id?: string
          protocolist_id?: string | null
          room: string
          schedule_version_id: string
          start_time: string
          status?: string
          updated_at?: string
        }
        Update: {
          cancellation_reason?: string | null
          created_at?: string
          day_date?: string
          end_time?: string
          exam_id?: string
          id?: string
          protocolist_id?: string | null
          room?: string
          schedule_version_id?: string
          start_time?: string
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "scheduled_events_exam_id_fkey"
            columns: ["exam_id"]
            isOneToOne: false
            referencedRelation: "exams"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "scheduled_events_protocolist_id_fkey"
            columns: ["protocolist_id"]
            isOneToOne: false
            referencedRelation: "staff"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "scheduled_events_schedule_version_id_fkey"
            columns: ["schedule_version_id"]
            isOneToOne: false
            referencedRelation: "schedule_versions"
            referencedColumns: ["id"]
          },
        ]
      }
      staff: {
        Row: {
          availability_override: Json | null
          competence_fields: string[]
          created_at: string
          employment_type: string
          id: string
          name: string
          updated_at: string
        }
        Insert: {
          availability_override?: Json | null
          competence_fields?: string[]
          created_at?: string
          employment_type: string
          id?: string
          name: string
          updated_at?: string
        }
        Update: {
          availability_override?: Json | null
          competence_fields?: string[]
          created_at?: string
          employment_type?: string
          id?: string
          name?: string
          updated_at?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      [_ in never]: never
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
