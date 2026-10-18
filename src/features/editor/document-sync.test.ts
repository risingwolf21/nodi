import { describe, expect, it } from "vitest";
import {
    classifyRequestError,
    compareVersions,
    interpretSaveResult,
    parseLocalDocument,
    parseRemoteDocumentRow,
} from "./document-sync";

const idA = "00000000-0000-4000-8000-00000000000a";
const idB = "00000000-0000-4000-8000-00000000000b";

describe("compareVersions", () => {
    it("orders by edit time first", () => {
        expect(
            compareVersions(
                { editedAt: "2026-10-17T10:00:00.000Z", mutationId: idA },
                { editedAt: "2026-10-17T09:00:00.000Z", mutationId: idB },
            ),
        ).toBe(1);
    });

    it("uses the mutation id on equal edit times", () => {
        const editedAt = "2026-10-17T10:00:00.000Z";
        expect(compareVersions({ editedAt, mutationId: idA }, { editedAt, mutationId: idB })).toBe(-1);
        expect(compareVersions({ editedAt, mutationId: idB }, { editedAt, mutationId: idB })).toBe(0);
    });

    it("treats a missing mutation id as the lowest id", () => {
        const editedAt = "2026-10-17T10:00:00.000Z";
        expect(compareVersions({ editedAt, mutationId: null }, { editedAt, mutationId: idA })).toBe(-1);
    });

    it("compares timestamps with different offsets correctly", () => {
        expect(
            compareVersions(
                { editedAt: "2026-10-17T12:00:00+02:00", mutationId: idA },
                { editedAt: "2026-10-17T10:00:00.000Z", mutationId: idA },
            ),
        ).toBe(0);
    });
});

describe("interpretSaveResult", () => {
    const row = (applied: boolean, storedMutationId: string | null) => ({
        applied,
        stored_edited_at: "2026-10-17T10:00:00.000+00:00",
        stored_mutation_id: storedMutationId,
    });

    it("applied write is saved", () => {
        expect(interpretSaveResult(row(true, idA), idA)).toEqual({ kind: "saved" });
    });

    it("rejected retry of the own mutation is saved", () => {
        expect(interpretSaveResult(row(false, idA), idA)).toEqual({ kind: "saved" });
    });

    it("rejected write with a foreign mutation is superseded", () => {
        expect(interpretSaveResult(row(false, idB), idA)).toEqual({
            kind: "superseded",
            stored: { editedAt: "2026-10-17T10:00:00.000+00:00", mutationId: idB },
        });
    });

    it("unexpected payload is a permanent failure", () => {
        expect(interpretSaveResult(undefined, idA)).toMatchObject({
            kind: "failed",
            reason: "permanent",
        });
    });
});

describe("classifyRequestError", () => {
    it.each([
        [{ status: 0, code: "" }, "offline"],
        [{ status: 401, code: "PGRST301" }, "auth"],
        [{ status: 503, code: "" }, "temporary"],
        [{ status: 400, code: "40001" }, "temporary"],
        [{ status: 403, code: "42501" }, "permanent"],
        [{ status: 400, code: "22023" }, "permanent"],
    ] as const)("%o -> %s", (error, expected) => {
        expect(classifyRequestError(error)).toBe(expected);
    });
});

describe("parseRemoteDocumentRow", () => {
    it("maps a row to a remote document", () => {
        expect(
            parseRemoteDocumentRow({
                document: [{ type: "paragraph" }],
                client_updated_at: "2026-10-17T10:00:00+00:00",
                last_mutation_id: null,
            }),
        ).toEqual({
            content: [{ type: "paragraph" }],
            editedAt: "2026-10-17T10:00:00+00:00",
            mutationId: null,
        });
    });

    it("returns null when no document exists", () => {
        expect(parseRemoteDocumentRow(null)).toBeNull();
    });

    it("rejects a document that is not an array of blocks", () => {
        expect(() =>
            parseRemoteDocumentRow({
                document: { type: "paragraph" },
                client_updated_at: "2026-10-17T10:00:00+00:00",
                last_mutation_id: null,
            }),
        ).toThrow();
    });
});

describe("parseLocalDocument", () => {
    const valid = {
        pageId: "page",
        content: [],
        editedAt: "2026-10-17T10:00:00.000Z",
        mutationId: idA,
        synced: false,
        canEdit: null,
    };

    it("accepts a valid record", () => {
        expect(parseLocalDocument(valid)).toEqual(valid);
    });

    it("rejects records with missing or wrong fields", () => {
        expect(parseLocalDocument({ ...valid, synced: "yes" })).toBeNull();
        expect(parseLocalDocument({ ...valid, editedAt: "not a date" })).toBeNull();
        expect(parseLocalDocument("garbage")).toBeNull();
    });
});
