
import { lazy, Suspense, useCallback, useEffect, useState, type FormEvent } from "react";
import { supabase } from "@/lib/supabase";
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
import { TrashView } from "@/features/pages/components/TrashView";

// BlockNote makes up most of the bundle; load it only when a page is opened.
const BlockEditor = lazy(() => import("@/components/editor/BlockEditor"));

type Workspace = {
    id: string;
    name: string;
};


export default function WorkspaceHome() {
    const { user, signOut } = useAuth();

    const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
    const [workspaceId, setWorkspaceId] = useState("");
    const [pageId, setPageId] = useState("");
    const [workspaceName, setWorkspaceName] = useState("");
    const [pageTitle, setPageTitle] = useState("");
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState("");
    const [parentForNewPage, setParentForNewPage] = useState<string | null>(null);
    const [showTrash, setShowTrash] = useState(false);
    // Only relevant below the md breakpoint, where the sidebar is a drawer.
    const [sidebarOpen, setSidebarOpen] = useState(false);

    const {
        pages,
        archivedPages,
        error: pagesError,
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

    const loadWorkspaces = useCallback(async () => {
        if (!user) return;

        const { data: memberships, error: membershipError } = await supabase
            .from("workspace_members")
            .select("workspace_id")
            .eq("user_id", user.id);

        if (membershipError) throw membershipError;

        const ids = (memberships ?? []).map((item) => item.workspace_id);

        if (ids.length === 0) {
            setWorkspaces([]);
            setWorkspaceId("");
            return;
        }

        const { data, error: workspaceError } = await supabase
            .from("workspaces")
            .select("id, name")
            .in("id", ids)
            .order("created_at", { ascending: true });

        if (workspaceError) throw workspaceError;

        const items = (data ?? []) as Workspace[];
        setWorkspaces(items);

        setWorkspaceId((current) =>
            items.some((item) => item.id === current)
                ? current
                : (items[0]?.id ?? ""),
        );
    }, [user]);

    useEffect(() => {
        let active = true;

        async function load() {
            try {
                await loadWorkspaces();
            } catch (err) {
                if (active) {
                    setError(err instanceof Error ? err.message : "Workspaces konnten nicht geladen werden.");
                }
            } finally {
                if (active) setLoading(false);
            }
        }

        void load();

        return () => {
            active = false;
        };
    }, [loadWorkspaces]);

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
        if (!user) return;

        setError("");

        const { data: sessionData } = await supabase.auth.getSession();
        const sessionUser = sessionData.session?.user;

        if (!sessionUser) {
            setError("Keine aktive Supabase-Sitzung.");
            return;
        }

        const { error: insertError } = await supabase
            .from("workspaces")
            .insert({
                name: workspaceName.trim(),
                owner_id: sessionUser.id,
            });

        if (insertError) {
            console.error("Workspace insert failed:", insertError);
            setError(insertError.message);
            return;
        }

        setWorkspaceName("");
        await loadWorkspaces();
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
                    <span className="hidden text-sm text-muted-foreground sm:inline">
                        {user?.email}
                    </span>
                    <Button variant="outline" size="sm" onClick={() => void signOut()}>
                        Abmelden
                    </Button>
                </div>
            </header>

            {(error || pagesError) && (
                <p className="border-b px-5 py-3 text-sm text-destructive" role="alert">
                    {error || pagesError}
                </p>
            )}

            {workspaces.length === 0 ? (
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


                        <CreatePageForm
                            title={pageTitle}
                            parentId={parentForNewPage}
                            pages={pages}
                            onTitleChange={setPageTitle}
                            onParentChange={setParentForNewPage}
                            onSubmit={handleCreatePage}
                        />

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


                        {showTrash ? (
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
