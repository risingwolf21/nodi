import { useEffect, useState, type ReactNode } from "react";
import { isAuthRetryableFetchError, type Session } from "@supabase/supabase-js";
import { authStorageKey, supabase } from "@/lib/supabase";
import { AuthContext, type Account } from "./auth-context";
import { forgetAccount, rememberAccount, rememberedAccount } from "./remembered-account";

// Without network, supabase-js retries the token refresh for up to about
// 30 s before getSession() answers. Start with local data after this.
const OFFLINE_START_TIMEOUT_MS = 3_000;

const toAccount = (session: Session): Account => ({
    id: session.user.id,
    email: session.user.email ?? null,
});

export function AuthProvider({ children }: { children: ReactNode }) {
    const [session, setSession] = useState<Session | null>(null);
    // Set when the stored session could not be renewed for lack of network.
    const [offlineAccount, setOfflineAccount] = useState<Account | null>(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        let active = true;
        let answered = false;

        // navigator.onLine is only a hint; getSession() below decides.
        const remembered = rememberedAccount();
        const offlineStart = remembered
            ? setTimeout(
                  () => {
                      if (!active || answered) return;
                      setOfflineAccount(remembered);
                      setLoading(false);
                  },
                  navigator.onLine ? OFFLINE_START_TIMEOUT_MS : 0,
              )
            : null;

        const stopWaiting = () => {
            answered = true;
            if (offlineStart) clearTimeout(offlineStart);
        };

        supabase.auth
            .getSession()
            .then(({ data, error }) => {
                stopWaiting();
                if (!active) return;

                if (data.session) {
                    rememberAccount(toAccount(data.session));
                    setOfflineAccount(null);
                } else if (error && isAuthRetryableFetchError(error)) {
                    // The session is still stored; supabase-js renews it once the
                    // network is back. Until then the app works with local data.
                    setOfflineAccount(remembered);
                } else {
                    if (error) console.error("Could not load auth session:", error);
                    setOfflineAccount(null);
                }

                setSession(data.session);
                setLoading(false);
            })
            .catch((err: unknown) => {
                // Unexpected (storage, a bug in the client): without an
                // answer the app would stay at "loading". Like a missing
                // network: local data of a remembered account, else login.
                stopWaiting();
                if (!active) return;
                console.error("Could not load auth session:", err);
                setOfflineAccount(remembered);
                setLoading(false);
            });

        const {
            data: { subscription },
        } = supabase.auth.onAuthStateChange((event, nextSession) => {
            setSession(nextSession);

            if (nextSession) {
                rememberAccount(toAccount(nextSession));
                setOfflineAccount(null);
            } else if (event === "SIGNED_OUT") {
                forgetAccount();
                setOfflineAccount(null);
            }

            // The initial event can precede getSession() above, which
            // decides about offline mode.
            if (event !== "INITIAL_SESSION") setLoading(false);
        });

        return () => {
            active = false;
            if (offlineStart) clearTimeout(offlineStart);
            subscription.unsubscribe();
        };
    }, []);

    // Renew the session right away when the network is back (a hint only).
    useEffect(() => {
        if (!offlineAccount) return;

        const renew = () => {
            void supabase.auth.getSession().then(({ error }) => {
                if (error && !isAuthRetryableFetchError(error)) {
                    console.error("Could not renew auth session:", error);
                }
            });
        };
        window.addEventListener("online", renew);
        return () => window.removeEventListener("online", renew);
    }, [offlineAccount]);

    async function signIn(email: string, password: string) {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
    }

    async function signUp(email: string, password: string) {
        const { data, error } = await supabase.auth.signUp({ email, password });
        if (error) throw error;
        // Without a session the address still has to be confirmed.
        return { needsConfirmation: !data.session };
    }

    async function signOut() {
        const { error } = await supabase.auth.signOut();

        if (error && !isAuthRetryableFetchError(error)) {
            throw error;
        }

        if (error) {
            // Offline: the session cannot be revoked on the server now.
            // Remove it on this device so it is not renewed later.
            localStorage.removeItem(authStorageKey);
            localStorage.removeItem(`${authStorageKey}-user`);
        }

        forgetAccount();
        setSession(null);
        setOfflineAccount(null);
    }

    const user = session ? toAccount(session) : offlineAccount;

    return (
        <AuthContext.Provider
            value={{
                session,
                user,
                offline: !session && offlineAccount !== null,
                loading,
                signIn,
                signUp,
                signOut,
            }}
        >
            {children}
        </AuthContext.Provider>
    );
}
