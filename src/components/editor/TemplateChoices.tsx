import { FileText, LayoutTemplate } from "lucide-react";
import { displayTitle } from "@/features/pages/page-display";
import type { Page } from "@/features/pages/types";

/** Page templates for an empty page (package 38b). */
export type PageTemplates = {
    pages: Page[];
    /** After the text: the template's title, icon and cover go to the page where it has none. */
    onApply: (template: Page) => Promise<void>;
};

/** Below an empty page: start with a template, like Notion's choices on a new page. */
export function TemplateChoices({
    templates,
    busy,
    error,
    onChoose,
}: {
    templates: Page[];
    busy: boolean;
    error: string;
    onChoose: (template: Page) => void;
}) {
    return (
        <section aria-label="Vorlagen" className="px-[var(--page-gutter)] pt-4 pb-8">
            <p className="mb-2 flex items-center gap-1.5 text-sm text-muted-foreground">
                <LayoutTemplate className="size-3.5" aria-hidden="true" />
                Mit einer Vorlage beginnen
            </p>
            <div className="flex flex-wrap gap-2">
                {templates.map((template) => (
                    <button
                        key={template.id}
                        type="button"
                        disabled={busy}
                        onClick={() => onChoose(template)}
                        className="flex max-w-full items-center gap-1.5 rounded-md border px-3 py-1.5 text-sm hover:bg-accent disabled:opacity-50 pointer-coarse:py-2.5"
                    >
                        {template.icon ? (
                            <span aria-hidden="true">{template.icon}</span>
                        ) : (
                            <FileText className="size-3.5 text-muted-foreground" aria-hidden="true" />
                        )}
                        <span className="truncate">{displayTitle(template)}</span>
                    </button>
                ))}
            </div>
            {error && (
                <p className="mt-2 text-sm text-destructive" role="alert">
                    {error}
                </p>
            )}
        </section>
    );
}
