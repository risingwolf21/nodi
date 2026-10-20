import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { PROPERTY_TYPE_LABELS } from "../database-model";
import { canRollUp, ROLLUP_FUNCTION_LABELS, rollupFunctionsFor } from "../rollup";
import { databaseRepository } from "../services/database-repository";
import { TITLE_FIELD, type DatabaseProperty, type RollupFunction, type RollupSettings } from "../types";

type RollupEditorProps = {
    property: DatabaseProperty;
    /** The properties of this database; its relations are what a rollup can read through. */
    properties: DatabaseProperty[];
    onClose: () => void;
    onSave: (rollup: RollupSettings) => Promise<void>;
};

const selectClass =
    "h-9 w-full rounded-md border bg-transparent px-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring/50";

/** Setting up a rollup (package 24): which relation, which property of the related entries, which function. */
export function RollupEditor({ property, properties, onClose, onSave }: RollupEditorProps) {
    const relations = properties.filter((item) => item.type === "relation" && item.relation);
    const [relationId, setRelationId] = useState(property.rollup?.relationPropertyId ?? relations[0]?.id ?? "");
    const [targetId, setTargetId] = useState(property.rollup?.targetPropertyId ?? TITLE_FIELD);
    const [fn, setFn] = useState<RollupFunction>(property.rollup?.function ?? "count_all");
    const [targets, setTargets] = useState<{ databaseId: string; properties: DatabaseProperty[] } | null>(null);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState("");

    const relation = relations.find((item) => item.id === relationId);
    const databaseId = relation?.relation?.databaseId ?? "";

    // The properties of the related database, loaded when the relation is chosen.
    useEffect(() => {
        if (!databaseId) return;
        let current = true;
        databaseRepository
            .listProperties(databaseId)
            .then((list) => {
                if (current) setTargets({ databaseId, properties: list.filter((item) => canRollUp(item.type)) });
            })
            .catch((err: unknown) => {
                if (current) setError(err instanceof Error ? err.message : "Die Eigenschaften fehlen.");
            });
        return () => {
            current = false;
        };
    }, [databaseId]);

    const targetProperties = targets?.databaseId === databaseId ? targets.properties : [];
    const target = targetProperties.find((item) => item.id === targetId);
    const functions = rollupFunctionsFor(targetId === TITLE_FIELD ? "title" : (target?.type ?? "title"));
    const chosenFunction = functions.includes(fn) ? fn : functions[0];

    async function save() {
        setBusy(true);
        setError("");
        try {
            await onSave({ relationPropertyId: relationId, targetPropertyId: targetId, function: chosenFunction });
            onClose();
        } catch (err) {
            setError(err instanceof Error ? err.message : "Das Rollup konnte nicht gespeichert werden.");
            setBusy(false);
        }
    }

    return (
        <Dialog labelledBy="rollup-title" onClose={onClose} busy={busy} className="w-[min(28rem,calc(100vw-2rem))]">
            <h2 id="rollup-title" className="text-lg font-semibold">
                Rollup „{property.name}“
            </h2>
            {relations.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                    Ein Rollup liest Werte verknüpfter Einträge. Lege zuerst eine Verknüpfung an.
                </p>
            ) : (
                <div className="space-y-3">
                    <label className="block space-y-1 text-sm">
                        <span className="text-muted-foreground">Verknüpfung</span>
                        <select
                            value={relationId}
                            onChange={(event) => {
                                setRelationId(event.target.value);
                                setTargetId(TITLE_FIELD);
                            }}
                            className={selectClass}
                        >
                            {relations.map((item) => (
                                <option key={item.id} value={item.id}>
                                    {item.name}
                                </option>
                            ))}
                        </select>
                    </label>
                    <label className="block space-y-1 text-sm">
                        <span className="text-muted-foreground">Eigenschaft</span>
                        <select
                            value={targetId}
                            onChange={(event) => setTargetId(event.target.value)}
                            className={selectClass}
                        >
                            <option value={TITLE_FIELD}>Name</option>
                            {targetProperties.map((item) => (
                                <option key={item.id} value={item.id}>
                                    {item.name} ({PROPERTY_TYPE_LABELS[item.type]})
                                </option>
                            ))}
                        </select>
                    </label>
                    <label className="block space-y-1 text-sm">
                        <span className="text-muted-foreground">Berechnung</span>
                        <select
                            value={chosenFunction}
                            onChange={(event) =>
                                setFn(functions.find((item) => item === event.target.value) ?? chosenFunction)
                            }
                            className={selectClass}
                        >
                            {functions.map((item) => (
                                <option key={item} value={item}>
                                    {ROLLUP_FUNCTION_LABELS[item]}
                                </option>
                            ))}
                        </select>
                    </label>
                </div>
            )}
            {error && (
                <p role="alert" className="text-sm text-destructive">
                    {error}
                </p>
            )}
            <div className="flex justify-end gap-2">
                <Button type="button" variant="outline" onClick={onClose} disabled={busy}>
                    Abbrechen
                </Button>
                <Button type="button" onClick={() => void save()} disabled={busy || relations.length === 0}>
                    Speichern
                </Button>
            </div>
        </Dialog>
    );
}
