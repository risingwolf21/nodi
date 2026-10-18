import { isDocumentContent } from "@/features/editor/document-sync";
import type { DocumentContent } from "@/features/editor/types";
import { RemoteRequestError, toRequestError } from "@/lib/request-errors";
import { supabase } from "@/lib/supabase";

export type PublicPage = {
    title: string;
    icon: string | null;
    fullWidth: boolean;
    document: DocumentContent;
};

const PUBLIC_PAGE_PARAMETER = "p";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Token of a public link (`…/nodi/?p=<token>`), "" for an invalid token
 * and null when the URL is not a public link. A query parameter needs no
 * extra route on GitHub Pages.
 */
export function publicPageToken(search: string): string | null {
    const token = new URLSearchParams(search).get(PUBLIC_PAGE_PARAMETER);
    if (token === null) return null;
    return UUID.test(token) ? token : "";
}

/** Relative to the app's base path, so it works under /nodi/. */
export function publicPageUrl(
    token: string,
    origin = location.origin,
    basePath = import.meta.env.BASE_URL,
): string {
    const url = new URL(basePath, origin);
    url.searchParams.set(PUBLIC_PAGE_PARAMETER, token);
    return url.toString();
}

/** Validates a row of `get_public_page`. */
export function parsePublicPage(row: unknown): PublicPage | null {
    if (
        typeof row !== "object" ||
        row === null ||
        !("title" in row) ||
        typeof row.title !== "string" ||
        !("icon" in row) ||
        (row.icon !== null && typeof row.icon !== "string") ||
        !("full_width" in row) ||
        typeof row.full_width !== "boolean" ||
        !("document" in row) ||
        !isDocumentContent(row.document)
    ) {
        return null;
    }
    return { title: row.title, icon: row.icon, fullWidth: row.full_width, document: row.document };
}

/**
 * Reads a published page without signing in (RPC `get_public_page`).
 * Null when the link is unknown, revoked or the page is archived.
 * Nothing is stored on the device.
 */
export async function fetchPublicPage(token: string): Promise<PublicPage | null> {
    const response = await supabase.rpc("get_public_page", { p_token: token });
    const failure = toRequestError(response);
    if (failure) throw failure;

    const rows: unknown = response.data;
    if (!Array.isArray(rows) || rows.length === 0) return null;

    const page = parsePublicPage(rows[0]);
    if (!page) throw new RemoteRequestError("permanent", "Unerwartete Antwort des Servers.");
    return page;
}
