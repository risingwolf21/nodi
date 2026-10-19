import { useState } from "react";
import { ArrowLeft, Plus } from "lucide-react";
import { Menu, MenuItem } from "@/components/ui/menu";
import { displayTitle } from "@/features/pages/page-display";
import { PROPERTY_TYPE_LABELS, PROPERTY_TYPES } from "../database-model";
import type { PropertyType, RelatedEntry } from "../types";
import { PropertyTypeIcon } from "./PropertyTypeIcon";

type AddPropertyButtonProps = {
    onAdd: (type: PropertyType) => Promise<void>;
    /** Databases a relation can point to; without them there is no "Verknüpfung". */
    relationTargets?: RelatedEntry[];
    onAddRelation?: (target: RelatedEntry) => Promise<void>;
    onError: (message: string) => void;
    label?: string;
};

/** "+" in the table header or the property bar: pick the type of a new property. */
export function AddPropertyButton({ onAdd, relationTargets, onAddRelation, onError, label }: AddPropertyButtonProps) {
    const [open, setOpen] = useState(false);
    const [choosingTarget, setChoosingTarget] = useState(false);
    const [busy, setBusy] = useState(false);
    const canRelate = relationTargets !== undefined && onAddRelation !== undefined;
    // A relation needs its target first (and the server creates both sides).
    const types = PROPERTY_TYPES.filter((type) => type !== "relation" || canRelate);

    async function run(action: () => Promise<void>) {
        setOpen(false);
        setBusy(true);
        try {
            await action();
        } catch (err) {
            onError(err instanceof Error ? err.message : "Die Eigenschaft konnte nicht angelegt werden.");
        } finally {
            setBusy(false);
        }
    }

    return (
        <div className="relative">
            <button
                type="button"
                aria-label="Eigenschaft hinzufügen"
                aria-expanded={open}
                disabled={busy}
                onClick={() => {
                    setChoosingTarget(false);
                    setOpen(true);
                }}
                className="flex h-8 items-center gap-1.5 rounded px-2 text-xs text-muted-foreground hover:bg-accent/60 pointer-coarse:h-10"
            >
                <Plus className="size-4" />
                {label}
            </button>
            <Menu detached open={open} onClose={() => setOpen(false)} align="end" className="w-56">
                {choosingTarget && relationTargets && onAddRelation ? (
                    <>
                        <MenuItem onSelect={() => setChoosingTarget(false)}>
                            <ArrowLeft className="size-4" />
                            Verknüpfung mit …
                        </MenuItem>
                        <div className="max-h-72 overflow-y-auto">
                            {relationTargets.map((target) => (
                                <MenuItem key={target.id} onSelect={() => void run(() => onAddRelation(target))}>
                                    <span className="truncate">
                                        {target.icon ? `${target.icon} ` : ""}
                                        {displayTitle(target)}
                                    </span>
                                </MenuItem>
                            ))}
                            {relationTargets.length === 0 && (
                                <p className="px-2 py-1 text-xs text-muted-foreground">Keine Datenbank gefunden.</p>
                            )}
                        </div>
                    </>
                ) : (
                    <>
                        <p className="px-2 pt-1 pb-1 text-xs text-muted-foreground">Neue Eigenschaft</p>
                        <div className="max-h-72 overflow-y-auto">
                            {types.map((type) => (
                                <MenuItem
                                    key={type}
                                    onSelect={() =>
                                        type === "relation" ? setChoosingTarget(true) : void run(() => onAdd(type))
                                    }
                                >
                                    <PropertyTypeIcon type={type} />
                                    {PROPERTY_TYPE_LABELS[type]}
                                </MenuItem>
                            ))}
                        </div>
                    </>
                )}
            </Menu>
        </div>
    );
}
