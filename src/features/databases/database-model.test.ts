import { describe, expect, it } from "vitest";
import type { Page } from "@/features/pages/types";
import {
    applyView,
    buildRows,
    formatValue,
    matchesFilter,
    parseCachedDatabase,
    parseProperties,
    parseViewConfig,
    readValue,
    uniqueName,
    visibleProperties,
} from "./database-model";
import { TITLE_FIELD, type DatabaseData, type DatabaseProperty, type ViewConfig } from "./types";

const status: DatabaseProperty = {
    id: "status",
    databaseId: "db",
    name: "Status",
    type: "status",
    options: [
        { id: "todo", name: "Offen", color: "gray" },
        { id: "doing", name: "In Arbeit", color: "blue" },
        { id: "done", name: "Erledigt", color: "green" },
    ],
    position: 1,
};
const estimate: DatabaseProperty = { id: "estimate", databaseId: "db", name: "Aufwand", type: "number", options: [], position: 2 };
const due: DatabaseProperty = { id: "due", databaseId: "db", name: "Fällig", type: "date", options: [], position: 3 };
const done: DatabaseProperty = { id: "done", databaseId: "db", name: "Fertig", type: "checkbox", options: [], position: 4 };
const edited: DatabaseProperty = {
    id: "edited",
    databaseId: "db",
    name: "Geändert",
    type: "last_edited_time",
    options: [],
    position: 5,
};

const entry = (id: string, title: string, position: number | null, createdAt: string): Page => ({
    id,
    title,
    parent_id: "db",
    owner_id: "u1",
    visibility: "private",
    icon: null,
    full_width: false,
    kind: "page",
    position,
    created_at: createdAt,
});

const entries = [
    entry("a", "Angebot schreiben", 1, "2026-10-01T10:00:00Z"),
    entry("b", "Bericht", 2, "2026-10-02T10:00:00Z"),
    entry("c", "", null, "2026-10-03T10:00:00Z"),
];

const data: DatabaseData = {
    properties: [status, estimate, due, done, edited],
    views: [],
    values: [
        { pageId: "a", propertyId: "status", value: "done", updatedAt: "2026-10-05T10:00:00Z" },
        { pageId: "a", propertyId: "estimate", value: 3, updatedAt: "2026-10-05T10:00:00Z" },
        { pageId: "a", propertyId: "due", value: { start: "2026-10-20", end: null }, updatedAt: "2026-10-05T10:00:00Z" },
        { pageId: "b", propertyId: "status", value: "todo", updatedAt: "2026-10-04T10:00:00Z" },
        { pageId: "b", propertyId: "estimate", value: 8, updatedAt: "2026-10-04T10:00:00Z" },
        { pageId: "b", propertyId: "done", value: true, updatedAt: "2026-10-04T10:00:00Z" },
        // Stale: the option was deleted.
        { pageId: "c", propertyId: "status", value: "gone", updatedAt: "2026-10-06T10:00:00Z" },
    ],
    documentEditedAt: { b: "2026-10-09T10:00:00Z" },
    canEdit: true,
};

const config = (changes: Partial<ViewConfig> = {}): ViewConfig => ({ sort: [], filter: [], hiddenPropertyIds: [], ...changes });
const titles = (configuration: ViewConfig) =>
    applyView(buildRows(entries, data), configuration, data.properties).map((row) => row.page.id);

describe("readValue", () => {
    it("reads values by type and treats anything else as empty", () => {
        expect(readValue(status, "done")).toBe("done");
        expect(readValue(status, "gone")).toBeNull();
        expect(readValue(estimate, "3")).toBeNull();
        expect(readValue(done, null)).toBe(false);
        expect(readValue(due, { start: "2026-10-20" })).toEqual({ start: "2026-10-20", end: null });
        expect(readValue(due, { start: "morgen" })).toBeNull();
    });
});

describe("buildRows", () => {
    it("computes the last edit from the text and the values", () => {
        const [a, b, c] = buildRows(entries, data);
        expect(a.values.edited).toBe("2026-10-05T10:00:00Z");
        expect(b.values.edited).toBe("2026-10-09T10:00:00Z");
        expect(c.values.status).toBeNull();
    });
});

