import { describe, expect, it } from "vitest";
import type { DatabaseRow } from "@/features/databases/database-model";
import type { DatabaseProperty, PropertyValue } from "@/features/databases/types";
import { columnValue, inferColumn, parseCsv } from "@/features/import/notion-csv";
import type { Page } from "@/features/pages/types";
import { csvCell, databaseCsv, type CsvLinks } from "./export-csv";

const property = (id: string, name: string, type: DatabaseProperty["type"], extra: Partial<DatabaseProperty> = {}) =>
    ({ id, databaseId: "db", name, type, options: [], position: 0, ...extra }) satisfies DatabaseProperty;

const row = (id: string, title: string, values: Record<string, PropertyValue>): DatabaseRow => ({
    page: { id, title, parent_id: "db", owner_id: "u", visibility: "private", icon: null } as Page,
    values,
    errors: {},
    createdAt: "",
    lastEditedAt: "",
});

const links: CsvLinks = {
    entry: (id) => (id === "e2" ? { title: "Zweiter", href: "Zweiter%20e2.md" } : null),
    file: (_entry, path) =>
        path
            .split("/")
            .pop()!
            .replace(/^[0-9a-f-]{36}-/, ""),
};

const options = [
    { id: "o1", name: "Hoch", color: "red" as const },
    { id: "o2", name: "Niedrig", color: "gray" as const },
];

const properties: DatabaseProperty[] = [
    property("p-done", "Erledigt", "checkbox", { position: 1 }),
    property("p-price", "Preis", "number", { position: 2, numberFormat: "euro" }),
    property("p-share", "Anteil", "number", { position: 3, numberFormat: "percent" }),
    property("p-due", "Fällig", "date", { position: 4 }),
    property("p-prio", "Priorität", "select", { position: 5, options }),
    property("p-link", "Verwandt", "relation", { position: 6 }),
    property("p-button", "Abhaken", "button", { position: 7 }),
];

const rows = [
    row("e1", 'Erster, mit "Zitat"', {
        "p-done": true,
        "p-price": 12.5,
        "p-share": 0.15,
        "p-due": { start: "2026-10-19", end: "2026-10-21" },
        "p-prio": "o1",
        "p-link": ["e2", "unbekannt"],
    }),
    row("e2", "Zweiter", {
        "p-done": false,
        "p-price": 1234,
        "p-share": 1,
        "p-due": { start: "2026-10-19T14:30:00.000Z", end: null },
        "p-prio": "o1",
        "p-link": null,
    }),
    row("e3", "Dritter", { "p-done": null, "p-price": null, "p-due": null, "p-prio": "o2", "p-link": null }),
];

describe("csvCell", () => {
    it("quotes only what needs it", () => {
        expect(csvCell("Hallo")).toBe("Hallo");
        expect(csvCell('a, "b"')).toBe('"a, ""b"""');
        expect(csvCell("zwei\nZeilen")).toBe('"zwei\nZeilen"');
    });
});

describe("databaseCsv", () => {
    const csv = databaseCsv(properties, rows, links);

    it("writes the title first, then the properties in their order, without buttons", () => {
        expect(csv.split("\n")[0]).toBe("Name,Erledigt,Preis,Anteil,Fällig,Priorität,Verwandt");
        expect(csv.split("\n")[1]).toBe(
            '"Erster, mit ""Zitat""",Yes,€12.5,15%,2026-10-19 → 2026-10-21,Hoch,Zweiter (Zweiter%20e2.md)',
        );
        expect(csv.split("\n")[2]).toBe("Zweiter,No,€1234,100%,2026-10-19 14:30 (GMT+0),Hoch,");
    });

    it("is read back by the import with the same types and values", () => {
        const [header, ...lines] = parseCsv(csv);
        const column = (index: number) =>
            inferColumn(
                header[index],
                lines.map((line) => line[index] ?? ""),
            );
        expect(lines.map((line) => line[0])).toEqual(['Erster, mit "Zitat"', "Zweiter", "Dritter"]);

        const done = column(1);
        expect(done.type).toBe("checkbox");
        expect(lines.map((line) => columnValue(done, line[1]))).toEqual([true, undefined, undefined]);

        const price = column(2);
        expect([price.type, price.numberFormat]).toEqual(["number", "euro"]);
        expect(lines.map((line) => columnValue(price, line[2]))).toEqual([12.5, 1234, undefined]);

        const share = column(3);
        expect([share.type, share.numberFormat]).toEqual(["number", "percent"]);
        expect(columnValue(share, lines[0][3])).toBe(0.15);

        const due = column(4);
        expect(due.type).toBe("date");
        expect(columnValue(due, lines[0][4])).toEqual({ start: "2026-10-19", end: "2026-10-21" });
        expect(columnValue(due, lines[1][4])).toEqual({ start: "2026-10-19T14:30:00.000Z", end: null });

        const priority = column(5);
        expect(priority.type).toBe("select");
        expect(priority.options.map((option) => option.name)).toEqual(["Hoch", "Niedrig"]);
    });
});
