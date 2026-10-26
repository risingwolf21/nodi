import { strFromU8 } from "fflate";
import { describe, expect, it } from "vitest";
import { planNotionImport } from "@/features/import/notion-export";
import type { DatabaseData } from "@/features/databases/types";
import type { Page } from "@/features/pages/types";
import { buildExport, type ExportSources } from "./build-export";

const page = (id: string, title: string, extra: Partial<Page> = {}): Page => ({
    id,
    title,
    parent_id: null,
    owner_id: "u",
    visibility: "private",
    icon: null,
    full_width: false,
    kind: "page",
    position: null,
    created_at: "",
    ...extra,
});

const ROOT = "aaaaaaaa-0000-4000-8000-000000000001";
const CHILD = "bbbbbbbb-0000-4000-8000-000000000002";
const OTHER = "cccccccc-0000-4000-8000-000000000003";
const FILE_1 = "f1111111-0000-4000-8000-000000000001";
const FILE_2 = "f2222222-0000-4000-8000-000000000002";
const DATABASE = "dddddddd-0000-4000-8000-000000000004";
const ENTRY_1 = "eeeeeeee-0000-4000-8000-000000000005";
const ENTRY_2 = "eeeeeeee-0000-4000-8000-000000000006";

const paragraph = (content: unknown[]) => ({ type: "paragraph", props: {}, content, children: [] });

// Blocks to simple Markdown: text, links and images, enough for the import's planner.
const toMarkdown = (blocks: Record<string, unknown>[]) =>
    blocks
        .map((block) => {
            const props = (block.props ?? {}) as Record<string, string>;
            if (block.type === "image") return `![](${props.url})`;
            return ((block.content ?? []) as Record<string, unknown>[])
                .map((item) =>
                    item.type === "link"
                        ? `[${((item.content ?? []) as { text: string }[]).map((part) => part.text).join("")}](${String(item.href)})`
                        : String(item.text),
                )
                .join("");
        })
        .join("\n\n");

const documents: Record<string, unknown[]> = {
    [ROOT]: [
        paragraph([{ type: "pageLink", props: { pageId: CHILD, title: "Tag 2" } }]),
        { type: "image", props: { url: `nodi-file:${ROOT}/${FILE_1}-bild.png` }, children: [] },
        { type: "image", props: { url: `nodi-file:${ROOT}/${FILE_2}-fehlt.png` }, children: [] },
    ],
    [CHILD]: [paragraph([{ type: "text", text: "Hallo", styles: {} }])],
};

const database: DatabaseData = {
    properties: [
        { id: "p-files", databaseId: DATABASE, name: "Belege", type: "files", options: [], position: 1 },
        { id: "p-done", databaseId: DATABASE, name: "Erledigt", type: "checkbox", options: [], position: 0 },
    ],
    views: [],
    values: [
        { pageId: ENTRY_2, propertyId: "p-done", value: true, updatedAt: "" },
        { pageId: ENTRY_2, propertyId: "p-files", value: [`${ENTRY_2}/${FILE_1}-beleg.pdf`], updatedAt: "" },
    ],
    documentEditedAt: {},
    documentPreview: {},
    documentImage: {},
    canEdit: true,
};

const sources: ExportSources = {
    loadDocument: (id) => Promise.resolve(documents[id] ?? []),
    loadDatabase: (id) => (id === DATABASE ? Promise.resolve(database) : Promise.reject(new Error("offline"))),
    downloadFile: (path) =>
        path.endsWith("fehlt.png") ? Promise.reject(new Error("404")) : Promise.resolve(new Uint8Array([1, 2, 3])),
    blocksToMarkdown: toMarkdown,
};

