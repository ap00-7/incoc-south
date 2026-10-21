export function getSupabasePublicConfig() {
  const env = import.meta.env;
  return {
    url: env.VITE_SUPABASE_URL,
    key:
      env.VITE_SUPABASE_PUBLISHABLE_KEY ||
      env.VITE_SUPABASE_ANON_KEY,
  };
}
