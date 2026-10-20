import { RemoteRequestError, toRequestError } from "@/lib/request-errors";
import { supabase } from "@/lib/supabase";
import { parseProperties, parseValues, parseViews, previewText } from "../database-model";
import { canRollUp } from "../rollup";
import {
    TITLE_FIELD,
    type DatabaseBlockRef,
    type DatabaseData,
    type DatabaseProperty,
    type DatabaseView,
    type PropertyOption,
    type RelatedEntry,
} from "../types";

export const DATABASE_OFFLINE_MESSAGE =
    "Offline: Die Datenbank kann erst wieder mit Internetverbindung geändert werden.";

// The columns under the app's names (PostgREST aliases), so the parsers
// read server rows and the cache alike.
const PROPERTY_COLUMNS = "id,databaseId:database_id,name,type,options,position";
const VIEW_COLUMNS = "id,databaseId:database_id,name,type,config,position";
// The feed shows the start of each entry's text: only the first blocks are
// sent, not whole documents.
/** Views of a database block live in their own table, with the same columns. */
const viewTable = (block: DatabaseBlockRef | undefined) => (block ? "block_views" : "database_views");

/** Views of the database, or of a block that shows it (package 19c). */
function viewsQuery(databaseId: string, block: DatabaseBlockRef | undefined) {
    const query = supabase.from(viewTable(block)).select(VIEW_COLUMNS).eq("database_id", databaseId);
    return (block ? query.eq("page_id", block.pageId).eq("block_id", block.blockId) : query).order("position");
}

const PREVIEW_BLOCKS = ["block0:document->0", "block1:document->1", "block2:document->2"].join(",");

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

export type NewProperty = Pick<DatabaseProperty, "name" | "type" | "options" | "position" | "numberFormat">;
export type PropertyChanges = Partial<
    Pick<DatabaseProperty, "name" | "type" | "options" | "position" | "formula" | "numberFormat" | "rollup">
>;
export type NewView = Pick<DatabaseView, "name" | "type" | "config" | "position">;
export type ViewChanges = Partial<Pick<DatabaseView, "name" | "config" | "position">>;

/**
 * Relations show the entries of their database: its readable, not archived
 * entries are loaded with the properties (RLS decides what is readable).
 */
async function withRelatedEntries(properties: DatabaseProperty[]): Promise<DatabaseProperty[]> {
    const targets = [...new Set(properties.flatMap((property) => property.relation?.databaseId ?? []))];
    if (targets.length === 0) return properties;

    const response = await supabase
        .from("pages")
        .select("id,title,icon,parentId:parent_id")
        .in("parent_id", targets)
        .eq("is_archived", false)
        .order("position", { ascending: true, nullsFirst: false })
        .order("created_at");
    const failure = toRequestError(response);
    if (failure) throw failure;

    const rows: unknown[] = response.data ?? [];
    const byDatabase = new Map<string, RelatedEntry[]>();
    for (const row of rows) {
        if (
            typeof row !== "object" ||
            row === null ||
            !("id" in row && typeof row.id === "string") ||
            !("parentId" in row && typeof row.parentId === "string") ||
            !("title" in row && typeof row.title === "string")
        ) {
            throw new Error("Unerwartete Daten der verknüpften Datenbank.");
        }
        const icon = "icon" in row && typeof row.icon === "string" ? row.icon : null;
        byDatabase.set(row.parentId, [...(byDatabase.get(row.parentId) ?? []), { id: row.id, title: row.title, icon }]);
    }
    return properties.map((property) =>
        property.relation
            ? {
                  ...property,
                  relation: { ...property.relation, entries: byDatabase.get(property.relation.databaseId) ?? [] },
              }
            : property,
    );
}

/**
 * Rollups read a property of the related entries: its definition and its
 * stored values are loaded with the database, like the related entries
 * (RLS decides what is readable). The title needs nothing more.
 */
