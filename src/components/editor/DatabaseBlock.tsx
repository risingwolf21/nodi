import { lazy, Suspense, useContext } from "react";
import { LoadErrorBoundary } from "@/components/LoadErrorBoundary";
import { DatabaseBlockContext } from "./database-block-context";

// Databases come in their own chunk, loaded with the first database block.
const DatabaseBlockContent = lazy(() =>
    import("@/features/databases/components/DatabaseBlockContent").then((module) => ({
        default: module.DatabaseBlockContent,
    })),
);

function Note({ text, alert = false }: { text: string; alert?: boolean }) {
    return (
        <p
            className={alert ? "text-sm text-destructive" : "text-sm text-muted-foreground"}
            role={alert ? "alert" : undefined}
        >
            {text}
        </p>
    );
}

/** Content of a "Datenbank" block; see `editor-schema.tsx`. */
export function DatabaseBlock({
    blockId,
    databaseId,
    onChoose,
}: {
    blockId: string;
    databaseId: string;
    onChoose: (databaseId: string) => void;
}) {
    const context = useContext(DatabaseBlockContext);
    // The public view shows no databases (their entries are not published).
    if (!context) return <Note text="Hier steht eine Datenbank. Über den öffentlichen Link ist sie nicht sichtbar." />;

    return (
        <LoadErrorBoundary
            key={databaseId}
            fallback={
                <Note
                    alert
                    text="Die Datenbank konnte nicht geladen werden. Prüfe die Internetverbindung und lade neu."
                />
            }
        >
            <Suspense fallback={<Note text="Datenbank wird geladen …" />}>
                <DatabaseBlockContent context={context} blockId={blockId} databaseId={databaseId} onChoose={onChoose} />
            </Suspense>
        </LoadErrorBoundary>
    );
}
