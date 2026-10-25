import { useState, type FormEvent } from "react";
import { useAuth } from "@/lib/use-auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

/** After the link from "Passwort vergessen?" (package 33b): the new password comes first. */
export function NewPasswordForm({ onSkip }: { onSkip: () => void }) {
    const { updatePassword } = useAuth();
    const [password, setPassword] = useState("");
    const [error, setError] = useState("");
    const [saving, setSaving] = useState(false);

    async function handleSubmit(event: FormEvent<HTMLFormElement>) {
        event.preventDefault();
        setError("");
        setSaving(true);
        try {
            await updatePassword(password);
        } catch (err) {
            setError(err instanceof Error ? err.message : "Das Passwort konnte nicht gespeichert werden.");
            setSaving(false);
        }
    }

    return (
        <Card className="w-full max-w-md">
            <CardHeader>
                <CardTitle className="text-2xl">Neues Passwort festlegen</CardTitle>
                <CardDescription>Danach meldest du dich mit diesem Passwort an.</CardDescription>
            </CardHeader>
            <CardContent>
                <form onSubmit={(event) => void handleSubmit(event)} className="space-y-4">
                    <div className="space-y-2">
                        <Label htmlFor="new-password">Neues Passwort</Label>
                        <Input
                            id="new-password"
                            type="password"
                            autoComplete="new-password"
                            placeholder="Mindestens 8 Zeichen"
                            minLength={8}
                            value={password}
                            onChange={(event) => setPassword(event.target.value)}
                            required
                            autoFocus
                        />
                    </div>
                    {error && (
                        <p role="alert" className="text-sm text-destructive">
                            {error}
                        </p>
                    )}
                    <Button type="submit" className="w-full" disabled={saving}>
                        {saving ? "Einen Moment …" : "Passwort speichern"}
                    </Button>
                    <Button type="button" variant="ghost" className="w-full" onClick={onSkip} disabled={saving}>
                        Später
                    </Button>
                </form>
            </CardContent>
        </Card>
    );
}
