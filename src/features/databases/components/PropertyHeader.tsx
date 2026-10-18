import { useState, type FormEvent } from "react";
import { EyeOff, Trash2 } from "lucide-react";
import { Menu, MenuItem } from "@/components/ui/menu";
import { PROPERTY_TYPE_LABELS, PROPERTY_TYPES } from "../database-model";
import type { DatabaseProperty, PropertyType } from "../types";
import { ConfirmDialog } from "./ConfirmDialog";
import { PropertyTypeIcon } from "./PropertyTypeIcon";

type PropertyHeaderProps = {
    property: DatabaseProperty;
    editable: boolean;
    onRename: (name: string) => Promise<void>;
    onChangeType: (type: PropertyType) => Promise<void>;
    onHide: () => Promise<void>;
    onDelete: () => Promise<void>;
    onError: (message: string) => void;
};

/** Column title with a menu: rename, change the type, hide, delete. */
export function PropertyHeader({
    property,
    editable,
    onRename,
    onChangeType,
    onHide,
    onDelete,
    onError,
}: PropertyHeaderProps) {
    const [menuOpen, setMenuOpen] = useState(false);
    const [name, setName] = useState(property.name);
    const [confirm, setConfirm] = useState<{ kind: "delete" } | { kind: "type"; type: PropertyType } | null>(null);

    const report = (err: unknown) => onError(err instanceof Error ? err.message : "Das hat nicht geklappt.");

    function rename(event?: FormEvent<HTMLFormElement>) {
        event?.preventDefault();
        const next = name.trim();
        if (!next || next === property.name) return setName(property.name);
        onRename(next).catch((err: unknown) => {
            setName(property.name);
            report(err);
        });
    }

    return (
        <div className="relative">
            <button
                type="button"
                disabled={!editable}
                aria-expanded={menuOpen}
                onClick={() => {
                    setName(property.name);
                    setMenuOpen(true);
                }}
                className="flex h-8 w-full min-w-0 items-center gap-1.5 px-2 text-left text-xs font-medium text-muted-foreground hover:bg-accent/60 disabled:hover:bg-transparent"
            >
                <PropertyTypeIcon type={property.type} />
                <span className="truncate">{property.name}</span>
            </button>

            <Menu
                detached
                open={menuOpen}
                onClose={() => {
                    rename();
                    setMenuOpen(false);
                }}
                align="start"
                className="w-56"
            >
                <form onSubmit={rename} className="p-1">
                    <input
                        autoFocus
                        value={name}
                        maxLength={100}
                        aria-label="Name der Eigenschaft"
                        onChange={(event) => setName(event.target.value)}
                        className="h-7 w-full rounded border bg-transparent px-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
                    />
                </form>
                <p className="px-2 pt-2 pb-1 text-xs text-muted-foreground">Typ</p>
                <div className="max-h-56 overflow-y-auto">
                    {PROPERTY_TYPES.map((type) => (
                        <MenuItem
                            key={type}
                            onSelect={() => {
                                setMenuOpen(false);
                                if (type !== property.type) setConfirm({ kind: "type", type });
                            }}
                        >
                            <PropertyTypeIcon type={type} />
                            <span className="flex-1">{PROPERTY_TYPE_LABELS[type]}</span>
                            {type === property.type && <span className="text-xs text-brand">aktuell</span>}
                        </MenuItem>
                    ))}
                </div>
                <div className="my-1 border-t" />
                <MenuItem
                    onSelect={() => {
                        setMenuOpen(false);
                        onHide().catch(report);
                    }}
                >
                    <EyeOff className="size-4" />
                    In dieser Ansicht ausblenden
                </MenuItem>
                <MenuItem
                    destructive
                    onSelect={() => {
                        setMenuOpen(false);
                        setConfirm({ kind: "delete" });
                    }}
                >
                    <Trash2 className="size-4" />
                    Eigenschaft löschen
                </MenuItem>
            </Menu>

            {confirm?.kind === "delete" && (
                <ConfirmDialog
                    title="Eigenschaft löschen?"
                    message={`„${property.name}“ und ihre Werte in allen Einträgen werden gelöscht.`}
                    confirmLabel="Löschen"
                    onCancel={() => setConfirm(null)}
                    onConfirm={async () => {
                        await onDelete();
                        setConfirm(null);
                    }}
                />
            )}
            {confirm?.kind === "type" && (
                <ConfirmDialog
                    title="Typ ändern?"
                    message={`„${property.name}“ wird zu „${PROPERTY_TYPE_LABELS[confirm.type]}“. Die bisherigen Werte dieser Eigenschaft werden gelöscht.`}
                    confirmLabel="Typ ändern"
                    onCancel={() => setConfirm(null)}
                    onConfirm={async () => {
                        await onChangeType(confirm.type);
                        setConfirm(null);
                    }}
                />
            )}
        </div>
    );
}
