import { useState } from "react";
import { Plus, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import type { ButtonAction, ButtonSettings, DatabaseProperty, PropertyType } from "../types";

type ButtonEditorProps = {
    property: DatabaseProperty;
    /** The properties of this database; actions set some of them. */
    properties: DatabaseProperty[];
    onClose: () => void;
    onSave: (button: ButtonSettings) => Promise<void>;
};

/** The types a button sets (package 32f); others are set in the entry itself. */
const SETTABLE: readonly PropertyType[] = ["checkbox", "select", "status", "date"];
const MAX_ACTIONS = 10;
const TODAY = "today";
const CLEAR = "";

const selectClass =
    "h-9 w-full min-w-0 rounded-md border bg-transparent px-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring/50";

/** The choices of an action's value, as select values ("" clears). */
function valueChoices(property: DatabaseProperty): { value: string; label: string }[] {
    if (property.type === "checkbox") {
        return [
            { value: "true", label: "Angehakt" },
            { value: "false", label: "Nicht angehakt" },
        ];
    }
    if (property.type === "date") {
        return [
            { value: TODAY, label: "Heute" },
            { value: CLEAR, label: "Leeren" },
        ];
    }
    return [
        ...property.options.map((option) => ({ value: option.id, label: option.name })),
        { value: CLEAR, label: "Leeren" },
    ];
}

function choiceOf(action: ButtonAction): string {
    if ("today" in action) return TODAY;
    if (action.value === null) return CLEAR;
    return typeof action.value === "boolean" || typeof action.value === "string" ? String(action.value) : CLEAR;
}

function actionFor(property: DatabaseProperty, choice: string): ButtonAction {
    if (choice === TODAY) return { propertyId: property.id, today: true };
    if (property.type === "checkbox") return { propertyId: property.id, value: choice === "true" };
    return { propertyId: property.id, value: choice === CLEAR ? null : choice };
}

/** Setting up a button (package 32f): its label and the values a click sets. */
export function ButtonEditor({ property, properties, onClose, onSave }: ButtonEditorProps) {
    const settable = properties.filter((item) => SETTABLE.includes(item.type));
    const [label, setLabel] = useState(property.button?.label || property.name);
    const [actions, setActions] = useState<ButtonAction[]>(
        (property.button?.actions ?? []).filter((action) => settable.some((item) => item.id === action.propertyId)),
    );
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState("");

    const addAction = () => {
        const target = settable.find((item) => !actions.some((action) => action.propertyId === item.id)) ?? settable[0];
        if (target) setActions((current) => [...current, actionFor(target, valueChoices(target)[0].value)]);
    };

    async function save() {
        setBusy(true);
        setError("");
        try {
            await onSave({ label: label.trim().slice(0, 100), actions });
            onClose();
        } catch (err) {
            setError(err instanceof Error ? err.message : "Der Button konnte nicht gespeichert werden.");
            setBusy(false);
        }
    }

    return (
        <Dialog labelledBy="button-title" onClose={onClose} busy={busy} className="w-[min(30rem,calc(100vw-2rem))]">
            <h2 id="button-title" className="text-lg font-semibold">
                Button „{property.name}“
            </h2>
            <label className="block space-y-1 text-sm">
                <span className="text-muted-foreground">Beschriftung</span>
                <input
                    value={label}
                    maxLength={100}
                    onChange={(event) => setLabel(event.target.value)}
                    className={selectClass}
                />
            </label>
            <div className="space-y-2 text-sm">
                <p className="text-muted-foreground">Ein Klick setzt im Eintrag:</p>
                {settable.length === 0 && (
                    <p className="text-muted-foreground">
                        Lege zuerst eine Checkbox-, Auswahl-, Status- oder Datums-Eigenschaft an.
                    </p>
                )}
                {actions.map((action, index) => {
                    const target = settable.find((item) => item.id === action.propertyId);
                    if (!target) return null;
                    return (
                        <div key={index} className="flex items-center gap-2">
                            <select
                                aria-label={`Eigenschaft der Aktion ${index + 1}`}
                                value={target.id}
                                onChange={(event) => {
                                    const next = settable.find((item) => item.id === event.target.value);
                                    if (!next) return;
                                    setActions((current) =>
                                        current.map((item, at) =>
                                            at === index ? actionFor(next, valueChoices(next)[0].value) : item,
                                        ),
                                    );
                                }}
                                className={selectClass}
                            >
                                {settable.map((item) => (
                                    <option key={item.id} value={item.id}>
                                        {item.name}
                                    </option>
                                ))}
                            </select>
                            <select
                                aria-label={`Wert der Aktion ${index + 1}`}
                                value={choiceOf(action)}
                                onChange={(event) =>
                                    setActions((current) =>
                                        current.map((item, at) =>
                                            at === index ? actionFor(target, event.target.value) : item,
                                        ),
                                    )
                                }
                                className={selectClass}
                            >
                                {valueChoices(target).map((choice) => (
                                    <option key={choice.value} value={choice.value}>
                                        {choice.label}
                                    </option>
                                ))}
                            </select>
                            <button
                                type="button"
                                aria-label={`Aktion ${index + 1} entfernen`}
                                onClick={() => setActions((current) => current.filter((_, at) => at !== index))}
                                className="flex size-8 shrink-0 items-center justify-center rounded text-muted-foreground hover:bg-accent"
                            >
                                <X className="size-4" />
                            </button>
                        </div>
                    );
                })}
                {settable.length > 0 && actions.length < MAX_ACTIONS && (
                    <button
                        type="button"
                        onClick={addAction}
                        className="flex h-8 items-center gap-1.5 rounded px-1 text-muted-foreground hover:bg-accent"
                    >
                        <Plus className="size-4" />
                        Aktion hinzufügen
                    </button>
                )}
            </div>
            {error && (
                <p className="text-sm text-destructive" role="alert">
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
