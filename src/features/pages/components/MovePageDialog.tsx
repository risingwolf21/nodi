import { useState } from "react";
import { FileText, Lock, Table2, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { displayTitle } from "../page-display";
import {
    findAncestors,
    isDatabaseEntry,
    moveProblem,
    withoutDatabaseEntries,
    type MoveTarget,
} from "../page-hierarchy";
import type { Page, PageSection } from "../types";

type MovePageDialogProps = {
    page: Page;
    /** Active pages of the workspace (entries included). */
    pages: Page[];
    userId: string | undefined;
    /** Given when the target is already chosen (dragged to another section): only the question. */
    target?: MoveTarget;
    onMove: (pageId: string, target: MoveTarget) => Promise<void>;
    onClose: () => void;
};

const SECTION_LABELS: Record<PageSection, string> = { workspace: "Workspace", private: "Privat" };
// More hits than this: the search narrows them down.
const MAX_RESULTS = 50;

function sectionOf(target: MoveTarget, pages: Page[]): PageSection | undefined {
    return "section" in target ? target.section : pages.find((item) => item.id === target.parentId)?.visibility;
}

/** "Verschieben nach …" like Notion: pick a page, a database or the top of a section. */
export function MovePageDialog({ page, pages, userId, target, onMove, onClose }: MovePageDialogProps) {
    const [query, setQuery] = useState("");
    const [pending, setPending] = useState<MoveTarget | null>(target ?? null);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState("");

    const isEntry = isDatabaseEntry(page.id, pages);
    const needle = query.trim().toLocaleLowerCase("de");
    const candidates = withoutDatabaseEntries(pages)
        .filter((item) => item.id !== page.id && displayTitle(item).toLocaleLowerCase("de").includes(needle))
        .slice(0, MAX_RESULTS);
    const sections = (["workspace", "private"] as const).filter((section) =>
        SECTION_LABELS[section].toLocaleLowerCase("de").includes(needle),
    );

    async function move(chosen: MoveTarget) {
        setBusy(true);
        setError("");
        try {
            await onMove(page.id, chosen);
            onClose();
        } catch (err) {
            setError(err instanceof Error ? err.message : "Die Seite konnte nicht verschoben werden.");
            setBusy(false);
        }
    }

    function choose(chosen: MoveTarget) {
        // Another section concerns the whole subtree and other people: ask first.
        if (sectionOf(chosen, pages) !== page.visibility) setPending(chosen);
        else void move(chosen);
    }

    const pendingSection = pending ? sectionOf(pending, pages) : undefined;
    const pendingTitle = pending
        ? "section" in pending
            ? SECTION_LABELS[pending.section]
            : displayTitle(pages.find((item) => item.id === pending.parentId) ?? { title: "" })
        : "";

    return (
        <Dialog labelledBy="move-page-title" onClose={onClose} busy={busy} className="w-[min(32rem,calc(100vw-2rem))]">
            <h2 id="move-page-title" className="text-lg font-semibold">
                „{displayTitle(page)}“ verschieben nach …
            </h2>

            {pending ? (
                <div className="space-y-3 text-sm">
                    <p>
                        Nach „{pendingTitle}“ ({pendingSection === "workspace" ? "Workspace" : "Privat"}) verschieben?
                    </p>
                    <p className="text-muted-foreground">
                        {pendingSection === "workspace"
                            ? "Die Seite und alle Unterseiten werden für alle Mitglieder dieses Workspace sichtbar und bearbeitbar."
                            : "Die Seite und alle Unterseiten sieht danach nur noch du (und wem die neue Elternseite freigegeben ist). Andere Mitglieder verlieren den Zugriff. Ihre geteilten Unterseiten gehen an dich, ihre privaten Unterseiten bleiben bei ihnen."}
                    </p>
                </div>
            ) : (
                <>
                    <input
                        autoFocus
                        value={query}
                        onChange={(event) => setQuery(event.target.value)}
                        placeholder="Seite oder Datenbank suchen"
                        aria-label="Ziel suchen"
                        className="h-9 w-full rounded-md border bg-transparent px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
                    />
                    {isEntry && (
                        <p className="text-xs text-muted-foreground">
                            Außerhalb ihrer Datenbank verliert die Seite ihre Eigenschaften und Verknüpfungen.
                        </p>
                    )}
                    <ul className="max-h-80 space-y-0.5 overflow-y-auto" aria-label="Ziele">
                        {sections.map((section) => (
                            <TargetButton
                                key={section}
                                label={`${SECTION_LABELS[section]} (oberste Ebene)`}
                                icon={section === "workspace" ? Users : Lock}
                                problem={moveProblem(page, { section }, pages, userId)}
                                onChoose={() => choose({ section })}
                            />
                        ))}
                        {candidates.map((item) => (
                            <TargetButton
                                key={item.id}
                                label={displayTitle(item)}
                                emoji={item.icon}
                                icon={item.kind === "database" ? Table2 : FileText}
                                // Root first.
                                path={findAncestors(item.id, pages)
                                    .reverse()
                                    .map((ancestor) => displayTitle(ancestor))
                                    .join(" / ")}
                                problem={moveProblem(page, { parentId: item.id }, pages, userId)}
                                onChoose={() => choose({ parentId: item.id })}
                            />
                        ))}
                        {sections.length === 0 && candidates.length === 0 && (
                            <li className="px-2 py-1 text-sm text-muted-foreground">Nichts gefunden.</li>
                        )}
                    </ul>
                </>
            )}

            {error && (
                <p role="alert" className="text-sm text-destructive">
                    {error}
                </p>
            )}

            <div className="flex justify-end gap-2">
                <Button type="button" variant="outline" onClick={onClose} disabled={busy}>
                    Abbrechen
                </Button>
                {pending && (
                    <Button type="button" onClick={() => void move(pending)} disabled={busy}>
                        {busy ? "Verschiebt …" : "Verschieben"}
                    </Button>
                )}
            </div>
        </Dialog>
    );
}

function TargetButton({
    label,
    emoji,
    icon: Icon,
    path,
    problem,
    onChoose,
}: {
    label: string;
    emoji?: string | null;
    icon: typeof FileText;
    path?: string;
    /** Why this target does not work; the button is disabled then. */
    problem: string | null;
    onChoose: () => void;
}) {
    return (
        <li>
            <button
                type="button"
                disabled={problem !== null}
                title={problem ?? undefined}
                onClick={onChoose}
                className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-sm hover:bg-accent disabled:opacity-50 disabled:hover:bg-transparent pointer-coarse:py-2.5"
            >
                <span className="flex size-5 shrink-0 items-center justify-center" aria-hidden="true">
                    {emoji ?? <Icon className="size-4 text-muted-foreground" />}
                </span>
                <span className="min-w-0 flex-1">
                    <span className="block truncate">{label}</span>
                    {path && <span className="block truncate text-xs text-muted-foreground">{path}</span>}
                </span>
                {problem && <span className="sr-only">{problem}</span>}
            </button>
        </li>
    );
}
