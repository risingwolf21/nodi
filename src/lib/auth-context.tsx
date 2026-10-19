import { createContext } from "react";
import type { Session } from "@supabase/supabase-js";

/** The signed-in account; also known offline, when no session is usable. */
export type Account = {
    id: string;
    email: string | null;
};

type AuthContextValue = {
    session: Session | null;
    user: Account | null;
    /**
     * Signed in, but the session could not be renewed without a network.
     * Local data stays usable; Supabase renews the session once online.
     */
    offline: boolean;
    loading: boolean;
    signOut: () => Promise<void>;
};

export const AuthContext = createContext<AuthContextValue | undefined>(undefined);
