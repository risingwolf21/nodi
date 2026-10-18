import { useState } from "react";
import { Plus } from "lucide-react";
import { Menu, MenuItem } from "@/components/ui/menu";
import { PROPERTY_TYPE_LABELS, PROPERTY_TYPES } from "../database-model";
import type { PropertyType } from "../types";
import { PropertyTypeIcon } from "./PropertyTypeIcon";

type AddPropertyButtonProps = {
    onAdd: (type: PropertyType) => Promise<void>;
    onError: (message: string) => void;
    label?: string;
};

/** "+" in the table header or the property bar: pick the type of a new property. */
export function AddPropertyButton({ onAdd, onError, label }: AddPropertyButtonProps) {
    const [open, setOpen] = useState(false);
    const [busy, setBusy] = useState(false);

    async function add(type: PropertyType) {
        setOpen(false);
        setBusy(true);
        try {
            await onAdd(type);
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
                onClick={() => setOpen(true)}
                className="flex h-8 items-center gap-1.5 rounded px-2 text-xs text-muted-foreground hover:bg-accent/60 pointer-coarse:h-10"
            >
                <Plus className="size-4" />
                {label}
            </button>
            <Menu detached open={open} onClose={() => setOpen(false)} align="end" className="w-52">
                <p className="px-2 pt-1 pb-1 text-xs text-muted-foreground">Neue Eigenschaft</p>
                <div className="max-h-72 overflow-y-auto">
                    {PROPERTY_TYPES.map((type) => (
                        <MenuItem key={type} onSelect={() => void add(type)}>
                            <PropertyTypeIcon type={type} />
                            {PROPERTY_TYPE_LABELS[type]}
                        </MenuItem>
                    ))}
                </div>
            </Menu>
        </div>
    );
}
