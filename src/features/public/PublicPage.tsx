import { lazy, Suspense, useEffect, useState } from "react";
import { EditorFrame } from "@/components/editor/EditorFrame";
import { LoadErrorBoundary, LoadErrorNotice } from "@/components/LoadErrorBoundary";
import { RemoteRequestError } from "@/lib/request-errors";
import { fetchPublicPage, type PublicPage as PublicPageData } from "./public-page";

// BlockNote makes up most of the bundle; load it only for the content.
const PublicDocument = lazy(() => import("./PublicDocument"));

const INVALID_LINK = "Dieser Link ist ungültig oder wurde deaktiviert.";

type LoadState =
    | { kind: "loading" }
    | { kind: "loaded"; page: PublicPageData }
    | { kind: "error"; message: string };

function errorMessage(error: unknown): string {
    if (error instanceof RemoteRequestError && error.reason === "offline") {
        return "Keine Internetverbindung. Öffentliche Seiten werden nicht auf dem Gerät gespeichert.";
    }
    return "Die Seite konnte nicht geladen werden. Bitte versuche es später erneut.";
}

/** A published page, readable without signing in (`…/nodi/?p=<token>`). */
export function PublicPage({ token }: { token: string }) {
    const [state, setState] = useState<LoadState>(
        token ? { kind: "loading" } : { kind: "error", message: INVALID_LINK },
    );

    useEffect(() => {
        if (!token) return;
        let active = true;

        fetchPublicPage(token).then(
            (page) => {
                if (!active) return;
                setState(page ? { kind: "loaded", page } : { kind: "error", message: INVALID_LINK });
            },
            (error: unknown) => {
                console.error("Öffentliche Seite konnte nicht geladen werden:", error);
                if (active) setState({ kind: "error", message: errorMessage(error) });
            },
        );

        return () => {
            active = false;
        };
    }, [token]);

    const title = state.kind === "loaded" ? state.page.title : "";
    useEffect(() => {
        if (title) document.title = `${title} – nodi`;
    }, [title]);

    const topBarStart = (
        <a href={import.meta.env.BASE_URL} className="flex items-center gap-2 rounded-md px-1 py-0.5 hover:bg-accent">
            <img src={`${import.meta.env.BASE_URL}favicon.svg`} alt="" className="size-5 rounded" />
            <span className="font-semibold">nodi</span>
        </a>
    );

    return (
        <main className="h-svh bg-background">
            <EditorFrame
                topBarStart={topBarStart}
                status={state.kind === "loaded" ? "Öffentliche Seite · nur lesen" : undefined}
                fullWidth={state.kind === "loaded" && state.page.fullWidth}
            >
                {state.kind === "loading" && (
                    <p className="px-[var(--page-gutter)] text-sm text-muted-foreground">Seite wird geladen …</p>
                )}
                {state.kind === "error" && (
                    <p className="px-[var(--page-gutter)] text-sm text-destructive" role="alert">
                        {state.message}
                    </p>
                )}
                {state.kind === "loaded" && (
                    <>
                        <header className="mb-2 px-[var(--page-gutter)]">
                            {state.page.icon && (
                                <p className="mb-2 px-1 text-6xl leading-none" aria-hidden="true">
                                    {state.page.icon}
                                </p>
                            )}
                            <h1 className="text-3xl font-bold leading-tight md:text-4xl">
                                {state.page.title}
                            </h1>
                        </header>
                        <LoadErrorBoundary
                            fallback={
                                <LoadErrorNotice message="Der Inhalt konnte nicht geladen werden. Prüfe die Internetverbindung und lade neu." />
                            }
                        >
                            <Suspense
                                fallback={
                                    <p className="px-[var(--page-gutter)] text-sm text-muted-foreground">
                                        Inhalt wird geladen …
                                    </p>
                                }
                            >
                                <PublicDocument content={state.page.document} />
                            </Suspense>
                        </LoadErrorBoundary>
                    </>
                )}
            </EditorFrame>
        </main>
    );
}
