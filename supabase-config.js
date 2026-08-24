const SUPABASE_URL = "https://cjahovglnavlluorxotb.supabase.co";
const SUPABASE_PUBLISHABLE_KEY = "sb_publishable_ZctK1b1IKRtfpF0hQ6V0aA_h3eWaLls";

window.supabaseClient = window.supabase.createClient(
  SUPABASE_URL,
  SUPABASE_PUBLISHABLE_KEY,
);
