import { forgetSyncEngine, syncEngineFor } from "@/features/editor/services/account-sync";
import { closeLocalDocumentStore, localDatabaseName } from "@/features/editor/services/local-document-store";
import { closePageTreeCache, pageTreeDatabaseName } from "@/features/pages/services/page-tree-cache";
import { deleteDatabase } from "@/lib/indexed-db";

/**
 * Logout policy (CLAUDE.md §2), step 1: store pending edits of open
 * editors and sync. Returns the number of pages that are still unsynced.
 */
export function syncBeforeSignOut(userId: string): Promise<number> {
    return syncEngineFor(userId).syncAll();
}

/**
 * Step 2, after sync succeeded or the user chose to discard: sign out, then
 * delete this account's local data on this device. If signing out fails,
 * nothing is deleted.
 */
export async function signOutAndDeleteLocalData(userId: string, signOut: () => Promise<void>): Promise<void> {
    const engine = syncEngineFor(userId);
    engine.stop();
    try {
        await signOut();
    } catch (error) {
        // Still signed in: keep syncing as before.
        engine.start();
        throw error;
    }

    forgetSyncEngine(userId);
    await Promise.all([closeLocalDocumentStore(userId), closePageTreeCache(userId)]);
    await Promise.all([
        deleteDatabase(indexedDB, localDatabaseName(userId)),
        deleteDatabase(indexedDB, pageTreeDatabaseName(userId)),
    ]);
}
