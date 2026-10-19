import { useEffect, useRef, useState, type FormEvent } from "react";
import { useAuth } from "@/lib/use-auth";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { PageActionsDialog, type PageActionMode } from "@/features/pages/components/PageActionsDialog";
import { ShareDialog } from "@/features/pages/components/ShareDialog";
import { MembersDialog } from "@/features/pages/components/MembersDialog";
import { MoveSectionDialog } from "@/features/pages/components/MoveSectionDialog";
import { Sidebar } from "@/features/pages/components/Sidebar";
import { findAncestors } from "@/features/pages/page-hierarchy";
import type { Page, PageKind, PageSection } from "@/features/pages/types";
import { usePages } from "@/features/pages/hooks/usePages";
import { useSharedPages } from "@/features/pages/hooks/useSharedPages";
import { useWorkspaces } from "@/features/pages/hooks/useWorkspaces";
import { usePageNavigation } from "@/features/pages/hooks/usePageNavigation";
import { syncEngineFor } from "@/features/editor/services/account-sync";
import { localDocumentStoreFor } from "@/features/editor/services/local-document-store";
import { deleteRevokedLocalCopies } from "@/features/editor/services/revoked-documents";
import { fileCacheFor } from "@/features/files/services/file-cache";
import { SyncStatusIndicator } from "@/features/editor/components/SyncStatusIndicator";
import { SignOutDialog } from "@/features/auth/SignOutDialog";
import { signOutAndDeleteLocalData, syncBeforeSignOut } from "@/features/auth/sign-out";
import { PageView } from "./PageView";

const NEW_PAGE_TITLE = "Unbenannte Seite";
const NEW_DATABASE_TITLE = "Unbenannte Datenbank";

