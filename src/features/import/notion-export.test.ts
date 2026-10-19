import { describe, expect, it } from "vitest";
import { planNotionImport, resolveExportPath, splitTitle, titleFromFileName } from "./notion-export";

const ID_A = "1a2b3c4d5e6f7a8b9c0d1e2f3a4b5c6d";
const ID_B = "2b3c4d5e6f7a8b9c0d1e2f3a4b5c6d7e";
const ID_C = "3c4d5e6f7a8b9c0d1e2f3a4b5c6d7e8f";
const ID_D = "4d5e6f7a8b9c0d1e2f3a4b5c6d7e8f9a";

describe("paths and titles", () => {
    it("removes Notion ids and extensions", () => {
        expect(titleFromFileName(`Reise nach Rom ${ID_A}.md`)).toBe("Reise nach Rom");
        expect(titleFromFileName(`Ordner/Aufgaben ${ID_B}.csv`)).toBe("Aufgaben");
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
        expect(plan.pages.map((page) => [page.title, page.parentPath && titleFromFileName(page.parentPath)])).toEqual([
            ["Alpha", null],
            ["Reise", null],
            ["Tag 2", "Reise"],
            ["Tag 1", "Reise"],
            ["Notizen", "Tag 1"],
        ]);
        expect(plan.databases).toEqual([]);
    });

    it("leaves databases and their entries for package 16b", () => {
        const files = new Map([
            [`Projekte ${ID_A}.md`, `# Projekte\n\n[Aufgaben](Projekte%20${ID_A}/Aufgaben%20${ID_B}.csv)`],
            [`Projekte ${ID_A}/Aufgaben ${ID_B}/Bericht ${ID_C}.md`, "# Bericht\n\nStatus: Erledigt"],
        ]);
        const plan = planNotionImport(files, [
            ...files.keys(),
            `Projekte ${ID_A}/Aufgaben ${ID_B}.csv`,
            `Projekte ${ID_A}/Aufgaben ${ID_B}_all.csv`,
        ]);
        expect(plan.pages.map((page) => page.title)).toEqual(["Projekte"]);
        expect(plan.databases).toEqual([{ path: `Projekte ${ID_A}/Aufgaben ${ID_B}.csv`, title: "Aufgaben" }]);
    });

    it("attaches pages in plain folders (e.g. the export folder) to the nearest page or the top", () => {
        const files = new Map([
            [`Export-x/Seite ${ID_A}.md`, "# Seite"],
            [`Export-x/Seite ${ID_A}/Unterordner/Tief ${ID_B}.md`, "# Tief"],
        ]);
        const plan = planNotionImport(files, files.keys());
        expect(plan.pages.map((page) => [page.title, page.parentPath])).toEqual([
            ["Seite", null],
            ["Tief", `Export-x/Seite ${ID_A}.md`],
        ]);
    });
});