async function withRollupTargets(properties: DatabaseProperty[]): Promise<DatabaseProperty[]> {
    const targetIds = [
        ...new Set(
            properties.flatMap((property) =>
                property.rollup && property.rollup.targetPropertyId !== TITLE_FIELD
                    ? [property.rollup.targetPropertyId]
                    : [],
            ),
        ),
    ];
    if (targetIds.length === 0) return properties;

    const [targets, values] = await Promise.all([
        supabase.from("database_properties").select(PROPERTY_COLUMNS).in("id", targetIds),
        supabase
            .from("page_property_values")
            .select("pageId:page_id,propertyId:property_id,value,updatedAt:updated_at")
            .in("property_id", targetIds),
    ]);
    for (const response of [targets, values]) {
        const failure = toRequestError(response);
        if (failure) throw failure;
    }
    // Computed targets have no stored values: the rollup shows nothing for them.
    const targetProperties = new Map(
        parseProperties(targets.data)
            .filter((property) => canRollUp(property.type))
            .map((property) => [property.id, property]),
    );
    const valuesByProperty = new Map<string, Record<string, unknown>>();
    for (const value of parseValues(values.data)) {
        const record = valuesByProperty.get(value.propertyId) ?? {};
        record[value.pageId] = value.value;
        valuesByProperty.set(value.propertyId, record);
    }
    return properties.map((property) => {
        const rollup = property.rollup;
        if (!rollup || rollup.targetPropertyId === TITLE_FIELD) return property;
        const target = targetProperties.get(rollup.targetPropertyId) ?? null;
        const loaded = { property: target, values: valuesByProperty.get(rollup.targetPropertyId) ?? {} };
        return { ...property, rollup: { ...rollup, target: loaded } };
    });
}

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
    async load(databaseId: string, block?: DatabaseBlockRef): Promise<DatabaseData> {
        const [properties, views, values, documents, canEdit] = await Promise.all([
            supabase
                .from("database_properties")
                .select(PROPERTY_COLUMNS)
                .eq("database_id", databaseId)
                .order("position"),
            viewsQuery(databaseId, block),
            supabase
                .from("page_property_values")
                .select("pageId:page_id,propertyId:property_id,value,updatedAt:updated_at,pages!inner(parent_id)")
                .eq("pages.parent_id", databaseId),
            supabase
                .from("page_documents")
                .select(`pageId:page_id,updatedAt:updated_at,${PREVIEW_BLOCKS},pages!inner(parent_id)`)
                .eq("pages.parent_id", databaseId),
            supabase.rpc("can_edit_page", { target_page_id: databaseId }),
        ]);

        for (const response of [properties, views, values, documents, canEdit]) {
            const failure = toRequestError(response);
            if (failure) throw failure;
        }

        const documentEditedAt: Record<string, string> = {};
        const documentPreview: Record<string, string> = {};
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
                const blocks = [
                    "block0" in row ? row.block0 : null,
                    "block1" in row ? row.block1 : null,
                    "block2" in row ? row.block2 : null,
                ];
                const preview = previewText(blocks);
                if (preview) documentPreview[row.pageId] = preview;
            }
        }

        return {
            properties: await withRollupTargets(await withRelatedEntries(parseProperties(properties.data))),
            views: parseViews(views.data),
            values: parseValues(values.data),
            documentEditedAt,
            documentPreview,
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
                // A number's format sits in options as well.
                options: property.numberFormat ? { format: property.numberFormat } : optionsColumn(property.options),
                position: property.position,
            })
            .select(PROPERTY_COLUMNS);
        const failure = databaseError(response, "Die Eigenschaft konnte nicht angelegt werden.");
        if (failure) throw failure;
        return requireRow(parseProperties(response.data));
    },

    /** Both sides of a relation at once (RPC add_relation_property, package 17d). */
    async addRelation(
        databaseId: string,
        name: string,
        targetDatabaseId: string,
        pairedName: string,
    ): Promise<{ propertyId: string }> {
        const response = await supabase.rpc("add_relation_property", {
            p_database_id: databaseId,
            p_name: name,
            p_target_database_id: targetDatabaseId,
            p_paired_name: pairedName,
        });
        const failure = databaseError(response, "Die Verknüpfung konnte nicht angelegt werden.");
        if (failure) throw failure;
        const row: unknown = Array.isArray(response.data) ? response.data[0] : response.data;
        if (typeof row !== "object" || row === null || !("property_id" in row) || typeof row.property_id !== "string") {
            throw new Error("Unerwartete Antwort beim Anlegen der Verknüpfung.");
        }
        return { propertyId: row.property_id };
    },

    async updateProperty(propertyId: string, changes: PropertyChanges): Promise<DatabaseProperty> {
        const { options, formula, numberFormat, rollup, ...rest } = changes;
        // The server keeps a formula's expression, a number's format and a rollup's settings in options.
        const column =
            formula !== undefined
                ? { expression: formula }
                : numberFormat !== undefined
                  ? { format: numberFormat }
                  : rollup !== undefined
                    ? {
                          relationPropertyId: rollup.relationPropertyId,
                          targetPropertyId: rollup.targetPropertyId,
                          function: rollup.function,
                      }
                    : options
                      ? optionsColumn(options)
                      : undefined;
        const response = await supabase
            .from("database_properties")
            .update(column ? { ...rest, options: column } : rest)
            .eq("id", propertyId)
            .select(PROPERTY_COLUMNS);
        const failure = databaseError(response, "Die Eigenschaft konnte nicht geändert werden.");
        if (failure) throw failure;
        return requireRow(parseProperties(response.data));
    },

    /** The properties of another database, e.g. for choosing what a rollup reads. */
    async listProperties(databaseId: string): Promise<DatabaseProperty[]> {
        const response = await supabase
            .from("database_properties")
            .select(PROPERTY_COLUMNS)
            .eq("database_id", databaseId)
            .order("position");
        const failure = databaseError(response, "Die Eigenschaften konnten nicht geladen werden.");
        if (failure) throw failure;
        return parseProperties(response.data);
    },

    async deleteProperty(propertyId: string): Promise<void> {
        const response = await supabase.from("database_properties").delete().eq("id", propertyId).select("id");
        const failure = databaseError(response, "Die Eigenschaft konnte nicht gelöscht werden.");
        if (failure) throw failure;
        requireRow(response.data);
    },

    async listViews(databaseId: string): Promise<DatabaseView[]> {
        const response = await supabase
            .from("database_views")
            .select(VIEW_COLUMNS)
            .eq("database_id", databaseId)
            .order("position");
        const failure = databaseError(response, "Die Ansichten konnten nicht geladen werden.");
        if (failure) throw failure;
        return parseViews(response.data);
    },

    async addView(databaseId: string, view: NewView, block?: DatabaseBlockRef): Promise<DatabaseView> {
        const response = await supabase
            .from(viewTable(block))
            .insert({
                database_id: databaseId,
                ...(block ? { page_id: block.pageId, block_id: block.blockId } : {}),
                ...view,
            })
            .select(VIEW_COLUMNS);
        const failure = databaseError(response, "Die Ansicht konnte nicht angelegt werden.");
        if (failure) throw failure;
        return requireRow(parseViews(response.data));
    },

    async updateView(viewId: string, changes: ViewChanges, block?: DatabaseBlockRef): Promise<DatabaseView> {
        const response = await supabase.from(viewTable(block)).update(changes).eq("id", viewId).select(VIEW_COLUMNS);
        const failure = databaseError(response, "Die Ansicht konnte nicht geändert werden.");
        if (failure) throw failure;
        return requireRow(parseViews(response.data));
    },

    async deleteView(viewId: string, block?: DatabaseBlockRef): Promise<void> {
        const response = await supabase.from(viewTable(block)).delete().eq("id", viewId).select("id");
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
