
import { lazy, Suspense, useEffect, useState, type FormEvent } from "react";
import { useAuth } from "@/lib/use-auth";
import { Menu, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { cn } from "@/lib/utils";
import { PageActionsDialog, type PageActionMode } from "@/features/pages/components/PageActionsDialog";
import type { Page } from "@/features/pages/types";
import { PageTree } from "@/features/pages/PageTree";
import { CreatePageForm } from "@/features/pages/CreatePageForm";
import { usePages } from "@/features/pages/hooks/usePages";
import { useWorkspaces } from "@/features/pages/hooks/useWorkspaces";
import { TrashView } from "@/features/pages/components/TrashView";
import { syncEngineFor } from "@/features/editor/services/account-sync";
import { SyncStatusIndicator } from "@/features/editor/components/SyncStatusIndicator";
import { SignOutDialog } from "@/features/auth/SignOutDialog";
import { signOutAndDeleteLocalData, syncBeforeSignOut } from "@/features/auth/sign-out";

// BlockNote makes up most of the bundle; load it only when a page is opened.
const BlockEditor = lazy(() => import("@/components/editor/BlockEditor"));

export default function WorkspaceHome() {
    const { user, offline: authOffline, signOut } = useAuth();

    const {
        workspaces,
        workspaceId,
        setWorkspaceId,
        loading,
        error: workspacesError,
        fromCache: workspacesFromCache,
        createWorkspace: createNewWorkspace,
    } = useWorkspaces(user?.id);
    const [pageId, setPageId] = useState("");
    const [workspaceName, setWorkspaceName] = useState("");
    const [pageTitle, setPageTitle] = useState("");
    const [error, setError] = useState("");
    const [parentForNewPage, setParentForNewPage] = useState<string | null>(null);
    const [showTrash, setShowTrash] = useState(false);
    const [signOutStep, setSignOutStep] = useState<
        | { kind: "idle" }
        | { kind: "syncing" }
        | { kind: "confirm"; unsyncedPages: number }
    >({ kind: "idle" });
    // Only relevant below the md breakpoint, where the sidebar is a drawer.
    const [sidebarOpen, setSidebarOpen] = useState(false);

    const {
        pages,
        archivedPages,
        error: pagesError,
        fromCache: pagesFromCache,
        createPage: createWorkspacePage,
        renamePage,
        archivePage,
        restorePage,
        permanentlyDeletePage,
    } = usePages(workspaceId, user?.id);

    const [activePageAction, setActivePageAction] = useState<{
        page: Page;
        mode: PageActionMode;
    } | null>(null);

    // Workspaces and page tree are cached for reading only (CLAUDE.md §2).
    const readOnly = workspacesFromCache || pagesFromCache;

    // Sends edits that are still waiting, also those of pages not open now.
    const userId = user?.id;
    useEffect(() => {
        if (!userId) return;

        const engine = syncEngineFor(userId);
        engine.start();
        return () => engine.stop();
    }, [userId]);

    useEffect(() => {
        if (!sidebarOpen) return;

        function closeOnEscape(event: KeyboardEvent) {
            if (event.key === "Escape") setSidebarOpen(false);
        }

        window.addEventListener("keydown", closeOnEscape);
        return () => window.removeEventListener("keydown", closeOnEscape);
    }, [sidebarOpen]);

    function selectPage(nextPageId: string) {
        setPageId(nextPageId);
        setSidebarOpen(false);
    }

    async function createWorkspace(event: FormEvent<HTMLFormElement>) {
        event.preventDefault();
        setError("");

        try {
            await createNewWorkspace(workspaceName);
            setWorkspaceName("");
        } catch (err) {
            setError(err instanceof Error ? err.message : "Der Workspace konnte nicht erstellt werden.");
        }
    }

    // Logout policy (CLAUDE.md §2): sync first; if that is not possible,
    // ask before local changes are discarded.
    async function handleSignOut() {
        if (!user) return;

        setError("");
        setSignOutStep({ kind: "syncing" });

        try {
            const unsyncedPages = await syncBeforeSignOut(user.id);
            if (unsyncedPages > 0) {
                setSignOutStep({ kind: "confirm", unsyncedPages });
                return;
            }
            await signOutAndDeleteLocalData(user.id, signOut);
        } catch (err) {
            console.error("Abmelden fehlgeschlagen:", err);
            setError(err instanceof Error ? err.message : "Abmelden ist fehlgeschlagen.");
            setSignOutStep({ kind: "idle" });
        }
    }

    async function handleCreatePage(event: FormEvent<HTMLFormElement>) {
        event.preventDefault();

        if (!user || !workspaceId) return;

        setError("");

        const title = pageTitle.trim() || "Unbenannte Seite";

        try {
            const createdPage = await createWorkspacePage(
                title,
                parentForNewPage,
            );

            setPageTitle("");
            setParentForNewPage(null);
            selectPage(createdPage.id);
        } catch (err) {
            console.error("Page creation failed:", err);
            setError(
                err instanceof Error
                    ? err.message
                    : "Die Seite konnte nicht erstellt werden.",
            );
        }
    }


    if (loading) {
        return <main className="p-8 text-sm text-muted-foreground">Nodi wird geladen …</main>;
    }

    return (
        <main className="flex h-svh flex-col bg-background">
            <header className="box-content flex h-14 shrink-0 items-center justify-between gap-2 border-b pt-[env(safe-area-inset-top)] pr-[max(1.25rem,env(safe-area-inset-right))] pl-[max(1.25rem,env(safe-area-inset-left))]">
                <div className="flex items-center gap-1">
                    {workspaces.length > 0 && (
                        <Button
                            variant="ghost"
                            size="icon"
                            className="-ml-2 md:hidden pointer-coarse:size-10"
                            aria-label={sidebarOpen ? "Seitenleiste schließen" : "Seitenleiste öffnen"}
                            aria-expanded={sidebarOpen}
                            aria-controls="sidebar"
                            onClick={() => setSidebarOpen((open) => !open)}
                        >
                            {sidebarOpen ? <X /> : <Menu />}
                        </Button>
                    )}
                    <span className="text-lg font-semibold">Nodi</span>
                </div>
                <div className="flex items-center gap-3">
                    {user && (
                        <SyncStatusIndicator
                            engine={syncEngineFor(user.id)}
                            offline={authOffline || readOnly}
                        />
                    )}
                    <span className="hidden text-sm text-muted-foreground sm:inline">
                        {user?.email}
                    </span>
                    <Button
                        variant="outline"
                        size="sm"
                        disabled={signOutStep.kind !== "idle"}
                        onClick={() => void handleSignOut()}
                    >
                        {signOutStep.kind === "syncing" ? "Synchronisiert …" : "Abmelden"}
                    </Button>
                </div>
            </header>

            {(error || workspacesError || pagesError) && (
                <p className="border-b px-5 py-3 text-sm text-destructive" role="alert">
                    {error || workspacesError || pagesError}
                </p>
            )}

            {readOnly && (
                <p className="border-b px-5 py-2 text-sm text-muted-foreground" role="status">
                    Offline: Die Seitenliste stammt aus dem lokalen Speicher. Seiten anlegen,
                    umbenennen und den Papierkorb gibt es erst wieder mit Internetverbindung.
                </p>
            )}

            {workspaces.length === 0 && workspacesError ? null : workspaces.length === 0 ? (
                <div className="flex flex-1 items-center justify-center p-6">
                    <Card className="w-full max-w-md">
                        <CardHeader>
                            <CardTitle>Deinen Workspace erstellen</CardTitle>
                        </CardHeader>
                        <CardContent>
                            <form onSubmit={createWorkspace} className="space-y-4">
                                <Input
                                    value={workspaceName}
                                    onChange={(event) => setWorkspaceName(event.target.value)}
                                    placeholder="z. B. Persönlicher Workspace"
                                    required
                                    maxLength={100}
                                />
                                <Button className="w-full" type="submit">
                                    Workspace erstellen
                                </Button>
                            </form>
                        </CardContent>
                    </Card>
                </div>
            ) : (
                <div className="flex min-h-0 flex-1">
                    {sidebarOpen && (
                        <div
                            className="fixed inset-x-0 bottom-0 top-[calc(3.5rem+env(safe-area-inset-top))] z-30 bg-black/40 md:hidden"
                            aria-hidden="true"
                            onClick={() => setSidebarOpen(false)}
                        />
                    )}

                    {/* Below md: drawer under the header. From md: static column. */}
                    <aside
                        id="sidebar"
                        className={cn(
                            "fixed bottom-0 left-0 top-[calc(3.5rem+env(safe-area-inset-top))] z-40 flex w-72 max-w-[85vw] flex-col border-r bg-background pb-[env(safe-area-inset-bottom)] pl-[env(safe-area-inset-left)] transition-[translate,visibility] duration-200",
                            "md:static md:z-auto md:w-64 md:max-w-none md:shrink-0 md:translate-x-0 md:visible",
                            sidebarOpen ? "translate-x-0" : "invisible -translate-x-full",
                        )}
                    >
                        <div className="p-3">
                            <label htmlFor="workspace" className="mb-2 block text-xs text-muted-foreground">
                                WORKSPACE
                            </label>
                            <select
                                id="workspace"
                                value={workspaceId}
                                onChange={(event) => setWorkspaceId(event.target.value)}
                                className="w-full rounded-md border bg-background px-3 py-2 text-sm"
                            >
                                {workspaces.map((workspace) => (
                                    <option key={workspace.id} value={workspace.id}>
                                        {workspace.name}
                                    </option>
                                ))}
                            </select>
                        </div>

                        <Separator />

                        <div className="flex items-center justify-between px-3 pb-2 pt-4">
                            <span className="text-xs font-medium text-muted-foreground">SEITEN</span>
                        </div>


                        {!readOnly && (
                            <CreatePageForm
                                title={pageTitle}
                                parentId={parentForNewPage}
                                pages={pages}
                                onTitleChange={setPageTitle}
                                onParentChange={setParentForNewPage}
                                onSubmit={handleCreatePage}
                            />
                        )}

                        {!readOnly && (
                            <div className="px-3 pb-2">
                                <Button
                                    type="button"
                                    variant={showTrash ? "secondary" : "ghost"}
                                    className="w-full justify-start"
                                    onClick={() => setShowTrash((current) => !current)}
                                >
                                    {showTrash ? "← Zurück zu den Seiten" : "Papierkorb"}
                                    {!showTrash && archivedPages.length > 0 && (
                                        <span className="ml-auto text-xs text-muted-foreground">
                                            {archivedPages.length}
                                        </span>
                                    )}
                                </Button>
                            </div>
                        )}


                        {showTrash && !readOnly ? (
                            <div className="flex-1 overflow-y-auto">
                                <TrashView
                                    pages={archivedPages}
                                    onRestore={restorePage}
                                    onDelete={permanentlyDeletePage}
                                />
                            </div>
                        ) : (
                            <nav className="flex-1 overflow-y-auto px-2 pb-4">
                                <PageTree
                                    pages={pages}
                                    selectedPageId={pageId}
                                    readOnly={readOnly}
                                    onSelect={selectPage}
                                    onAddChild={(parentId) => {
                                        setParentForNewPage(parentId);
                                        setPageTitle("");
                                    }}
                                    onRename={(page) =>
                                        setActivePageAction({ page, mode: "rename" })
                                    }
                                    onArchive={(page) =>
                                        setActivePageAction({ page, mode: "archive" })
                                    }
                                />
                            </nav>
                        )}

                    </aside>

                    <section className="min-w-0 flex-1 pr-[env(safe-area-inset-right)] pb-[env(safe-area-inset-bottom)]">
                        {pageId ? (
                            <Suspense
                                fallback={
                                    <p className="p-6 text-sm text-muted-foreground">
                                        Editor wird geladen …
                                    </p>
                                }
                            >
                                <BlockEditor key={pageId} pageId={pageId} />
                            </Suspense>
                        ) : (
                            <div className="flex h-full items-center justify-center p-6 text-center">
                                <div>
                                    <h1 className="text-xl font-semibold">Willkommen bei Nodi</h1>
                                    <p className="mt-2 text-sm text-muted-foreground">
                                        Erstelle eine Seite oder wähle eine vorhandene aus.
                                    </p>
                                    <Button
                                        variant="outline"
                                        className="mt-4 md:hidden"
                                        onClick={() => setSidebarOpen(true)}
                                    >
                                        Seiten anzeigen
                                    </Button>
                                </div>
                            </div>
                        )}
                    </section>
                </div>
            )}

            {signOutStep.kind === "confirm" && user && (
                <SignOutDialog
                    unsyncedPages={signOutStep.unsyncedPages}
                    onCancel={() => setSignOutStep({ kind: "idle" })}
                    onDiscardAndSignOut={() => signOutAndDeleteLocalData(user.id, signOut)}
                />
            )}

            {activePageAction && (
                <PageActionsDialog
                    key={`${activePageAction.mode}-${activePageAction.page.id}`}
                    page={activePageAction.page}
                    mode={activePageAction.mode}
                    onClose={() => setActivePageAction(null)}
                    onRename={renamePage}
                    onArchive={archivePage}
                    onArchived={(archivedIds) => {
                        if (archivedIds.includes(pageId)) {
                            setPageId("");
                        }
                    }}
                />
            )}
        </main>
    );
}
