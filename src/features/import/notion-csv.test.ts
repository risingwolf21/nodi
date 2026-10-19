import { describe, expect, it } from "vitest";
import { cleanCell, columnValue, inferColumn, parseCsv, parseNotionDate, stripPropertyLines } from "./notion-csv";

describe("parseCsv", () => {
    it("reads quoted fields, quotes, line breaks and a byte order mark", () => {
        const csv = '﻿Name,Notiz\r\nBericht,"Erst, dann ""fertig"""\r\n"Zwei\nZeilen",\r\n\r\n';
        expect(parseCsv(csv)).toEqual([
            ["Name", "Notiz"],
            ["Bericht", 'Erst, dann "fertig"'],
            ["Zwei\nZeilen", ""],
        ]);
    });
});

describe("parseNotionDate", () => {
    it("reads Notion's date formats, with times and ranges", () => {
        expect(parseNotionDate("October 19, 2026")).toEqual({ start: "2026-10-19", end: null });
        expect(parseNotionDate("Oct 5, 2026")).toEqual({ start: "2026-10-05", end: null });
        expect(parseNotionDate("19. Oktober 2026")).toEqual({ start: "2026-10-19", end: null });
        expect(parseNotionDate("2026/10/19")).toEqual({ start: "2026-10-19", end: null });
        expect(parseNotionDate("10/19/2026")).toEqual({ start: "2026-10-19", end: null });
        expect(parseNotionDate("19/10/2026", true)).toEqual({ start: "2026-10-19", end: null });
        expect(parseNotionDate("October 19, 2026 → October 21, 2026")).toEqual({
            start: "2026-10-19",
            end: "2026-10-21",
        });
        // Date properties have no time.
        expect(parseNotionDate("October 19, 2026 2:30 PM")).toEqual({ start: "2026-10-19", end: null });
        expect(parseNotionDate("19.10.2026 14:30")).toEqual({ start: "2026-10-19", end: null });
    });

    it("rejects anything else", () => {
        expect(parseNotionDate("Bericht")).toBeNull();
        expect(parseNotionDate("February 30, 2026")).toBeNull();
        expect(parseNotionDate("13/19/2026")).toBeNull();
        expect(parseNotionDate("October 19, 2026 nachmittags")).toBeNull();
    });
});

describe("inferColumn", () => {
    it("guesses the property type from the values", () => {
        expect(inferColumn("Fertig", ["Yes", "No", "No"]).type).toBe("checkbox");
        expect(inferColumn("Preis", ["12", "-3.5", ""]).type).toBe("number");
        expect(inferColumn("Fällig", ["October 19, 2026", ""]).type).toBe("date");
        expect(inferColumn("Link", ["https://nodi.app", "http://x.de/a"]).type).toBe("url");
        expect(inferColumn("Kontakt", ["a@b.de"]).type).toBe("email");
        expect(inferColumn("Notiz", ["Erst anrufen", "Dann schreiben"]).type).toBe("text");
        // A single value of each is free text, not a choice.
        expect(inferColumn("Ort", ["Berlin", "München"]).type).toBe("text");
    });

    it("makes choices from repeated values, in order of appearance", () => {
        const status = inferColumn("Status", ["Erledigt", "Offen", "Erledigt", ""]);
        expect(status.type).toBe("select");
        expect(status.options.map((option) => [option.name, option.color])).toEqual([
            ["Erledigt", "gray"],
            ["Offen", "brown"],
        ]);
        const tags = inferColumn("Tags", ["Arbeit, Privat", "Arbeit", ""]);
        expect(tags.type).toBe("multi_select");
        expect(tags.options.map((option) => option.name)).toEqual(["Arbeit", "Privat"]);
    });

    it("reads day-first dates when a day is above 12", () => {
        const column = inferColumn("Datum", ["05/10/2026", "19/10/2026"]);
        expect(column).toMatchObject({ type: "date", dayFirst: true });
        expect(columnValue(column, "05/10/2026")).toEqual({ start: "2026-10-05", end: null });
    });
});

describe("columnValue", () => {
    it("converts cells to values of the property, empty cells to nothing", () => {
        const tags = inferColumn("Tags", ["Arbeit, Privat", "Arbeit"]);
        const [arbeit, privat] = tags.options.map((option) => option.id);
        expect(columnValue(tags, "Privat, Arbeit, Privat")).toEqual([privat, arbeit]);
        expect(columnValue(inferColumn("Fertig", ["Yes", "No"]), "Yes")).toBe(true);
        expect(columnValue(inferColumn("Fertig", ["Yes", "No"]), "No")).toBeUndefined();
        expect(columnValue(inferColumn("Preis", ["12"]), "12")).toBe(12);
        expect(columnValue(inferColumn("Notiz", ["a", "b"]), "  ")).toBeUndefined();
    });
});

describe("helpers", () => {
    it("removes links to pages from relation cells", () => {
        expect(cleanCell("Bericht (Aufgaben%20abc/Bericht%20def.md), Angebot (Aufgaben/Angebot.md)")).toBe(
            "Bericht, Angebot",
        );
        expect(cleanCell("Preis (netto)")).toBe("Preis (netto)");
    });

    it("drops the property lines at the start of an entry", () => {
        expect(
            stripPropertyLines("\nStatus: Erledigt\nTags: Arbeit\nFertig:\n\nText", ["Status", "Tags", "Fertig"]),
        ).toBe("\nText");
        expect(stripPropertyLines("\nStatusbericht folgt", ["Status"])).toBe("\nStatusbericht folgt");
    });
});
