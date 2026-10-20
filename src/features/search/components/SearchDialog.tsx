import { useEffect, useState, type ReactNode } from "react";
import { FileText, Search, Table2 } from "lucide-react";
import { Dialog } from "@/components/ui/dialog";
import { displayTitle } from "@/features/pages/page-display";
import { findAncestors } from "@/features/pages/page-hierarchy";
import type { Page } from "@/features/pages/types";
import { RemoteRequestError } from "@/lib/request-errors";
import { searchOnDevice, searchOnServer } from "../page-search";
import { MIN_QUERY_LENGTH, type SearchResult } from "../search-text";

// Wait for a short pause in typing before asking the server.
const TYPING_PAUSE_MS = 250;

type SearchState = { query: string; results: SearchResult[]; onDevice: boolean } | { query: string; error: string };

/** The hit in bold; the text stays text (no HTML). */
function highlight(text: string, needle: string): ReactNode {
    const index = text.toLocaleLowerCase("de").indexOf(needle.toLocaleLowerCase("de"));
    if (index === -1 || !needle) return text;
    return (
        <>
            {text.slice(0, index)}
            <mark className="rounded-sm bg-brand/20 text-inherit">{text.slice(index, index + needle.length)}</mark>
            {text.slice(index + needle.length)}
        </>
    );
}

/**
 * Search (package 27): online the server's full-text search over titles and
 * texts, offline (or when the server cannot be reached) the titles and the
 * pages stored on this device. Arrow keys choose, Enter opens.
 */
export function SearchDialog({
    knownPages,
    userId,
    offline,
    onOpen,
    onClose,
}: {
    /** Pages that can be opened: the workspace's and those shared with the user. */
    knownPages: Page[];
    userId: string;
    /** The app knows it is offline: search on the device right away. */
    offline: boolean;
    onOpen: (pageId: string) => void;
    onClose: () => void;
}) {
    const [query, setQuery] = useState("");
    const [state, setState] = useState<SearchState | null>(null);
    const [active, setActive] = useState(0);
    const needle = query.trim();

    useEffect(() => {
        if (needle.length < MIN_QUERY_LENGTH) return;
        let current = true;
        const timer = window.setTimeout(() => {
            const onDevice = () =>
                searchOnDevice(userId, needle, knownPages).then((results) => ({ results, onDevice: true }));
            const search = offline
                ? onDevice()
                : searchOnServer(needle, knownPages)
                      .then((results) => ({ results, onDevice: false }))
                      .catch((err: unknown) => {
                          // Without a connection the device answers; other errors are shown.
                          if (err instanceof RemoteRequestError && err.reason !== "permanent") return onDevice();
                          throw err;
                      });
            search
                .then((found) => {
                    if (!current) return;
                    setState({ query: needle, ...found });
                    setActive(0);
                })
                .catch((err: unknown) => {
                    console.error("Suche fehlgeschlagen:", err);
                    if (current) setState({ query: needle, error: "Die Suche hat nicht geklappt." });
                });
        }, TYPING_PAUSE_MS);
        return () => {
            current = false;
            window.clearTimeout(timer);
        };
    }, [needle, knownPages, offline, userId]);

    const shown = state && state.query === needle && needle.length >= MIN_QUERY_LENGTH ? state : null;
    const results = shown && "results" in shown ? shown.results : [];

    function open(result: SearchResult | undefined) {
        if (!result) return;
        onClose();
        onOpen(result.page.id);
    }

    return (
        <Dialog labelledBy="search-title" onClose={onClose} className="w-[min(40rem,calc(100vw-2rem))]">
            <h2 id="search-title" className="sr-only">
                Suchen
            </h2>
            <div className="flex items-center gap-2 border-b pb-2">
                <Search className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
                <input
                    autoFocus
                    value={query}
                    onChange={(event) => setQuery(event.target.value)}
                    onKeyDown={(event) => {
                        if (event.key === "ArrowDown") {
                            event.preventDefault();
                            setActive((index) => Math.min(index + 1, results.length - 1));
                        } else if (event.key === "ArrowUp") {
                            event.preventDefault();
                            setActive((index) => Math.max(index - 1, 0));
                        } else if (event.key === "Enter") {
                            event.preventDefault();
                            open(results[active]);
                        }
                    }}
                    placeholder="Seiten und Texte durchsuchen"
                    aria-label="Suchen"
                    aria-controls="search-results"
                    className="h-9 min-w-0 flex-1 bg-transparent text-base outline-none"
                />
            </div>
            <div aria-live="polite">
                {needle.length < MIN_QUERY_LENGTH ? (
                    <p className="py-4 text-sm text-muted-foreground">Mindestens zwei Zeichen eingeben.</p>
                ) : !shown ? (
                    <p className="py-4 text-sm text-muted-foreground">Sucht …</p>
                ) : "error" in shown ? (
                    <p className="py-4 text-sm text-destructive" role="alert">
                        {shown.error}
                    </p>
                ) : (
                    <>
                        {shown.onDevice && (
                            <p className="pt-2 text-xs text-muted-foreground">
                                Offline: gesucht in Titeln und auf diesem Gerät gespeicherten Seiten.
                            </p>
                        )}
                        {results.length === 0 ? (
                            <p className="py-4 text-sm text-muted-foreground">Nichts gefunden.</p>
                        ) : (
                            <ul id="search-results" className="max-h-[60svh] space-y-0.5 overflow-y-auto pt-2">
                                {results.map((result, index) => {
                                    const path = findAncestors(result.page.id, knownPages)
                                        .reverse()
                                        .map(displayTitle)
                                        .join(" / ");
                                    return (
                                        <li key={result.page.id}>
                                            <button
                                                type="button"
                                                onClick={() => open(result)}
                                                onMouseEnter={() => setActive(index)}
                                                aria-current={index === active}
                                                className="flex w-full items-start gap-2 rounded px-2 py-1.5 text-left aria-current:bg-accent"
                                            >
                                                <span
                                                    className="flex size-5 shrink-0 items-center justify-center pt-0.5"
                                                    aria-hidden="true"
                                                >
                                                    {result.page.icon ??
                                                        (result.page.kind === "database" ? (
                                                            <Table2 className="size-4 text-muted-foreground" />
                                                        ) : (
                                                            <FileText className="size-4 text-muted-foreground" />
                                                        ))}
                                                </span>
                                                <span className="min-w-0 flex-1">
                                                    <span className="block truncate text-sm font-medium">
                                                        {highlight(displayTitle(result.page), needle)}
                                                    </span>
                                                    {path && (
                                                        <span className="block truncate text-xs text-muted-foreground">
                                                            {path}
                                                        </span>
                                                    )}
                                                    {result.snippet && (
                                                        <span className="line-clamp-2 text-xs text-muted-foreground">
                                                            {highlight(result.snippet, needle)}
                                                        </span>
                                                    )}
                                                </span>
                                            </button>
                                        </li>
                                    );
                                })}
                            </ul>
                        )}
                    </>
                )}
            </div>
        </Dialog>
    );
}
