import { Fragment, lazy, Suspense, useState } from "react";
import { Check, ChevronLeft, FileText, MoreHorizontal, Table2 } from "lucide-react";
import { EditorFrame } from "@/components/editor/EditorFrame";
import { LoadErrorBoundary, LoadErrorNotice } from "@/components/LoadErrorBoundary";
import { Menu, MenuItem } from "@/components/ui/menu";
import { PageHeader } from "@/features/pages/components/PageHeader";
import { displayTitle } from "@/features/pages/page-display";
import type { Page, PageSection, PageSettings } from "@/features/pages/types";

// BlockNote makes up most of the bundle; load it only when a page is opened.
const BlockEditor = lazy(() => import("@/components/editor/BlockEditor"));
// Databases come in their own chunk, loaded with the first database or entry.
const DatabaseView = lazy(() =>
    import("@/features/databases/components/DatabaseView").then((module) => ({ default: module.DatabaseView })),
);
const PropertyBar = lazy(() =>
    import("@/features/databases/components/PropertyBar").then((module) => ({ default: module.PropertyBar })),
);

type PageViewProps = {
    page: Page;
    /** Root first. */
    ancestors: Page[];
    /** Offline: nothing about the page can be changed. */
    readOnly: boolean;
    /** Width, trash and sharing; not for pages shared from other workspaces. */
    showPageMenu: boolean;
    focusTitle: boolean;
    onBack: () => void;
    onSelect: (pageId: string) => void;
    onRename: (pageId: string, title: string) => Promise<void>;
    onUpdate: (pageId: string, settings: PageSettings) => Promise<void>;
    onArchive: (page: Page) => void;
    /** Only for the page owner. */
    onShare?: (page: Page) => void;
    /** Only for root pages of the owner. */
    onMoveSection?: (page: Page, target: PageSection) => void;
    /** "Verschieben nach …"; not for pages shared from other workspaces. */
    onMove?: (page: Page) => void;
    userId: string | undefined;
    /** For a database: its entries (subpages). */
    entries: Page[];
    /** For a database: adds an entry; undefined where that is not possible. */
    onCreateEntry?: (databaseId: string) => Promise<string>;
    /** Databases of the workspace, for new relations; undefined where that is not possible. */
    databases?: Page[];
};

function PageLabel({ page }: { page: Page }) {
    return (
        <>
            <span aria-hidden="true">
                {page.icon ??
                    (page.kind === "database" ? (
                        <Table2 className="inline size-3.5 align-[-2px] text-muted-foreground" />
                    ) : (
                        <FileText className="inline size-3.5 align-[-2px] text-muted-foreground" />
                    ))}
            </span>{" "}
            {displayTitle(page)}
        </>
    );
}

