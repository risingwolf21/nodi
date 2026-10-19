// A fake Supabase backend for the browser tests: answers the requests the
// app makes, from an in-memory state each test sets up and inspects.
// Nothing reaches a real server; OpenStreetMap is faked as well.
import type { BrowserContext, Route } from "@playwright/test";

/** Must match VITE_SUPABASE_URL of the test build (playwright.config.ts). */
export const SUPABASE_URL = "http://fake.localhost:54321";
export const OWNER = "11111111-1111-4111-8111-111111111111";
const WORKSPACE = "w1";
// supabase.ts: `sb-<first label of the host>-auth-token`.
const AUTH_STORAGE_KEY = "sb-fake-auth-token";

export type FakePage = {
    id: string;
    title: string;
    parent_id: string | null;
    owner_id: string;
    visibility: "private" | "workspace";
    is_archived: boolean;
    icon: string | null;
    full_width: boolean;
    kind: "page" | "database";
    position: number | null;
    created_at: string;
};

export type FakeProperty = {
    id: string;
    databaseId: string;
    name: string;
    type: string;
    options: Record<string, unknown>;
    position: number;
};

export type FakeView = {
    id: string;
    databaseId: string;
    name: string;
    type: string;
    config: Record<string, unknown>;
    position: number;
};

export type FakeValue = { pageId: string; propertyId: string; value: unknown; updatedAt: string };

/** One call of the RPC set_page_property, as the app sent it. */
export type SetPropertyCall = { p_page_id: string; p_property_id: string; p_value: unknown; p_edited_at: string };

/** The start of an entry's text, as the feed query selects it. */
export type FakePreview = {
    pageId: string;
    updatedAt: string;
    block0: unknown;
    block1: unknown;
    block2: unknown;
    pages: { parent_id: string };
};

export type FakeBackend = {
    pages: FakePage[];
    properties: FakeProperty[];
    views: FakeView[];
    values: FakeValue[];
    previews: FakePreview[];
    /** Every set_page_property call, oldest first. */
    propertyCalls: SetPropertyCall[];
    propertyPatches: unknown[];
    pagesCreated: number;
    offline: boolean;
    login: "ok" | "invalid";
    signups: number;
    geocodingRequests: URLSearchParams[];
    tiles: number;
    /** Storage bucket page-files, by path. */
    files: Map<string, Buffer>;
    /** Documents saved with save_page_document, by page id. */
    savedDocuments: Map<string, unknown>;
    /** Pages behind a public link, by token. */
    publicPages: Map<string, { title: string; icon: string | null; full_width: boolean; document: unknown[] }>;
};

export function page(id: string, title: string, extra: Partial<FakePage> = {}): FakePage {
    return {
        id,
        title,
        parent_id: null,
        owner_id: OWNER,
        visibility: "private",
        is_archived: false,
        icon: null,
        full_width: false,
        kind: "page",
        position: null,
        created_at: "2026-10-01T10:00:00Z",
        ...extra,
    };
}

export const STATUS_OPTIONS = [
    { id: "todo", name: "Nicht begonnen", color: "gray" },
    { id: "doing", name: "In Arbeit", color: "blue" },
    { id: "done", name: "Erledigt", color: "green" },
];

export function createBackend(initial: Partial<FakeBackend> = {}): FakeBackend {
    return {
        pages: [],
        properties: [],
        views: [],
        values: [],
        previews: [],
        propertyCalls: [],
        propertyPatches: [],
        pagesCreated: 0,
        offline: false,
        login: "ok",
        signups: 0,
        geocodingRequests: [],
        tiles: 0,
        files: new Map(),
        savedDocuments: new Map(),
        publicPages: new Map(),
        ...initial,
    };
}

/** A database "Aufgaben" with the entries "Bericht" and "Angebot". */
export function taskDatabase(extra: Partial<FakeBackend> = {}): FakeBackend {
    return createBackend({
        pages: [
            page("db", "Aufgaben", { kind: "database" }),
            page("e1", "Bericht", { parent_id: "db", position: 1 }),
            page("e2", "Angebot", { parent_id: "db", position: 2 }),
        ],
        views: [{ id: "v1", databaseId: "db", name: "Tabelle", type: "table", config: {}, position: 1 }],
        ...extra,
    });
}

const base64Url = (value: object) => Buffer.from(JSON.stringify(value)).toString("base64url");

function session() {
    const expiresAt = Math.floor(Date.now() / 1000) + 86400;
    return {
        access_token: `${base64Url({ alg: "HS256" })}.${base64Url({ sub: OWNER, exp: expiresAt, role: "authenticated" })}.sig`,
        refresh_token: "refresh",
        token_type: "bearer",
        expires_in: 86400,
        expires_at: expiresAt,
        user: {
            id: OWNER,
            email: "owner@nodi.test",
            aud: "authenticated",
            role: "authenticated",
            app_metadata: {},
            user_metadata: {},
            created_at: "2026-10-01T10:00:00Z",
        },
    };
}

