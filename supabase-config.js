const SUPABASE_URL = "https://cjahovglnavlluorxotb.supabase.co";
const SUPABASE_PUBLISHABLE_KEY = "sb_publishable_ZctK1b1IKRtfpF0hQ6V0aA_h3eWaLls";

window.supabaseClient = window.supabase.createClient(
  SUPABASE_URL,
  SUPABASE_PUBLISHABLE_KEY,
);

// Public catalog reads must not inherit a stale signed-in user's JWT. This
// client deliberately uses only the publishable key and stores no session.
window.supabasePublicClient = window.supabase.createClient(
  SUPABASE_URL,
  SUPABASE_PUBLISHABLE_KEY,
  {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
      storageKey: "legofolio-public-catalog",
    },
  },
);
