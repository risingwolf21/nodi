import { strToU8, zipSync } from "fflate";
import { describe, expect, it, vi } from "vitest";
import type { DocumentContent } from "@/features/editor/types";
import { EMPTY_VIEW_CONFIG } from "@/features/databases/database-model";
import type { NewProperty, NewView, ViewChanges } from "@/features/databases/services/database-repository";
import type { DatabaseBlockRef } from "@/features/databases/types";
import { importNotionExport, IMPORT_ROOT_TITLE, type ImportDependencies } from "./notion-import";
import { readExportArchive } from "./read-archive";

const ID_A = "1a2b3c4d5e6f7a8b9c0d1e2f3a4b5c6d";
const ID_B = "2b3c4d5e6f7a8b9c0d1e2f3a4b5c6d7e";
const ID_C = "3c4d5e6f7a8b9c0d1e2f3a4b5c6d7e8f";
const ID_D = "4d5e6f7a8b9c0d1e2f3a4b5c6d7e8f9a";

const exportFiles = () =>
    new Map<string, Uint8Array>([
        [
            `Reise ${ID_A}.md`,
            strToU8(
                `# Reise\n\n![Strand](Reise%20${ID_A}/Strand.png)\n\n[Tag 1](Reise%20${ID_A}/Tag%201%20${ID_B}.md)`,
            ),
        ],
        [`Reise ${ID_A}/Strand.png`, new Uint8Array([137, 80, 78, 71])],
        [`Reise ${ID_A}/Tag 1 ${ID_B}.md`, strToU8("# Tag 1\n\nAnkunft.")],
        [`Aufgaben ${ID_C}.csv`, strToU8("Name,Status\nBericht,Erledigt")],
        [
            `Aufgaben ${ID_C}_all.csv`,
            strToU8('Name,Status,Erledigt,Fällig\nBericht,Offen,No,"October 19, 2026"\nAngebot,Offen,Yes,'),
        ],
        [`Aufgaben ${ID_C}/Bericht ${ID_D}.md`, strToU8("# Bericht\n\nStatus: Offen\nErledigt: No\n\nErster Entwurf.")],
    ]);

const defaultTable: NewView = { name: "Tabelle", type: "table", config: EMPTY_VIEW_CONFIG, position: 0 };

/** A tiny stand-in for BlockNote's parser: images and links per line, otherwise text. */
function markdownToBlocks(markdown: string): unknown[] {
    return markdown
        .split("\n")
        .filter((line) => line.trim())
        .map((line) => {
            const image = /^!\[[^\]]*\]\(([^)]+)\)$/.exec(line);
            if (image) return { type: "image", props: { url: image[1] }, children: [] };
            const link = /^\[([^\]]*)\]\(([^)]+)\)$/.exec(line);
            if (link) {
                return {
                    type: "paragraph",
                    content: [{ type: "link", href: link[2], content: [{ type: "text", text: link[1], styles: {} }] }],
                    children: [],
                };
            }
            return { type: "paragraph", content: [{ type: "text", text: line, styles: {} }], children: [] };
        });
}

