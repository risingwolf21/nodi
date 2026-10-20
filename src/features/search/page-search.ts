import { localDocumentStoreFor } from "@/features/editor/services/local-document-store";
import type { Page } from "@/features/pages/types";
import { toRequestError } from "@/lib/request-errors";
import { supabase } from "@/lib/supabase";
import { documentText, searchLocally, type SearchResult } from "./search-text";

const RESULT_LIMIT = 30;

/**
 * Online: the server's full-text search (RLS decides what is found); only
 * pages the app knows (its workspace, shared with the user) are shown, as
 * those can be opened. Throws when the server cannot be reached.
 */
export async function searchOnServer(query: string, knownPages: Page[]): Promise<SearchResult[]> {
    const response = await supabase.rpc("search_pages", { p_query: query, p_limit: RESULT_LIMIT });
    const failure = toRequestError(response);
    if (failure) throw failure;
    const byId = new Map(knownPages.map((page) => [page.id, page]));
    const rows: unknown[] = Array.isArray(response.data) ? response.data : [];
    return rows.flatMap((row) => {
        if (typeof row !== "object" || row === null || !("id" in row) || typeof row.id !== "string") return [];
        const page = byId.get(row.id);
        const snippet = "snippet" in row && typeof row.snippet === "string" ? row.snippet : null;
        return page ? [{ page, snippet }] : [];
    });
}

/** Offline: titles and the documents stored on this device. */
export async function searchOnDevice(userId: string, query: string, knownPages: Page[]): Promise<SearchResult[]> {
    const documents = await localDocumentStoreFor(userId).listAll();
    const texts = new Map(documents.map((document) => [document.pageId, documentText(document.content)]));
    return searchLocally(query, knownPages, texts).slice(0, RESULT_LIMIT);
}
