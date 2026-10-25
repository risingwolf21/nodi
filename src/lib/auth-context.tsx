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
    signIn: (email: string, password: string) => Promise<void>;
    signUp: (email: string, password: string) => Promise<{ needsConfirmation: boolean }>;
    signOut: () => Promise<void>;
    /** Sends a link to set a new password (package 33b). */
    requestPasswordReset: (email: string) => Promise<void>;
    /** Opened from that link: the app asks for a new password first. */
    passwordRecovery: boolean;
    updatePassword: (password: string) => Promise<void>;
    /** Checks the password, deletes the account on the server and ends the session here. */
    deleteAccount: (password: string) => Promise<void>;
};

export const AuthContext = createContext<AuthContextValue | undefined>(undefined);
