
import { createClient } from "@supabase/supabase-js";

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

export const supabase = createClient(
  supabaseUrl,
  supabaseKey,
  {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
    },
  }
);

export async function signInPlayer() {
  const { data: sessionData, error: sessionError } =
    await supabase.auth.getSession();

  if (sessionError) throw sessionError;

  if (sessionData.session?.user) {
    return sessionData.session.user;
  }

  const { data, error } =
    await supabase.auth.signInAnonymously();

  if (error) throw error;

  return data.user;
}
