import { beforeEach, describe, expect, it, vi } from "vitest";
import { RemoteRequestError } from "@/lib/request-errors";

const session = vi.hoisted(() => ({ userId: "u1" as string | null }));

vi.mock("@/lib/supabase", () => ({
    supabase: {
        auth: {
            getSession: async () => ({
                data: { session: session.userId ? { user: { id: session.userId } } : null },
            }),
        },
    },
}));

const { loadCacheThenServer } = await import("./load-cache-then-server");

type Shown = { value: string; fromCache: boolean };

function load(options: {
    cache?: string | null;
    server?: () => Promise<string>;
    cacheFirst?: boolean;
}) {
    const shown: Shown[] = [];
    const fetchServer = vi.fn(options.server ?? (async () => "server"));
    const result = loadCacheThenServer({
        userId: "u1",
        readCache: async () => options.cache ?? null,
        fetchServer,
        cacheFirst: options.cacheFirst ?? true,
        isActive: () => true,
        show: (value, fromCache) => shown.push({ value, fromCache }),
    });
    return { result, shown, fetchServer };
}

beforeEach(() => {
    session.userId = "u1";
});

describe("loadCacheThenServer", () => {
    it("shows the cache first and the server answer after it", async () => {
        let answer: (value: string) => void = () => undefined;
        const { result, shown } = load({
            cache: "cached",
            server: () => new Promise((resolve) => (answer = resolve)),
        });

        await vi.waitFor(() => expect(shown).toEqual([{ value: "cached", fromCache: true }]));
        answer("server");

        expect(await result).toBe("server");
        expect(shown.at(-1)).toEqual({ value: "server", fromCache: false });
    });

    it("does not flash back to the cache when server data is shown already", async () => {
        const { result, shown } = load({ cache: "cached", cacheFirst: false });

        expect(await result).toBe("server");
        expect(shown).toEqual([{ value: "server", fromCache: false }]);
    });

    it("does not ask the server without this account's session", async () => {
        session.userId = null;
        const { result, shown, fetchServer } = load({ cache: "cached", cacheFirst: false });

        expect(await result).toBe("cache");
        expect(fetchServer).not.toHaveBeenCalled();
        expect(shown).toEqual([{ value: "cached", fromCache: true }]);
    });

    it("reports offline without a cached copy", async () => {
        const { result, shown } = load({
            server: async () => {
                throw new RemoteRequestError("offline", "Failed to fetch");
            },
        });

        expect(await result).toBe("none");
        expect(shown).toEqual([]);
    });

    it("throws other errors, keeping what is shown", async () => {
        const failure = new RemoteRequestError("permanent", "permission denied");
        const { result } = load({
            cache: "cached",
            server: async () => {
                throw failure;
            },
        });

        await expect(result).rejects.toBe(failure);
    });
});
