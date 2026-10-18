import { useState } from "react";
import type { Page } from "@/features/pages/types";
import { buildRows } from "../database-model";
import { useDatabase } from "../hooks/useDatabase";
import { AddPropertyButton } from "./AddPropertyButton";
import { PropertyTypeIcon } from "./PropertyTypeIcon";
import { PropertyValueEditor } from "./PropertyValueEditor";

type PropertyBarProps = {
    entry: Page;
    databaseId: string;
    userId: string | undefined;
    /** Offline or without edit rights on the page. */
    readOnly: boolean;
};

/** The properties of an entry, between its title and its text (like Notion). */
export function PropertyBar({ entry, databaseId, userId, readOnly }: PropertyBarProps) {
    const { data, error, fromCache, addProperty, addOption, setValue } = useDatabase(databaseId, userId);
    const [actionError, setActionError] = useState("");

    if (!data) {
        return error ? (
            <p className="mb-4 px-[var(--page-gutter)] text-sm text-muted-foreground" role="alert">
                {error}
            </p>
        ) : null;
    }

    const editable = !readOnly && !fromCache && data.canEdit;
    const [row] = buildRows([entry], data);
    const properties = [...data.properties].sort((a, b) => a.position - b.position);

    return (
        <section aria-label="Eigenschaften" className="mb-6 space-y-0.5 border-b px-[var(--page-gutter)] pb-4">
            {properties.map((property) => (
                <div key={property.id} className="grid grid-cols-[minmax(7rem,10rem)_1fr] items-start gap-2">
                    <span className="flex min-h-8 items-center gap-1.5 text-sm text-muted-foreground">
                        <PropertyTypeIcon type={property.type} />
                        <span className="truncate">{property.name}</span>
                    </span>
                    <PropertyValueEditor
                        property={property}
                        value={row?.values[property.id] ?? null}
                        editable={editable}
                        onChange={(value) => setValue(entry.id, property.id, value)}
                        onCreateOption={(name) => addOption(property.id, name)}
                        onError={setActionError}
                    />
                </div>
            ))}
            {editable && (
                <AddPropertyButton
                    label="Eigenschaft hinzufügen"
                    onAdd={async (type) => {
                        await addProperty(type);
                    }}
                    onError={setActionError}
                />
            )}
            {actionError && (
                <p className="text-sm text-destructive" role="alert">
                    {actionError}
                </p>
            )}
        </section>
    );
}

