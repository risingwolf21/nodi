// Package 35b: deletes the files of pages deleted for good (queue and
// next_page_file_deletions in 20261025100000_page_file_cleanup.sql).
// Package 40: then the files nothing has referred to for 30 days
// (next_unused_page_files in 20261026120000_unused_page_files.sql).
//
// Called by the app after deleting pages or the account and once a day by
// GitHub Actions. Open without a JWT (config.toml, verify_jwt = false): it
// only removes files whose page no longer exists or that nothing has
// referred to for 30 days, and answers with a count, so a caller can neither
// choose what is deleted nor learn anything.
// Plain fetch against the REST and Storage APIs: no dependency to load.

const BUCKET = "page-files";
// Each source returns at most 1000 paths; a call handles at most ROUNDS of
// them per source. The rest waits for the next call.
const BATCH_SIZE = 1000;
const ROUNDS = 10;

const CORS_HEADERS = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
};

/** The secret key: the new one if the project has it, else the legacy service role key. */
function secretKey(): string | undefined {
    const secretKeys = Deno.env.get("SUPABASE_SECRET_KEYS");
    if (secretKeys) {
        const keys: unknown = JSON.parse(secretKeys);
        if (typeof keys === "object" && keys !== null && "default" in keys && typeof keys.default === "string") {
            return keys.default;
        }
    }
    return Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
}

const isPathList = (value: unknown): value is string[] =>
    Array.isArray(value) && value.every((item) => typeof item === "string");

/** Headers for the secret key; a legacy key is a JWT and also goes into Authorization. */
function serverHeaders(key: string): Record<string, string> {
    const headers: Record<string, string> = { apikey: key, "content-type": "application/json" };
    if (key.startsWith("eyJ")) headers.Authorization = `Bearer ${key}`;
    return headers;
}

// The two lists of files to delete, each returned in batches by a server function.
const SOURCES = ["next_page_file_deletions", "next_unused_page_files"] as const;

async function nextPaths(url: string, headers: Record<string, string>, source: string): Promise<string[]> {
    const response = await fetch(`${url}/rest/v1/rpc/${source}`, {
        method: "POST",
        headers,
        body: JSON.stringify({ p_limit: BATCH_SIZE }),
    });
    const body: unknown = await response.json();
    if (!response.ok || !isPathList(body)) throw new Error(`${source}: ${response.status}`);
    return body;
}

async function removeFiles(url: string, headers: Record<string, string>, paths: string[]): Promise<void> {
    const response = await fetch(`${url}/storage/v1/object/${BUCKET}`, {
        method: "DELETE",
        headers,
        body: JSON.stringify({ prefixes: paths }),
    });
    await response.body?.cancel();
    if (!response.ok) throw new Error(`storage remove: ${response.status}`);
}

Deno.serve(async (request) => {
    if (request.method === "OPTIONS") return new Response(null, { headers: CORS_HEADERS });
    if (request.method !== "POST") return new Response(null, { status: 405, headers: CORS_HEADERS });

    const url = Deno.env.get("SUPABASE_URL");
    const key = secretKey();
    if (!url || !key) {
        console.error("purge-deleted-files: SUPABASE_URL or the secret key is missing");
        return Response.json({ error: "not configured" }, { status: 500, headers: CORS_HEADERS });
    }
    const headers = serverHeaders(key);

    let removed = 0;
    try {
        for (const source of SOURCES) {
            for (let round = 0; round < ROUNDS; round += 1) {
                const paths = await nextPaths(url, headers, source);
                if (paths.length === 0) break;
                await removeFiles(url, headers, paths);
                removed += paths.length;
            }
        }
    } catch (error) {
        console.error("purge-deleted-files:", error);
        return Response.json({ error: "failed", removed }, { status: 500, headers: CORS_HEADERS });
    }
    return Response.json({ removed }, { headers: CORS_HEADERS });
});
