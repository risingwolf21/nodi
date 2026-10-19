import { describe, expect, it } from "vitest";
import type { Page } from "@/features/pages/types";
import {
    applyView,
    buildRows,
    dateFromInput,
    dateHasTime,
    dateInputValue,
    EMPTY_VIEW_CONFIG,
    dateProperty,
    formatValue,
    groupProperty,
    groupRows,
    matchesFilter,
    monthGrid,
    parseCachedDatabase,
    parseProperties,
    parseViewConfig,
    parseViews,
    placeProperty,
    previewText,
    readValue,
    rowsByDay,
    setDateTime,
    timeOfDay,
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
const estimate: DatabaseProperty = {
    id: "estimate",
    databaseId: "db",
    name: "Aufwand",
    type: "number",
    options: [],
    position: 2,
};
const due: DatabaseProperty = { id: "due", databaseId: "db", name: "Fällig", type: "date", options: [], position: 3 };
const done: DatabaseProperty = {
    id: "done",
    databaseId: "db",
    name: "Fertig",
    type: "checkbox",
    options: [],
    position: 4,
};
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
        {
            pageId: "a",
            propertyId: "due",
            value: { start: "2026-10-20", end: null },
            updatedAt: "2026-10-05T10:00:00Z",
        },
        { pageId: "b", propertyId: "status", value: "todo", updatedAt: "2026-10-04T10:00:00Z" },
        { pageId: "b", propertyId: "estimate", value: 8, updatedAt: "2026-10-04T10:00:00Z" },
        { pageId: "b", propertyId: "done", value: true, updatedAt: "2026-10-04T10:00:00Z" },
        // Stale: the option was deleted.
        { pageId: "c", propertyId: "status", value: "gone", updatedAt: "2026-10-06T10:00:00Z" },
    ],
    documentEditedAt: { b: "2026-10-09T10:00:00Z" },
    documentPreview: { b: "Erste Zeile" },
    canEdit: true,
};

const config = (changes: Partial<ViewConfig> = {}): ViewConfig => ({ ...EMPTY_VIEW_CONFIG, ...changes });
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
        expect(matchesFilter(a, { propertyId: TITLE_FIELD, operator: "contains", value: "angebot" }, undefined)).toBe(
            true,
        );
        expect(matchesFilter(b, { propertyId: "status", operator: "equals", value: "done" }, status)).toBe(false);
        expect(matchesFilter(a, { propertyId: "due", operator: "before", value: "2026-10-21" }, due)).toBe(true);
        expect(matchesFilter(c, { propertyId: "status", operator: "isEmpty", value: "" }, status)).toBe(true);
    });

    it("does not hide anything for an unfinished input or a deleted property", () => {
        expect(matchesFilter(b, { propertyId: "estimate", operator: "equals", value: "" }, estimate)).toBe(true);
        expect(matchesFilter(b, { propertyId: "removed", operator: "equals", value: "x" }, undefined)).toBe(true);
    });
});

describe("board", () => {
    const priority: DatabaseProperty = {
        id: "priority",
        databaseId: "db",
        name: "Priorität",
        type: "select",
        options: [{ id: "high", name: "Hoch", color: "red" }],
        position: 0,
    };

    it("groups by the chosen property, otherwise by the first status", () => {
        expect(groupProperty([priority, status, estimate], config())?.id).toBe("status");
        expect(groupProperty([priority, status], config({ groupByPropertyId: "priority" }))?.id).toBe("priority");
        // A number cannot be a board column.
        expect(groupProperty([estimate, status], config({ groupByPropertyId: "estimate" }))?.id).toBe("status");
        expect(groupProperty([estimate], config())).toBeUndefined();
    });

    it("puts entries without a valid value into the first column", () => {
        const groups = groupRows(buildRows(entries, data), status);
        expect(groups.map((group) => [group.option?.id ?? null, group.rows.map((row) => row.page.id)])).toEqual([
            [null, ["c"]],
            ["todo", ["b"]],
            ["doing", []],
            ["done", ["a"]],
        ]);
    });
});

