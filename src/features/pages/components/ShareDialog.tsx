import { useEffect, useState, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { publicPageUrl } from "@/features/public/public-page";
import { pageSharing, type PageShare, type SharePermission } from "../services/page-sharing";
import type { Page } from "../types";

type ShareDialogProps = {
    page: Page;
    userId: string;
    onClose: () => void;
};

const PERMISSION_LABELS: Record<SharePermission, string> = {
    read: "Kann lesen",
    edit: "Kann bearbeiten",
};

const selectClass = "h-9 rounded-md border bg-background px-2 text-sm disabled:opacity-50 pointer-coarse:h-10";

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

function LoadFailed({ text, onRetry }: { text: string; onRetry: () => void }) {
    return (
        <div className="flex items-center justify-between gap-2">
            <p className="text-sm text-muted-foreground">{text}</p>
            <Button type="button" variant="outline" size="sm" onClick={onRetry}>
                Erneut laden
            </Button>
        </div>
    );
}

/**
 * Owner only (the server checks it too): invite by e-mail, change, revoke,
 * and publish the page with a public link.
 */
export function ShareDialog({ page, userId, onClose }: ShareDialogProps) {
    const [shares, setShares] = useState<PageShare[] | null>(null);
    // undefined while loading, null when the page is not published.
    const [publicToken, setPublicToken] = useState<string | null | undefined>(undefined);
    // A failed load is not shown as "not shared" or "no link": the owner
    // would think the page is private.
    const [sharesLoadError, setSharesLoadError] = useState("");
    const [linkLoadError, setLinkLoadError] = useState("");
    const [copied, setCopied] = useState(false);
    const [reloadCount, setReloadCount] = useState(0);
    const [linkReloadCount, setLinkReloadCount] = useState(0);
    const [email, setEmail] = useState("");
    const [permission, setPermission] = useState<SharePermission>("read");
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState("");

    useEffect(() => {
        let active = true;

        pageSharing.list(page.id).then(
            (loaded) => {
                if (!active) return;
                setShares(loaded);
                setSharesLoadError("");
            },
            (err: unknown) => {
                if (!active) return;
                setSharesLoadError(err instanceof Error ? err.message : "Die Freigaben konnten nicht geladen werden.");
            },
        );

        return () => {
            active = false;
        };
    }, [page.id, reloadCount]);

    useEffect(() => {
        let active = true;

        pageSharing.getPublicLink(page.id).then(
            (token) => {
                if (!active) return;
                setPublicToken(token);
                setLinkLoadError("");
            },
            (err: unknown) => {
                if (!active) return;
                setLinkLoadError(
                    err instanceof Error ? err.message : "Der öffentliche Link konnte nicht geladen werden.",
                );
            },
        );

        return () => {
            active = false;
        };
    }, [page.id, linkReloadCount]);

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

    async function copyLink(url: string) {
        setError("");
        try {
            await navigator.clipboard.writeText(url);
            setCopied(true);
        } catch (err) {
            console.warn("Link konnte nicht kopiert werden:", err);
            setError("Der Link konnte nicht kopiert werden. Markiere ihn und kopiere ihn von Hand.");
        }
    }

    const publicUrl = publicToken ? publicPageUrl(publicToken) : "";

    return (
        <Dialog labelledBy="share-title" onClose={onClose} busy={busy} className="max-w-md">
            <div className="space-y-1">
                <h2 id="share-title" className="truncate text-lg font-semibold">
                    „{page.title}“ teilen
                </h2>
                <p className="text-sm text-muted-foreground">
                    Gilt auch für die Unterseiten, außer für private Unterseiten.
                </p>
            </div>

            <form onSubmit={(event) => void invite(event)} className="flex flex-col gap-2 sm:flex-row">
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
                {sharesLoadError && shares === null ? (
                    <LoadFailed
                        text={sharesLoadError}
                        onRetry={() => {
                            setSharesLoadError("");
                            setReloadCount((count) => count + 1);
                        }}
                    />
                ) : shares === null ? (
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
                                    onChange={(next) => void run(() => pageSharing.share(page.id, share.email, next))}
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

            <div className="border-t pt-4">
                <h3 className="mb-1 text-sm font-medium">Öffentlicher Link</h3>
                {linkLoadError && publicToken === undefined ? (
                    <LoadFailed
                        text={linkLoadError}
                        onRetry={() => {
                            setLinkLoadError("");
                            setLinkReloadCount((count) => count + 1);
                        }}
                    />
                ) : publicToken === undefined ? (
                    <p className="text-sm text-muted-foreground">Wird geladen …</p>
                ) : publicToken === null ? (
                    <div className="flex items-center justify-between gap-2">
                        <p className="text-sm text-muted-foreground">
                            Jeder mit dem Link kann diese Seite lesen, ohne Anmeldung. Unterseiten nicht.
                        </p>
                        <Button
                            type="button"
                            variant="outline"
                            disabled={busy}
                            onClick={() =>
                                void run(async () => {
                                    setPublicToken(await pageSharing.createPublicLink(page.id, userId));
                                    setCopied(false);
                                })
                            }
                        >
                            Link erstellen
                        </Button>
                    </div>
                ) : (
                    <div className="space-y-2">
                        <div className="flex gap-2">
                            <Input
                                readOnly
                                aria-label="Öffentlicher Link"
                                value={publicUrl}
                                onFocus={(event) => event.currentTarget.select()}
                                className="min-w-0 flex-1"
                            />
                            <Button type="button" variant="outline" onClick={() => void copyLink(publicUrl)}>
                                {copied ? "Kopiert" : "Kopieren"}
                            </Button>
                        </div>
                        <div className="flex items-center justify-between gap-2">
                            <p className="text-xs text-muted-foreground">
                                Jeder mit dem Link kann diese Seite lesen. Unterseiten nicht.
                            </p>
                            <Button
                                type="button"
                                variant="ghost"
                                size="sm"
                                disabled={busy}
                                onClick={() =>
                                    void run(async () => {
                                        await pageSharing.deletePublicLink(page.id);
                                        setPublicToken(null);
                                    })
                                }
                            >
                                Link deaktivieren
                            </Button>
                        </div>
                    </div>
                )}
            </div>

            <div className="flex justify-end">
                <Button type="button" variant="outline" onClick={onClose} disabled={busy}>
                    Fertig
                </Button>
            </div>
        </Dialog>
    );
}