/** Starts the app signed in, as if the session were stored from an earlier visit. */
export async function signIn(context: BrowserContext): Promise<void> {
    await context.addInitScript(
        ([key, value]) => localStorage.setItem(key, value),
        [AUTH_STORAGE_KEY, JSON.stringify(session())],
    );
}

const CORS = {
    "access-control-allow-origin": "*",
    "access-control-allow-headers": "*",
    "access-control-allow-methods": "*",
    "access-control-expose-headers": "content-range",
};

type RequestBody = Record<string, unknown>;

function requestBody(route: Route): RequestBody {
    const body: unknown = route.request().postDataJSON();
    if (typeof body !== "object" || body === null) throw new Error("Request without a JSON object");
    return Object.fromEntries(Object.entries(body));
}

const text = (body: RequestBody, key: string) => String(body[key]);

/** supabase-js uploads a Blob as multipart form data; this is the file part. */
function fileFromMultipart(body: Buffer, contentType: string): Buffer {
    const boundary = /boundary=(?:"([^"]+)"|([^;]+))/.exec(contentType);
    if (!boundary) return body;
    const marker = Buffer.from(`--${boundary[1] ?? boundary[2]}`);
    let index = body.indexOf(marker);
    while (index !== -1) {
        const next = body.indexOf(marker, index + marker.length);
        if (next === -1) break;
        const part = body.subarray(index + marker.length, next);
        if (part.includes("filename=")) {
            // Headers end with an empty line; the part ends with a line break.
            return part.subarray(part.indexOf("\r\n\r\n") + 4, part.length - 2);
        }
        index = next;
    }
    return body;
}

// A transparent 1×1 PNG for map tiles.
const TILE = Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=",
    "base64",
);

export async function installFakeSupabase(context: BrowserContext, backend: FakeBackend): Promise<void> {
    await context.route(`${SUPABASE_URL}/**`, (route) => {
        if (backend.offline) return route.abort("internetdisconnected");
        return answer(route, backend);
    });

    await context.route("https://tile.openstreetmap.org/**", (route) => {
        backend.tiles += 1;
        if (backend.offline) return route.abort("internetdisconnected");
        return route.fulfill({ status: 200, contentType: "image/png", body: TILE });
    });

    await context.route("https://nominatim.openstreetmap.org/**", (route) => {
        backend.geocodingRequests.push(new URL(route.request().url()).searchParams);
        return route.fulfill({
            status: 200,
            contentType: "application/json",
            headers: { "access-control-allow-origin": "*" },
            body: JSON.stringify([
                { lat: "48.1351", lon: "11.5820", display_name: "Frauenkirche, München, Bayern, Deutschland" },
            ]),
        });
    });
}

