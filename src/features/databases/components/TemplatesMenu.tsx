import { useState } from "react";
import { Check, LayoutTemplate, Pencil, Plus } from "lucide-react";
import { Menu, MenuItem } from "@/components/ui/menu";
import { displayTitle } from "@/features/pages/page-display";
import type { Page } from "@/features/pages/types";
import { toolbarButton } from "./ViewSettingsPanels";

/** What a database page offers for its templates (package 26). */
export type TemplateActions = {
    /** A new entry with the template's text and values; returns its id. */
    onCreateFromTemplate: (templateId: string) => Promise<string>;
    /** A new, empty template; returns its id. */
    onCreateTemplate: () => Promise<string>;
    /** The template "Neu" uses, or none (package 38c). */
    onSetDefault: (templateId: string | null) => Promise<void>;
};

/** "Vorlagen" in the toolbar of a database: new entries from a template, the default, editing and adding templates. */
export function TemplatesMenu({
    templates,
    defaultTemplateId,
    actions,
    onOpen,
    onError,
}: {
    templates: Page[];
    defaultTemplateId: string | null;
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

    function setDefault(templateId: string | null) {
        setOpen(false);
        actions.onSetDefault(templateId).catch((err: unknown) => {
            onError(err instanceof Error ? err.message : "Die Standardvorlage konnte nicht gespeichert werden.");
        });
    }

    const defaultTemplate = templates.find((template) => template.id === defaultTemplateId);

    return (
        <div className="relative">
            <button
                type="button"
                aria-label="Vorlagen"
                aria-expanded={open}
                onClick={() => setOpen(true)}
                className={toolbarButton}
            >
                <LayoutTemplate className="size-3.5" aria-hidden="true" />
                <span className="hidden sm:inline">Vorlagen</span>
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
                            aria-pressed={template.id === defaultTemplateId}
                            aria-label={`„${displayTitle(template)}“ als Standard für „Neu“`}
                            title="Standard für „Neu“"
                            onClick={() => setDefault(template.id === defaultTemplateId ? null : template.id)}
                            className="flex size-8 shrink-0 items-center justify-center rounded text-muted-foreground hover:bg-accent hover:text-foreground"
                        >
                            <Check
                                className={
                                    template.id === defaultTemplateId ? "size-3.5 text-brand" : "size-3.5 opacity-30"
                                }
                                aria-hidden="true"
                            />
                        </button>
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
                {templates.length > 0 && (
                    <p className="px-2 pt-1 pb-1 text-xs text-muted-foreground">
                        {defaultTemplate
                            ? `„Neu“ beginnt mit „${displayTitle(defaultTemplate)}“.`
                            : "„Neu“ legt leere Einträge an. Mit ✓ wird eine Vorlage zum Standard."}
                    </p>
                )}
                {templates.length > 0 && <div className="my-1 border-t" />}
                <MenuItem onSelect={() => void run(actions.onCreateTemplate)}>
                    <Plus className="size-4" aria-hidden="true" />
                    Neue Vorlage
                </MenuItem>
            </Menu>
        </div>
    );
}
