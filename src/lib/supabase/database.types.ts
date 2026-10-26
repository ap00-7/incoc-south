export type Database = {
  public: {
    Tables: {
      churches: {
        Row: { id: string; name: string; slug: string; created_at: string; updated_at: string };
        Insert: { id?: string; name: string; slug: string; created_at?: string; updated_at?: string };
        Update: { id?: string; name?: string; slug?: string; created_at?: string; updated_at?: string };
        Relationships: [];
      };
      profiles: {
        Row: { id: string; display_name: string; created_at: string; updated_at: string };
        Insert: { id: string; display_name?: string; created_at?: string; updated_at?: string };
        Update: { id?: string; display_name?: string; created_at?: string; updated_at?: string };
        Relationships: [];
      };
      church_members: {
        Row: { id: string; church_id: string; user_id: string; role: Database["public"]["Enums"]["member_role"]; created_at: string };
        Insert: { id?: string; church_id: string; user_id: string; role?: Database["public"]["Enums"]["member_role"]; created_at?: string };
        Update: { id?: string; church_id?: string; user_id?: string; role?: Database["public"]["Enums"]["member_role"]; created_at?: string };
        Relationships: [
          { foreignKeyName: "church_members_church_id_fkey"; columns: ["church_id"]; isOneToOne: false; referencedRelation: "churches"; referencedColumns: ["id"] },
          { foreignKeyName: "church_members_profile_id_fkey"; columns: ["user_id"]; isOneToOne: false; referencedRelation: "profiles"; referencedColumns: ["id"] },
        ];
      };
      songs: {
        Row: { id: string; church_id: string; title: string; language: string; author: string | null; source: string | null; has_translation: boolean; start_with_chorus: boolean; is_published: boolean; created_by: string; created_at: string; updated_at: string };
        Insert: { id?: string; church_id: string; title: string; language: string; author?: string | null; source?: string | null; has_translation?: boolean; start_with_chorus?: boolean; is_published?: boolean; created_by: string; created_at?: string; updated_at?: string };
        Update: { id?: string; church_id?: string; title?: string; language?: string; author?: string | null; source?: string | null; has_translation?: boolean; start_with_chorus?: boolean; is_published?: boolean; created_by?: string; created_at?: string; updated_at?: string };
        Relationships: [
          { foreignKeyName: "songs_church_id_fkey"; columns: ["church_id"]; isOneToOne: false; referencedRelation: "churches"; referencedColumns: ["id"] },
        ];
      };
      song_sections: {
        Row: { id: string; song_id: string; section_type: Database["public"]["Enums"]["song_section_type"]; label: string | null; position: number; lyrics: string; translation: string | null; translation_language: string | null; is_hidden: boolean; created_at: string; updated_at: string };
        Insert: { id?: string; song_id: string; section_type?: Database["public"]["Enums"]["song_section_type"]; label?: string | null; position: number; lyrics?: string; translation?: string | null; translation_language?: string | null; is_hidden?: boolean; created_at?: string; updated_at?: string };
        Update: { id?: string; song_id?: string; section_type?: Database["public"]["Enums"]["song_section_type"]; label?: string | null; position?: number; lyrics?: string; translation?: string | null; translation_language?: string | null; is_hidden?: boolean; created_at?: string; updated_at?: string };
        Relationships: [
          { foreignKeyName: "song_sections_song_id_fkey"; columns: ["song_id"]; isOneToOne: false; referencedRelation: "songs"; referencedColumns: ["id"] },
        ];
      };
      schedules: {
        Row: { id: string; church_id: string; title: string; service_date: string; venue: string | null; description: string | null; status: Database["public"]["Enums"]["schedule_status"]; created_by: string; created_at: string; updated_at: string; published_at: string | null };
        Insert: { id?: string; church_id: string; title: string; service_date: string; venue?: string | null; description?: string | null; status?: Database["public"]["Enums"]["schedule_status"]; created_by: string; created_at?: string; updated_at?: string; published_at?: string | null };
        Update: { id?: string; church_id?: string; title?: string; service_date?: string; venue?: string | null; description?: string | null; status?: Database["public"]["Enums"]["schedule_status"]; created_by?: string; created_at?: string; updated_at?: string; published_at?: string | null };
        Relationships: [
          { foreignKeyName: "schedules_church_id_fkey"; columns: ["church_id"]; isOneToOne: false; referencedRelation: "churches"; referencedColumns: ["id"] },
        ];
      };
      schedule_items: {
        Row: { id: string; schedule_id: string; church_id: string; item_type: Database["public"]["Enums"]["schedule_item_type"]; title: string; song_id: string | null; position: number; leader_name: string | null; translator_name: string | null; translation_language: string | null; duration_minutes: number | null; public_content: string | null; link_title: string | null; link_url: string | null; media_url: string | null; background_image_url: string | null; show_in_slides: boolean; show_in_schedule: boolean | null; created_at: string; updated_at: string };
        Insert: { id?: string; schedule_id: string; church_id: string; item_type: Database["public"]["Enums"]["schedule_item_type"]; title: string; song_id?: string | null; position: number; leader_name?: string | null; translator_name?: string | null; translation_language?: string | null; duration_minutes?: number | null; public_content?: string | null; link_title?: string | null; link_url?: string | null; media_url?: string | null; background_image_url?: string | null; show_in_slides?: boolean; show_in_schedule?: boolean | null; created_at?: string; updated_at?: string };
        Update: { id?: string; schedule_id?: string; church_id?: string; item_type?: Database["public"]["Enums"]["schedule_item_type"]; title?: string; song_id?: string | null; position?: number; leader_name?: string | null; translator_name?: string | null; translation_language?: string | null; duration_minutes?: number | null; public_content?: string | null; link_title?: string | null; link_url?: string | null; media_url?: string | null; background_image_url?: string | null; show_in_slides?: boolean; show_in_schedule?: boolean | null; created_at?: string; updated_at?: string };
        Relationships: [
          { foreignKeyName: "schedule_items_schedule_id_church_id_fkey"; columns: ["schedule_id", "church_id"]; isOneToOne: false; referencedRelation: "schedules"; referencedColumns: ["id", "church_id"] },
          { foreignKeyName: "schedule_items_song_id_church_id_fkey"; columns: ["song_id", "church_id"]; isOneToOne: false; referencedRelation: "songs"; referencedColumns: ["id", "church_id"] },
        ];
      };
      presentation_sessions: {
        Row: { id: string; schedule_id: string; current_item_id: string | null; current_slide_index: number; is_active: boolean; updated_by: string | null; created_at: string; updated_at: string };
        Insert: { id?: string; schedule_id: string; current_item_id?: string | null; current_slide_index?: number; is_active?: boolean; updated_by?: string | null; created_at?: string; updated_at?: string };
        Update: { id?: string; schedule_id?: string; current_item_id?: string | null; current_slide_index?: number; is_active?: boolean; updated_by?: string | null; created_at?: string; updated_at?: string };
        Relationships: [
          { foreignKeyName: "presentation_sessions_schedule_id_fkey"; columns: ["schedule_id"]; isOneToOne: true; referencedRelation: "schedules"; referencedColumns: ["id"] },
          { foreignKeyName: "presentation_sessions_schedule_id_current_item_id_fkey"; columns: ["schedule_id", "current_item_id"]; isOneToOne: false; referencedRelation: "schedule_items"; referencedColumns: ["schedule_id", "id"] },
        ];
      };
      presentation_links: {
        Row: { id: string; schedule_id: string; token_hash: string; expires_at: string | null; revoked_at: string | null; created_by: string; created_at: string };
        Insert: { id?: string; schedule_id: string; token_hash: string; expires_at?: string | null; revoked_at?: string | null; created_by: string; created_at?: string };
        Update: { id?: string; schedule_id?: string; token_hash?: string; expires_at?: string | null; revoked_at?: string | null; created_by?: string; created_at?: string };
        Relationships: [
          { foreignKeyName: "presentation_links_schedule_id_fkey"; columns: ["schedule_id"]; isOneToOne: false; referencedRelation: "schedules"; referencedColumns: ["id"] },
        ];
      };
      schedule_item_notes: {
        Row: { schedule_item_id: string; notes: string; created_at: string; updated_at: string };
        Insert: { schedule_item_id: string; notes: string; created_at?: string; updated_at?: string };
        Update: { schedule_item_id?: string; notes?: string; created_at?: string; updated_at?: string };
        Relationships: [
          { foreignKeyName: "schedule_item_notes_schedule_item_id_fkey"; columns: ["schedule_item_id"]; isOneToOne: true; referencedRelation: "schedule_items"; referencedColumns: ["id"] },
        ];
      };
    };
    Views: Record<string, never>;
    Functions: {
      move_song_section: { Args: { target_section: string; direction: number }; Returns: undefined };
      move_schedule_item: { Args: { target_item: string; direction: number }; Returns: undefined };
      is_church_member: { Args: { target_church: string }; Returns: boolean };
      is_church_owner: { Args: { target_church: string }; Returns: boolean };
    };
    Enums: {
      member_role: "owner" | "viewer";
      schedule_status: "draft" | "published";
      schedule_item_type: "song" | "worship" | "prayer" | "sermon" | "scripture_reading" | "announcement" | "communion" | "offering" | "other" | "welcome" | "closing";
      song_section_type: "verse" | "chorus" | "pre_chorus" | "bridge" | "intro" | "outro" | "other";
    };
    CompositeTypes: Record<string, never>;
  };
};
