import { useState, type ReactNode } from "react";
import { Check, ChevronsUpDown, LogOut, Plus, Trash2, Users } from "lucide-react";
import { Menu, MenuItem } from "@/components/ui/menu";
import { cn } from "@/lib/utils";
import { PageTree } from "../PageTree";
import { pagesInSection } from "../page-hierarchy";
import type { Page, PageSection, Workspace } from "../types";
import { TrashView } from "./TrashView";

type SidebarProps = {
    workspaces: Workspace[];
    workspaceId: string;
    onWorkspaceChange: (workspaceId: string) => void;
    pages: Page[];
    archivedPages: Page[];
    /** Shared with the user from other workspaces; read-only in the tree. */
    sharedPages: Page[];
    selectedPageId: string;
    /** Offline: the tree is a cached copy and cannot be changed. */
    readOnly: boolean;
    status: ReactNode;
    userId: string | undefined;
    accountEmail: string | null;
    signingOut: boolean;
    onSignOut: () => void;
    onSelect: (pageId: string) => void;
    /** `section` is used for root pages; subpages take their parent's. */
    onCreatePage: (parentId: string | null, section: PageSection) => void;
    onOpenMembers: () => void;
    onRename: (page: Page) => void;
    onArchive: (page: Page) => void;
    onRestore: (pageId: string) => Promise<string[]>;
    onDelete: (pageId: string) => Promise<string[]>;
};

const SECTIONS: { section: PageSection; title: string; addLabel: string; emptyText: string }[] = [
    {
        section: "workspace",
        title: "Workspace",
        addLabel: "Neue Seite im Workspace",
        emptyText: "Noch keine geteilten Seiten",
    },
    { section: "private", title: "Privat", addLabel: "Neue private Seite", emptyText: "Noch keine privaten Seiten" },
];

const footerButton =
    "flex h-7 w-full items-center gap-2 rounded-md px-2 text-sm text-sidebar-foreground hover:bg-sidebar-accent/70 pointer-coarse:h-10";

