import { useEffect, useState, type FormEvent } from "react";
import { useAuth } from "@/lib/use-auth";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { PageActionsDialog, type PageActionMode } from "@/features/pages/components/PageActionsDialog";
import { ShareDialog } from "@/features/pages/components/ShareDialog";
import { Sidebar } from "@/features/pages/components/Sidebar";
import { findAncestors } from "@/features/pages/page-hierarchy";
import type { Page } from "@/features/pages/types";
import { usePages } from "@/features/pages/hooks/usePages";
import { useSharedPages } from "@/features/pages/hooks/useSharedPages";
import { useWorkspaces } from "@/features/pages/hooks/useWorkspaces";
import { syncEngineFor } from "@/features/editor/services/account-sync";
import { localDocumentStoreFor } from "@/features/editor/services/local-document-store";
import { deleteRevokedLocalCopies } from "@/features/editor/services/revoked-documents";
import { SyncStatusIndicator } from "@/features/editor/components/SyncStatusIndicator";
import { SignOutDialog } from "@/features/auth/SignOutDialog";
import { signOutAndDeleteLocalData, syncBeforeSignOut } from "@/features/auth/sign-out";
import { PageView } from "./PageView";

const NEW_PAGE_TITLE = "Unbenannte Seite";

// Open pages are history entries (without URL change), so the browser and
// Android back button return to the previous page or the page list.
const HISTORY_PAGE_KEY = "nodiPageId";

