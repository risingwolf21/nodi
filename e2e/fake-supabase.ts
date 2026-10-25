// A fake Supabase backend for the browser tests: answers the requests the
// app makes, from an in-memory state each test sets up and inspects.
// Nothing reaches a real server; OpenStreetMap is faked as well.
import type { BrowserContext, Route } from "@playwright/test";

/** Must match VITE_SUPABASE_URL of the test build (playwright.config.ts). */
export const SUPABASE_URL = "http://fake.localhost:54321";
export const OWNER = "11111111-1111-4111-8111-111111111111";
/** A second member of the workspace (person properties). */
export const MEMBER = "22222222-2222-4222-8222-222222222222";
// A local Supabase refuses requests from about 300 ids in the URL (414).
const MAX_URL_LENGTH = 8000;
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
    is_template?: boolean;
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

/** Views of a "Datenbank" block in a page's text (package 19c). */
export type FakeBlockView = FakeView & { pageId: string; blockId: string };

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
    blockViews: FakeBlockView[];
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
    /** Rules of recurring entries (package 25), as the app stored them. */
    recurrences: Record<string, unknown>[];
    /** Workspaces create_due_recurring_entries was called for, oldest first. */
    recurrenceRuns: string[];
    /** Page ids in the user's favorites (package 30b). */
    favorites: string[];
    /** Comments of pages (package 31a), as the server stores them. */
    comments: FakeComment[];
    /** "Passwort vergessen?" requests (package 33b), oldest first. */
    passwordResets: { email: string; redirectTo: string | null }[];
    /** New passwords set with updateUser. */
    newPasswords: string[];
    accountDeleted: boolean;
    /** Calls of the Edge Function purge-deleted-files. */
    fileCleanups: number;
};

