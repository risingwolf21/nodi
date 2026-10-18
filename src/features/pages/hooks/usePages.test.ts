import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/supabase", () => ({ supabase: {} }));

const { OFFLINE_READ_ONLY_MESSAGE, pageChangeError, parseServerPages } = await import("./usePages");

describe("pageChangeError", () => {
    it("is null when the change worked", () => {
        expect(pageChangeError({ error: null, status: 200 }, "Fehler")).toBeNull();
    });

    it("explains missing rights and offline in German instead of the raw message", () => {
        vi.spyOn(console, "error").mockImplementation(() => undefined);

        expect(
            pageChangeError(
                { error: { message: "new row violates row-level security policy", code: "42501" }, status: 403 },
                "Die Seite konnte nicht erstellt werden.",
            )?.message,
        ).toBe("Dafür fehlen dir die Rechte.");
        expect(
            pageChangeError({ error: { message: "Failed to fetch", code: "" }, status: 0 }, "Fehler")?.message,
        ).toBe(OFFLINE_READ_ONLY_MESSAGE);
        expect(
            pageChangeError({ error: { message: "boom", code: "XX000" }, status: 500 }, "Die Seite konnte nicht umbenannt werden.")
                ?.message,
        ).toBe("Die Seite konnte nicht umbenannt werden.");
    });
});

describe("parseServerPages", () => {
    it("accepts the rows of the page tree", () => {
        expect(
            parseServerPages([
                {
                    id: "p1",
                    title: "A",
                    parent_id: null,
                    owner_id: "u1",
                    visibility: "workspace",
                    is_archived: false,
                    icon: null,
                    full_width: false,
                },
            ]),
        ).toHaveLength(1);
        expect(parseServerPages(null)).toEqual([]);
    });

    it("rejects unexpected rows instead of showing them", () => {
        expect(() => parseServerPages([{ id: 1, title: "A" }])).toThrow("Unerwartete Antwort");
    });
});