function dependencies(overrides: Partial<ImportDependencies> = {}) {
    const created: { title: string; parentId: string | null; id: string; kind?: string }[] = [];
    const saved = new Map<string, DocumentContent>();
    const uploads: string[] = [];
    const properties: (NewProperty & { databaseId: string; id: string })[] = [];
    const values: { pageId: string; property: string; value: unknown }[] = [];
    const views: (NewView & { databaseId: string; id: string; block?: DatabaseBlockRef })[] = [];
    const relations: { id: string; databaseId: string; name: string; targetDatabaseId: string; pairedName: string }[] =
        [];
    const deps: ImportDependencies = {
        createPage: vi.fn(async (title: string, parentId: string | null, kind?: "page" | "database", id?: string) => {
            const page = { title, parentId, id: id ?? `p${created.length}`, ...(kind ? { kind } : {}) };
            created.push(page);
            // The server adds the first view of a new database.
            if (kind === "database") {
                views.push({ databaseId: page.id, id: `view${views.length}`, ...defaultTable });
            }
            return { id: page.id };
        }),
        addProperty: vi.fn(async (databaseId: string, property: NewProperty) => {
            const stored = { ...property, databaseId, id: `prop${properties.length}` };
            properties.push(stored);
            return { id: stored.id };
        }),
        setValue: vi.fn(async (pageId: string, propertyId: string, value: unknown) => {
            const property = properties.find((item) => item.id === propertyId)?.name ?? propertyId;
            values.push({ pageId, property, value });
        }),
        saveDocument: vi.fn(async (pageId: string, content: DocumentContent) => {
            saved.set(pageId, content);
        }),
        uploadFile: vi.fn(async (pageId: string, file: File) => {
            uploads.push(`${pageId}:${file.name}:${file.size}`);
            return `nodi-file:${pageId}/x-${file.name}`;
        }),
        listViews: vi.fn(async (databaseId: string) => views.filter((view) => view.databaseId === databaseId)),
        updateView: vi.fn(async (viewId: string, changes: ViewChanges) => {
            Object.assign(views.find((view) => view.id === viewId) ?? {}, changes);
        }),
        addView: vi.fn(async (databaseId: string, view: NewView, block?: DatabaseBlockRef) => {
            views.push({ ...view, databaseId, id: `view${views.length}`, ...(block ? { block } : {}) });
        }),
        addRelation: vi.fn(async (databaseId: string, name: string, targetDatabaseId: string, pairedName: string) => {
            const id = `relation${relations.length}`;
            relations.push({ id, databaseId, name, targetDatabaseId, pairedName });
            properties.push({ id, databaseId, name, type: "relation", options: [], position: 99 });
            return { propertyId: id };
        }),
        markdownToBlocks,
        ...overrides,
    };
    return { deps, created, saved, uploads, properties, values, views, relations };
}

