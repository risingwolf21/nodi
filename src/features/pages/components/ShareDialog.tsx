import { useEffect, useState, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { pageSharing, type PageShare, type SharePermission } from "../services/page-sharing";
import type { Page } from "../types";

type ShareDialogProps = {
    page: Page;
    onClose: () => void;
};

const PERMISSION_LABELS: Record<SharePermission, string> = {
    read: "Kann lesen",
    edit: "Kann bearbeiten",
};

const selectClass =
    "h-9 rounded-md border bg-background px-2 text-sm disabled:opacity-50 pointer-coarse:h-10";

function PermissionSelect({
    value,
    disabled,
    label,
    onChange,
}: {
    value: SharePermission;
    disabled: boolean;
    label: string;
    onChange: (permission: SharePermission) => void;
}) {
    return (
        <select
            aria-label={label}
            className={selectClass}
            value={value}
            disabled={disabled}
            onChange={(event) => onChange(event.target.value === "edit" ? "edit" : "read")}
        >
            <option value="read">{PERMISSION_LABELS.read}</option>
            <option value="edit">{PERMISSION_LABELS.edit}</option>
        </select>
    );
}

/** Owner only (the server checks it too): invite by e-mail, change, revoke. */
export function ShareDialog({ page, onClose }: ShareDialogProps) {
    const [shares, setShares] = useState<PageShare[] | null>(null);
    const [reloadCount, setReloadCount] = useState(0);
    const [email, setEmail] = useState("");
    const [permission, setPermission] = useState<SharePermission>("read");
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState("");

    useEffect(() => {
        let active = true;

        pageSharing.list(page.id).then(
            (loaded) => {
                if (active) setShares(loaded);
            },
            (err: unknown) => {
                if (active) {
                    setShares([]);
                    setError(err instanceof Error ? err.message : "Die Freigaben konnten nicht geladen werden.");
                }
            },
        );

        return () => {
            active = false;
        };
    }, [page.id, reloadCount]);

    async function run(action: () => Promise<void>): Promise<boolean> {
        setBusy(true);
        setError("");
        try {
            await action();
            setReloadCount((count) => count + 1);
            return true;
        } catch (err) {
            setError(err instanceof Error ? err.message : "Das hat nicht geklappt.");
            return false;
        } finally {
            setBusy(false);
        }
    }

    async function invite(event: FormEvent<HTMLFormElement>) {
        event.preventDefault();
        const address = email.trim();
        if (!address) return;

        if (await run(() => pageSharing.share(page.id, address, permission))) setEmail("");
    }

    return (
        <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
            onMouseDown={(event) => {
                if (event.target === event.currentTarget && !busy) onClose();
            }}
        >
            <section
                role="dialog"
                aria-modal="true"
                aria-labelledby="share-title"
                className="w-full max-w-md space-y-4 rounded-lg border bg-background p-5 shadow-lg"
            >
                <div className="space-y-1">
                    <h2 id="share-title" className="truncate text-lg font-semibold">
                        „{page.title}“ teilen
                    </h2>
                    <p className="text-sm text-muted-foreground">
                        Gilt auch für die Unterseiten, außer für private Unterseiten.
                    </p>
                </div>

                <form onSubmit={invite} className="flex flex-col gap-2 sm:flex-row">
                    <Input
                        type="email"
                        aria-label="E-Mail-Adresse"
                        placeholder="E-Mail-Adresse"
                        value={email}
                        onChange={(event) => setEmail(event.target.value)}
                        disabled={busy}
                        autoFocus
                        required
                        className="min-w-0 flex-1"
                    />
                    <div className="flex gap-2">
                        <PermissionSelect
                            label="Rolle für die Einladung"
                            value={permission}
                            disabled={busy}
                            onChange={setPermission}
                        />
                        <Button type="submit" disabled={busy}>
                            Einladen
                        </Button>
                    </div>
                </form>

                {error && (
                    <p role="alert" className="text-sm text-destructive">
                        {error}
                    </p>
                )}

                <div>
                    <h3 className="mb-1 text-sm font-medium">Zugriff</h3>
                    {shares === null ? (
                        <p className="text-sm text-muted-foreground">Wird geladen …</p>
                    ) : shares.length === 0 ? (
                        <p className="text-sm text-muted-foreground">Noch mit niemandem geteilt.</p>
                    ) : (
                        <ul className="divide-y">
                            {shares.map((share) => (
                                <li key={share.userId} className="flex flex-wrap items-center gap-2 py-2">
                                    <span className="min-w-0 basis-full truncate text-sm sm:basis-0 sm:flex-1">
                                        {share.email}
                                    </span>
                                    <PermissionSelect
                                        label={`Rolle von ${share.email}`}
                                        value={share.permission}
                                        disabled={busy}
                                        onChange={(next) =>
                                            void run(() => pageSharing.share(page.id, share.email, next))
                                        }
                                    />
                                    <Button
                                        type="button"
                                        variant="ghost"
                                        size="sm"
                                        disabled={busy}
                                        aria-label={`Zugriff von ${share.email} entfernen`}
                                        onClick={() => void run(() => pageSharing.revoke(page.id, share.userId))}
                                    >
                                        Entfernen
                                    </Button>
                                </li>
                            ))}
                        </ul>
                    )}
                </div>

                <div className="flex justify-end">
                    <Button type="button" variant="outline" onClick={onClose} disabled={busy}>
                        Fertig
                    </Button>
                </div>
            </section>
        </div>
    );
}
