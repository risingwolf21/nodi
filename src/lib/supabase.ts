import { createClient } from "@supabase/supabase-js";

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabasePublishableKey = import.meta.env
  .VITE_SUPABASE_PUBLISHABLE_KEY;

if (!supabaseUrl || !supabasePublishableKey) {
  throw new Error(
    "Supabase configuration missing. Check your .env.local file.",
  );
}

// The supabase-js default, set explicitly so existing sessions stay valid
// and an offline sign-out can remove the stored session (auth-provider).
export const authStorageKey = `sb-${new URL(supabaseUrl).hostname.split(".")[0]}-auth-token`;

export const supabase = createClient(
  supabaseUrl,
  supabasePublishableKey,
  { auth: { storageKey: authStorageKey } },
);