import { useState } from "react";
import { LayoutTemplate, Pencil, Plus } from "lucide-react";
import { Menu, MenuItem } from "@/components/ui/menu";
import { displayTitle } from "@/features/pages/page-display";
import type { Page } from "@/features/pages/types";

/** What a database page offers for its templates (package 26). */
export type TemplateActions = {
    /** A new entry with the template's text and values; returns its id. */
    onCreateFromTemplate: (templateId: string) => Promise<string>;
    /** A new, empty template; returns its id. */
    onCreateTemplate: () => Promise<string>;
};

/** "Vorlagen" in the toolbar of a database: new entries from a template, editing and adding templates. */
export function TemplatesMenu({
    templates,
    actions,
    onOpen,
    onError,
}: {
    templates: Page[];
    actions: TemplateActions;
    onOpen: (pageId: string) => void;
    onError: (message: string) => void;
}) {
    const [open, setOpen] = useState(false);

    async function run(action: () => Promise<string>) {
        setOpen(false);
        try {
            onOpen(await action());
        } catch (err) {
            onError(err instanceof Error ? err.message : "Das hat nicht geklappt.");
        }
    }

    return (
        <div className="relative">
            <button
                type="button"
                aria-expanded={open}
                onClick={() => setOpen(true)}
                className="flex h-8 items-center gap-1.5 rounded px-2 text-sm text-muted-foreground hover:bg-accent/60 hover:text-foreground pointer-coarse:h-10"
            >
                <LayoutTemplate className="size-3.5" aria-hidden="true" />
                Vorlagen
            </button>
            <Menu open={open} onClose={() => setOpen(false)} align="end" className="w-64" label="Vorlagen">
                {templates.length > 0 && (
                    <p className="px-2 pt-1 pb-1 text-xs text-muted-foreground">Neuer Eintrag aus Vorlage</p>
                )}
                {templates.map((template) => (
                    <div key={template.id} className="flex items-center">
                        <div className="min-w-0 flex-1">
                            <MenuItem onSelect={() => void run(() => actions.onCreateFromTemplate(template.id))}>
                                <span className="truncate">
                                    {template.icon ? `${template.icon} ` : ""}
                                    {displayTitle(template)}
                                </span>
                            </MenuItem>
                        </div>
                        <button
                            type="button"
                            aria-label={`Vorlage „${displayTitle(template)}“ bearbeiten`}
                            onClick={() => {
                                setOpen(false);
                                onOpen(template.id);
                            }}
                            className="flex size-8 shrink-0 items-center justify-center rounded text-muted-foreground hover:bg-accent hover:text-foreground"
                        >
                            <Pencil className="size-3.5" aria-hidden="true" />
                        </button>
                    </div>
                ))}
                {templates.length > 0 && <div className="my-1 border-t" />}
                <MenuItem onSelect={() => void run(actions.onCreateTemplate)}>
                    <Plus className="size-4" aria-hidden="true" />
                    Neue Vorlage
                </MenuItem>
            </Menu>
        </div>
    );
}
