import { useCallback, useEffect, useRef, useState } from "react";
import { loadCacheThenServer, useServerReload } from "@/features/pages/hooks/load-cache-then-server";
import { pageTreeCacheFor } from "@/features/pages/services/page-tree-cache";
import {
    EMPTY_VIEW_CONFIG,
    OPTION_COLORS,
    PROPERTY_TYPE_LABELS,
    VIEW_TYPE_LABELS,
    defaultOptions,
    parseCachedDatabase,
    uniqueName,
} from "../database-model";
import {
    DATABASE_OFFLINE_MESSAGE,
    databaseRepository,
    type PropertyChanges,
    type ViewChanges,
} from "../services/database-repository";
import type {
    DatabaseData,
    DatabaseProperty,
    DatabaseView,
    PropertyOption,
    PropertyType,
    PropertyValue,
    StoredPropertyValue,
    ViewType,
} from "../types";

export type UseDatabaseResult = {
    data: DatabaseData | null;
    loading: boolean;
    error: string;
    /** Shown from the cache: nothing can be changed (CLAUDE.md §12 P14). */
    fromCache: boolean;
    addProperty: (type: PropertyType) => Promise<DatabaseProperty>;
    /** A relation to another database (or this one), with its other side there (package 17d). */
    addRelation: (target: { id: string; title: string }, ownTitle: string) => Promise<void>;
    updateProperty: (propertyId: string, changes: PropertyChanges) => Promise<void>;
    deleteProperty: (propertyId: string) => Promise<void>;
    /** A new choice of a select, multi-select or status property. */
    addOption: (propertyId: string, name: string) => Promise<PropertyOption>;
    addView: (type: ViewType) => Promise<DatabaseView>;
    updateView: (viewId: string, changes: ViewChanges) => Promise<void>;
    deleteView: (viewId: string) => Promise<void>;
    /** Shown at once; undone if the server rejects it. */
    setValue: (pageId: string, propertyId: string, value: PropertyValue) => Promise<void>;
    /**
     * A new entry, with a first value if given (a board column, a calendar
     * day). Resolves to its page id, or null while another one is being
     * created or when entries cannot be created here.
     */
    createEntry: (initial?: NewEntryValue) => Promise<string | null>;
};

export type NewEntryValue = { propertyId: string; value: PropertyValue };

const NO_EDIT_RIGHT_MESSAGE = "Du darfst diese Datenbank nicht ändern.";

const nextPosition = (items: { position: number }[]) =>
    items.reduce((highest, item) => Math.max(highest, item.position), 0) + 1;

/**
 * Properties, views and values of one database; entries come with the page
 * tree, so the page tree creates their pages (`createEntryPage`).
 */
