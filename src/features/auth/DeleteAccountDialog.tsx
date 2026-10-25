import { useState, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type DeleteAccountDialogProps = {
    /** Without a server session the account cannot be deleted. */
    offline: boolean;
    onCancel: () => void;
    onDelete: (password: string) => Promise<void>;
};

/** Deleting the own account (package 33): what happens, then the password to confirm. */
export function DeleteAccountDialog({ offline, onCancel, onDelete }: DeleteAccountDialogProps) {
    const [password, setPassword] = useState("");
    const [deleting, setDeleting] = useState(false);
    const [error, setError] = useState("");

    async function handleSubmit(event: FormEvent<HTMLFormElement>) {
        event.preventDefault();
        setDeleting(true);
        setError("");
        try {
            await onDelete(password);
        } catch (err) {
            setError(err instanceof Error ? err.message : "Das Konto konnte nicht gelöscht werden.");
            setDeleting(false);
        }
    }

    return (
        <Dialog
            role="alertdialog"
            labelledBy="delete-account-title"
            describedBy="delete-account-description"
            onClose={onCancel}
            busy={deleting}
        >
            <h2 id="delete-account-title" className="text-lg font-semibold">
                Konto löschen
            </h2>
            <div id="delete-account-description" className="space-y-2 text-sm text-muted-foreground">
                <p>Das lässt sich nicht rückgängig machen.</p>
                <ul className="list-disc space-y-1 pl-5">
                    <li>Deine privaten Seiten werden gelöscht, auch auf diesem Gerät.</li>
                    <li>Seiten im Bereich „Workspace“ bleiben für die anderen Mitglieder erhalten.</li>
                    <li>
                        Deine Workspaces mit anderen Mitgliedern gehen an das Mitglied, das am längsten dabei ist; ohne
                        andere Mitglieder werden sie gelöscht.
                    </li>
                    <li>Noch nicht synchronisierte Änderungen gehen verloren.</li>
                </ul>
            </div>
            <form onSubmit={(event) => void handleSubmit(event)} className="space-y-3">
                <div className="space-y-2">
                    <Label htmlFor="delete-account-password">Zur Bestätigung dein Passwort</Label>
                    <Input
                        id="delete-account-password"
                        type="password"
                        autoComplete="current-password"
                        value={password}
                        onChange={(event) => setPassword(event.target.value)}
                        disabled={offline}
                        required
                    />
                </div>
                {offline && (
                    <p className="text-sm text-muted-foreground">
                        Zum Löschen des Kontos ist eine Internetverbindung nötig.
                    </p>
                )}
                {error && (
                    <p role="alert" className="text-sm text-destructive">
                        {error}
                    </p>
                )}
                <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
                    <Button type="button" variant="outline" onClick={onCancel} disabled={deleting} autoFocus>
                        Abbrechen
                    </Button>
                    <Button type="submit" variant="destructive" disabled={deleting || offline || !password}>
                        {deleting ? "Wird gelöscht …" : "Konto endgültig löschen"}
                    </Button>
                </div>
            </form>
        </Dialog>
    );
}
