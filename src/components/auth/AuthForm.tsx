
import { useState, type FormEvent } from "react";
import { supabase } from "@/lib/supabase";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";

type AuthMode = "login" | "signup";

export function AuthForm() {
  const [mode, setMode] = useState<AuthMode>("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setMessage("");
    setSubmitting(true);

    try {
      if (mode === "login") {
        const { error } = await supabase.auth.signInWithPassword({
          email,
          password,
        });
        if (error) throw error;
      } else {
        const { data, error } = await supabase.auth.signUp({
          email,
          password,
        });
        if (error) throw error;

        if (!data.session) {
          setMessage(
            "Dein Konto wurde angelegt. Bitte bestätige gegebenenfalls deine E-Mail-Adresse.",
          );
        }
      }
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Es ist ein unerwarteter Fehler aufgetreten.",
      );
    } finally {
      setSubmitting(false);
    }
  }

  const isLogin = mode === "login";

  return (
    <Card className="w-full max-w-md">
      <CardHeader>
        <div className="mb-2 flex size-11 items-center justify-center rounded-xl bg-primary text-lg font-semibold text-primary-foreground">
          N
        </div>
        <CardTitle className="text-2xl">
          {isLogin ? "Willkommen zurück" : "Nodi-Konto erstellen"}
        </CardTitle>
        <CardDescription>
          {isLogin
            ? "Melde dich an, um deinen Workspace zu öffnen."
            : "Erstelle dein Konto und starte mit deinem persönlichen Workspace."}
        </CardDescription>
      </CardHeader>

      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="email">E-Mail-Adresse</Label>
            <Input
              id="email"
              type="email"
              autoComplete="email"
              placeholder="du@beispiel.de"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              required
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="password">Passwort</Label>
            <Input
              id="password"
              type="password"
              autoComplete={isLogin ? "current-password" : "new-password"}
              placeholder="Mindestens 8 Zeichen"
              minLength={8}
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              required
            />
          </div>

          {error && (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          )}
          {message && (
            <p role="status" className="text-sm text-muted-foreground">
              {message}
            </p>
          )}

          <Button type="submit" className="w-full" disabled={submitting}>
            {submitting
              ? "Einen Moment …"
              : isLogin
                ? "Anmelden"
                : "Konto erstellen"}
          </Button>
        </form>

        <div className="my-5">
          <Separator />
        </div>

        <p className="text-center text-sm text-muted-foreground">
          {isLogin ? "Noch kein Konto?" : "Bereits ein Konto?"}{" "}
          <button
            type="button"
            className="font-medium text-foreground underline-offset-4 hover:underline"
            onClick={() => {
              setMode(isLogin ? "signup" : "login");
              setError("");
              setMessage("");
            }}
          >
            {isLogin ? "Registrieren" : "Anmelden"}
          </button>
        </p>
      </CardContent>
    </Card>
  );
}