describe("importNotionExport", () => {
    it("creates the pages and databases under a new page, with their files and values", async () => {
        const { deps, created, saved, uploads, properties, values, views } = dependencies();
        const summary = await importNotionExport(exportFiles(), deps);

        // A database's id is given in advance (pages link it before it exists).
        const database = created[1].id;
        expect(created).toEqual([
            { title: IMPORT_ROOT_TITLE, parentId: null, id: "p0" },
            { title: "Aufgaben", parentId: "p0", id: database, kind: "database" },
            { title: "Bericht", parentId: database, id: "p2" },
            { title: "Angebot", parentId: database, id: "p3" },
            { title: "Reise", parentId: "p0", id: "p4" },
            { title: "Tag 1", parentId: "p4", id: "p5" },
        ]);
        // All properties (_all.csv), typed from their values.
        expect(properties.map(({ name, type, position }) => [name, type, position])).toEqual([
            ["Status", "status", 0],
            ["Erledigt", "checkbox", 1],
            ["Fällig", "date", 2],
        ]);
        const offen = properties[0].options[0].id;
        expect(values).toEqual([
            { pageId: "p2", property: "Status", value: offen },
            { pageId: "p2", property: "Fällig", value: { start: "2026-10-19", end: null } },
            { pageId: "p3", property: "Status", value: offen },
            { pageId: "p3", property: "Erledigt", value: true },
        ]);
        // Notion's view (Aufgaben.csv) showed only the status; a board and a calendar are added.
        const hidden = { ...EMPTY_VIEW_CONFIG, hiddenPropertyIds: ["prop1", "prop2"] };
        expect(views.map(({ name, type, config, position }) => [name, type, config, position])).toEqual([
            ["Tabelle", "table", hidden, 0],
            ["Board", "board", { ...hidden, groupByPropertyId: "prop0" }, 1],
            ["Kalender", "calendar", { ...hidden, datePropertyId: "prop2" }, 2],
        ]);
        // The entry's text without the repeated property lines.
        expect(saved.get("p2")).toEqual([
            { type: "paragraph", content: [{ type: "text", text: "Erster Entwurf.", styles: {} }], children: [] },
        ]);
        expect(uploads).toEqual(["p4:Strand.png:4"]);
        expect(saved.get("p4")).toEqual([
            { type: "image", props: { url: "nodi-file:p4/x-Strand.png", name: "Strand.png" }, children: [] },
            { type: "paragraph", content: [{ type: "text", text: "Tag 1", styles: {} }], children: [] },
        ]);
        expect(saved.get("p5")).toEqual([
            { type: "paragraph", content: [{ type: "text", text: "Ankunft.", styles: {} }], children: [] },
        ]);
        expect(JSON.stringify(saved.get("p0"))).toContain("2 Seiten und 1 Datenbank");
        expect(summary).toMatchObject({
            rootPageId: "p0",
            pages: 2,
            plannedPages: 2,
            databases: 1,
            plannedDatabases: 1,
            entries: 2,
            files: 1,
            error: null,
            cancelled: false,
        });
    });

    it("shows a database linked in a page as a database block with the database's views", async () => {
        const project = `Projekt ${ID_A}`;
        const archive = new Map<string, Uint8Array>([
            [
                `${project}.md`,
                strToU8(`# Projekt\n\nVorher\n\n[Aufgaben](${encodeURIComponent(project)}/Aufgaben%20${ID_C}.csv)`),
            ],
            [`${project}/Aufgaben ${ID_C}.csv`, strToU8("Name,Status\nBericht,Erledigt")],
            [`${project}/Aufgaben ${ID_C}/Bericht ${ID_D}.md`, strToU8("# Bericht")],
        ]);
        const { deps, created, saved, views } = dependencies();
        const summary = await importNotionExport(archive, deps);

        const id = (title: string) => created.find((page) => page.title === title)?.id ?? "";
        expect(created.find((page) => page.title === "Aufgaben")).toMatchObject({ parentId: id("Projekt") });
        const document = saved.get(id("Projekt")) ?? [];
        expect(document.map((block) => block.type)).toEqual(["paragraph", "database"]);
        const block = document[1];
        expect(block).toMatchObject({ type: "database", props: { databaseId: id("Aufgaben") } });
        // The block shows the database's views (a table and a board for the status), stored for the block.
        const ownViews = views.filter((view) => !view.block).map(({ name, type, config }) => [name, type, config]);
        expect(views.filter((view) => view.block).map(({ name, type, config }) => [name, type, config])).toEqual(
            ownViews,
        );
        expect(ownViews.map(([name]) => name)).toEqual(["Tabelle", "Board"]);
        expect(views.find((view) => view.block)).toMatchObject({
            databaseId: id("Aufgaben"),
            block: { pageId: id("Projekt"), blockId: block.id },
        });
        expect(summary.problems).toEqual([]);
    });

    it("imports a newer export: entries in a folder without id, an embedded view with its sorting", async () => {
        // Copies of embedded views sit at the top of the export; pages link them from their folder.
        const copy = `Untitled ${ID_C.slice(0, 4)}-${ID_C.slice(-4)}_all.csv`;
        const archive = new Map<string, Uint8Array>([
            [
                `Bereich/Projekt ${ID_A}.md`,
                strToU8(
                    `# Projekt\n\n[Aufgaben](Projekt/Aufgaben%20${ID_C}.md)\n\n[Heute](../${encodeURIComponent(copy)})\n\nfilters:\nxx\nsort:\nStatus: descending\nName: ascending\n\nEnde\n\n[Woanders](../Woanders%20${ID_B}_all.csv)`,
                ),
            ],
            [`Bereich/Projekt/Aufgaben ${ID_C}.md`, strToU8(`# Aufgaben\n\n[Aufgaben](Aufgaben%20${ID_C}_all.csv)`)],
            [`Bereich/Projekt/Aufgaben ${ID_C}_all.csv`, strToU8("Name,Status\nBericht,Offen\nAngebot,Erledigt")],
            [`Bereich/Projekt/Aufgaben/Bericht ${ID_D}.md`, strToU8("# Bericht\n\nStatus: Offen\n\nEntwurf.")],
            [copy, strToU8("Name,Status\nBericht,Offen")],
        ]);
        const { deps, created, saved, properties, views } = dependencies();
        const summary = await importNotionExport(archive, deps);

        const id = (title: string) => created.find((page) => page.title === title)?.id ?? "";
        expect(created.map(({ title, parentId }) => [title, parentId])).toEqual([
            [IMPORT_ROOT_TITLE, null],
            ["Projekt", id(IMPORT_ROOT_TITLE)],
            ["Aufgaben", id("Projekt")],
            ["Bericht", id("Aufgaben")],
            ["Angebot", id("Aufgaben")],
        ]);
        expect(saved.get(id("Bericht"))).toEqual([
            { type: "paragraph", content: [{ type: "text", text: "Entwurf.", styles: {} }], children: [] },
        ]);
        // The view is a block on the real database; its settings are not text.
        const document = saved.get(id("Projekt")) ?? [];
        expect(document.map((block) => block.type)).toEqual(["paragraph", "database", "paragraph", "paragraph"]);
        expect(document[1]).toMatchObject({ props: { databaseId: id("Aufgaben") } });
        expect(document[2]).toMatchObject({ content: [{ text: "Ende" }] });

        // Only `_all.csv`: nothing hidden. The block's views are sorted like the embedded view.
        const status = properties.find((property) => property.name === "Status")?.id;
        expect(views.filter((view) => !view.block).map((view) => view.config)).toEqual([
            EMPTY_VIEW_CONFIG,
            { ...EMPTY_VIEW_CONFIG, groupByPropertyId: status },
        ]);
        const sort = [
            { propertyId: status, direction: "desc" },
            { propertyId: "title", direction: "asc" },
        ];
        expect(views.filter((view) => view.block).map((view) => [view.type, view.config.sort])).toEqual([
            ["table", sort],
            ["board", sort],
        ]);
        expect(summary).toMatchObject({
            pages: 1,
            databases: 1,
            entries: 2,
            problems: ["Projekt: Datenbank „Woanders“ fehlt im Export, nur ihr Name wurde übernommen"],
            error: null,
        });
    });

    it("stops at the first failure and keeps what was imported", async () => {
        const { deps, created } = dependencies({
            createPage: vi.fn(async (title: string) => {
                if (title === "Tag 1") throw new Error("Keine Internetverbindung.");
                return { id: title };
            }),
        });
        const summary = await importNotionExport(exportFiles(), deps);
        expect(created).toEqual([]);
        expect(summary).toMatchObject({ rootPageId: IMPORT_ROOT_TITLE, pages: 1, error: "Keine Internetverbindung." });
    });

    it("can be cancelled between pages and entries", async () => {
        const controller = new AbortController();
        const titles: string[] = [];
        const { deps } = dependencies({
            signal: controller.signal,
            createPage: vi.fn(async (title: string) => {
                titles.push(title);
                // Cancelled while the database (first in the tree) is being created.
                if (title === "Aufgaben") controller.abort();
                return { id: title };
            }),
        });
        const summary = await importNotionExport(exportFiles(), deps);
        expect(titles).toEqual([IMPORT_ROOT_TITLE, "Aufgaben"]);
        expect(summary).toMatchObject({ pages: 0, databases: 1, entries: 0, cancelled: true, error: null });
    });

    it("links entries of two databases with one two-way relation", async () => {
        const PROJECTS = "5e6f7a8b9c0d1e2f3a4b5c6d7e8f9a0b";
        const link = (folder: string, title: string, id: string) =>
            `${title} (${encodeURIComponent(folder)}/${encodeURIComponent(`${title} ${id}`)}.md)`;
        const tasks = `Aufgaben ${ID_C}`;
        const projects = `Projekte ${PROJECTS}`;
        const archive = new Map<string, Uint8Array>([
            [
                `${projects}.csv`,
                strToU8(
                    [
                        "Name,Aufgaben,Notiz",
                        `Website,"${link(tasks, "Entwurf", ID_A)}, ${link(tasks, "Texte", ID_B)}",Neu`,
                        "Newsletter,,",
                    ].join("\n"),
                ),
            ],
            [`${projects}/Website ${ID_D}.md`, strToU8("# Website")],
            [`${tasks}.csv`, strToU8(`Name,Projekte\nEntwurf,${link(projects, "Website", ID_D)}\nTexte,`)],
            [`${tasks}/Entwurf ${ID_A}.md`, strToU8("# Entwurf")],
            [`${tasks}/Texte ${ID_B}.md`, strToU8("# Texte")],
        ]);
        const { deps, created, properties, relations, values } = dependencies();
        const summary = await importNotionExport(archive, deps);

        const id = (title: string) => created.find((page) => page.title === title)?.id;
        // The relation columns are no text properties; one relation with both sides, made from the
        // database imported first ("Aufgaben").
        expect(properties.map(({ name, type }) => [name, type])).toEqual([
            ["Notiz", "text"],
            ["Projekte", "relation"],
        ]);
        expect(relations).toEqual([
            {
                id: "relation0",
                databaseId: id("Aufgaben"),
                name: "Projekte",
                targetDatabaseId: id("Projekte"),
                pairedName: "Aufgaben",
            },
        ]);
        // One side is set, with the links of both columns; the server links back.
        expect(values.filter((value) => value.property === "Projekte")).toEqual([
            { pageId: id("Entwurf"), property: "Projekte", value: [id("Website")] },
            // Only the column in "Projekte" had this link.
            { pageId: id("Texte"), property: "Projekte", value: [id("Website")] },
        ]);
        expect(summary.problems).toEqual([]);
    });

    it("takes relations, rollups and formulas of newer exports from the entry pages", async () => {
        const PLANS = "5e6f7a8b9c0d1e2f3a4b5c6d7e8f9a0b";
        const workout = (title: string, id: string) =>
            `${title} (../Workouts/${encodeURIComponent(`${title} ${id}`)}.md)`;
        const archive = new Map<string, Uint8Array>([
            [`Workouts ${ID_A}_all.csv`, strToU8("Name,Tag\nOberkörper,Montag\nBeine,Dienstag\n")],
            [`Workouts/Oberkörper ${ID_B}.md`, strToU8("# Oberkörper\n\nTag: Montag")],
            [`Workouts/Beine ${ID_C}.md`, strToU8("# Beine\n\nTag: Dienstag")],
            // The CSV has no relation and no rollup; the pages do.
            [`Übungen ${PLANS}_all.csv`, strToU8("Name,Sätze\nKniebeuge,3\nRudern,4\n")],
            [
                `Übungen/Kniebeuge ${ID_D}.md`,
                strToU8(
                    `# Kniebeuge\n\nSätze: 3\nWorkout: ${workout("Beine", ID_C)}\nVolumen: 175\n\nFazit: gut\n\nTief gehen.`,
                ),
            ],
            [
                `Übungen/Rudern ${ID_A.slice(0, 31)}e.md`,
                strToU8(`# Rudern\n\nSätze: 4\nWorkout: ${workout("Oberkörper", ID_B)}\nVolumen: 80.5`),
            ],
        ]);
        const { deps, created, properties, relations, values, saved } = dependencies();
        const summary = await importNotionExport(archive, deps);

        const id = (title: string) => created.find((page) => page.title === title)?.id;
        expect(properties.map(({ name, type }) => [name, type])).toEqual([
            // "Übungen" comes first (by title); its relation is made after all databases.
            ["Sätze", "number"],
            ["Volumen", "number"],
            ["Tag", "text"],
            ["Workout", "relation"],
        ]);
        expect(relations).toMatchObject([
            { databaseId: id("Übungen"), name: "Workout", targetDatabaseId: id("Workouts"), pairedName: "Übungen" },
        ]);
        expect(values.filter((value) => value.property !== "Tag")).toEqual([
            { pageId: id("Kniebeuge"), property: "Sätze", value: 3 },
            { pageId: id("Kniebeuge"), property: "Volumen", value: 175 },
            { pageId: id("Rudern"), property: "Sätze", value: 4 },
            { pageId: id("Rudern"), property: "Volumen", value: 80.5 },
            { pageId: id("Kniebeuge"), property: "Workout", value: [id("Beine")] },
            { pageId: id("Rudern"), property: "Workout", value: [id("Oberkörper")] },
        ]);
        // The property lines are values now; "Fazit: gut" below the blank line is text.
        expect(saved.get(id("Kniebeuge") ?? "")).toMatchObject([
            { content: [{ text: "Fazit: gut" }] },
            { content: [{ text: "Tief gehen." }] },
        ]);
        expect(summary.problems).toEqual([]);
    });

    it("explains an archive without pages", async () => {
        const { deps } = dependencies();
        const summary = await importNotionExport(new Map([["foto.png", new Uint8Array([1])]]), deps);
        expect(summary.error).toContain("Markdown & CSV");
        expect(deps.createPage).not.toHaveBeenCalled();
    });
});

describe("readExportArchive", () => {
    it("merges the parts of a large export and skips macOS metadata", async () => {
        const part = zipSync({ [`Reise ${ID_A}.md`]: strToU8("# Reise"), [`Reise ${ID_A}/`]: new Uint8Array() });
        const outer = zipSync({
            "Export-1-Part-1.zip": part,
            "__MACOSX/._x": strToU8("x"),
            // macOS writes decomposed umlauts.
            ["Größe.md"]: strToU8("# Größe"),
        });
        const files = await readExportArchive(new Blob([outer]));
        expect([...files.keys()].sort()).toEqual(["Größe.md", `Reise ${ID_A}.md`]);
    });

    it("rejects files that are not ZIPs", async () => {
        await expect(readExportArchive(new Blob(["kein zip"]))).rejects.toThrow("keine lesbare ZIP-Datei");
    });
});
