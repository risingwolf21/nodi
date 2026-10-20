import { describe, expect, it } from "vitest";
import {
    planNotionImport,
    resolveExportPath,
    splitTitle,
    takeViewSettings,
    titleFromFileName,
    viewSortOf,
} from "./notion-export";

const ID_A = "1a2b3c4d5e6f7a8b9c0d1e2f3a4b5c6d";
const ID_B = "2b3c4d5e6f7a8b9c0d1e2f3a4b5c6d7e";
const ID_C = "3c4d5e6f7a8b9c0d1e2f3a4b5c6d7e8f";
const ID_D = "4d5e6f7a8b9c0d1e2f3a4b5c6d7e8f9a";

describe("paths and titles", () => {
    it("removes Notion ids and extensions", () => {
        expect(titleFromFileName(`Reise nach Rom ${ID_A}.md`)).toBe("Reise nach Rom");
        expect(titleFromFileName(`Ordner/Aufgaben ${ID_B}.csv`)).toBe("Aufgaben");
        expect(titleFromFileName(`Aufgaben ${ID_B}_all.csv`)).toBe("Aufgaben");
        expect(titleFromFileName("Ohne ID.md")).toBe("Ohne ID");
    });

    it("resolves links relative to the Markdown file", () => {
        expect(resolveExportPath(`Reise ${ID_A}.md`, `Reise%20${ID_A}/Foto%201.png`)).toBe(`Reise ${ID_A}/Foto 1.png`);
        expect(resolveExportPath("A/B/c.md", "../d.md")).toBe("A/d.md");
        expect(resolveExportPath("c.md", "../../geheim")).toBeNull();
        expect(resolveExportPath("c.md", "https://www.notion.so/x")).toBeNull();
        expect(resolveExportPath("c.md", "mailto:a@b.de")).toBeNull();
        expect(resolveExportPath("c.md", "%E0%A4%A")).toBeNull();
    });

    it("takes the title from a leading heading", () => {
        expect(splitTitle("# Reise\n\nText")).toEqual({ title: "Reise", body: "\nText" });
        expect(splitTitle("Nur Text")).toEqual({ title: null, body: "Nur Text" });
    });
});

