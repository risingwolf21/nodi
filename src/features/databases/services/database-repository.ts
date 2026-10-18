import { RemoteRequestError, toRequestError } from "@/lib/request-errors";
import { supabase } from "@/lib/supabase";
import { parseProperties, parseValues, parseViews } from "../database-model";
import type { DatabaseData, DatabaseProperty, DatabaseView, PropertyOption } from "../types";

export const DATABASE_OFFLINE_MESSAGE = "Offline: Die Datenbank kann erst wieder mit Internetverbindung geändert werden.";

// The columns under the app's names (PostgREST aliases), so the parsers
// read server rows and the cache alike.
const PROPERTY_COLUMNS = "id,databaseId:database_id,name,type,options,position";
const VIEW_COLUMNS = "id,databaseId:database_id,name,type,config,position";

type Response = {
    error: { message: string; code?: string } | null;
    status: number;
};

/** A failed request in German; technical details go to the console. */
function databaseError(response: Response, fallback: string): RemoteRequestError | null {
    const failure = toRequestError(response);
    if (!failure) return null;

    console.error(fallback, failure.reason, failure.message);
    const code = response.error?.code;
    const message =
        failure.reason === "offline"
            ? DATABASE_OFFLINE_MESSAGE
            : code === "42501"
              ? "Dafür fehlen dir die Rechte."
              : code === "22023"
                ? "Dieser Wert passt nicht zur Eigenschaft."
                : fallback;
    return new RemoteRequestError(failure.reason, message);
}

/** RLS filters changes without rights silently; the returned rows tell. */
function requireRow<T>(rows: T[] | null): T {
    const row = rows?.[0];
    if (!row) throw new Error("Du darfst diese Datenbank nicht ändern.");
    return row;
}

/** The server stores choices as `{"options": [...]}`. */
const optionsColumn = (options: PropertyOption[]) => ({ options });

export type NewProperty = Pick<DatabaseProperty, "name" | "type" | "options" | "position">;
export type PropertyChanges = Partial<Pick<DatabaseProperty, "name" | "type" | "options" | "position">>;
export type NewView = Pick<DatabaseView, "name" | "type" | "config" | "position">;
export type ViewChanges = Partial<Pick<DatabaseView, "name" | "config" | "position">>;

/** Whether a value write was taken or lost against a newer one (LWW). */
export type ValueWriteResult = "saved" | "superseded";

function parseWriteResult(data: unknown, mutationId: string): ValueWriteResult {
    const row: unknown = Array.isArray(data) ? data[0] : data;
    if (
        typeof row !== "object" ||
        row === null ||
        !("applied" in row) ||
        typeof row.applied !== "boolean" ||
        !("stored_mutation_id" in row)
    ) {
        throw new Error("Unerwartete Antwort beim Speichern des Werts.");
    }
    return row.applied || row.stored_mutation_id === mutationId ? "saved" : "superseded";
}

/**
 * Supabase access for databases (package 14a): properties and views are
 * plain rows under RLS, values go through `set_page_property` (LWW per
 * field). Entries are pages and loaded with the page tree.
 */
export const databaseRepository = {
    async load(databaseId: string): Promise<DatabaseData> {
        const [properties, views, values, documents, canEdit] = await Promise.all([
            supabase.from("database_properties").select(PROPERTY_COLUMNS).eq("database_id", databaseId).order("position"),
            supabase.from("database_views").select(VIEW_COLUMNS).eq("database_id", databaseId).order("position"),
            supabase
                .from("page_property_values")
                .select("pageId:page_id,propertyId:property_id,value,updatedAt:updated_at,pages!inner(parent_id)")
                .eq("pages.parent_id", databaseId),
            supabase
                .from("page_documents")
                .select("pageId:page_id,updatedAt:updated_at,pages!inner(parent_id)")
                .eq("pages.parent_id", databaseId),
            supabase.rpc("can_edit_page", { target_page_id: databaseId }),
        ]);

        for (const response of [properties, views, values, documents, canEdit]) {
            const failure = toRequestError(response);
            if (failure) throw failure;
        }

        const documentEditedAt: Record<string, string> = {};
        const documentRows: unknown[] = documents.data ?? [];
        for (const row of documentRows) {
            if (
                typeof row === "object" &&
                row !== null &&
                "pageId" in row &&
                typeof row.pageId === "string" &&
                "updatedAt" in row &&
                typeof row.updatedAt === "string"
            ) {
                documentEditedAt[row.pageId] = row.updatedAt;
            }
        }

        return {
            properties: parseProperties(properties.data),
            views: parseViews(views.data),
            values: parseValues(values.data),
            documentEditedAt,
            canEdit: canEdit.data === true,
        };
    },

    async addProperty(databaseId: string, property: NewProperty): Promise<DatabaseProperty> {
        const response = await supabase
            .from("database_properties")
            .insert({
                database_id: databaseId,
                name: property.name,
                type: property.type,
                options: optionsColumn(property.options),
                position: property.position,
            })
            .select(PROPERTY_COLUMNS);
        const failure = databaseError(response, "Die Eigenschaft konnte nicht angelegt werden.");
        if (failure) throw failure;
        return requireRow(parseProperties(response.data));
    },

    async updateProperty(propertyId: string, changes: PropertyChanges): Promise<DatabaseProperty> {
        const { options, ...rest } = changes;
        const response = await supabase
            .from("database_properties")
            .update(options ? { ...rest, options: optionsColumn(options) } : rest)
            .eq("id", propertyId)
            .select(PROPERTY_COLUMNS);
        const failure = databaseError(response, "Die Eigenschaft konnte nicht geändert werden.");
        if (failure) throw failure;
        return requireRow(parseProperties(response.data));
    },

    async deleteProperty(propertyId: string): Promise<void> {
        const response = await supabase.from("database_properties").delete().eq("id", propertyId).select("id");
        const failure = databaseError(response, "Die Eigenschaft konnte nicht gelöscht werden.");
        if (failure) throw failure;
        requireRow(response.data);
    },

    async addView(databaseId: string, view: NewView): Promise<DatabaseView> {
        const response = await supabase
            .from("database_views")
            .insert({ database_id: databaseId, ...view })
            .select(VIEW_COLUMNS);
        const failure = databaseError(response, "Die Ansicht konnte nicht angelegt werden.");
        if (failure) throw failure;
        return requireRow(parseViews(response.data));
    },

    async updateView(viewId: string, changes: ViewChanges): Promise<DatabaseView> {
        const response = await supabase.from("database_views").update(changes).eq("id", viewId).select(VIEW_COLUMNS);
        const failure = databaseError(response, "Die Ansicht konnte nicht geändert werden.");
        if (failure) throw failure;
        return requireRow(parseViews(response.data));
    },

    async deleteView(viewId: string): Promise<void> {
        const response = await supabase.from("database_views").delete().eq("id", viewId).select("id");
        const failure = databaseError(response, "Die Ansicht konnte nicht gelöscht werden.");
        if (failure) throw failure;
        requireRow(response.data);
    },

    /** LWW per field: `editedAt` is when the user changed the value. */
    async setValue(
        pageId: string,
        propertyId: string,
        value: unknown,
        editedAt: string,
        mutationId: string,
    ): Promise<ValueWriteResult> {
        const response = await supabase.rpc("set_page_property", {
            p_page_id: pageId,
            p_property_id: propertyId,
            p_value: value,
            p_edited_at: editedAt,
            p_mutation_id: mutationId,
        });
        const failure = databaseError(response, "Der Wert konnte nicht gespeichert werden.");
        if (failure) throw failure;
        return parseWriteResult(response.data, mutationId);
    },
};