describe("feed", () => {
    it("shows the text of the first blocks, without empty blocks and tables", () => {
        const blocks = [
            { type: "heading", content: [{ type: "text", text: "Titel", styles: {} }] },
            { type: "paragraph", content: [] },
            { type: "table", content: { type: "tableContent", rows: [] } },
            {
                type: "paragraph",
                content: [
                    { type: "text", text: "Siehe ", styles: {} },
                    { type: "link", href: "https://x.test", content: [{ type: "text", text: "Link", styles: {} }] },
                ],
            },
            null,
        ];
        expect(previewText(blocks)).toBe("Titel\nSiehe Link");
        expect(previewText([{ content: [{ type: "text", text: "x".repeat(400) }] }])).toHaveLength(282);
    });
});

describe("calendar", () => {
    it("starts weeks on Monday and covers the whole month", () => {
        const weeks = monthGrid(2026, 9); // October 2026 starts on a Thursday.
        expect(weeks[0]).toEqual([
            "2026-09-28",
            "2026-09-29",
            "2026-09-30",
            "2026-10-01",
            "2026-10-02",
            "2026-10-03",
            "2026-10-04",
        ]);
        expect(weeks.at(-1)?.at(-1)).toBe("2026-11-01");
        expect(weeks).toHaveLength(5);
        expect(monthGrid(2027, 1)).toHaveLength(4); // February 2027 starts on a Monday.
    });

    it("places entries on their days, ranges on every day", () => {
        const rows = buildRows(entries, {
            ...data,
            values: [
                { pageId: "a", propertyId: "due", value: { start: "2026-10-30", end: "2026-11-02" }, updatedAt: "" },
                { pageId: "b", propertyId: "due", value: { start: "2026-10-31", end: null }, updatedAt: "" },
            ],
        });
        const days = rowsByDay(rows, due);
        expect([...days.keys()]).toEqual(["2026-10-30", "2026-10-31", "2026-11-01", "2026-11-02"]);
        expect(days.get("2026-10-31")?.map((row) => row.page.id)).toEqual(["a", "b"]);
    });

    it("places a time on its local day", () => {
        // 00:30 local time: in UTC it may still be the day before.
        const lateNight = new Date(2026, 9, 31, 0, 30).toISOString();
        const rows = buildRows(entries, {
            ...data,
            values: [{ pageId: "a", propertyId: "due", value: { start: lateNight, end: null }, updatedAt: "" }],
        });
        expect([...rowsByDay(rows, due).keys()]).toEqual(["2026-10-31"]);
    });

    it("uses the chosen date property, otherwise the first", () => {
        const start: DatabaseProperty = { ...due, id: "start", position: 0 };
        expect(dateProperty([due, start], config())?.id).toBe("start");
        expect(dateProperty([due, start], config({ datePropertyId: "due" }))?.id).toBe("due");
        expect(dateProperty([status], config())).toBeUndefined();
    });
});

