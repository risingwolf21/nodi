import { Fragment, lazy, Suspense, useState } from "react";
import { ChevronLeft, FileText, MoreHorizontal } from "lucide-react";
import { EditorFrame } from "@/components/editor/EditorFrame";
import { Menu, MenuItem } from "@/components/ui/menu";
import { PageHeader } from "@/features/pages/components/PageHeader";
import type { Page } from "@/features/pages/types";

// BlockNote makes up most of the bundle; load it only when a page is opened.
const BlockEditor = lazy(() => import("@/components/editor/BlockEditor"));

type PageViewProps = {
    page: Page;
    /** Root first. */
    ancestors: Page[];
    readOnly: boolean;
    focusTitle: boolean;
    onBack: () => void;
    onSelect: (pageId: string) => void;
    onRename: (pageId: string, title: string) => Promise<void>;
    onSetIcon: (pageId: string, icon: string | null) => Promise<void>;
    onArchive: (page: Page) => void;
};

function PageLabel({ page }: { page: Page }) {
    return (
        <>
            <span aria-hidden="true">
                {page.icon ?? <FileText className="inline size-3.5 align-[-2px] text-muted-foreground" />}
            </span>{" "}
            {page.title}
        </>
    );
}

export function PageView({
    page,
    ancestors,
    readOnly,
    focusTitle,
    onBack,
    onSelect,
    onRename,
    onSetIcon,
    onArchive,
}: PageViewProps) {
    const [menuOpen, setMenuOpen] = useState(false);

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

    const topBarEnd = readOnly ? null : (
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
        <PageHeader
            page={page}
            editable={canEdit && !readOnly}
            focusTitle={focusTitle}
            onRename={onRename}
            onSetIcon={onSetIcon}
        />
    );

    return (
        <Suspense
            fallback={
                <EditorFrame topBarStart={topBarStart} topBarEnd={topBarEnd}>
                    {renderHeader(false)}
                    <p className="px-[var(--page-gutter)] text-sm text-muted-foreground">
                        Editor wird geladen …
                    </p>
                </EditorFrame>
            }
        >
            <BlockEditor
                key={page.id}
                pageId={page.id}
                topBarStart={topBarStart}
                topBarEnd={topBarEnd}
                renderHeader={renderHeader}
            />
        </Suspense>
    );
}
