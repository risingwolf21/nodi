import { useEffect, useState, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { workspaceMembers, type WorkspaceMember } from "../services/workspace-members";

type MembersDialogProps = {
    workspaceId: string;
    workspaceName: string;
    userId: string;
    onClose: () => void;
    /** After leaving: the workspace is gone for this user. */
    onLeft: () => void;
};

const ROLE_LABELS: Record<WorkspaceMember["role"], string> = {
    owner: "Owner",
    admin: "Admin",
    member: "Mitglied",
};

/**
 * Members of a workspace. The owner invites by e-mail and removes; members
 * can leave. Rights are checked by the server (package 12a).
 */
export function MembersDialog({ workspaceId, workspaceName, userId, onClose, onLeft }: MembersDialogProps) {
    const [members, setMembers] = useState<WorkspaceMember[] | null>(null);
    const [reloadCount, setReloadCount] = useState(0);
    const [email, setEmail] = useState("");
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState("");
    // Asked once more before something that takes access away.
    const [confirmRemove, setConfirmRemove] = useState<string | null>(null);
    const [confirmLeave, setConfirmLeave] = useState(false);

    useEffect(() => {
        let active = true;

        workspaceMembers.list(workspaceId).then(
            (loaded) => {
                if (active) setMembers(loaded);
            },
            (err: unknown) => {
                // members stays unknown: no owner or member actions on a guess.
                if (active) setError(err instanceof Error ? err.message : "Die Mitglieder konnten nicht geladen werden.");
            },
        );

        return () => {
            active = false;
        };
    }, [workspaceId, reloadCount]);

    const isOwner = members?.some((member) => member.userId === userId && member.role === "owner") ?? false;

    async function run(action: () => Promise<void>): Promise<boolean> {
        setBusy(true);
        setError("");
        try {
            await action();
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

        if (await run(() => workspaceMembers.add(workspaceId, address))) {
            setEmail("");
            setReloadCount((count) => count + 1);
        }
    }

    async function remove(memberId: string) {
        if (await run(() => workspaceMembers.remove(workspaceId, memberId))) {
            setConfirmRemove(null);
            setReloadCount((count) => count + 1);
        }
    }

    async function leave() {
        if (await run(() => workspaceMembers.leave(workspaceId))) onLeft();
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
                aria-labelledby="members-title"
                className="w-full max-w-md space-y-4 rounded-lg border bg-background p-5 shadow-lg"
            >
                <div className="space-y-1">
                    <h2 id="members-title" className="truncate text-lg font-semibold">
                        Mitglieder von „{workspaceName}“
                    </h2>
                    <p className="text-sm text-muted-foreground">
                        Mitglieder sehen und bearbeiten alle Seiten im Bereich „Workspace“. Private Seiten
                        sieht nur, wem sie gehören.
                    </p>
                </div>

                {isOwner && (
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
                        <Button type="submit" disabled={busy}>
                            Hinzufügen
                        </Button>
                    </form>
                )}

                {error && (
                    <p role="alert" className="text-sm text-destructive">
                        {error}
                    </p>
                )}

                {members === null ? (
                    error ? (
                        <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            onClick={() => {
                                setError("");
                                setReloadCount((count) => count + 1);
                            }}
                        >
                            Erneut laden
                        </Button>
                    ) : (
                        <p className="text-sm text-muted-foreground">Wird geladen …</p>
                    )
                ) : (
                    <ul className="divide-y">
                        {members.map((member) => (
                            <li key={member.userId} className="flex flex-wrap items-center gap-2 py-2">
                                <span className="min-w-0 basis-full truncate text-sm sm:basis-0 sm:flex-1">
                                    {member.email}
                                    {member.userId === userId && (
                                        <span className="text-muted-foreground"> (du)</span>
                                    )}
                                </span>
                                <span className="text-xs text-muted-foreground">{ROLE_LABELS[member.role]}</span>
                                {isOwner && member.role !== "owner" && (
                                    confirmRemove === member.userId ? (
                                        <Button
                                            type="button"
                                            variant="destructive"
                                            size="sm"
                                            disabled={busy}
                                            onClick={() => void remove(member.userId)}
                                        >
                                            Wirklich entfernen
                                        </Button>
                                    ) : (
                                        <Button
                                            type="button"
                                            variant="ghost"
                                            size="sm"
                                            disabled={busy}
                                            aria-label={`${member.email} entfernen`}
                                            onClick={() => setConfirmRemove(member.userId)}
                                        >
                                            Entfernen
                                        </Button>
                                    )
                                )}
                            </li>
                        ))}
                    </ul>
                )}

                {confirmRemove && (
                    <p className="text-xs text-muted-foreground">
                        Geteilte Seiten dieser Person gehen an dich, ihre Freigaben und öffentlichen Links
                        darauf enden. Ihre privaten Seiten bleiben erhalten, sind aber nicht mehr sichtbar.
                    </p>
                )}

                {members !== null && !isOwner && (
                    <div className="space-y-2 border-t pt-4">
                        {confirmLeave ? (
                            <>
                                <p className="text-sm text-muted-foreground">
                                    Deine Seiten im Bereich „Workspace“ gehen an den Owner, deine Freigaben und
                                    öffentlichen Links darauf enden. Deine privaten Seiten
                                    bleiben erhalten, du siehst sie aber erst wieder, wenn du erneut hinzugefügt
                                    wirst.
                                </p>
                                <div className="flex justify-end gap-2">
                                    <Button
                                        type="button"
                                        variant="outline"
                                        disabled={busy}
                                        onClick={() => setConfirmLeave(false)}
                                    >
                                        Abbrechen
                                    </Button>
                                    <Button
                                        type="button"
                                        variant="destructive"
                                        disabled={busy}
                                        onClick={() => void leave()}
                                    >
                                        Workspace verlassen
                                    </Button>
                                </div>
                            </>
                        ) : (
                            <Button type="button" variant="ghost" disabled={busy} onClick={() => setConfirmLeave(true)}>
                                Workspace verlassen …
                            </Button>
                        )}
                    </div>
                )}

                <div className="flex justify-end">
                    <Button type="button" variant="outline" onClick={onClose} disabled={busy}>
                        Fertig
                    </Button>
                </div>
            </section>
        </div>
    );
}