export function PageView({
    page,
    ancestors,
    readOnly,
    showPageMenu,
    focusTitle,
    onBack,
    onSelect,
    onRename,
    onUpdate,
    onArchive,
    onShare,
    onMoveSection,
    onMove,
    userId,
    entries,
    onCreateEntry,
    databases,
}: PageViewProps) {
    // The nearest ancestor is the parent: below a database the page is an entry.
    const database = ancestors.at(-1)?.kind === "database" ? ancestors.at(-1) : undefined;
    const [menuOpen, setMenuOpen] = useState(false);
    const [menuError, setMenuError] = useState("");

    function toggleFullWidth() {
        setMenuOpen(false);
        setMenuError("");
        onUpdate(page.id, { full_width: !page.full_width }).catch((err: unknown) => {
            setMenuError(err instanceof Error ? err.message : "Die Breite konnte nicht gespeichert werden.");
        });
    }

    const topBarStart = (
        <>
            <button
                type="button"
                aria-label="Zurück zur Seitenliste"
                onClick={onBack}
                className="-ml-1 flex size-9 shrink-0 items-center justify-center rounded-md hover:bg-accent md:hidden"
            >
                <ChevronLeft className="size-5" />
            </button>
            <nav aria-label="Pfad" className="flex min-w-0 items-center gap-1">
                {ancestors.map((ancestor) => (
                    <Fragment key={ancestor.id}>
                        <button
                            type="button"
                            onClick={() => onSelect(ancestor.id)}
                            className="hidden max-w-40 truncate rounded px-1 py-0.5 text-muted-foreground hover:bg-accent hover:text-foreground md:inline"
                        >
                            <PageLabel page={ancestor} />
                        </button>
                        <span className="hidden text-muted-foreground/60 md:inline" aria-hidden="true">
                            /
                        </span>
                    </Fragment>
                ))}
                <span className="truncate px-1" aria-current="page">
                    <PageLabel page={page} />
                </span>
            </nav>
        </>
    );

    const topBarEnd =
        readOnly || !showPageMenu ? null : (
            <div className="relative shrink-0">
                <button
                    type="button"
                    aria-label="Seitenmenü"
                    aria-expanded={menuOpen}
                    onClick={() => setMenuOpen((open) => !open)}
                    className="flex size-8 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground"
                >
                    <MoreHorizontal className="size-5" />
                </button>
                <Menu open={menuOpen} onClose={() => setMenuOpen(false)}>
                    {onShare && (
                        <MenuItem
                            onSelect={() => {
                                setMenuOpen(false);
                                onShare(page);
                            }}
                        >
                            Teilen
                        </MenuItem>
                    )}
                    {onMove && (
                        <MenuItem
                            onSelect={() => {
                                setMenuOpen(false);
                                onMove(page);
                            }}
                        >
                            Verschieben nach …
                        </MenuItem>
                    )}
                    {onMoveSection && (
                        <MenuItem
                            onSelect={() => {
                                setMenuOpen(false);
                                onMoveSection(page, page.visibility === "private" ? "workspace" : "private");
                            }}
                        >
                            {page.visibility === "private" ? "In den Workspace verschieben" : "In Privat verschieben"}
                        </MenuItem>
                    )}
                    <MenuItem onSelect={toggleFullWidth}>
                        <span className="flex-1">Volle Breite</span>
                        {page.full_width && <Check className="size-4 text-brand" />}
                    </MenuItem>
                    <div className="my-1 border-t" />
                    <MenuItem
                        destructive
                        onSelect={() => {
                            setMenuOpen(false);
                            onArchive(page);
                        }}
                    >
                        In den Papierkorb
                    </MenuItem>
                </Menu>
            </div>
        );

    const renderHeader = (canEdit: boolean) => (
        <>
            {menuError && (
                <p className="mb-4 px-[var(--page-gutter)] text-sm text-destructive" role="alert">
                    {menuError}
                </p>
            )}
            <PageHeader
                page={page}
                editable={canEdit && !readOnly}
                focusTitle={focusTitle}
                onRename={onRename}
                onSetIcon={(pageId, icon) => onUpdate(pageId, { icon })}
            />
            {database && (
                // Its own boundary: the editor's fallback shows this header again.
                <LoadErrorBoundary
                    key={page.id}
                    fallback={
                        <LoadErrorNotice message="Die Eigenschaften konnten nicht geladen werden. Prüfe die Internetverbindung und lade neu." />
                    }
                >
                    <Suspense fallback={null}>
                        <PropertyBar
                            entry={page}
                            databaseId={database.id}
                            userId={userId}
                            readOnly={readOnly || !canEdit}
                            databases={databases}
                        />
                    </Suspense>
                </LoadErrorBoundary>
            )}
        </>
    );

    if (page.kind === "database") {
        // A database shows its views instead of a text (no editor chunk needed).
        return (
            <EditorFrame topBarStart={topBarStart} topBarEnd={topBarEnd} fullWidth={page.full_width}>
                {renderHeader(!readOnly)}
                <LoadErrorBoundary
                    key={page.id}
                    fallback={
                        <LoadErrorNotice message="Die Datenbank konnte nicht geladen werden. Prüfe die Internetverbindung und lade neu." />
                    }
                >
                    <Suspense
                        fallback={
                            <p className="px-[var(--page-gutter)] text-sm text-muted-foreground">
                                Datenbank wird geladen …
                            </p>
                        }
                    >
                        <DatabaseView
                            database={page}
                            entries={entries}
                            userId={userId}
                            readOnly={readOnly}
                            onOpenEntry={onSelect}
                            onCreateEntry={onCreateEntry ? () => onCreateEntry(page.id) : undefined}
                            onRenameEntry={onRename}
                            databases={databases}
                        />
                    </Suspense>
                </LoadErrorBoundary>
            </EditorFrame>
        );
    }

    return (
        <LoadErrorBoundary
            key={page.id}
            fallback={
                <EditorFrame topBarStart={topBarStart} fullWidth={page.full_width}>
                    {renderHeader(false)}
                    <LoadErrorNotice message="Der Editor konnte nicht geladen werden. Prüfe die Internetverbindung und lade neu. Gespeicherte Änderungen bleiben erhalten." />
                </EditorFrame>
            }
        >
            <Suspense
                fallback={
                    <EditorFrame topBarStart={topBarStart} topBarEnd={topBarEnd} fullWidth={page.full_width}>
                        {renderHeader(false)}
                        <p className="px-[var(--page-gutter)] text-sm text-muted-foreground">Editor wird geladen …</p>
                    </EditorFrame>
                }
            >
                <BlockEditor
                    key={page.id}
                    pageId={page.id}
                    topBarStart={topBarStart}
                    topBarEnd={topBarEnd}
                    fullWidth={page.full_width}
                    renderHeader={renderHeader}
                />
            </Suspense>
        </LoadErrorBoundary>
    );
}
