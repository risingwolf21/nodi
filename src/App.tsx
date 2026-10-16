import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

function App() {
  return (
    <main className="flex min-h-svh items-center justify-center bg-background p-6">
      <Card className="w-full max-w-lg">
        <CardHeader>
          <CardTitle className="text-2xl">Willkommen bei Nodi</CardTitle>
          <CardDescription>
            Dein persönlicher Workspace für Wissen, Notizen und Datenbanken.
          </CardDescription>
        </CardHeader>

        <CardContent>
          <Button onClick={() => console.log("Nodi ist bereit!")}>
            Loslegen
          </Button>
        </CardContent>
      </Card>
    </main>
  );
}

export default App;