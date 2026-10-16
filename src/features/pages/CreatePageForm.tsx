
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { Page } from "./types";

type CreatePageFormProps = {
    title: string;
    parentId: string | null;
    pages: Page[];
    onTitleChange: (title: string) => void;
    onParentChange: (parentId: string | null) => void;
    onSubmit: (event: React.FormEvent<HTMLFormElement>) => void;
};

export function CreatePageForm({
    title,
    parentId,
    pages,
    onTitleChange,
    onParentChange,
    onSubmit,
}: CreatePageFormProps) {
    const parent = pages.find((page) => page.id === parentId);

    return (
        <form onSubmit={onSubmit} className="space-y-2 px-3 pb-3">
            {parentId && (
                <div className="flex items-center justify-between gap-2 text-xs text-muted-foreground">
                    <span className="truncate">
                        Unterseite von {parent?.title ?? "unbekannter Seite"}
                    </span>

                    <button
                        type="button"
                        onClick={() => onParentChange(null)}
                        className="shrink-0 underline"
                    >
                        Abbrechen
                    </button>
                </div>
            )}

            <div className="flex gap-1">
                <Input
                    value={title}
                    onChange={(event) => onTitleChange(event.target.value)}
                    placeholder={parentId ? "Neue Unterseite …" : "Neue Seite …"}
                    aria-label={parentId ? "Titel der neuen Unterseite" : "Titel der neuen Seite"}
                    maxLength={200}
                />

                <Button type="submit" size="sm" aria-label="Seite erstellen">
                    +
                </Button>
            </div>
        </form>
    );
}
