import { useState, type FormEvent } from "react";
import { Check } from "lucide-react";
import { Menu } from "@/components/ui/menu";
import type { PropertyOption } from "../types";
import { OptionBadge } from "./OptionBadge";

type OptionPickerProps = {
    open: boolean;
    options: PropertyOption[];
    selectedIds: string[];
    /** Several options (multi-select) or one (select, status). */
    multiple: boolean;
    label: string;
    onClose: () => void;
    onToggle: (optionId: string) => void;
    onClear: () => void;
    /** Creates an option with this name and selects it. */
    onCreate: (name: string) => Promise<void>;
};

/** Choosing options like in Notion: type to filter, Enter creates a new one. */
export function OptionPicker({
    open,
    options,
    selectedIds,
    multiple,
    label,
    onClose,
    onToggle,
    onClear,
    onCreate,
}: OptionPickerProps) {
    const [query, setQuery] = useState("");
    const [error, setError] = useState("");
    const needle = query.trim().toLocaleLowerCase("de");
    const matching = options.filter((option) => option.name.toLocaleLowerCase("de").includes(needle));
    const exact = options.find((option) => option.name.toLocaleLowerCase("de") === needle);

    async function submit(event: FormEvent<HTMLFormElement>) {
        event.preventDefault();
        if (!needle) return;
        setError("");
        try {
            if (exact) onToggle(exact.id);
            else await onCreate(query.trim());
            setQuery("");
            if (!multiple) onClose();
        } catch (err) {
            setError(err instanceof Error ? err.message : "Die Option konnte nicht angelegt werden.");
        }
    }

    return (
        <Menu open={open} onClose={onClose} align="start" role="dialog" label={label} className="w-60">
            <form onSubmit={(event) => void submit(event)} className="p-1">
                <input
                    autoFocus
                    value={query}
                    onChange={(event) => setQuery(event.target.value)}
                    placeholder="Option suchen oder anlegen"
                    aria-label="Option suchen oder anlegen"
                    className="h-7 w-full rounded border bg-transparent px-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
                />
            </form>
            {error && (
                <p role="alert" className="px-2 py-1 text-xs text-destructive">
                    {error}
                </p>
            )}
            <ul className="max-h-60 overflow-y-auto py-1">
                {matching.map((option) => (
                    <li key={option.id}>
                        <button
                            type="button"
                            onClick={() => {
                                onToggle(option.id);
                                if (!multiple) onClose();
                            }}
                            className="flex w-full items-center gap-2 rounded px-2 py-1 text-left hover:bg-accent pointer-coarse:py-2"
                        >
                            <span className="min-w-0 flex-1">
                                <OptionBadge option={option} />
                            </span>
                            {selectedIds.includes(option.id) && <Check className="size-4 shrink-0 text-brand" />}
                        </button>
                    </li>
                ))}
                {needle && !exact && (
                    <li className="px-2 py-1 text-xs text-muted-foreground">
                        Enter legt „{query.trim()}“ an
                    </li>
                )}
            </ul>
            {selectedIds.length > 0 && (
                <button
                    type="button"
                    onClick={() => {
                        onClear();
                        onClose();
                    }}
                    className="w-full rounded border-t px-2 py-1.5 text-left text-xs text-muted-foreground hover:bg-accent"
                >
                    Leeren
                </button>
            )}
        </Menu>
    );
}
