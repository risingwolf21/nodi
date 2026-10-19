import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// A fresh module per test: the rate limit remembers the last request.
async function loadGeocoding() {
    vi.resetModules();
    return import("./geocoding");
}

const answer = [
    { lat: "48.1372", lon: "11.5756", display_name: "Marienplatz, München, Bayern, Deutschland" },
    { lat: "kaputt", lon: "11", display_name: "Ungültig" },
    { lat: "95", lon: "11", display_name: "Außerhalb" },
];

describe("parseSearchResults", () => {
    it("reads coordinates and the address, leaving out unusable results", async () => {
        const { parseSearchResults } = await loadGeocoding();
        expect(parseSearchResults(answer)).toEqual([
            { lat: 48.1372, lng: 11.5756, label: "Marienplatz, München, Bayern, Deutschland" },
        ]);
        expect(parseSearchResults([{ lat: "1", lon: "2", display_name: "x".repeat(600) }])[0].label).toHaveLength(500);
        expect(() => parseSearchResults({ error: "nope" })).toThrow();
    });
});

describe("searchPlaces", () => {
    beforeEach(() => {
        vi.useFakeTimers();
        vi.stubGlobal(
            "fetch",
            vi.fn(async () => new Response(JSON.stringify(answer), { status: 200 })),
        );
    });
    afterEach(() => {
        vi.useRealTimers();
        vi.unstubAllGlobals();
    });

    it("asks Nominatim in German for five results", async () => {
        const { searchPlaces } = await loadGeocoding();
        await searchPlaces("Marienplatz");
        const url = new URL(String(vi.mocked(fetch).mock.calls[0][0]));
        expect(url.origin + url.pathname).toBe("https://nominatim.openstreetmap.org/search");
        expect(Object.fromEntries(url.searchParams)).toEqual({
            q: "Marienplatz",
            format: "jsonv2",
            limit: "5",
            "accept-language": "de",
        });
    });

    it("sends at most one request per second", async () => {
        const { searchPlaces } = await loadGeocoding();
        await searchPlaces("eins");
        const second = searchPlaces("zwei");
        await vi.advanceTimersByTimeAsync(999);
        expect(fetch).toHaveBeenCalledTimes(1);
        await vi.advanceTimersByTimeAsync(1);
        await second;
        expect(fetch).toHaveBeenCalledTimes(2);
    });

    it("explains a rate limit of the server", async () => {
        vi.mocked(fetch).mockResolvedValueOnce(new Response("", { status: 429 }));
        const { searchPlaces } = await loadGeocoding();
        await expect(searchPlaces("x")).rejects.toThrow("Zu viele Suchen");
    });
});
