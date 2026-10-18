import type { PartialBlock } from "@blocknote/core";
import type { RequestFailureReason } from "@/lib/request-errors";

export type DocumentContent = PartialBlock[];

/**
 * Position of a document state in the last-write-wins order enforced by
 * the server (`save_page_document`, CLAUDE.md §8): edit time first, then
 * mutation id. `mutationId` is null for documents written before the RPC
 * existed.
 */
export type DocumentVersion = {
    editedAt: string;
    mutationId: string | null;
};

export type RemoteDocument = DocumentVersion & {
    content: DocumentContent;
};

export type LocalDocument = DocumentVersion & {
    pageId: string;
    content: DocumentContent;
    /** The server has confirmed exactly this version. */
    synced: boolean;
    /** Last known edit permission; null until the server has been asked. */
    canEdit: boolean | null;
};

export type SaveOutcome =
    | { kind: "saved" }
    | { kind: "superseded"; stored: DocumentVersion }
    | { kind: "failed"; reason: RequestFailureReason; message: string };

export type RemotePageDocument = {
    document: RemoteDocument | null;
    canEdit: boolean;
};

/** Server access for documents; implemented with Supabase, faked in tests. */
export type RemoteDocumentApi = {
    /** Throws RemoteRequestError if the server cannot answer. */
    fetch(pageId: string): Promise<RemotePageDocument>;
    save(
        pageId: string,
        content: DocumentContent,
        version: DocumentVersion & { mutationId: string },
    ): Promise<SaveOutcome>;
};