describe("applyView", () => {
    it("keeps the manual order without sort rules", () => {
        expect(titles(config())).toEqual(["a", "b", "c"]);
    });

    it("sorts by status in the order of its options, empty values last", () => {
        expect(titles(config({ sort: [{ propertyId: "status", direction: "asc" }] }))).toEqual(["b", "a", "c"]);
        expect(titles(config({ sort: [{ propertyId: "status", direction: "desc" }] }))).toEqual(["a", "b", "c"]);
    });

    it("sorts numbers as numbers and titles alphabetically", () => {
        expect(titles(config({ sort: [{ propertyId: "estimate", direction: "desc" }] }))).toEqual(["b", "a", "c"]);
        expect(titles(config({ sort: [{ propertyId: TITLE_FIELD, direction: "asc" }] }))).toEqual(["a", "b", "c"]);
    });

    it("applies all filter rules", () => {
        expect(
            titles(
                config({
                    filter: [
                        { propertyId: "estimate", operator: "greaterThan", value: "2" },
                        { propertyId: "done", operator: "unchecked", value: "" },
                    ],
                }),
            ),
        ).toEqual(["a"]);
    });
});

describe("matchesFilter", () => {
    const [a, b, c] = buildRows(entries, data);

    it("filters text, options, dates and emptiness", () => {
        expect(matchesFilter(a, { propertyId: TITLE_FIELD, operator: "contains", value: "angebot" }, undefined)).toBe(true);
        expect(matchesFilter(b, { propertyId: "status", operator: "equals", value: "done" }, status)).toBe(false);
        expect(matchesFilter(a, { propertyId: "due", operator: "before", value: "2026-10-21" }, due)).toBe(true);
        expect(matchesFilter(c, { propertyId: "status", operator: "isEmpty", value: "" }, status)).toBe(true);
    });

    it("does not hide anything for an unfinished input or a deleted property", () => {
        expect(matchesFilter(b, { propertyId: "estimate", operator: "equals", value: "" }, estimate)).toBe(true);
        expect(matchesFilter(b, { propertyId: "removed", operator: "equals", value: "x" }, undefined)).toBe(true);
    });
});

describe("formatValue", () => {
    it("shows values in German", () => {
        expect(formatValue(estimate, 1234.5)).toBe("1.234,5");
        expect(formatValue(status, "doing")).toBe("In Arbeit");
        expect(formatValue(due, { start: "2026-10-20", end: null })).toBe("20. Okt. 2026");
    });
});

describe("parsing", () => {
    it("reads view settings leniently", () => {
        expect(
            parseViewConfig({
                sort: [{ propertyId: "status", direction: "sideways" }, { propertyId: "status", direction: "asc" }],
                filter: [{ propertyId: "x", operator: "explodes", value: "" }],
                hiddenPropertyIds: ["estimate", 7],
            }),
        ).toEqual({ sort: [{ propertyId: "status", direction: "asc" }], filter: [], hiddenPropertyIds: ["estimate"] });
    });

    it("rejects invalid server rows instead of showing them", () => {
        expect(() => parseProperties([{ id: "p", databaseId: "db", name: "X", type: "formula" }])).toThrow();
    });

    it("reads the server's options object and the cached list alike", () => {
        const [fromServer] = parseProperties([
            { id: "p", databaseId: "db", name: "X", type: "select", options: { options: [{ id: "o", name: "O", color: "red" }] }, position: 1 },
        ]);
        const [fromCache] = parseProperties([{ ...fromServer }]);
        expect(fromCache.options).toEqual([{ id: "o", name: "O", color: "red" }]);
    });

    it("treats an invalid cache as missing", () => {
        expect(parseCachedDatabase({ properties: "nope" })).toBeNull();
        expect(parseCachedDatabase(JSON.parse(JSON.stringify(data)))).toEqual(data);
    });
});

describe("helpers", () => {
    it("finds a free name", () => {
        expect(uniqueName("Status", ["Status", "Status 2"])).toBe("Status 3");
    });

    it("hides properties of a view and keeps the order", () => {
        expect(visibleProperties([due, status], config({ hiddenPropertyIds: ["due"] })).map((p) => p.id)).toEqual(["status"]);
    });
});
