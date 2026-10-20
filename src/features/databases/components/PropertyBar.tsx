import { useState } from "react";
import type { Page } from "@/features/pages/types";
import { buildRows } from "../database-model";
import { useDatabase } from "../hooks/useDatabase";
import { AddPropertyButton } from "./AddPropertyButton";
import { FormulaEditor } from "./FormulaEditor";
import { RecurrenceSetting } from "./RecurrenceSetting";
import { RollupEditor } from "./RollupEditor";
import { PropertyTypeIcon } from "./PropertyTypeIcon";
import { PropertyValueEditor } from "./PropertyValueEditor";

type PropertyBarProps = {
    entry: Page;
    databaseId: string;
    userId: string | undefined;
    /** Offline or without edit rights on the page. */
    readOnly: boolean;
    /** Databases of the workspace a relation can point to; undefined: no new relations here. */
    databases?: Page[];
};

/** The properties of an entry, between its title and its text (like Notion). */
export function PropertyBar({ entry, databaseId, userId, readOnly, databases }: PropertyBarProps) {
    const { data, error, fromCache, addProperty, addRelation, updateProperty, addOption, setValue } = useDatabase(
        databaseId,
        userId,
    );
    const [actionError, setActionError] = useState("");
    const [editedPropertyId, setEditedPropertyId] = useState("");

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
    const formulaProperty = properties.find(
        (property) => property.id === editedPropertyId && property.type === "formula",
    );
    const rollupProperty = properties.find(
        (property) => property.id === editedPropertyId && property.type === "rollup",
    );

    return (
        <section aria-label="Eigenschaften" className="mb-6 space-y-0.5 border-b px-[var(--page-gutter)] pb-4">
            {properties.map((property) => (
                <div key={property.id} className="grid grid-cols-[minmax(7rem,10rem)_1fr] items-start gap-2">
                    {(property.type === "formula" || property.type === "rollup") && editable ? (
                        <button
                            type="button"
                            onClick={() => setEditedPropertyId(property.id)}
                            aria-label={`${property.type === "formula" ? "Formel" : "Rollup"} „${property.name}“ bearbeiten`}
                            className="flex min-h-8 min-w-0 items-center gap-1.5 rounded text-left text-sm text-muted-foreground hover:bg-accent/60 hover:text-foreground"
                        >
                            <PropertyTypeIcon type={property.type} />
                            <span className="truncate">{property.name}</span>
                        </button>
                    ) : (
                        <span className="flex min-h-8 items-center gap-1.5 text-sm text-muted-foreground">
                            <PropertyTypeIcon type={property.type} />
                            <span className="truncate">{property.name}</span>
                        </span>
                    )}
                    <PropertyValueEditor
                        property={property}
                        value={row?.values[property.id] ?? null}
                        editable={editable}
                        onChange={(value) => setValue(entry.id, property.id, value)}
                        onCreateOption={(name) => addOption(property.id, name)}
                        onError={setActionError}
                        error={row?.errors[property.id]}
                    />
                </div>
            ))}
            <RecurrenceSetting
                entryId={entry.id}
                dateProperties={properties.filter((property) => property.type === "date")}
                editable={editable}
            />
            {editable && (
                <AddPropertyButton
                    label="Eigenschaft hinzufügen"
                    relationTargets={databases?.map(({ id, title, icon }) => ({ id, title, icon }))}
                    onAddRelation={(target) =>
                        addRelation(target, databases?.find((database) => database.id === databaseId)?.title ?? "")
                    }
                    onAdd={async (type) => {
                        const property = await addProperty(type);
                        if (type === "formula" || type === "rollup") setEditedPropertyId(property.id);
                    }}
                    onError={setActionError}
                />
            )}
            {formulaProperty && (
                <FormulaEditor
                    property={formulaProperty}
                    data={data}
                    sample={entry}
                    onClose={() => setEditedPropertyId("")}
                    onSave={(formula) => updateProperty(formulaProperty.id, { formula })}
                />
            )}
            {rollupProperty && (
                <RollupEditor
                    property={rollupProperty}
                    properties={properties}
                    onClose={() => setEditedPropertyId("")}
                    onSave={(rollup) => updateProperty(rollupProperty.id, { rollup })}
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
