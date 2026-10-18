import type { Account } from "./auth-context";

// Only id and email, no tokens: enough to open the account's local data
// when the session cannot be renewed offline.
const ACCOUNT_KEY = "nodi-account";

export function rememberAccount(account: Account): void {
    localStorage.setItem(ACCOUNT_KEY, JSON.stringify(account));
}

export function forgetAccount(): void {
    localStorage.removeItem(ACCOUNT_KEY);
}

export function rememberedAccount(): Account | null {
    const stored = localStorage.getItem(ACCOUNT_KEY);
    if (!stored) return null;

    try {
        const value: unknown = JSON.parse(stored);
        if (
            typeof value === "object" &&
            value !== null &&
            "id" in value &&
            "email" in value &&
            typeof value.id === "string" &&
            (value.email === null || typeof value.email === "string")
        ) {
            return { id: value.id, email: value.email };
        }
    } catch (error) {
        console.warn("Gemerktes Konto ist ungültig:", error);
    }
    return null;
}
