
import { useAuth } from "@/lib/auth-context";
import { AuthForm } from "@/components/auth/AuthForm";
import WorkspaceHome from "@/components/workspace/WorkspaceHome";

export default function App() {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <main className="flex min-h-svh items-center justify-center">
        <p className="text-sm text-muted-foreground">Nodi wird geladen …</p>
      </main>
    );
  }

  if (user) {
    return <WorkspaceHome />;
  }

  return (
    <main className="flex min-h-svh items-center justify-center bg-background p-6">
      <AuthForm />
    </main>
  );
}