describe("places", () => {
    const place: DatabaseProperty = {
        id: "place",
        databaseId: "db",
        name: "Ort",
        type: "place",
        options: [],
        position: 6,
    };
    const placeData: DatabaseData = {
        ...data,
        properties: [place],
        values: [
            {
                pageId: "a",
                propertyId: "place",
                value: { lat: 48.1372, lng: 11.5756, label: "Marienplatz, München" },
                updatedAt: "",
            },
            { pageId: "b", propertyId: "place", value: { lat: 52.52, lng: 13.405, label: null }, updatedAt: "" },
            { pageId: "c", propertyId: "place", value: { lat: 120, lng: 0 }, updatedAt: "" },
        ],
    };
    const rows = buildRows(entries, placeData);

    it("reads valid places only and shows the address or the coordinates", () => {
        expect(rows.map((row) => formatValue(place, row.values.place))).toEqual([
            "Marienplatz, München",
            "52,52; 13,405",
            "",
        ]);
        expect(readValue(place, { lat: 1, lng: 2, label: "" })).toEqual({ lat: 1, lng: 2, label: null });
    });

    it("filters places by their address", () => {
        const rule = { propertyId: "place", operator: "contains" as const, value: "münchen" };
        expect(rows.filter((row) => matchesFilter(row, rule, place)).map((row) => row.page.id)).toEqual(["a"]);
    });

    it("sorts places by their text, empty last", () => {
        const sorted = applyView(rows, config({ sort: [{ propertyId: "place", direction: "asc" }] }), [place]);
        expect(sorted.map((row) => row.page.id)).toEqual(["b", "a", "c"]);
    });

    it("uses the chosen place property, otherwise the first", () => {
        const second: DatabaseProperty = { ...place, id: "second", position: 7 };
        expect(placeProperty([second, place], config())?.id).toBe("place");
        expect(placeProperty([second, place], config({ placePropertyId: "second" }))?.id).toBe("second");
    });
});

describe("formulas", () => {
    const formula = (id: string, name: string, expression: string, position: number): DatabaseProperty => ({
        id,
        databaseId: "db",
        name,
        type: "formula",
        options: [],
        position,
        formula: expression,
    });
    const rowsWith = (...formulas: DatabaseProperty[]) =>
        buildRows(entries, { ...data, properties: [...data.properties, ...formulas] });

    it("computes from other properties, the title and other formulas", () => {
        const total = formula("total", "Gesamt", 'prop("Aufwand") * 100', 10);
        const label = formula(
            "label",
            "Beschriftung",
            'prop("Name") + ": " + prop("Gesamt") + " € (" + prop("Status") + ")"',
            11,
        );
        const [a, b] = rowsWith(label, total);
        expect(a.values.total).toBe(300);
        expect(a.values.label).toBe("Angebot schreiben: 300 € (Erledigt)");
        expect(b.values.label).toBe("Bericht: 800 € (Offen)");
        expect(a.errors).toEqual({});
    });

    it("turns dates into date values and computes a date range", () => {
        const deadline = formula("deadline", "Frist", 'dateAdd(prop("Fällig"), 1, "weeks")', 10);
        const [a, b] = rowsWith(deadline);
        expect(a.values.deadline).toEqual({ start: "2026-10-27", end: null });
        expect(formatValue(deadline, a.values.deadline)).toBe("27. Okt. 2026");
        expect(b.values.deadline).toBeNull();
    });

    it("reports a cycle for every formula in it and a broken formula where it is used", () => {
        const first = formula("first", "Eins", 'prop("Zwei") + 1', 10);
        const second = formula("second", "Zwei", 'prop("Eins") + 1', 11);
        const broken = formula("broken", "Kaputt", "1 +", 12);
        const user = formula("user", "Nutzer", 'prop("Kaputt") * 2', 13);
        const [a] = rowsWith(first, second, broken, user);
        expect(a.errors.first).toContain("Zirkelbezug");
        expect(a.errors.second).toContain("Zirkelbezug");
        expect(a.errors.broken).toBe("Unerwartet: das Ende an Stelle 4.");
        expect(a.errors.user).toBe("Die Formel „Kaputt“ hat einen Fehler.");
        expect(a.values.user).toBeNull();
    });

    it("filters and sorts by the result", () => {
        const total = formula("total", "Gesamt", 'prop("Aufwand") * 100', 10);
        const rows = rowsWith(total);
        const properties = [...data.properties, total];
        const bigger = config({ filter: [{ propertyId: "total", operator: "greaterThan", value: "500" }] });
        expect(applyView(rows, bigger, properties).map((row) => row.page.id)).toEqual(["b"]);
        const sorted = config({ sort: [{ propertyId: "total", direction: "desc" }] });
        expect(applyView(rows, sorted, properties).map((row) => row.page.id)).toEqual(["b", "a", "c"]);
    });

    it("reads the expression from the server's options and from the cache", () => {
        const [fromServer] = parseProperties([
            { id: "f", databaseId: "db", name: "F", type: "formula", options: { expression: "1 + 1" }, position: 1 },
        ]);
        expect(fromServer.formula).toBe("1 + 1");
        expect(parseProperties([{ ...fromServer }])[0].formula).toBe("1 + 1");
    });
});