describe("planNotionImport", () => {
    it("builds the tree from folders, in the order of the links in the parent", () => {
        const files = new Map([
            [
                `Reise ${ID_A}.md`,
                `# Reise\n\n[Zweiter Tag](Reise%20${ID_A}/Tag%202%20${ID_C}.md)\n\n[Erster Tag](Reise%20${ID_A}/Tag%201%20${ID_B}.md)`,
            ],
            [`Reise ${ID_A}/Tag 1 ${ID_B}.md`, "# Tag 1\n"],
            [`Reise ${ID_A}/Tag 2 ${ID_C}.md`, "# Tag 2\n"],
            [`Reise ${ID_A}/Tag 1 ${ID_B}/Notizen ${ID_D}.md`, "Kein Titel hier"],
            [`Alpha ${ID_D}.md`, "# Alpha"],
        ]);
        const plan = planNotionImport(files, [...files.keys(), `Reise ${ID_A}/Foto.png`]);
        expect(plan.items.map((item) => [item.title, item.parentPath && titleFromFileName(item.parentPath)])).toEqual([
            ["Alpha", null],
            ["Reise", null],
            ["Tag 2", "Reise"],
            ["Tag 1", "Reise"],
            ["Notizen", "Tag 1"],
        ]);
        expect(plan.skippedInEntries).toBe(0);
    });

    it("places databases in the tree, with their entries and all properties", () => {
        const files = new Map([
            [
                `Projekte ${ID_A}.md`,
                `# Projekte\n\n[Aufgaben](Projekte%20${ID_A}/Aufgaben%20${ID_B}.csv)\n\n[Notizen](Projekte%20${ID_A}/Notizen%20${ID_D}.md)`,
            ],
            [`Projekte ${ID_A}/Notizen ${ID_D}.md`, "# Notizen"],
            [`Projekte ${ID_A}/Aufgaben ${ID_B}/Bericht ${ID_C}.md`, "# Bericht\n\nStatus: Erledigt"],
            // Entries have no subpages in Nodi.
            [`Projekte ${ID_A}/Aufgaben ${ID_B}/Bericht ${ID_C}/Anhang ${ID_D}.md`, "# Anhang"],
        ]);
        const plan = planNotionImport(files, [
            ...files.keys(),
            `Projekte ${ID_A}/Aufgaben ${ID_B}.csv`,
            `Projekte ${ID_A}/Aufgaben ${ID_B}_all.csv`,
            `Projekte ${ID_A}/Aufgaben ${ID_B}/Bericht ${ID_C}/Tabelle ${ID_D}.csv`,
        ]);
        expect(plan.items).toEqual([
            { kind: "page", path: `Projekte ${ID_A}.md`, title: "Projekte", parentPath: null },
            {
                kind: "database",
                path: `Projekte ${ID_A}/Aufgaben ${ID_B}.csv`,
                dataPath: `Projekte ${ID_A}/Aufgaben ${ID_B}_all.csv`,
                title: "Aufgaben",
                parentPath: `Projekte ${ID_A}.md`,
                entryPaths: [`Projekte ${ID_A}/Aufgaben ${ID_B}/Bericht ${ID_C}.md`],
            },
            {
                kind: "page",
                path: `Projekte ${ID_A}/Notizen ${ID_D}.md`,
                title: "Notizen",
                parentPath: `Projekte ${ID_A}.md`,
            },
        ]);
        expect(plan.skippedInEntries).toBe(2);
    });

    it("attaches pages in plain folders (e.g. the export folder) to the nearest page or the top", () => {
        const files = new Map([
            [`Export-x/Seite ${ID_A}.md`, "# Seite"],
            [`Export-x/Seite ${ID_A}/Unterordner/Tief ${ID_B}.md`, "# Tief"],
        ]);
        const plan = planNotionImport(files, files.keys());
        expect(plan.items.map((item) => [item.title, item.parentPath])).toEqual([
            ["Seite", null],
            ["Tief", `Export-x/Seite ${ID_A}.md`],
        ]);
    });

    it("reads newer exports: folders without ids, only `_all.csv`, database pages and copies of embedded views", () => {
        const files = new Map([
            // Subpages of `Projekte <id>.md` sit in `Projekte/`.
            [
                `Projekte ${ID_A}.md`,
                `# Projekte\n\n[Notizen](Projekte/Notizen%20${ID_D}.md)\n\n[Aufgaben](Projekte/Aufgaben%20${ID_B}.md)\n\n[Heute](../Untitled%20${ID_B.slice(0, 4)}-${ID_B.slice(-4)}_all.csv)`,
            ],
            [`Projekte/Notizen ${ID_D}.md`, "# Notizen"],
            // The page of a full-page database is the database itself.
            [`Projekte/Aufgaben ${ID_B}.md`, `# Aufgaben\n\n[Aufgaben](Aufgaben%20${ID_B}_all.csv)`],
            // Entries of `Aufgaben <id>_all.csv` sit in `Aufgaben/`.
            [`Projekte/Aufgaben/Bericht ${ID_C}.md`, "# Bericht\n\nStatus: Offen"],
        ]);
        const plan = planNotionImport(files, [
            ...files.keys(),
            `Projekte/Aufgaben ${ID_B}_all.csv`,
            `Untitled ${ID_B.slice(0, 4)}-${ID_B.slice(-4)}_all.csv`,
            // A real database whose name looks like a copy.
            `Saison 2024-2025 ${ID_C}_all.csv`,
        ]);
        expect(plan.items).toEqual([
            { kind: "page", path: `Projekte ${ID_A}.md`, title: "Projekte", parentPath: null },
            {
                kind: "page",
                path: `Projekte/Notizen ${ID_D}.md`,
                title: "Notizen",
                parentPath: `Projekte ${ID_A}.md`,
            },
            {
                kind: "database",
                path: `Projekte/Aufgaben ${ID_B}.csv`,
                dataPath: `Projekte/Aufgaben ${ID_B}_all.csv`,
                title: "Aufgaben",
                parentPath: `Projekte ${ID_A}.md`,
                entryPaths: [`Projekte/Aufgaben/Bericht ${ID_C}.md`],
            },
            {
                kind: "database",
                path: `Saison 2024-2025 ${ID_C}.csv`,
                dataPath: `Saison 2024-2025 ${ID_C}_all.csv`,
                title: "Saison 2024-2025",
                parentPath: null,
                entryPaths: [],
            },
        ]);
        expect(plan.databaseCopies).toEqual(
            new Map([[`Untitled ${ID_B.slice(0, 4)}-${ID_B.slice(-4)}_all.csv`, `Projekte/Aufgaben ${ID_B}.csv`]]),
        );
    });

    it("gives siblings with the same title the subpages they link", () => {
        const files = new Map([
            [`Woche ${ID_A}.md`, `# Woche\n\n[Montag](Woche/Montag%20${ID_C}.md)`],
            [`Woche ${ID_B}.md`, `# Woche\n\n[Dienstag](Woche/Dienstag%20${ID_D}.md)`],
            [`Woche/Montag ${ID_C}.md`, "# Montag"],
            [`Woche/Dienstag ${ID_D}.md`, "# Dienstag"],
        ]);
        const plan = planNotionImport(files, files.keys());
        expect(plan.items.map((item) => [item.title, item.parentPath])).toEqual([
            ["Woche", null],
            ["Montag", `Woche ${ID_A}.md`],
            ["Woche", null],
            ["Dienstag", `Woche ${ID_B}.md`],
        ]);
    });
});

describe("takeViewSettings", () => {
    it("removes the settings below an embedded view and keeps its sorting", () => {
        const markdown = [
            "<aside>",
            "[Heute](../Untitled%208fe7-1f36_all.csv)",
            "",
            "filters:",
            "unlesbar",
            "sort:",
            "Status: ascending",
            "Priority: descending",
            "",
            "Text danach",
            "[Alle](Aufgaben%20x_all.csv)",
            "",
            "filters:",
            "noch mehr",
            "</aside>",
            "[Ohne](Andere.csv)",
            "",
            "Status: ascending",
        ].join("\n");
        const { markdown: text, sorts } = takeViewSettings(markdown);
        expect(text).toBe(
            [
                "<aside>",
                "[Heute](../Untitled%208fe7-1f36_all.csv#nodi-view-0)",
                "",
                "",
                "Text danach",
                "[Alle](Aufgaben%20x_all.csv#nodi-view-1)",
                "",
                "</aside>",
                // Without "filters:" or "sort:" right below, nothing is a setting.
                "[Ohne](Andere.csv)",
                "",
                "Status: ascending",
            ].join("\n"),
        );
        expect(sorts).toEqual([
            [
                { name: "Status", direction: "asc" },
                { name: "Priority", direction: "desc" },
            ],
            [],
        ]);
        expect(viewSortOf("../Untitled%208fe7-1f36_all.csv#nodi-view-0", sorts)).toEqual(sorts[0]);
        expect(viewSortOf("Andere.csv", sorts)).toEqual([]);
        expect(resolveExportPath("a.md", "Aufgaben%20x_all.csv#nodi-view-1")).toBe("Aufgaben x_all.csv");
    });
});