function answer(route: Route, backend: FakeBackend): Promise<void> {
    const request = route.request();
    const url = new URL(request.url());
    const query = url.searchParams;
    const method = request.method();
    const path = url.pathname;
    const idFilter = () => query.get("id")?.replace("eq.", "");
    const json = (body: unknown, status = 200, headers: Record<string, string> = {}) =>
        route.fulfill({
            status,
            contentType: "application/json",
            body: JSON.stringify(body),
            headers: { ...CORS, ...headers },
        });

    if (method === "OPTIONS") return json({});

    // Auth
    if (path === "/auth/v1/token" && query.get("grant_type") === "password") {
        if (backend.login === "invalid") {
            return json({ code: 400, error_code: "invalid_credentials", msg: "Invalid login credentials" }, 400);
        }
        return json(session());
    }
    if (path === "/auth/v1/token") return json(session());
    if (path === "/auth/v1/signup") {
        backend.signups += 1;
        // No session: the address still has to be confirmed.
        return json({ ...session().user, identities: [{ id: "identity" }] });
    }
    if (path === "/auth/v1/user") return json(session().user);
    if (path === "/auth/v1/logout") return route.fulfill({ status: 204, headers: CORS });

    // Workspaces and page tree
    if (path === "/rest/v1/workspace_members") return json([{ workspace_id: WORKSPACE }]);
    if (path === "/rest/v1/workspaces") return json([{ id: WORKSPACE, name: "Team", owner_id: OWNER }]);
    if (path === "/rest/v1/pages") {
        if (method === "POST") {
            const body = requestBody(route);
            backend.pagesCreated += 1;
            backend.pages.push(
                page(text(body, "id"), text(body, "title"), {
                    parent_id: typeof body.parent_id === "string" ? body.parent_id : null,
                    kind: body.kind === "database" ? "database" : "page",
                    position: typeof body.position === "number" ? body.position : null,
                    created_at: new Date().toISOString(),
                }),
            );
            if (body.kind === "database") {
                // The server adds the first view with a trigger.
                backend.views.push({
                    id: crypto.randomUUID(),
                    databaseId: text(body, "id"),
                    name: "Tabelle",
                    type: "table",
                    config: {},
                    position: 1,
                });
            }
            return route.fulfill({ status: 201, headers: CORS });
        }
        if (method === "PATCH") {
            const target = backend.pages.find((item) => item.id === idFilter());
            if (target) Object.assign(target, requestBody(route));
            return json(target ? [{ id: target.id }] : []);
        }
        // Readable page ids, for deleting local copies of revoked pages.
        if (query.get("select") === "id") {
            const ids = backend.pages.map(({ id }) => ({ id }));
            return json(ids, 200, { "content-range": `0-${ids.length - 1}/${ids.length}` });
        }
        // Own workspace; nothing is shared from other workspaces.
        return json(query.get("workspace_id") === `eq.${WORKSPACE}` ? backend.pages : []);
    }

    // Databases
    if (path === "/rest/v1/database_properties") {
        if (method === "GET") return json(backend.properties);
        if (method === "POST") {
            const body = requestBody(route);
            const property: FakeProperty = {
                id: crypto.randomUUID(),
                databaseId: text(body, "database_id"),
                name: text(body, "name"),
                type: text(body, "type"),
                options: typeof body.options === "object" && body.options !== null ? { ...body.options } : {},
                position: Number(body.position),
            };
            backend.properties.push(property);
            return json([property], 201);
        }
        if (method === "PATCH") {
            const body = requestBody(route);
            backend.propertyPatches.push(body);
            const property = backend.properties.find((item) => item.id === idFilter());
            if (property) Object.assign(property, body);
            return json(property ? [property] : []);
        }
        if (method === "DELETE") {
            backend.properties = backend.properties.filter((item) => item.id !== idFilter());
            return json([{ id: idFilter() }]);
        }
    }
    if (path === "/rest/v1/database_views") {
        if (method === "GET") return json(backend.views);
        if (method === "POST") {
            const body = requestBody(route);
            const view: FakeView = {
                id: crypto.randomUUID(),
                databaseId: text(body, "database_id"),
                name: text(body, "name"),
                type: text(body, "type"),
                config: typeof body.config === "object" && body.config !== null ? { ...body.config } : {},
                position: Number(body.position),
            };
            backend.views.push(view);
            return json([view], 201);
        }
        if (method === "PATCH") {
            const view = backend.views.find((item) => item.id === idFilter());
            if (view) Object.assign(view, requestBody(route));
            return json(view ? [view] : []);
        }
        if (method === "DELETE") {
            backend.views = backend.views.filter((item) => item.id !== idFilter());
            return json([{ id: idFilter() }]);
        }
    }
    if (path === "/rest/v1/page_property_values") return json(backend.values);
    if (path === "/rest/v1/rpc/set_page_property") {
        const body = requestBody(route);
        const call: SetPropertyCall = {
            p_page_id: text(body, "p_page_id"),
            p_property_id: text(body, "p_property_id"),
            p_value: body.p_value,
            p_edited_at: text(body, "p_edited_at"),
        };
        backend.propertyCalls.push(call);
        backend.values = backend.values.filter(
            (value) => value.pageId !== call.p_page_id || value.propertyId !== call.p_property_id,
        );
        backend.values.push({
            pageId: call.p_page_id,
            propertyId: call.p_property_id,
            value: call.p_value,
            updatedAt: call.p_edited_at,
        });
        return json([{ applied: true, stored_edited_at: call.p_edited_at, stored_mutation_id: body.p_mutation_id }]);
    }

    if (path === "/rest/v1/rpc/save_page_document") {
        const body = requestBody(route);
        backend.savedDocuments.set(text(body, "p_page_id"), body.p_document);
        return json([{ applied: true, stored_edited_at: body.p_edited_at, stored_mutation_id: body.p_mutation_id }]);
    }
    if (path === "/rest/v1/rpc/get_public_page") {
        const publicPage = backend.publicPages.get(text(requestBody(route), "p_token"));
        return json(publicPage ? [publicPage] : []);
    }

    // Storage: upload, signed URL, download of the signed URL.
    const upload = /^\/storage\/v1\/object\/page-files\/(.+)$/.exec(path);
    if (upload && method === "POST") {
        const filePath = decodeURIComponent(upload[1]);
        if (backend.files.has(filePath)) return json({ statusCode: "409", error: "Duplicate" }, 409);
        const raw = request.postDataBuffer() ?? Buffer.alloc(0);
        backend.files.set(filePath, fileFromMultipart(raw, request.headers()["content-type"] ?? ""));
        return json({ Key: `page-files/${filePath}`, Id: crypto.randomUUID() });
    }
    const signed = /^\/storage\/v1\/object\/sign\/page-files\/(.+)$/.exec(path);
    if (signed) {
        const filePath = decodeURIComponent(signed[1]);
        const file = backend.files.get(filePath);
        if (!file) return json({ statusCode: "404", error: "not_found", message: "Object not found" }, 400);
        if (method === "POST") return json({ signedURL: `/object/sign/page-files/${filePath}?token=fake` });
        return route.fulfill({ status: 200, contentType: "image/png", body: file, headers: CORS });
    }

    // Documents: the feed asks for the first blocks; a page's own text is empty.
    if (path === "/rest/v1/page_documents") {
        return json(query.get("select")?.includes("block0") ? backend.previews : []);
    }
    if (path === "/rest/v1/rpc/can_edit_page") return json(true);

    return json([]);
}