export function useDatabase(
    databaseId: string,
    userId: string | undefined,
    createEntryPage?: () => Promise<string>,
): UseDatabaseResult {
    const [data, setData] = useState<DatabaseData | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState("");
    const [fromCache, setFromCache] = useState(false);
    // Only data the server confirmed (and changes on top of it) is cached.
    const [confirmedByServer, setConfirmedByServer] = useState(false);
    const [manualReloads, setManualReloads] = useState(0);
    const serverReloads = useServerReload(fromCache || error !== "");
    const shownFromServerFor = useRef("");
    // The newest write per field, so an older failure does not undo a newer edit.
    const latestWrite = useRef(new Map<string, string>());

    useEffect(() => {
        if (!userId) return;
        const currentUserId = userId;
        let active = true;

        async function load() {
            setLoading(true);
            try {
                const result = await loadCacheThenServer({
                    userId: currentUserId,
                    readCache: async () =>
                        parseCachedDatabase(await pageTreeCacheFor(currentUserId).getDatabase(databaseId)),
                    fetchServer: () => databaseRepository.load(databaseId),
                    cacheFirst: shownFromServerFor.current !== databaseId,
                    isActive: () => active,
                    show: (loaded, cached) => {
                        setData(loaded);
                        setFromCache(cached);
                        setConfirmedByServer(!cached);
                        if (!cached) shownFromServerFor.current = databaseId;
                    },
                });
                if (!active) return;
                setError(
                    result === "none"
                        ? "Die Datenbank ist offline noch nicht verfügbar. Öffne sie einmal mit Internetverbindung."
                        : "",
                );
            } catch (err) {
                if (!active) return;
                console.error("Datenbank konnte nicht geladen werden:", err);
                setError("Die Datenbank konnte nicht geladen werden.");
            } finally {
                if (active) setLoading(false);
            }
        }

        void load();
        return () => {
            active = false;
        };
    }, [databaseId, userId, manualReloads, serverReloads]);

    useEffect(() => {
        if (!userId || !data || !confirmedByServer) return;
        pageTreeCacheFor(userId)
            .putDatabase(databaseId, data)
            .catch((cacheError: unknown) => {
                console.warn("Datenbank konnte nicht lokal gespeichert werden:", cacheError);
            });
    }, [userId, databaseId, data, confirmedByServer]);

    const requireEditable = useCallback((): DatabaseData => {
        if (fromCache || !data) throw new Error(DATABASE_OFFLINE_MESSAGE);
        if (!data.canEdit) throw new Error(NO_EDIT_RIGHT_MESSAGE);
        return data;
    }, [data, fromCache]);

    const change = (update: (current: DatabaseData) => DatabaseData) =>
        setData((current) => (current ? update(current) : current));

    const addProperty = useCallback(
        async (type: PropertyType) => {
            const current = requireEditable();
            const property = await databaseRepository.addProperty(databaseId, {
                name: uniqueName(
                    PROPERTY_TYPE_LABELS[type],
                    current.properties.map((item) => item.name),
                ),
                type,
                options: defaultOptions(type),
                position: nextPosition(current.properties),
            });
            change((latest) => ({ ...latest, properties: [...latest.properties, property] }));
            return property;
        },
        [databaseId, requireEditable],
    );

    const updateProperty = useCallback(
        async (propertyId: string, changes: PropertyChanges) => {
            const current = requireEditable();
            const before = current.properties.find((item) => item.id === propertyId);
            const updated = await databaseRepository.updateProperty(propertyId, changes);
            // The related entries are loaded with the database, not with the property.
            const property =
                updated.relation && before?.relation
                    ? { ...updated, relation: { ...updated.relation, entries: before.relation.entries } }
                    : updated;
            // The server clears the values when the type changes.
            const typeChanged = before !== undefined && before.type !== property.type;
            change((latest) => ({
                ...latest,
                properties: latest.properties.map((item) => (item.id === propertyId ? property : item)),
                values: typeChanged ? latest.values.filter((value) => value.propertyId !== propertyId) : latest.values,
            }));
        },
        [requireEditable],
    );

    const addRelation = useCallback(
        async (target: { id: string; title: string }, ownTitle: string) => {
            const current = requireEditable();
            const name = uniqueName(
                target.title.trim() || PROPERTY_TYPE_LABELS.relation,
                current.properties.map((item) => item.name),
            );
            await databaseRepository.addRelation(
                databaseId,
                name,
                target.id,
                ownTitle.trim() || PROPERTY_TYPE_LABELS.relation,
            );
            // Both sides and the related entries come with the database.
            setManualReloads((count) => count + 1);
        },
        [databaseId, requireEditable],
    );

    const deleteProperty = useCallback(
        async (propertyId: string) => {
            const current = requireEditable();
            const relation = current.properties.find((item) => item.id === propertyId)?.relation;
            await databaseRepository.deleteProperty(propertyId);
            // The other side of a relation within this database is gone as well.
            if (relation?.databaseId === databaseId) setManualReloads((count) => count + 1);
            change((latest) => ({
                ...latest,
                properties: latest.properties.filter((item) => item.id !== propertyId),
                values: latest.values.filter((value) => value.propertyId !== propertyId),
            }));
        },
        [databaseId, requireEditable],
    );

    const addOption = useCallback(
        async (propertyId: string, name: string) => {
            const current = requireEditable();
            const property = current.properties.find((item) => item.id === propertyId);
            if (!property) throw new Error("Die Eigenschaft gibt es nicht mehr.");
            const option: PropertyOption = {
                id: crypto.randomUUID(),
                name,
                // Colors in turn, like Notion.
                color: OPTION_COLORS[property.options.length % OPTION_COLORS.length],
            };
            await updateProperty(propertyId, { options: [...property.options, option] });
            return option;
        },
        [requireEditable, updateProperty],
    );

    const addView = useCallback(
        async (type: ViewType) => {
            const current = requireEditable();
            const view = await databaseRepository.addView(databaseId, {
                name: uniqueName(
                    VIEW_TYPE_LABELS[type],
                    current.views.map((item) => item.name),
                ),
                type,
                config: EMPTY_VIEW_CONFIG,
                position: nextPosition(current.views),
            });
            change((latest) => ({ ...latest, views: [...latest.views, view] }));
            return view;
        },
        [databaseId, requireEditable],
    );

    const updateView = useCallback(
        async (viewId: string, changes: ViewChanges) => {
            requireEditable();
            const view = await databaseRepository.updateView(viewId, changes);
            change((latest) => ({
                ...latest,
                views: latest.views.map((item) => (item.id === viewId ? view : item)),
            }));
        },
        [requireEditable],
    );

    const deleteView = useCallback(
        async (viewId: string) => {
            const current = requireEditable();
            if (current.views.length <= 1) throw new Error("Die letzte Ansicht kann nicht gelöscht werden.");
            await databaseRepository.deleteView(viewId);
            change((latest) => ({ ...latest, views: latest.views.filter((item) => item.id !== viewId) }));
        },
        [requireEditable],
    );

    const setValue = useCallback(
        async (pageId: string, propertyId: string, value: PropertyValue) => {
            const current = requireEditable();
            const field = `${pageId}:${propertyId}`;
            const mutationId = crypto.randomUUID();
            const editedAt = new Date().toISOString();
            const previous = current.values.find(
                (stored) => stored.pageId === pageId && stored.propertyId === propertyId,
            );
            latestWrite.current.set(field, mutationId);

            const replaceValue = (latest: DatabaseData, next: StoredPropertyValue | undefined): DatabaseData => ({
                ...latest,
                values: [
                    ...latest.values.filter((stored) => stored.pageId !== pageId || stored.propertyId !== propertyId),
                    ...(next ? [next] : []),
                ],
            });
            change((latest) => replaceValue(latest, { pageId, propertyId, value, updatedAt: editedAt }));

            try {
                const result = await databaseRepository.setValue(pageId, propertyId, value, editedAt, mutationId);
                const relation = current.properties.find((item) => item.id === propertyId)?.relation;
                // Another device was later (LWW): show what the server keeps. A relation within this
                // database changed its other side here as well.
                if (result === "superseded" || relation?.databaseId === databaseId) {
                    setManualReloads((count) => count + 1);
                }
            } catch (err) {
                if (latestWrite.current.get(field) === mutationId) {
                    change((latest) => replaceValue(latest, previous));
                }
                throw err;
            }
        },
        [databaseId, requireEditable],
    );

    // Repeated taps on "Neu" while an entry is being created add nothing.
    const creatingEntry = useRef(false);
    const createEntry = useCallback(
        async (initial?: NewEntryValue) => {
            if (!createEntryPage || creatingEntry.current) return null;
            creatingEntry.current = true;
            try {
                const pageId = await createEntryPage();
                if (initial && initial.value !== null) await setValue(pageId, initial.propertyId, initial.value);
                return pageId;
            } finally {
                creatingEntry.current = false;
            }
        },
        [createEntryPage, setValue],
    );

    return {
        data,
        loading,
        error,
        fromCache,
        addProperty,
        addRelation,
        updateProperty,
        deleteProperty,
        addOption,
        addView,
        updateView,
        deleteView,
        setValue,
        createEntry,
    };
}
