import { lazy, Suspense, useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { useAuth } from "@/lib/use-auth";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { startTouchDrag } from "@/lib/touch-drag";
import { trackVirtualKeyboard } from "@/lib/virtual-keyboard";
import { PageActionsDialog, type PageActionMode } from "@/features/pages/components/PageActionsDialog";
import { ShareDialog } from "@/features/pages/components/ShareDialog";
import { MembersDialog } from "@/features/pages/components/MembersDialog";
import { MoveSectionDialog } from "@/features/pages/components/MoveSectionDialog";
import { MovePageDialog } from "@/features/pages/components/MovePageDialog";
import type { MoveTarget, PositionUpdate } from "@/features/pages/page-hierarchy";
import { Sidebar } from "@/features/pages/components/Sidebar";
import { findAncestors, pageTemplates } from "@/features/pages/page-hierarchy";
import { NEW_PAGE_TITLE } from "@/features/pages/page-display";
import type { Page, PageKind, PageSection } from "@/features/pages/types";
import { usePages } from "@/features/pages/hooks/usePages";
import { useSharedPages } from "@/features/pages/hooks/useSharedPages";
import { useWorkspaces } from "@/features/pages/hooks/useWorkspaces";
import { usePageNavigation } from "@/features/pages/hooks/usePageNavigation";
import { syncEngineFor } from "@/features/editor/services/account-sync";
import { startPageActivity } from "@/features/realtime/page-activity";
import { localDocumentStoreFor } from "@/features/editor/services/local-document-store";
import { deleteRevokedLocalCopies } from "@/features/editor/services/revoked-documents";
import { fileCacheFor } from "@/features/files/services/file-cache";
import { SyncStatusIndicator } from "@/features/editor/components/SyncStatusIndicator";
import { SignOutDialog } from "@/features/auth/SignOutDialog";
import { UploadProgress } from "@/features/files/components/UploadProgress";
import { DeleteAccountDialog } from "@/features/auth/DeleteAccountDialog";
import { signOutAndDeleteLocalData, syncBeforeSignOut } from "@/features/auth/sign-out";
import { requestDeletedFilesCleanup } from "@/features/files/services/purge-deleted-files";
import { SearchDialog } from "@/features/search/components/SearchDialog";
import { MentionsDialog } from "@/features/mentions/components/MentionsDialog";
import { useMentions } from "@/features/mentions/hooks/useMentions";
import { useWorkspaceMembers } from "@/features/pages/hooks/useWorkspaceMembers";
import { Dialog } from "@/components/ui/dialog";
import { LoadErrorBoundary, LoadErrorNotice } from "@/components/LoadErrorBoundary";
import { PageView } from "./PageView";

// Loaded on demand: it brings the ZIP reader and BlockNote's Markdown parser.
const NotionImportDialog = lazy(() => import("@/features/import/components/NotionImportDialog"));
const ExportDialog = lazy(() => import("@/features/export/components/ExportDialog"));

const NEW_DATABASE_TITLE = "Unbenannte Datenbank";

/** Local copies of pages that are no longer readable go at the next contact with the server. */
function cleanUpRevokedCopies(userId: string): void {
    deleteRevokedLocalCopies(userId, localDocumentStoreFor(userId), fileCacheFor(userId)).catch((err: unknown) => {
        console.error("Lokale Kopien konnten nicht bereinigt werden:", err);
    });
}

export default function WorkspaceHome() {
    const { user, offline: authOffline, signOut, deleteAccount } = useAuth();

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
        createEntryFromTemplate,
        setPageSection,
        movePage,
        renamePage,
        updatePage,
        setFavorite,
        reorderPages,
        archivePage,
        restorePage,
        permanentlyDeletePage,
        emptyTrash,
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
    // "Verschieben nach …"; with a target when a page was dragged to another section (ask first).
    const [movePageDialog, setMovePageDialog] = useState<{ page: Page; target?: MoveTarget } | null>(null);
    const [membersOpen, setMembersOpen] = useState(false);
    const [deleteAccountOpen, setDeleteAccountOpen] = useState(false);
    const [importOpen, setImportOpen] = useState(false);
    const [exportRequest, setExportRequest] = useState<{ rootIds: string[]; label: string; fileName: string } | null>(
        null,
    );

    // Workspaces and page tree are cached for reading only (CLAUDE.md §2).
    const readOnly = workspacesFromCache || pagesFromCache;

    // Missing after archiving, deleting, switching the workspace or when
    // a share was revoked.
    const sharedPage = sharedPages.find((item) => item.id === pageId) ?? null;
    const page = pages.find((item) => item.id === pageId) ?? sharedPage;
    const ancestors = page ? findAncestors(page.id, sharedPage ? sharedPages : pages).reverse() : [];
    // Database blocks in a text may show databases shared from elsewhere.
    const knownPages = useMemo(() => [...pages, ...sharedPages], [pages, sharedPages]);
    const workspacePageTemplates = useMemo(() => pageTemplates(pages), [pages]);

    // Sends edits that are still waiting, also those of pages not open now.
    const userId = user?.id;
    useEffect(() => {
        if (!userId) return;

        const engine = syncEngineFor(userId);
        engine.start();
        return () => engine.stop();
    }, [userId]);

    // Changes by others and other devices arrive live (package 36).
    useEffect(() => (userId ? startPageActivity() : undefined), [userId]);

    // On phones the app fits the area above the keyboard (package 20).
    useEffect(() => trackVirtualKeyboard(), []);
    // Drag by long press on touch screens (package 41).
    useEffect(() => startTouchDrag(), []);

    // Ctrl/⌘+K opens the search (package 27), as in Notion.
    const [searchOpen, setSearchOpen] = useState(false);
    // Mentions of the user (package 37): the list and the members for "@".
    const online = !(readOnly || authOffline);
    const mentions = useMentions(user?.id, online);
    const [mentionsOpen, setMentionsOpen] = useState(false);
    const workspaceMembersForMentions = useWorkspaceMembers(workspaceId, online);
    useEffect(() => {
        function openSearch(event: KeyboardEvent) {
            if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "k") {
                event.preventDefault();
                setSearchOpen(true);
            }
        }
        window.addEventListener("keydown", openSearch);
        return () => window.removeEventListener("keydown", openSearch);
    }, []);

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

    // Dragged in the sidebar: within its section at once, to the other one after a question.
    async function dropPage(item: Page, target: MoveTarget) {
        const section =
            "section" in target ? target.section : pages.find((other) => other.id === target.parentId)?.visibility;
        if (section !== item.visibility) {
            setMovePageDialog({ page: item, target });
            return;
        }
        setError("");
        try {
            await movePage(item.id, target);
        } catch (err) {
            setError(err instanceof Error ? err.message : "Die Seite konnte nicht verschoben werden.");
        }
    }

    async function reorder(updates: PositionUpdate[]) {
        setError("");
        try {
            await reorderPages(updates);
        } catch (err) {
            setError(err instanceof Error ? err.message : "Die Reihenfolge konnte nicht gespeichert werden.");
        }
    }

    // A new entry stays in the table (its name gets the focus there).
    async function createEntry(databaseId: string): Promise<string> {
        const database = pages.find((item) => item.id === databaseId);
        // With a default template (package 38c), as long as it is still one of this database.
        const templateId = database?.default_template_id;
        const template = templateId
            ? pages.find((item) => item.id === templateId && item.parent_id === databaseId && item.is_template)
            : undefined;
        if (template) return (await createEntryFromTemplate(template.id)).id;
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
        <main className="nodi-app-viewport flex h-svh bg-background">
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
                            onDeleteAccount={() => setDeleteAccountOpen(true)}
                            onSelect={(id) => openPage(id)}
                            onCreatePage={(parentId, section, kind) => void createPage(parentId, section, kind)}
                            onOpenMembers={() => setMembersOpen(true)}
                            onImportNotion={() => setImportOpen(true)}
                            onExportWorkspace={() => {
                                const name = workspaces.find((item) => item.id === workspaceId)?.name ?? "Workspace";
                                setExportRequest({
                                    rootIds: pages.filter((item) => item.parent_id === null).map((item) => item.id),
                                    label: `Workspace „${name}“`,
                                    fileName: name,
                                });
                            }}
                            onSearch={() => setSearchOpen(true)}
                            unreadMentions={mentions.unread}
                            onMentions={() => setMentionsOpen(true)}
                            onRename={(item) => setActivePageAction({ page: item, mode: "rename" })}
                            onArchive={(item) => setActivePageAction({ page: item, mode: "archive" })}
                            onRestore={restorePage}
                            onDelete={permanentlyDeletePage}
                            onEmptyTrash={emptyTrash}
                            onMove={(item) => setMovePageDialog({ page: item })}
                            onDropPage={(item, target) => void dropPage(item, target)}
                            onReorder={(updates) => void reorder(updates)}
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
                                // Favorites of pages from other workspaces: later.
                                onSetFavorite={sharedPage ? undefined : setFavorite}
                                // Export from the own workspace, whose page tree is known here.
                                onExport={
                                    sharedPage
                                        ? undefined
                                        : (item) =>
                                              setExportRequest({
                                                  rootIds: [item.id],
                                                  label: `Seite „${item.title || "Ohne Titel"}“`,
                                                  fileName: item.title || "Ohne Titel",
                                              })
                                }
                                onShare={page.owner_id === user?.id ? setSharingPage : undefined}
                                // Moving stays within the page's own workspace.
                                onMove={sharedPage ? undefined : (item) => setMovePageDialog({ page: item })}
                                onMoveSection={
                                    !sharedPage && page.parent_id === null && page.owner_id === user?.id
                                        ? (item, target) => setMovingPage({ page: item, target })
                                        : undefined
                                }
                                userId={user?.id}
                                // Mentions name members of the page's own workspace.
                                people={sharedPage ? [] : workspaceMembersForMentions}
                                entries={(sharedPage ? sharedPages : pages).filter(
                                    (item) => item.parent_id === page.id,
                                )}
                                // Entries are created in the database's own workspace only (for now).
                                onCreateEntry={sharedPage ? undefined : createEntry}
                                templateActions={
                                    sharedPage
                                        ? undefined
                                        : {
                                              onCreateFromTemplate: async (templateId) =>
                                                  (await createEntryFromTemplate(templateId)).id,
                                              onSetDefault: (templateId) =>
                                                  updatePage(page.id, { default_template_id: templateId }),
                                              onCreateTemplate: async () =>
                                                  (
                                                      await createWorkspacePage("", page.id, page.visibility, "page", {
                                                          isTemplate: true,
                                                      })
                                                  ).id,
                                          }
                                }
                                onCreateSubpage={
                                    sharedPage
                                        ? undefined
                                        : (parentId, kind) => void createPage(parentId, page.visibility, kind)
                                }
                                // Relations stay within the workspace (package 17d).
                                databases={sharedPage ? undefined : pages.filter((item) => item.kind === "database")}
                                knownPages={knownPages}
                                // Templates of the page's own workspace (package 38b).
                                pageTemplates={sharedPage ? [] : workspacePageTemplates}
                                // Entries of other workspaces keep their order (for now).
                                onReorderPages={sharedPage ? undefined : reorderPages}
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

            <UploadProgress />

            {signOutStep.kind === "confirm" && user && (
                <SignOutDialog
                    unsyncedPages={signOutStep.unsyncedPages}
                    onCancel={() => setSignOutStep({ kind: "idle" })}
                    onDiscardAndSignOut={() => signOutAndDeleteLocalData(user.id, signOut)}
                />
            )}

            {deleteAccountOpen && user && (
                <DeleteAccountDialog
                    offline={authOffline}
                    onCancel={() => setDeleteAccountOpen(false)}
                    // Like signing out: the local data of the account goes as well (package 33).
                    onDelete={(password) =>
                        signOutAndDeleteLocalData(user.id, async () => {
                            await deleteAccount(password);
                            requestDeletedFilesCleanup();
                        })
                    }
                />
            )}

            {movePageDialog && (
                <MovePageDialog
                    key={movePageDialog.page.id}
                    page={movePageDialog.page}
                    pages={pages}
                    userId={user?.id}
                    target={movePageDialog.target}
                    onMove={movePage}
                    onClose={() => setMovePageDialog(null)}
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

            {importOpen && (
                <LoadErrorBoundary
                    fallback={
                        <Dialog labelledBy="import-load-error" onClose={() => setImportOpen(false)}>
                            <h2 id="import-load-error" className="sr-only">
                                Import
                            </h2>
                            <LoadErrorNotice message="Der Import konnte nicht geladen werden. Prüfe die Internetverbindung und lade neu." />
                        </Dialog>
                    }
                >
                    <Suspense fallback={null}>
                        <NotionImportDialog
                            // Imported pages are private (decision of the user, CLAUDE.md §12 P16).
                            createPage={(title, parentId, kind, id) =>
                                createWorkspacePage(title, parentId, "private", kind, { id })
                            }
                            onOpen={(pageId) => openPage(pageId)}
                            onClose={() => setImportOpen(false)}
                        />
                    </Suspense>
                </LoadErrorBoundary>
            )}

            {exportRequest && user && (
                <LoadErrorBoundary
                    fallback={
                        <Dialog labelledBy="export-load-error" onClose={() => setExportRequest(null)}>
                            <h2 id="export-load-error" className="sr-only">
                                Export
                            </h2>
                            <LoadErrorNotice message="Der Export konnte nicht geladen werden. Prüfe die Internetverbindung und lade neu." />
                        </Dialog>
                    }
                >
                    <Suspense fallback={null}>
                        <ExportDialog
                            userId={user.id}
                            pages={pages}
                            rootIds={exportRequest.rootIds}
                            label={exportRequest.label}
                            fileName={exportRequest.fileName}
                            onClose={() => setExportRequest(null)}
                        />
                    </Suspense>
                </LoadErrorBoundary>
            )}

            {mentionsOpen && (
                <MentionsDialog
                    mentions={mentions.mentions}
                    error={mentions.error}
                    onOpen={(mention) => {
                        setMentionsOpen(false);
                        mentions.markRead(mention.id).catch((err: unknown) => {
                            console.error("Erwähnung konnte nicht als gelesen markiert werden:", err);
                        });
                        if (
                            mention.workspaceId !== workspaceId &&
                            workspaces.some((item) => item.id === mention.workspaceId)
                        ) {
                            changeWorkspace(mention.workspaceId);
                        }
                        openPage(mention.pageId);
                    }}
                    onMarkAllRead={() => {
                        mentions.markAllRead().catch((err: unknown) => {
                            console.error("Erwähnungen konnten nicht als gelesen markiert werden:", err);
                        });
                    }}
                    onClose={() => setMentionsOpen(false)}
                />
            )}

            {searchOpen && user && (
                <SearchDialog
                    knownPages={knownPages}
                    userId={user.id}
                    offline={readOnly || authOffline}
                    onOpen={(id) => openPage(id)}
                    onClose={() => setSearchOpen(false)}
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
