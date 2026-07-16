import { supabase, supabaseConfigured } from "../../shared/api";

export async function signInWithGoogle(): Promise<{ error: string | null }> {
  if (!supabaseConfigured) {
    return {
      error: "Supabase is not configured. Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY in web/.env.local",
    };
  }
  const { error } = await supabase.auth.signInWithOAuth({
    provider: "google",
    options: {
      redirectTo: `${window.location.origin}/auth/callback`,
      queryParams: { prompt: "select_account" },
    },
  });
  return { error: error?.message ?? null };
}
