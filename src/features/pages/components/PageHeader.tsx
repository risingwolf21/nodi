import { useEffect, useRef, useState, type ReactNode } from "react";
import { SmilePlus } from "lucide-react";
import { Menu } from "@/components/ui/menu";
import { cn } from "@/lib/utils";
import type { Page } from "../types";
import { IconGrid } from "./IconGrid";

type PageHeaderProps = {
    page: Page;
    /** False offline or without edit rights. */
    editable: boolean;
    /** A page created just now: focus the title so the user can type. */
    focusTitle: boolean;
    onRename: (pageId: string, title: string) => Promise<void>;
    onSetIcon: (pageId: string, icon: string | null) => Promise<void>;
    /** More buttons beside "Icon hinzufügen", shown on hover (cover, comment). */
    actions?: ReactNode;
};

export function PageHeader({ page, editable, focusTitle, onRename, onSetIcon, actions }: PageHeaderProps) {
    // Only set while the title is being edited; otherwise the stored title shows.
    const [draft, setDraft] = useState<string | null>(null);
    const [pickerOpen, setPickerOpen] = useState(false);
    const [error, setError] = useState("");
    const titleRef = useRef<HTMLTextAreaElement>(null);
    // Escape discards the draft; blur() runs before the state update lands.
    const discardDraft = useRef(false);

    // Once per new page: editable can flip back on later (e.g. after a
    // reload from the server), which must not take the focus again.
    const focusedPageId = useRef("");

    useEffect(() => {
        if (!focusTitle || !editable || focusedPageId.current === page.id) return;
        focusedPageId.current = page.id;
        titleRef.current?.focus();
        titleRef.current?.select();
    }, [focusTitle, editable, page.id]);

    function commitTitle() {
        const next = discardDraft.current ? "" : (draft?.trim() ?? "");
        discardDraft.current = false;
        setDraft(null);
        // An empty title keeps the previous one; the database needs a title.
        if (!next || next === page.title) return;

        setError("");
        onRename(page.id, next).catch((err: unknown) => {
            setError(err instanceof Error ? err.message : "Der Titel konnte nicht gespeichert werden.");
        });
    }

    function chooseIcon(icon: string | null) {
        setPickerOpen(false);
        setError("");
        onSetIcon(page.id, icon).catch((err: unknown) => {
            setError(err instanceof Error ? err.message : "Das Icon konnte nicht gespeichert werden.");
        });
    }

    return (
        <div className="group/header mb-1 px-[var(--page-gutter)]">
            <div className="relative">
                {page.icon && (
                    <button
                        type="button"
                        aria-label="Icon ändern"
                        disabled={!editable}
                        onClick={() => setPickerOpen((open) => !open)}
                        className={cn(
                            "relative mb-1 rounded-md p-0.5 text-[64px] leading-[1.1] hover:bg-accent disabled:hover:bg-transparent md:text-[78px]",
                            // Like Notion, the icon reaches halfway into the cover.
                            page.cover && "-mt-9 md:-mt-11",
                        )}
                    >
                        {page.icon}
                    </button>
                )}
                {editable && (
                    <div className="mb-1 flex flex-wrap items-start gap-1 opacity-0 focus-within:opacity-100 group-hover/header:opacity-100 pointer-coarse:opacity-100">
                        {!page.icon && (
                            <button
                                type="button"
                                onClick={() => setPickerOpen((open) => !open)}
                                className="flex items-center gap-1.5 rounded-md px-1.5 py-1 text-sm text-muted-foreground hover:bg-accent"
                            >
                                <SmilePlus className="size-4" />
                                Icon hinzufügen
                            </button>
                        )}
                        {actions}
                    </div>
                )}

                <Menu open={pickerOpen} onClose={() => setPickerOpen(false)} align="start" className="w-72 p-2">
                    <IconGrid onChoose={chooseIcon} />
                    {page.icon && (
                        <button
                            type="button"
                            role="menuitem"
                            onClick={() => chooseIcon(null)}
                            className="mt-2 w-full rounded px-2 py-1.5 text-left text-sm text-muted-foreground hover:bg-accent"
                        >
                            Icon entfernen
                        </button>
                    )}
                </Menu>
            </div>

            <textarea
                ref={titleRef}
                rows={1}
                aria-label="Seitentitel"
                placeholder="Ohne Titel"
                maxLength={200}
                readOnly={!editable}
                value={draft ?? page.title}
                onFocus={() => setDraft((current) => current ?? page.title)}
                onChange={(event) => setDraft(event.target.value)}
                onBlur={commitTitle}
                onKeyDown={(event) => {
                    if (event.key === "Enter") {
                        event.preventDefault();
                        event.currentTarget.blur();
                    } else if (event.key === "Escape") {
                        discardDraft.current = true;
                        event.currentTarget.blur();
                    }
                }}
                className="field-sizing-content w-full resize-none overflow-hidden bg-transparent text-[32px] leading-[1.2] font-bold text-foreground outline-none placeholder:text-muted-foreground/60 md:text-[40px]"
            />

            {error && (
                <p className="mt-1 text-sm text-destructive" role="alert">
                    {error}
                </p>
            )}
        </div>
    );
}
