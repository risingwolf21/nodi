import { useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import type { Page } from "@/features/pages/types";
import { buildRows, formatValue } from "../database-model";
import { FormulaError, MAX_EXPRESSION_LENGTH, parseFormula } from "../formula/formula-parser";
import type { DatabaseData, DatabaseProperty } from "../types";
import { PropertyTypeIcon } from "./PropertyTypeIcon";

type FormulaEditorProps = {
    property: DatabaseProperty;
    data: DatabaseData;
    /** The preview is computed for this entry, if there is one. */
    sample: Page | undefined;
    onClose: () => void;
    onSave: (expression: string) => Promise<void>;
};

/** Short help, in the order people usually need it. */
const FUNCTIONS: { insert: string; help: string }[] = [
    { insert: "if(", help: "if(Bedingung, dann, sonst)" },
    { insert: "concat(", help: "concat(Text, Text, …)" },
    { insert: "round(", help: "round(Zahl, Stellen)" },
    { insert: "empty(", help: "empty(Wert) – leer?" },
    { insert: "contains(", help: "contains(Text, Suche)" },
    { insert: "replace(", help: "replace(Text, alt, neu)" },
    { insert: "length(", help: "length(Text)" },
    { insert: "upper(", help: "upper(Text) / lower(Text)" },
    { insert: "min(", help: "min(…) / max(…)" },
    { insert: "abs(", help: "abs / floor / ceil (Zahl)" },
    { insert: "format(", help: "format(Wert) – als Text" },
    { insert: "toNumber(", help: "toNumber(Text)" },
    { insert: "now()", help: "now() – jetzt" },
    { insert: "dateAdd(", help: 'dateAdd(Datum, 1, "days")' },
    { insert: "dateBetween(", help: 'dateBetween(später, früher, "days")' },
    { insert: "formatDate(", help: 'formatDate(Datum, "DD.MM.YYYY")' },
];

/** Writing a formula in Notion's syntax, with a live preview for one entry. */
export function FormulaEditor({ property, data, sample, onClose, onSave }: FormulaEditorProps) {
    const [expression, setExpression] = useState(property.formula ?? "");
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState("");
    const textRef = useRef<HTMLTextAreaElement>(null);

    // The draft takes the place of the stored expression for the preview.
    // Without an entry only the syntax can be checked.
    const preview = useMemo((): { error?: string; text: string } => {
        if (!sample) {
            try {
                parseFormula(expression);
                return { text: "" };
            } catch (err) {
                if (err instanceof FormulaError) return { error: err.message, text: "" };
                throw err;
            }
        }
        const draft = { ...property, formula: expression };
        const properties = data.properties.map((item) => (item.id === property.id ? draft : item));
        const [row] = buildRows([sample], { ...data, properties });
        return { error: row.errors[property.id], text: formatValue(draft, row.values[property.id] ?? null) };
    }, [data, expression, property, sample]);

    const others = [...data.properties]
        .filter((item) => item.id !== property.id)
        .sort((a, b) => a.position - b.position);

    function insert(text: string) {
        const field = textRef.current;
        const start = field?.selectionStart ?? expression.length;
        const end = field?.selectionEnd ?? expression.length;
        const next = expression.slice(0, start) + text + expression.slice(end);
        setExpression(next.slice(0, MAX_EXPRESSION_LENGTH));
        requestAnimationFrame(() => {
            field?.focus();
            field?.setSelectionRange(start + text.length, start + text.length);
        });
    }

    async function save() {
        setBusy(true);
        setError("");
        try {
            await onSave(expression.trim());
            onClose();
        } catch (err) {
            setError(err instanceof Error ? err.message : "Die Formel konnte nicht gespeichert werden.");
            setBusy(false);
        }
    }

    return (
        <Dialog labelledBy="formula-title" onClose={onClose} busy={busy} className="w-[min(40rem,calc(100vw-2rem))]">
            <h2 id="formula-title" className="text-lg font-semibold">
                Formel „{property.name}“
            </h2>
            <textarea
                ref={textRef}
                autoFocus
                value={expression}
                maxLength={MAX_EXPRESSION_LENGTH}
                onChange={(event) => setExpression(event.target.value)}
                onKeyDown={(event) => {
                    if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) void save();
                }}
                aria-label="Formel"
                placeholder={'z. B. prop("Preis") * prop("Menge")'}
                spellCheck={false}
                rows={4}
                className="w-full resize-y rounded-md border bg-transparent px-3 py-2 font-mono text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
            />
            <div className="min-h-10 rounded-md bg-muted/50 px-3 py-2 text-sm" aria-live="polite">
                {preview.error ? (
                    <span className="text-destructive">{preview.error}</span>
                ) : sample ? (
                    <>
                        <span className="text-muted-foreground">Ergebnis für „{sample.title || "Ohne Titel"}“: </span>
                        <span className="font-medium">{preview.text || "leer"}</span>
                    </>
                ) : (
                    <span className="text-muted-foreground">
                        Die Formel ist gültig. Ein Ergebnis gibt es mit dem ersten Eintrag.
                    </span>
                )}
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
                <section aria-label="Eigenschaften einfügen">
                    <h3 className="pb-1 text-xs font-medium text-muted-foreground">Eigenschaften</h3>
                    <div className="flex max-h-40 flex-wrap gap-1 overflow-y-auto">
                        {[{ id: "title", name: "Name", type: "text" as const }, ...others].map((item) => (
                            <button
                                key={item.id}
                                type="button"
                                onClick={() => insert(`prop("${item.name.replace(/(["\\])/g, "\\$1")}")`)}
                                className="flex items-center gap-1 rounded border px-1.5 py-0.5 text-xs hover:bg-accent"
                            >
                                <PropertyTypeIcon type={item.type} className="size-3" />
                                {item.name}
                            </button>
                        ))}
                    </div>
                </section>
                <section aria-label="Funktionen einfügen">
                    <h3 className="pb-1 text-xs font-medium text-muted-foreground">Funktionen</h3>
                    <ul className="max-h-40 space-y-0.5 overflow-y-auto">
                        {FUNCTIONS.map((fn) => (
                            <li key={fn.insert}>
                                <button
                                    type="button"
                                    onClick={() => insert(fn.insert)}
                                    className="w-full rounded px-1.5 py-0.5 text-left font-mono text-xs hover:bg-accent"
                                >
                                    {fn.help}
                                </button>
                            </li>
                        ))}
                    </ul>
                </section>
            </div>
            <p className="text-xs text-muted-foreground">
                Rechnen mit + − * / % ^, vergleichen mit == != &lt; &gt; &lt;= &gt;=, verknüpfen mit and, or, not. Text
                in Anführungszeichen; + hängt Texte aneinander.
            </p>
            {error && (
                <p role="alert" className="text-sm text-destructive">
                    {error}
                </p>
            )}
            <div className="flex justify-end gap-2">
                <Button type="button" variant="outline" onClick={onClose} disabled={busy}>
                    Abbrechen
                </Button>
                <Button type="button" onClick={() => void save()} disabled={busy}>
                    Speichern
                </Button>
            </div>
        </Dialog>
    );
}