describe("buildExport", () => {
    it("writes pages, subpages and files so that the import reads the same tree back", async () => {
        const pages = [page(ROOT, "Reise"), page(CHILD, "Tag 2", { parent_id: ROOT }), page(OTHER, "Anderes")];
        const result = await buildExport(pages, [ROOT], sources);

        expect(result.pages).toBe(2);
        expect(result.attachments).toBe(1);
        expect(result.problems).toEqual(["fehlt.png: Datei konnte nicht geladen werden"]);
        expect([...result.files.keys()]).toEqual([
            "Reise aaaaaaaa000040008000000000000001.md",
            "Reise aaaaaaaa000040008000000000000001/bild.png",
            "Reise aaaaaaaa000040008000000000000001/Tag 2 bbbbbbbb000040008000000000000002.md",
        ]);
        const rootMarkdown = strFromU8(result.files.get("Reise aaaaaaaa000040008000000000000001.md")!);
        expect(rootMarkdown).toContain(
            "[Tag 2](Reise%20aaaaaaaa000040008000000000000001/Tag%202%20bbbbbbbb000040008000000000000002.md)",
        );
        expect(rootMarkdown).toContain("![](Reise%20aaaaaaaa000040008000000000000001/bild.png)");

        // Round trip: the import plans the same pages with the same parents.
        const texts = new Map(
            [...result.files].filter(([path]) => path.endsWith(".md")).map(([path, data]) => [path, strFromU8(data)]),
        );
        const plan = planNotionImport(texts, result.files.keys());
        expect(plan.items.map((item) => [item.title, item.parentPath])).toEqual([
            ["Reise", null],
            ["Tag 2", "Reise aaaaaaaa000040008000000000000001.md"],
        ]);
    });

    it("writes a database as CSV with its entries in its folder, readable by the import", async () => {
        const pages = [
            page(DATABASE, "Aufgaben", { kind: "database" }),
            // The CSV keeps the order of the database, the folder is sorted by title.
            page(ENTRY_1, "Zweite", { parent_id: DATABASE, position: 2 }),
            page(ENTRY_2, "Erste", { parent_id: DATABASE, position: 1 }),
            page("ffffffff-0000-4000-8000-000000000007", "Vorlage", { parent_id: DATABASE, is_template: true }),
        ];
        const result = await buildExport(pages, [DATABASE], sources);

        expect([result.pages, result.databases, result.attachments, result.problems]).toEqual([2, 1, 1, []]);
        const csvPath = "Aufgaben dddddddd000040008000000000000004.csv";
        expect(strFromU8(result.files.get(csvPath)!)).toBe(
            [
                "Name,Erledigt,Belege",
                "Erste,Yes,Aufgaben%20dddddddd000040008000000000000004/Erste%20eeeeeeee000040008000000000000006/beleg.pdf",
                "Zweite,No,",
                "",
            ].join("\n"),
        );
        const folder = "Aufgaben dddddddd000040008000000000000004";
        expect([...result.files.keys()]).toEqual([
            `${folder}/Erste eeeeeeee000040008000000000000006.md`,
            `${folder}/Zweite eeeeeeee000040008000000000000005.md`,
            csvPath,
            `${folder}/Erste eeeeeeee000040008000000000000006/beleg.pdf`,
        ]);

        const texts = new Map(
            [...result.files].filter(([path]) => path.endsWith(".md")).map(([path, data]) => [path, strFromU8(data)]),
        );
        const [planned] = planNotionImport(texts, result.files.keys()).items;
        expect(planned).toMatchObject({ kind: "database", title: "Aufgaben", dataPath: csvPath });
        expect(planned.kind === "database" && planned.entryPaths).toEqual([
            `${folder}/Erste eeeeeeee000040008000000000000006.md`,
            `${folder}/Zweite eeeeeeee000040008000000000000005.md`,
        ]);
    });

    it("reports a database that could not be loaded", async () => {
        const result = await buildExport([page(OTHER, "Liste", { kind: "database" })], [OTHER], sources);
        expect(result.databases).toBe(0);
        expect(result.problems).toEqual(["Liste: Datenbank konnte nicht geladen werden"]);
    });

    it("reports a page whose text could not be loaded and still exports its title", async () => {
        const failing: ExportSources = { ...sources, loadDocument: () => Promise.reject(new Error("offline")) };
        const result = await buildExport([page(OTHER, "Anderes")], [OTHER], failing);
        expect(result.problems).toEqual(["Anderes: Text konnte nicht geladen werden"]);
        expect(strFromU8(result.files.get("Anderes cccccccc000040008000000000000003.md")!)).toBe("# Anderes\n");
    });
});
