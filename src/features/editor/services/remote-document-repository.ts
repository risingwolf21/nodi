import { supabase } from "@/lib/supabase";
import { toRequestError } from "@/lib/request-errors";
import { interpretSaveResult, parseRemoteDocumentRow } from "../document-sync";
import type { RemoteDocumentApi } from "../types";

export const remoteDocumentRepository: RemoteDocumentApi = {
    async fetch(pageId) {
        const [documentResponse, permissionResponse] = await Promise.all([
            supabase
                .from("page_documents")
                .select("document, client_updated_at, last_mutation_id")
                .eq("page_id", pageId)
                .maybeSingle(),
            supabase.rpc("can_edit_page", { target_page_id: pageId }),
        ]);

        const failure =
            toRequestError(documentResponse) ?? toRequestError(permissionResponse);
        if (failure) throw failure;

        return {
            document: parseRemoteDocumentRow(documentResponse.data),
            canEdit: permissionResponse.data === true,
        };
    },

    async save(pageId, content, version) {
        const response = await supabase.rpc("save_page_document", {
            p_page_id: pageId,
            p_document: content,
            p_edited_at: version.editedAt,
            p_mutation_id: version.mutationId,
        });

        const failure = toRequestError(response);
        if (failure) {
            return { kind: "failed", reason: failure.reason, message: failure.message };
        }

        // RETURNS TABLE: PostgREST delivers the single row as an array.
        const row: unknown = Array.isArray(response.data) ? response.data[0] : undefined;
        return interpretSaveResult(row, version.mutationId);
    },
};