export type FakeComment = {
    id: string;
    page_id: string;
    parent_id: string | null;
    author_id: string;
    author_email: string;
    body: string;
    quote: string | null;
    created_at: string;
    edited_at: string | null;
    resolved_at: string | null;
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
        blockViews: [],
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
        recurrences: [],
        recurrenceRuns: [],
        favorites: [],
        comments: [],
        passwordResets: [],
        newPasswords: [],
        accountDeleted: false,
        fileCleanups: 0,
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

/** The part of the link from a password reset e-mail that supabase-js reads (implicit flow). */
export function recoveryHash(): string {
    const { access_token, refresh_token, expires_in, expires_at, token_type } = session();
    const params = new URLSearchParams({
        access_token,
        refresh_token,
        expires_in: String(expires_in),
        expires_at: String(expires_at),
        token_type,
        type: "recovery",
    });
    return `#${params.toString()}`;
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

/** Like the server (package 17d): the other side of a relation gains or loses the entry. */
function mirrorRelation(backend: FakeBackend, call: SetPropertyCall): void {
    const property = backend.properties.find((item) => item.id === call.p_property_id);
    const paired = property?.type === "relation" ? property.options.pairedPropertyId : undefined;
    if (typeof paired !== "string") return;
    const ids = (value: unknown) => (Array.isArray(value) ? value.filter((id) => typeof id === "string") : []);
    const before = ids(backend.values.find((v) => v.pageId === call.p_page_id && v.propertyId === property?.id)?.value);
    const after = ids(call.p_value);
    for (const related of new Set([...before, ...after])) {
        const stored = backend.values.find((v) => v.pageId === related && v.propertyId === paired);
        const others = ids(stored?.value).filter((id) => id !== call.p_page_id);
        const next = after.includes(related) ? [...others, call.p_page_id] : others;
        backend.values = backend.values.filter((v) => v !== stored);
        backend.values.push({
            pageId: related,
            propertyId: paired,
            value: next.length > 0 ? next : null,
            updatedAt: call.p_edited_at,
        });
    }
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
    // Like the proxy in front of Supabase: a very long URL is refused.
    if (request.url().length > MAX_URL_LENGTH) return json({ message: "URI too long" }, 414);

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
    if (path === "/auth/v1/recover") {
        backend.passwordResets.push({ email: text(requestBody(route), "email"), redirectTo: query.get("redirect_to") });
        return json({});
    }
    if (path === "/auth/v1/user") {
        if (method === "PUT") backend.newPasswords.push(text(requestBody(route), "password"));
        return json(session().user);
    }
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
                    ...(body.is_template === true ? { is_template: true } : {}),
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
            // Several pages at once: the trash moves whole trees (`id=in.(…)`).
            const ids = /^in\.\((.*)\)$/.exec(query.get("id") ?? "")?.[1].split(",") ?? [idFilter()];
            const targets = backend.pages.filter((item) => ids.includes(item.id));
            for (const target of targets) Object.assign(target, requestBody(route));
            return json(targets.map(({ id }) => ({ id })));
        }
        if (method === "DELETE") {
            // Deleting for good (trash): by id or all own archived pages; subpages go with them (cascade).
            const id = query.get("id")?.replace("eq.", "");
            const owner = query.get("owner_id")?.replace("eq.", "");
            const deleted = backend.pages.filter(
                (item) => item.is_archived && (!id || item.id === id) && (!owner || item.owner_id === owner),
            );
            const gone = new Set(deleted.map((item) => item.id));
            let grew = true;
            while (grew) {
                grew = false;
                for (const item of backend.pages) {
                    if (item.parent_id && gone.has(item.parent_id) && !gone.has(item.id)) {
                        gone.add(item.id);
                        grew = true;
                    }
                }
            }
            backend.pages = backend.pages.filter((item) => !gone.has(item.id));
            return json(deleted.map((item) => ({ id: item.id })));
        }
        // The workspace of a database, for the members of person properties (package 29).
        if (query.get("select") === "workspace_id") return json([{ workspace_id: WORKSPACE }]);
        // Readable page ids, for deleting local copies of revoked pages.
        if (query.get("select") === "id") {
            const ids = backend.pages.map(({ id }) => ({ id }));
            return json(ids, 200, { "content-range": `0-${ids.length - 1}/${ids.length}` });
        }
        // Entries of related databases (relations, package 17e).
        const parents = /^in\.\((.*)\)$/.exec(query.get("parent_id") ?? "")?.[1].split(",");
        if (parents) {
            return json(
                backend.pages
                    .filter((item) => item.parent_id && parents.includes(item.parent_id) && !item.is_archived)
                    .map(({ id, title, icon, parent_id }) => ({ id, title, icon, parentId: parent_id })),
            );
        }
        // Own workspace; nothing is shared from other workspaces. Favorites are embedded like PostgREST does.
        return json(
            query.get("workspace_id") === `eq.${WORKSPACE}`
                ? backend.pages.map((item) => ({
                      ...item,
                      favorites: backend.favorites.includes(item.id) ? [{ created_at: "2026-10-20T10:00:00Z" }] : [],
                  }))
                : [],
        );
    }

    if (path === "/functions/v1/purge-deleted-files") {
        if (method === "POST") backend.fileCleanups += 1;
        return json({ removed: 0 });
    }
    if (path === "/rest/v1/rpc/delete_account") {
        backend.accountDeleted = true;
        return route.fulfill({ status: 204, headers: CORS });
    }
    if (path === "/rest/v1/rpc/list_page_comments") {
        const pageId = text(requestBody(route), "p_page_id");
        return json(backend.comments.filter((item) => item.page_id === pageId));
    }
    if (path === "/rest/v1/page_comments") {
        // Like the server: author and times come from it; only own comments change their text.
        const id = query.get("id")?.replace("eq.", "");
        if (method === "POST") {
            const body = requestBody(route);
            const comment: FakeComment = {
                // A thread on text brings its id (the mark in the text) and the quote (package 31b).
                id: typeof body.id === "string" ? body.id : crypto.randomUUID(),
                page_id: text(body, "page_id"),
                parent_id: typeof body.parent_id === "string" ? body.parent_id : null,
                author_id: OWNER,
                author_email: "owner@nodi.test",
                body: text(body, "body"),
                quote: typeof body.quote === "string" && typeof body.parent_id !== "string" ? body.quote : null,
                created_at: new Date().toISOString(),
                edited_at: null,
                resolved_at: null,
            };
            backend.comments.push(comment);
            return json([{ id: comment.id }], 201);
        }
        const target = backend.comments.find((item) => item.id === id);
        if (!target) return json([]);
        if (method === "PATCH") {
            const body = requestBody(route);
            if (typeof body.body === "string")
                Object.assign(target, { body: body.body, edited_at: new Date().toISOString() });
            if ("resolved_at" in body) target.resolved_at = body.resolved_at === null ? null : new Date().toISOString();
            return json([{ id: target.id }]);
        }
        if (method === "DELETE") {
            backend.comments = backend.comments.filter((item) => item.id !== id && item.parent_id !== id);
            return json([{ id: target.id }]);
        }
    }
    if (path === "/rest/v1/page_favorites") {
        if (method === "POST") backend.favorites.push(text(requestBody(route), "page_id"));
        if (method === "DELETE") {
            const id = query.get("page_id")?.replace("eq.", "");
            backend.favorites = backend.favorites.filter((item) => item !== id);
        }
        return route.fulfill({ status: method === "POST" ? 201 : 204, headers: CORS });
    }

    // Databases
    if (path === "/rest/v1/database_properties") {
        if (method === "GET") {
            const database = query.get("database_id");
            return json(
                database
                    ? backend.properties.filter((item) => `eq.${item.databaseId}` === database)
                    : backend.properties,
            );
        }
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
        if (method === "GET") {
            const database = query.get("database_id");
            return json(
                database ? backend.views.filter((view) => `eq.${view.databaseId}` === database) : backend.views,
            );
        }
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
    if (path === "/rest/v1/block_views") {
        if (method === "GET") {
            return json(
                backend.blockViews.filter(
                    (view) =>
                        `eq.${view.databaseId}` === query.get("database_id") &&
                        `eq.${view.pageId}` === query.get("page_id") &&
                        `eq.${view.blockId}` === query.get("block_id"),
                ),
            );
        }
        if (method === "POST") {
            const body = requestBody(route);
            const view: FakeBlockView = {
                id: crypto.randomUUID(),
                databaseId: text(body, "database_id"),
                pageId: text(body, "page_id"),
                blockId: text(body, "block_id"),
                name: text(body, "name"),
                type: text(body, "type"),
                config: typeof body.config === "object" && body.config !== null ? { ...body.config } : {},
                position: Number(body.position),
            };
            backend.blockViews.push(view);
            return json([view], 201);
        }
        if (method === "PATCH") {
            const view = backend.blockViews.find((item) => item.id === idFilter());
            if (view) Object.assign(view, requestBody(route));
            return json(view ? [view] : []);
        }
        if (method === "DELETE") {
            backend.blockViews = backend.blockViews.filter((item) => item.id !== idFilter());
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
        mirrorRelation(backend, call);
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

    if (path === "/rest/v1/rpc/move_page") {
        const body = requestBody(route);
        const moving = backend.pages.find((item) => item.id === body.p_page_id);
        const parent = backend.pages.find((item) => item.id === body.p_parent_id);
        if (!moving) return json({ code: "42501", message: "no edit rights" }, 403);
        // Like the server (package 18a): the subtree takes the section of its new place.
        const section = parent ? parent.visibility : body.p_section === "workspace" ? "workspace" : "private";
        const subtree = new Set([moving.id]);
        for (let grown = true; grown;) {
            grown = false;
            for (const item of backend.pages) {
                if (item.parent_id && subtree.has(item.parent_id) && !subtree.has(item.id)) {
                    subtree.add(item.id);
                    grown = true;
                }
            }
        }
        for (const item of backend.pages) if (subtree.has(item.id)) item.visibility = section;
        const intoDatabase = parent?.kind === "database";
        const wasEntry = backend.pages.some((item) => item.id === moving.parent_id && item.kind === "database");
        if (wasEntry && moving.parent_id !== parent?.id) {
            backend.values = backend.values.filter((value) => value.pageId !== moving.id);
        }
        moving.position = intoDatabase
            ? Math.max(
                  0,
                  ...backend.pages.filter((item) => item.parent_id === parent?.id).map((item) => item.position ?? 0),
              ) + 1
            : null;
        moving.parent_id = parent?.id ?? null;
        return route.fulfill({ status: 204, headers: CORS });
    }

    if (path === "/rest/v1/rpc/add_relation_property") {
        const body = requestBody(route);
        const [source, paired] = [crypto.randomUUID(), crypto.randomUUID()];
        const add = (id: string, databaseId: string, name: string, target: string, other: string) =>
            backend.properties.push({
                id,
                databaseId,
                name,
                type: "relation",
                options: { databaseId: target, pairedPropertyId: other },
                position: backend.properties.filter((item) => item.databaseId === databaseId).length,
            });
        add(source, text(body, "p_database_id"), text(body, "p_name"), text(body, "p_target_database_id"), paired);
        add(
            paired,
            text(body, "p_target_database_id"),
            text(body, "p_paired_name"),
            text(body, "p_database_id"),
            source,
        );
        return json([{ property_id: source, paired_property_id: paired }]);
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

    // Documents: the feed asks for the first blocks; a page's own text is what
    // the test saved, else empty. The version is old: a local copy always wins.
    if (path === "/rest/v1/page_documents") {
        if (query.get("select")?.includes("block0")) return json(backend.previews);
        const saved = backend.savedDocuments.get(query.get("page_id")?.replace("eq.", "") ?? "");
        return json(
            saved ? [{ document: saved, client_updated_at: "2026-01-01T00:00:00Z", last_mutation_id: null }] : [],
        );
    }
    if (path === "/rest/v1/rpc/can_edit_page") return json(true);
    if (path === "/rest/v1/rpc/search_pages") {
        // Like the server: titles and texts (the "text" values of the saved documents), title hits first.
        const needle = text(requestBody(route), "p_query").trim().toLowerCase();
        const texts = (document: unknown) =>
            [...JSON.stringify(document ?? []).matchAll(/"text":"((?:[^"\\]|\\.)*)"/g)]
                .map((match) => match[1])
                .join(" ");
        const hits = backend.pages.flatMap((item) => {
            if (item.is_archived || needle.length < 2) return [];
            const body = texts(backend.savedDocuments.get(item.id));
            const inTitle = item.title.toLowerCase().includes(needle);
            const at = body.toLowerCase().indexOf(needle);
            if (!inTitle && at === -1) return [];
            const snippet = at === -1 ? null : body.slice(Math.max(at - 40, 0), Math.max(at - 40, 0) + 160);
            return [{ id: item.id, title: item.title, inTitle, snippet }];
        });
        hits.sort((a, b) => Number(b.inTitle) - Number(a.inTitle));
        return json(hits.map(({ id, title, snippet }) => ({ id, title, snippet })));
    }
    if (path === "/rest/v1/rpc/list_workspace_members") {
        return json([
            { user_id: OWNER, email: "owner@nodi.test", role: "owner", joined_at: "2026-10-01T10:00:00Z" },
            { user_id: MEMBER, email: "kim@nodi.test", role: "member", joined_at: "2026-10-02T10:00:00Z" },
        ]);
    }
    if (path === "/rest/v1/rpc/page_backlinks") {
        // Like the server: active pages whose saved text has a page link to the page.
        const target = text(requestBody(route), "p_page_id");
        const links = (document: unknown) => JSON.stringify(document ?? []).includes(`"pageId":"${target}"`);
        return json(
            backend.pages
                .filter((item) => item.id !== target && !item.is_archived)
                .filter((item) => links(backend.savedDocuments.get(item.id)))
                .map(({ id, title, icon, kind }) => ({ id, title, icon, kind })),
        );
    }
    if (path === "/rest/v1/rpc/create_entry_from_template") {
        // Like the server: a copy of the template (title, icon, values) at the end of its database.
        const template = backend.pages.find((item) => item.id === text(requestBody(route), "p_template_id"));
        if (!template?.is_template) return json({ code: "22023", message: "not a template" }, 400);
        const id = crypto.randomUUID();
        const siblings = backend.pages.filter((item) => item.parent_id === template.parent_id);
        backend.pages.push({
            ...template,
            id,
            is_template: false,
            position: Math.max(0, ...siblings.map((item) => item.position ?? 0)) + 1,
        });
        for (const value of backend.values.filter((item) => item.pageId === template.id)) {
            backend.values.push({ ...value, pageId: id });
        }
        return json(id);
    }
    if (path === "/rest/v1/rpc/create_due_recurring_entries") {
        backend.recurrenceRuns.push(text(requestBody(route), "p_workspace_id"));
        return json(0);
    }
    if (path === "/rest/v1/entry_recurrences") {
        const pageId = query.get("page_id")?.replace("eq.", "");
        // The server's names, aliased like the app asks for them; the next day is the start here.
        const shown = (row: Record<string, unknown>) => ({
            pageId: row.page_id,
            frequency: row.frequency,
            interval: row.interval,
            weekdays: row.weekdays,
            startDate: row.start_date,
            nextDate: row.start_date,
            datePropertyId: row.date_property_id,
        });
        if (method === "GET") return json(backend.recurrences.filter((row) => row.page_id === pageId).map(shown));
        if (method === "POST") {
            const body = requestBody(route);
            backend.recurrences = [...backend.recurrences.filter((row) => row.page_id !== body.page_id), body];
            return json([shown(body)], 201);
        }
        if (method === "DELETE") {
            backend.recurrences = backend.recurrences.filter((row) => row.page_id !== pageId);
            return json([]);
        }
    }

    return json([]);
}