describe("formatValue", () => {
    it("shows values in German", () => {
        expect(formatValue(estimate, 1234.5)).toBe("1.234,5");
        expect(formatValue(status, "doing")).toBe("In Arbeit");
        expect(formatValue(due, { start: "2026-10-20", end: null })).toBe("20. Okt. 2026");
    });

    it("shows numbers in their format; percent like Notion (0.15 is 15 %)", () => {
        // Intl separates the symbol with a no-break space.
        const shown = (numberFormat: DatabaseProperty["numberFormat"], value: number) =>
            formatValue({ ...estimate, numberFormat }, value).replace(/\s/g, " ");
        expect(shown("euro", 1234.5)).toBe("1.234,50 €");
        expect(shown("dollar", 12)).toBe("12,00 $");
        expect(shown("percent", 0.15)).toBe("15 %");
        expect(shown("franc", 3)).toBe("3,00 CHF");
        expect(shown(undefined, 1234.5)).toBe("1.234,5");
    });

    it("reads the number format from the server's options and from the cache", () => {
        const [fromServer] = parseProperties([
            { id: "p", databaseId: "db", name: "Preis", type: "number", options: { format: "euro" }, position: 0 },
        ]);
        expect(fromServer.numberFormat).toBe("euro");
        expect(parseProperties([{ ...fromServer, options: [] }])[0].numberFormat).toBe("euro");
        // Unknown formats (a newer app version) are shown as plain numbers.
        expect(
            parseProperties([
                { id: "p", databaseId: "db", name: "X", type: "number", options: { format: "bitcoin" } },
            ])[0].numberFormat,
        ).toBeUndefined();
    });
});

describe("relations", () => {
    const tasks: DatabaseProperty = {
        id: "tasks",
        databaseId: "db",
        name: "Aufgaben",
        type: "relation",
        options: [],
        position: 5,
        relation: {
            databaseId: "other",
            pairedPropertyId: "back",
            entries: [
                { id: "t1", title: "Entwurf", icon: null },
                { id: "t2", title: "", icon: "📝" },
            ],
        },
    };

    it("reads the target from the server's options and, with the entries, from the cache", () => {
        const [fromServer] = parseProperties([
            {
                id: "tasks",
                databaseId: "db",
                name: "Aufgaben",
                type: "relation",
                options: { databaseId: "other", pairedPropertyId: "back" },
            },
        ]);
        expect(fromServer.relation).toEqual({ databaseId: "other", pairedPropertyId: "back", entries: [] });
        expect(parseProperties([{ ...tasks }])[0].relation).toEqual(tasks.relation);
        // Without a target it cannot be shown.
        expect(parseProperties([{ id: "x", databaseId: "db", name: "X", type: "relation", options: {} }])).toEqual([]);
    });

    it("shows the titles of known entries and is found by them", () => {
        // "gone" was deleted or is not readable.
        expect(formatValue(tasks, ["t2", "gone", "t1"])).toBe("Ohne Titel, Entwurf");
        const rows = buildRows(entries, {
            ...data,
            properties: [tasks],
            values: [{ pageId: "a", propertyId: "tasks", value: ["t1"], updatedAt: "" }],
        });
        const found = (operator: "contains" | "isEmpty", value = "") =>
            rows
                .filter((row) => matchesFilter(row, { propertyId: "tasks", operator, value }, tasks))
                .map((row) => row.page.id);
        expect(found("contains", "entw")).toEqual(["a"]);
        expect(found("isEmpty")).toEqual(["b", "c"]);
    });
});

