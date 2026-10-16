
import {
    useEffect,
    useState,
    type ReactNode,
} from "react";
import type { Session } from "@supabase/supabase-js";
import { supabase } from "@/lib/supabase";
import { AuthContext } from "./auth-context";


export function AuthProvider({ children }: { children: ReactNode }) {
    const [session, setSession] = useState<Session | null>(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        let active = true;

        supabase.auth.getSession().then(({ data, error }) => {
            if (!active) return;

            if (error) {
                console.error("Could not load auth session:", error);
            }

            setSession(data.session);
            setLoading(false);
        });

        const {
            data: { subscription },
        } = supabase.auth.onAuthStateChange((_event, nextSession) => {
            setSession(nextSession);
            setLoading(false);
        });

        return () => {
            active = false;
            subscription.unsubscribe();
        };
    }, []);

    async function signOut() {
        const { error } = await supabase.auth.signOut();

        if (error) {
            throw error;
        }
    }

    return (
        <AuthContext.Provider
            value={{
                session,
                user: session?.user ?? null,
                loading,
                signOut,
            }}
        >
            {children}
        </AuthContext.Provider>
    );
}