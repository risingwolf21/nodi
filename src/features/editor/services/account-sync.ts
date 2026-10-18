import { documentChangesFor } from "./document-changes";
import { localDocumentStoreFor } from "./local-document-store";
import { remoteDocumentRepository } from "./remote-document-repository";
import { SyncEngine } from "./sync-engine";

const enginesByUser = new Map<string, SyncEngine>();

/** One sync engine per account and tab, wired to IndexedDB and Supabase. */
export function syncEngineFor(userId: string): SyncEngine {
    let engine = enginesByUser.get(userId);
    if (!engine) {
        engine = new SyncEngine({
            userId,
            store: localDocumentStoreFor(userId),
            remote: remoteDocumentRepository,
            changes: documentChangesFor(userId),
        });
        enginesByUser.set(userId, engine);
    }
    return engine;
}