function pageIdFromHistory(state: unknown): string {
    if (typeof state !== "object" || state === null || !(HISTORY_PAGE_KEY in state)) return "";
    const pageId = state[HISTORY_PAGE_KEY];
    return typeof pageId === "string" ? pageId : "";
}

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
    // A page created just now: its title gets the focus.
    const [newPageId, setNewPageId] = useState("");
    const [workspaceName, setWorkspaceName] = useState("");
    const [error, setError] = useState("");
    const [signOutStep, setSignOutStep] = useState<
        | { kind: "idle" }
        | { kind: "syncing" }
        | { kind: "confirm"; unsyncedPages: number }
    >({ kind: "idle" });

    const {
        pages,
        archivedPages,
        error: pagesError,
        fromCache: pagesFromCache,
        createPage: createWorkspacePage,
        renamePage,
        updatePage,
        archivePage,
        restorePage,
        permanentlyDeletePage,
    } = usePages(workspaceId, user?.id);

    const { pages: sharedPages, error: sharedPagesError } = useSharedPages(
        user?.id,
        loading ? undefined : workspaces.map((workspace) => workspace.id),
    );

    const [activePageAction, setActivePageAction] = useState<{
        page: Page;
        mode: PageActionMode;
    } | null>(null);
    const [sharingPage, setSharingPage] = useState<Page | null>(null);

    // Workspaces and page tree are cached for reading only (CLAUDE.md §2).
    const readOnly = workspacesFromCache || pagesFromCache;

    // Missing after archiving, deleting, switching the workspace or when
    // a share was revoked.
    const sharedPage = sharedPages.find((item) => item.id === pageId) ?? null;
    const page = pages.find((item) => item.id === pageId) ?? sharedPage;
    const ancestors = page ? findAncestors(page.id, sharedPage ? sharedPages : pages).reverse() : [];

    // Sends edits that are still waiting, also those of pages not open now.
    const userId = user?.id;
    useEffect(() => {
        if (!userId) return;

        const engine = syncEngineFor(userId);
        engine.start();
        return () => engine.stop();
    }, [userId]);

    // Revoked shares: the local copies go at the next contact with the server.
    useEffect(() => {
        if (!userId) return;

        const store = localDocumentStoreFor(userId);
        const deleteRevoked = () => {
            deleteRevokedLocalCopies(userId, store).catch((err: unknown) => {
                console.error("Lokale Kopien konnten nicht bereinigt werden:", err);
            });
        };
        deleteRevoked();
        window.addEventListener("online", deleteRevoked);
        return () => window.removeEventListener("online", deleteRevoked);
    }, [userId]);

    useEffect(() => {
        // An entry left from before a reload would reopen a stale page.
        if (pageIdFromHistory(history.state)) history.replaceState(null, "");

        const followHistory = (event: PopStateEvent) => setPageId(pageIdFromHistory(event.state));
        window.addEventListener("popstate", followHistory);
        return () => window.removeEventListener("popstate", followHistory);
    }, []);

    function openPage(nextPageId: string, { isNew = false } = {}) {
        setNewPageId(isNew ? nextPageId : "");
        if (nextPageId === pageId) return;

        history.pushState({ [HISTORY_PAGE_KEY]: nextPageId }, "");
        setPageId(nextPageId);
    }

    function closePage() {
        if (pageIdFromHistory(history.state)) {
            history.back();
        } else {
            setPageId("");
        }
    }

    async function createPage(parentId: string | null) {
        setError("");

        try {
            const createdPage = await createWorkspacePage(NEW_PAGE_TITLE, parentId);
            openPage(createdPage.id, { isNew: true });
        } catch (err) {
            console.error("Page creation failed:", err);
            setError(err instanceof Error ? err.message : "Die Seite konnte nicht erstellt werden.");
        }
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

    if (loading) {
        return <main className="p-8 text-sm text-muted-foreground">Nodi wird geladen …</main>;
    }

    const visibleError = error || workspacesError || pagesError || sharedPagesError;

    return (
        <main className="flex h-svh bg-background">
            {workspaces.length === 0 ? (
                !workspacesError && (
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
                )
            ) : (
                <>
                    {/* Below md, like the Notion app: the list or one page, full screen. */}
                    <aside
                        className={cn(
                            "w-full md:block md:w-64 md:shrink-0 md:border-r md:border-sidebar-border",
                            page ? "hidden" : "block",
                        )}
                    >
                        <Sidebar
                            workspaces={workspaces}
                            workspaceId={workspaceId}
                            onWorkspaceChange={setWorkspaceId}
                            pages={pages}
                            archivedPages={archivedPages}
                            sharedPages={sharedPages}
                            selectedPageId={page?.id ?? ""}
                            readOnly={readOnly}
                            status={
                                user && (
                                    <SyncStatusIndicator
                                        engine={syncEngineFor(user.id)}
                                        offline={authOffline && !readOnly}
                                    />
                                )
                            }
                            accountEmail={user?.email ?? null}
                            signingOut={signOutStep.kind !== "idle"}
                            onSignOut={() => void handleSignOut()}
                            onSelect={(id) => openPage(id)}
                            onCreatePage={(parentId) => void createPage(parentId)}
                            onRename={(item) => setActivePageAction({ page: item, mode: "rename" })}
                            onArchive={(item) => setActivePageAction({ page: item, mode: "archive" })}
                            onRestore={restorePage}
                            onDelete={permanentlyDeletePage}
                        />
                    </aside>

                    <section className={cn("min-w-0 flex-1 md:block", page ? "block" : "hidden")}>
                        {page ? (
                            <PageView
                                page={page}
                                ancestors={ancestors}
                                // Title, icon and width of a shared page belong to its workspace.
                                readOnly={readOnly || sharedPage !== null}
                                focusTitle={newPageId === page.id}
                                onBack={closePage}
                                onSelect={(id) => openPage(id)}
                                onRename={renamePage}
                                onUpdate={updatePage}
                                onArchive={(item) => setActivePageAction({ page: item, mode: "archive" })}
                                onShare={page.owner_id === user?.id ? setSharingPage : undefined}
                            />
                        ) : (
                            <div className="flex h-full items-center justify-center p-6 text-center">
                                <div>
                                    <p className="text-sm text-muted-foreground">
                                        Wähle links eine Seite aus oder lege eine neue an.
                                    </p>
                                    {!readOnly && (
                                        <Button
                                            variant="outline"
                                            className="mt-4"
                                            onClick={() => void createPage(null)}
                                        >
                                            <Plus />
                                            Neue Seite
                                        </Button>
                                    )}
                                </div>
                            </div>
                        )}
                    </section>
                </>
            )}

            {visibleError && (
                <p
                    className="fixed inset-x-3 bottom-[max(0.75rem,env(safe-area-inset-bottom))] z-30 rounded-md border bg-background px-4 py-3 text-sm text-destructive shadow-md md:left-auto md:w-96"
                    role="alert"
                >
                    {visibleError}
                </p>
            )}

            {signOutStep.kind === "confirm" && user && (
                <SignOutDialog
                    unsyncedPages={signOutStep.unsyncedPages}
                    onCancel={() => setSignOutStep({ kind: "idle" })}
                    onDiscardAndSignOut={() => signOutAndDeleteLocalData(user.id, signOut)}
                />
            )}

            {sharingPage && user && (
                <ShareDialog
                    key={sharingPage.id}
                    page={sharingPage}
                    userId={user.id}
                    onClose={() => setSharingPage(null)}
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
                        if (archivedIds.includes(pageId)) closePage();
                    }}
                />
            )}
        </main>
    );
}
