"use client";

import { createBrowserClient } from "@supabase/ssr";
import type { Database } from "@/lib/supabase/database.types";
import { getSupabasePublicConfig } from "@/lib/supabase/config";

export function createClient() {
  const { url, key } = getSupabasePublicConfig();
  if (!url || !key) {
    throw new Error("Supabase is not configured. See the setup instructions.");
  }
  return createBrowserClient<Database>(url, key);
}
