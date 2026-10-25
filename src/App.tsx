import { useState } from "react";
import { useAuth } from "@/lib/use-auth";
import { AuthForm } from "@/components/auth/AuthForm";
import { NewPasswordForm } from "@/components/auth/NewPasswordForm";
import WorkspaceHome from "@/components/workspace/WorkspaceHome";

export default function App() {
    const { user, loading, passwordRecovery } = useAuth();
    const [recoverySkipped, setRecoverySkipped] = useState(false);

    if (loading) {
        return (
            <main className="flex min-h-svh items-center justify-center">
                <p className="text-sm text-muted-foreground">Nodi wird geladen …</p>
            </main>
        );
    }

    if (user && passwordRecovery && !recoverySkipped) {
        return (
            <main className="flex min-h-svh items-center justify-center bg-background p-6">
                <NewPasswordForm onSkip={() => setRecoverySkipped(true)} />
            </main>
        );
    }

    if (user) {
        // A new account starts from scratch, without state of the previous one.
        return <WorkspaceHome key={user.id} />;
    }

    return (
        <main className="flex min-h-svh items-center justify-center bg-background p-6">
            <AuthForm />
        </main>
    );
}
