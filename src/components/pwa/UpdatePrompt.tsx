import { useRegisterSW } from "virtual:pwa-register/react";
import { Button } from "@/components/ui/button";

// Installed apps (especially on iOS) are rarely reloaded, so the browser's
// own update check on navigation would almost never run.
const UPDATE_CHECK_INTERVAL_MS = 60 * 60 * 1000;

export function UpdatePrompt() {
    const {
        needRefresh: [needRefresh, setNeedRefresh],
        updateServiceWorker,
    } = useRegisterSW({
        onRegisteredSW(_swUrl, registration) {
            if (!registration) return;

            setInterval(() => {
                if (!navigator.onLine) return;

                registration.update().catch((error: unknown) => {
                    console.warn("Service-Worker-Update-Prüfung fehlgeschlagen:", error);
                });
            }, UPDATE_CHECK_INTERVAL_MS);
        },
        onRegisterError(error: unknown) {
            console.error("Service Worker konnte nicht registriert werden:", error);
        },
    });

    if (!needRefresh) return null;

    return (
        <div
            role="status"
            aria-live="polite"
            className="fixed inset-x-4 bottom-4 z-50 mx-auto flex max-w-md items-center gap-3 rounded-lg border bg-background p-4 shadow-lg"
        >
            <p className="flex-1 text-sm">
                Eine neue Version von nodi ist verfügbar. Beim Neuladen gehen
                Änderungen verloren, die noch nicht gespeichert sind.
            </p>

            <Button variant="outline" size="sm" onClick={() => setNeedRefresh(false)}>
                Später
            </Button>
            <Button size="sm" onClick={() => void updateServiceWorker(true)}>
                Neu laden
            </Button>
        </div>
    );
}
