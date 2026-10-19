import { describe, expect, it, vi } from "vitest";

const rpc = vi.hoisted(() => vi.fn());

vi.mock("@/lib/supabase", () => ({ supabase: { rpc } }));

const { fetchPublicPage, parsePublicPage, publicPageToken, publicPageUrl } = await import("./public-page");

const token = "ffffffff-ffff-4fff-8fff-ffffffffffff";

describe("publicPageToken", () => {
    it("reads the token of a public link", () => {
        expect(publicPageToken(`?p=${token}`)).toBe(token);
    });

    it("is null for the normal app and empty for an invalid token", () => {
        expect(publicPageToken("")).toBeNull();
        expect(publicPageToken("?x=1")).toBeNull();
        expect(publicPageToken("?p=abc")).toBe("");
    });
});

describe("publicPageUrl", () => {
    it("stays under the app's base path (GitHub Pages)", () => {
        expect(publicPageUrl(token, "https://risingwolf21.github.io", "/nodi/")).toBe(
            `https://risingwolf21.github.io/nodi/?p=${token}`,
        );
    });
});

describe("parsePublicPage", () => {
    it("validates a row of get_public_page", () => {
        expect(
            parsePublicPage({ title: "A", icon: null, full_width: true, document: [{ type: "paragraph" }] }),
        ).toEqual({
            title: "A",
            icon: null,
            fullWidth: true,
            document: [{ type: "paragraph" }],
        });
        expect(parsePublicPage({ title: "A", icon: null, full_width: true, document: "x" })).toBeNull();
    });
});

describe("fetchPublicPage", () => {
    it("returns null for an unknown or revoked link", async () => {
        rpc.mockResolvedValueOnce({ data: [], error: null, status: 200 });

        expect(await fetchPublicPage(token)).toBeNull();
        expect(rpc).toHaveBeenCalledWith("get_public_page", { p_token: token });
    });

    it("reports a missing connection as offline", async () => {
        rpc.mockResolvedValueOnce({ data: null, error: { message: "Failed to fetch", code: "" }, status: 0 });

        await expect(fetchPublicPage(token)).rejects.toMatchObject({ reason: "offline" });
    });
});
