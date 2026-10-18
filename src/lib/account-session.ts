import { supabase } from "@/lib/supabase";

/**
 * Whether requests run as this account. Without its session supabase-js
 * sends the publishable key, and RLS answers as anon with empty lists and
 * no error, e.g. while the app runs on the remembered account (offline
 * start) or a token renewal failed.
 */
export async function hasAccountSession(userId: string): Promise<boolean> {
    const { data } = await supabase.auth.getSession();
    return data.session?.user.id === userId;
}
