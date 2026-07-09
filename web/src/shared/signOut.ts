import { supabase } from "./api";

/** Clears presence then Supabase session (safe for idle / forced logout). */
export async function signOutApp() {
  try {
    const { clearPresence } = await import("./usePresence");
    await clearPresence();
  } catch {
    /* presence clear is best-effort */
  }
  await supabase.auth.signOut();
}