export function Sidebar({
    workspaces,
    workspaceId,
    onWorkspaceChange,
    pages,
    archivedPages,
    sharedPages,
    selectedPageId,
    readOnly,
    status,
    userId,
    accountEmail,
    signingOut,
    onSignOut,
    onSelect,
    onCreatePage,
    onOpenMembers,
    onRename,
    onArchive,
    onRestore,
    onDelete,
}: SidebarProps) {
    const [workspaceMenuOpen, setWorkspaceMenuOpen] = useState(false);
    const [showTrash, setShowTrash] = useState(false);
    const workspace = workspaces.find((item) => item.id === workspaceId);
    const trashOpen = showTrash && !readOnly;

    return (
        <div className="flex h-full flex-col bg-sidebar pt-[env(safe-area-inset-top)] pb-[env(safe-area-inset-bottom)] pl-[env(safe-area-inset-left)] text-sidebar-foreground">
            <div className="relative px-2 pt-2">
                <button
                    type="button"
                    aria-label="Workspace und Konto"
                    aria-expanded={workspaceMenuOpen}
                    onClick={() => setWorkspaceMenuOpen((open) => !open)}
                    className="flex h-9 w-full items-center gap-2 rounded-md px-2 text-left hover:bg-sidebar-accent/70 pointer-coarse:h-11"
                >
                    <img
                        src={`${import.meta.env.BASE_URL}favicon.svg`}
                        alt=""
                        className="size-5 shrink-0 rounded"
                    />
                    <span className="min-w-0 flex-1 truncate text-sm font-semibold text-foreground">
                        {workspace?.name ?? "nodi"}
                    </span>
                    <ChevronsUpDown className="size-4 shrink-0 text-muted-foreground" />
                </button>

                <Menu
                    open={workspaceMenuOpen}
                    onClose={() => setWorkspaceMenuOpen(false)}
                    align="start"
                    className="left-2 right-2"
                >
                    {workspaces.map((item) => (
                        <MenuItem
                            key={item.id}
                            onSelect={() => {
                                setWorkspaceMenuOpen(false);
                                onWorkspaceChange(item.id);
                            }}
                        >
                            <span className="min-w-0 flex-1 truncate">{item.name}</span>
                            {item.id === workspaceId && <Check className="size-4 text-brand" />}
                        </MenuItem>
                    ))}
                    <div className="my-1 border-t" />
                    {!readOnly && workspace && (
                        <MenuItem
                            onSelect={() => {
                                setWorkspaceMenuOpen(false);
                                onOpenMembers();
                            }}
                        >
                            <Users className="size-4" />
                            Mitglieder
                        </MenuItem>
                    )}
                    {accountEmail && (
                        <p className="truncate px-2 py-1 text-xs text-muted-foreground">
                            {accountEmail}
                        </p>
                    )}
                    <MenuItem
                        disabled={signingOut}
                        onSelect={() => {
                            setWorkspaceMenuOpen(false);
                            onSignOut();
                        }}
                    >
                        <LogOut className="size-4" />
                        {signingOut ? "Synchronisiert …" : "Abmelden"}
                    </MenuItem>
                </Menu>
            </div>

            <div className="space-y-1 px-4 pt-1 pb-2">
                {status}
                {readOnly && (
                    <p className="text-xs text-muted-foreground" role="status">
                        Offline: Seitenliste nur lesbar. Anlegen, Umbenennen und
                        Papierkorb gehen erst wieder mit Internetverbindung.
                    </p>
                )}
            </div>

            <nav className="min-h-0 flex-1 overflow-y-auto px-2 pb-2" aria-label="Seiten">
                {trashOpen ? (
                    <TrashView pages={archivedPages} userId={userId} onRestore={onRestore} onDelete={onDelete} />
                ) : (
                    <>
                        {SECTIONS.map(({ section, title, addLabel, emptyText }) => (
                            <section key={section} aria-labelledby={`section-${section}`} className="mb-3">
                                <div className="group/section flex h-7 items-center justify-between px-2">
                                    <h2
                                        id={`section-${section}`}
                                        className="text-xs font-medium text-muted-foreground"
                                    >
                                        {title}
                                    </h2>
                                    {!readOnly && (
                                        <button
                                            type="button"
                                            aria-label={addLabel}
                                            onClick={() => onCreatePage(null, section)}
                                            className="flex size-6 items-center justify-center rounded text-muted-foreground opacity-0 hover:bg-sidebar-accent focus-visible:opacity-100 group-hover/section:opacity-100 pointer-coarse:size-8 pointer-coarse:opacity-100"
                                        >
                                            <Plus className="size-4" />
                                        </button>
                                    )}
                                </div>
                                <PageTree
                                    pages={pagesInSection(pages, section)}
                                    selectedPageId={selectedPageId}
                                    readOnly={readOnly}
                                    emptyText={emptyText}
                                    onSelect={onSelect}
                                    onAddChild={(parentId) => onCreatePage(parentId, section)}
                                    onRename={onRename}
                                    onArchive={onArchive}
                                />
                            </section>
                        ))}
                        {sharedPages.length > 0 && (
                            <section aria-labelledby="shared-pages-title" className="mt-4">
                                <h2
                                    id="shared-pages-title"
                                    className="px-2 pb-1 text-xs font-medium text-muted-foreground"
                                >
                                    Mit mir geteilt
                                </h2>
                                <PageTree
                                    pages={sharedPages}
                                    selectedPageId={selectedPageId}
                                    readOnly
                                    onSelect={onSelect}
                                    onAddChild={() => undefined}
                                    onRename={() => undefined}
                                    onArchive={() => undefined}
                                />
                            </section>
                        )}
                    </>
                )}
            </nav>

            {!readOnly && (
                <div className="space-y-0.5 border-t border-sidebar-border px-2 py-2">
                    <button
                        type="button"
                        className={footerButton}
                        onClick={() => {
                            setShowTrash(false);
                            onCreatePage(null, "private");
                        }}
                    >
                        <Plus className="size-4 text-muted-foreground" />
                        Neue Seite
                    </button>
                    <button
                        type="button"
                        aria-pressed={trashOpen}
                        className={cn(footerButton, trashOpen && "bg-sidebar-accent")}
                        onClick={() => setShowTrash((open) => !open)}
                    >
                        <Trash2 className="size-4 text-muted-foreground" />
                        {trashOpen ? "Zurück zu den Seiten" : "Papierkorb"}
                        {!trashOpen && archivedPages.length > 0 && (
                            <span className="ml-auto text-xs text-muted-foreground">
                                {archivedPages.length}
                            </span>
                        )}
                    </button>
                </div>
            )}
        </div>
    );
}
