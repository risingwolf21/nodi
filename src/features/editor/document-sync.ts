import { RemoteRequestError } from "@/lib/request-errors";
import type {
    DocumentContent,
    DocumentVersion,
    LocalDocument,
    RemoteDocument,
    SaveOutcome,
} from "./types";

// Same fallback the server uses for documents without a mutation id.
const NIL_MUTATION_ID = "00000000-0000-0000-0000-000000000000";

// Edit time of a document that has never been saved.
export const NEVER_EDITED = new Date(0).toISOString();

/** Orders like the server: edit time, then mutation id. */
export function compareVersions(a: DocumentVersion, b: DocumentVersion): number {
    const timeDifference = Date.parse(a.editedAt) - Date.parse(b.editedAt);
    if (timeDifference !== 0) return Math.sign(timeDifference);

    const aId = a.mutationId ?? NIL_MUTATION_ID;
    const bId = b.mutationId ?? NIL_MUTATION_ID;
    return aId < bId ? -1 : aId > bId ? 1 : 0;
}

export function isDocumentContent(value: unknown): value is DocumentContent {
    return (
        Array.isArray(value) &&
        value.every((block) => typeof block === "object" && block !== null)
    );
}

function isTimestamp(value: unknown): value is string {
    return typeof value === "string" && !Number.isNaN(Date.parse(value));
}

function isOptionalString(value: unknown): value is string | null {
    return value === null || typeof value === "string";
}

/** Validates a `page_documents` row; null means "no document yet". */
export function parseRemoteDocumentRow(row: unknown): RemoteDocument | null {
    if (row === null) return null;

    if (
        typeof row !== "object" ||
        !("document" in row) ||
        !("client_updated_at" in row) ||
        !("last_mutation_id" in row) ||
        !isDocumentContent(row.document) ||
        !isTimestamp(row.client_updated_at) ||
        !isOptionalString(row.last_mutation_id)
    ) {
        // Retrying does not help with a malformed answer.
        throw new RemoteRequestError("permanent", "Unerwartetes Dokumentformat vom Server.");
    }

    return {
        content: row.document,
        editedAt: row.client_updated_at,
        mutationId: row.last_mutation_id,
    };
}

/** Validates a record read from IndexedDB; invalid records count as missing. */
export function parseLocalDocument(value: unknown): LocalDocument | null {
    if (
        typeof value !== "object" ||
        value === null ||
        !("pageId" in value) ||
        !("content" in value) ||
        !("editedAt" in value) ||
        !("mutationId" in value) ||
        !("synced" in value) ||
        !("canEdit" in value) ||
        typeof value.pageId !== "string" ||
        !isDocumentContent(value.content) ||
        !isTimestamp(value.editedAt) ||
        !isOptionalString(value.mutationId) ||
        typeof value.synced !== "boolean" ||
        (value.canEdit !== null && typeof value.canEdit !== "boolean")
    ) {
        return null;
    }

    return {
        pageId: value.pageId,
        content: value.content,
        editedAt: value.editedAt,
        mutationId: value.mutationId,
        synced: value.synced,
        canEdit: value.canEdit,
    };
}

/**
 * Interprets the row returned by `save_page_document`. A rejected write
 * whose stored mutation id is our own was already applied earlier (retry).
 */
export function interpretSaveResult(
    row: unknown,
    ownMutationId: string,
): SaveOutcome {
    if (
        typeof row !== "object" ||
        row === null ||
        !("applied" in row) ||
        !("stored_edited_at" in row) ||
        !("stored_mutation_id" in row) ||
        typeof row.applied !== "boolean" ||
        !isTimestamp(row.stored_edited_at) ||
        !isOptionalString(row.stored_mutation_id)
    ) {
        return {
            kind: "failed",
            reason: "permanent",
            message: "Unerwartete Antwort vom Server.",
        };
    }

    if (row.applied || row.stored_mutation_id === ownMutationId) {
        return { kind: "saved" };
    }

    return {
        kind: "superseded",
        stored: {
            editedAt: row.stored_edited_at,
            mutationId: row.stored_mutation_id,
        },
    };
}