/** Local copies of pages that are no longer readable go at the next contact with the server. */
function cleanUpRevokedCopies(userId: string): void {
    deleteRevokedLocalCopies(userId, localDocumentStoreFor(userId), fileCacheFor(userId)).catch((err: unknown) => {
        console.error("Lokale Kopien konnten nicht bereinigt werden:", err);
    });
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
        reload: reloadWorkspaces,
    } = useWorkspaces(user?.id);
    const { pageId, newPageId, openPage, closePage } = usePageNavigation();
    const [workspaceName, setWorkspaceName] = useState("");
    const [creatingWorkspace, setCreatingWorkspace] = useState(false);
    // Repeated taps on "Neue Seite" while one is being created add nothing.
    const creatingPage = useRef(false);
    const [error, setError] = useState("");
    const [signOutStep, setSignOutStep] = useState<
        { kind: "idle" } | { kind: "syncing" } | { kind: "confirm"; unsyncedPages: number }
    >({ kind: "idle" });

    const {
        pages,
        archivedPages,
        error: pagesError,
        fromCache: pagesFromCache,
        createPage: createWorkspacePage,
        setPageSection,
        renamePage,
        updatePage,
        archivePage,
        restorePage,
        permanentlyDeletePage,
    } = usePages(workspaceId, user?.id);

    const {
        pages: sharedPages,
        error: sharedPagesError,
        fromCache: sharedPagesFromCache,
        renamePage: renameSharedPage,
        updatePage: updateSharedPage,
    } = useSharedPages(user?.id, loading ? undefined : workspaces.map((workspace) => workspace.id));

    const [activePageAction, setActivePageAction] = useState<{
        page: Page;
        mode: PageActionMode;
    } | null>(null);
    const [sharingPage, setSharingPage] = useState<Page | null>(null);
    const [movingPage, setMovingPage] = useState<{ page: Page; target: PageSection } | null>(null);
    const [membersOpen, setMembersOpen] = useState(false);

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

        const deleteRevoked = () => cleanUpRevokedCopies(userId);
        deleteRevoked();
        window.addEventListener("online", deleteRevoked);
        return () => window.removeEventListener("online", deleteRevoked);
    }, [userId]);

    // The open page belongs to the previous workspace; its history entry
    // would reopen it when switching back.
    function changeWorkspace(nextWorkspaceId: string) {
        closePage();
        setWorkspaceId(nextWorkspaceId);
    }

    async function createPage(parentId: string | null, section: PageSection, kind: PageKind = "page") {
        if (creatingPage.current) return;
        creatingPage.current = true;
        setError("");

        try {
            const title = kind === "database" ? NEW_DATABASE_TITLE : NEW_PAGE_TITLE;
            const createdPage = await createWorkspacePage(title, parentId, section, kind);
            openPage(createdPage.id, { isNew: true });
        } catch (err) {
            console.error("Page creation failed:", err);
            setError(err instanceof Error ? err.message : "Die Seite konnte nicht erstellt werden.");
        } finally {
            creatingPage.current = false;
        }
    }

    // A new entry stays in the table (its name gets the focus there).
    async function createEntry(databaseId: string): Promise<string> {
        const database = pages.find((item) => item.id === databaseId);
        const entry = await createWorkspacePage("", databaseId, database?.visibility ?? "private");
        return entry.id;
    }

    async function createWorkspace(event: FormEvent<HTMLFormElement>) {
        event.preventDefault();
        if (creatingWorkspace) return;
        setCreatingWorkspace(true);
        setError("");

        try {
            await createNewWorkspace(workspaceName);
            setWorkspaceName("");
        } catch (err) {
            setError(err instanceof Error ? err.message : "Der Workspace konnte nicht erstellt werden.");
        } finally {
            setCreatingWorkspace(false);
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
                                <form onSubmit={(event) => void createWorkspace(event)} className="space-y-4">
                                    <Input
                                        aria-label="Name des Workspace"
                                        value={workspaceName}
                                        onChange={(event) => setWorkspaceName(event.target.value)}
                                        placeholder="z. B. Persönlicher Workspace"
                                        required
                                        maxLength={100}
                                        disabled={creatingWorkspace}
                                    />
                                    <Button className="w-full" type="submit" disabled={creatingWorkspace}>
                                        {creatingWorkspace ? "Wird erstellt …" : "Workspace erstellen"}
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
                            onWorkspaceChange={changeWorkspace}
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
                            userId={user?.id}
                            accountEmail={user?.email ?? null}
                            signingOut={signOutStep.kind !== "idle"}
                            onSignOut={() => void handleSignOut()}
                            onSelect={(id) => openPage(id)}
                            onCreatePage={(parentId, section, kind) => void createPage(parentId, section, kind)}
                            onOpenMembers={() => setMembersOpen(true)}
                            onRename={(item) => setActivePageAction({ page: item, mode: "rename" })}
                            onArchive={(item) => setActivePageAction({ page: item, mode: "archive" })}
                            onRestore={restorePage}
                            onDelete={permanentlyDeletePage}
                        />
                    </aside>

                    <section className={cn("min-w-0 flex-1 md:block", page ? "block" : "hidden")}>
                        {page ? (
                            <PageView
                                key={page.id}
                                page={page}
                                ancestors={ancestors}
                                readOnly={readOnly || (sharedPage !== null && sharedPagesFromCache)}
                                // Width, trash and sharing belong to the page's own workspace.
                                showPageMenu={sharedPage === null}
                                focusTitle={newPageId === page.id}
                                onBack={closePage}
                                onSelect={(id) => openPage(id)}
                                onRename={sharedPage ? renameSharedPage : renamePage}
                                onUpdate={sharedPage ? updateSharedPage : updatePage}
                                onArchive={(item) => setActivePageAction({ page: item, mode: "archive" })}
                                onShare={page.owner_id === user?.id ? setSharingPage : undefined}
                                onMoveSection={
                                    !sharedPage && page.parent_id === null && page.owner_id === user?.id
                                        ? (item, target) => setMovingPage({ page: item, target })
                                        : undefined
                                }
                                userId={user?.id}
                                entries={(sharedPage ? sharedPages : pages).filter(
                                    (item) => item.parent_id === page.id,
                                )}
                                // Entries are created in the database's own workspace only (for now).
                                onCreateEntry={sharedPage ? undefined : createEntry}
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
                                            onClick={() => void createPage(null, "private")}
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

            {movingPage && (
                <MoveSectionDialog
                    key={movingPage.page.id}
                    page={movingPage.page}
                    target={movingPage.target}
                    onClose={() => setMovingPage(null)}
                    onMove={setPageSection}
                />
            )}

            {membersOpen && user && workspaceId && (
                <MembersDialog
                    workspaceId={workspaceId}
                    workspaceName={workspaces.find((item) => item.id === workspaceId)?.name ?? ""}
                    userId={user.id}
                    onClose={() => setMembersOpen(false)}
                    onLeft={() => {
                        setMembersOpen(false);
                        closePage();
                        reloadWorkspaces();
                        // The workspace's pages are no longer readable.
                        cleanUpRevokedCopies(user.id);
                    }}
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