describe("dates with a time", () => {
    const at = (hours: number, minutes = 0) => new Date(2026, 9, 19, hours, minutes).toISOString();

    it("converts between stored values and the inputs (local time)", () => {
        expect(dateInputValue("2026-10-19")).toBe("2026-10-19");
        expect(dateInputValue(at(14, 30))).toBe("2026-10-19T14:30");
        expect(dateFromInput("2026-10-19")).toBe("2026-10-19");
        expect(dateFromInput("2026-10-19T14:30")).toBe(at(14, 30));
        expect(dateFromInput("")).toBeNull();
        expect(timeOfDay(at(8, 5))).toBe("08:05");
        expect(timeOfDay("2026-10-19")).toBeNull();
    });

    it("adds a time (09:00) or drops it, on both ends", () => {
        const withTime = setDateTime({ start: "2026-10-19", end: "2026-10-20" }, true);
        expect(withTime).toEqual({ start: at(9), end: new Date(2026, 9, 20, 9).toISOString() });
        expect(dateHasTime(withTime)).toBe(true);
        expect(setDateTime({ start: at(23, 45), end: null }, false)).toEqual({ start: "2026-10-19", end: null });
    });

    it("shows, filters and sorts by the time", () => {
        expect(formatValue(due, { start: at(14, 30), end: null })).toBe("19. Okt. 2026, 14:30");
        const rows = buildRows(entries, {
            ...data,
            values: [
                { pageId: "a", propertyId: "due", value: { start: at(18), end: null }, updatedAt: "" },
                { pageId: "b", propertyId: "due", value: { start: at(8), end: null }, updatedAt: "" },
                { pageId: "c", propertyId: "due", value: { start: "2026-10-19", end: null }, updatedAt: "" },
            ],
        });
        // A day without a time counts from midnight.
        const sorted = applyView(rows, config({ sort: [{ propertyId: "due", direction: "asc" }] }), [due]);
        expect(sorted.map((row) => row.page.id)).toEqual(["c", "b", "a"]);
        const onDay = rows.filter((row) =>
            matchesFilter(row, { propertyId: "due", operator: "equals", value: "2026-10-19" }, due),
        );
        expect(onDay.map((row) => row.page.id)).toEqual(["a", "b", "c"]);
    });
});

describe("parsing", () => {
    it("reads view settings leniently", () => {
        expect(
            parseViewConfig({
                sort: [
                    { propertyId: "status", direction: "sideways" },
                    { propertyId: "status", direction: "asc" },
                ],
                filter: [{ propertyId: "x", operator: "explodes", value: "" }],
                hiddenPropertyIds: ["estimate", 7],
            }),
        ).toEqual({
            sort: [{ propertyId: "status", direction: "asc" }],
            filter: [],
            hiddenPropertyIds: ["estimate"],
            groupByPropertyId: null,
            datePropertyId: null,
            placePropertyId: null,
        });
    });

    it("rejects broken server rows, but leaves out types of a newer app version", () => {
        expect(() => parseProperties([{ id: "p", databaseId: "db", type: "text" }])).toThrow();
        expect(parseProperties([{ id: "p", databaseId: "db", name: "X", type: "rollup" }])).toEqual([]);
        expect(parseViews([{ id: "v", databaseId: "db", name: "Zeitleiste", type: "timeline" }])).toEqual([]);
    });

    it("reads the server's options object and the cached list alike", () => {
        const [fromServer] = parseProperties([
            {
                id: "p",
                databaseId: "db",
                name: "X",
                type: "select",
                options: { options: [{ id: "o", name: "O", color: "red" }] },
                position: 1,
            },
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
        expect(visibleProperties([due, status], config({ hiddenPropertyIds: ["due"] })).map((p) => p.id)).toEqual([
            "status",
        ]);
    });
});
