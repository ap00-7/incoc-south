import { createClient } from "@/lib/supabase/server";

export async function getPublicChurchContext() {
  const supabase = await createClient();
  const { data: church, error } = await supabase.from("churches")
    .select("id").eq("slug", "incoc-south").maybeSingle();
  if (error) throw new Error(`Unable to load public church information: ${error.message}`);
  if (!church) throw new Error("The public INCOC South church record is unavailable.");
  return { supabase, churchId: church.id };
}
