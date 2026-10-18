/**
 * Tells every tab of an account, this one included, that a stored
 * document changed. Messages carry only the page id; receivers read the
 * current state from the local store, so a late message is harmless.
 */
export type DocumentChanges = {
    announce(pageId: string): void;
    subscribe(listener: (pageId: string) => void): () => void;
};

function channelName(userId: string): string {
    return `nodi-documents-${userId}`;
}

const changesByUser = new Map<string, DocumentChanges>();

export function documentChangesFor(userId: string): DocumentChanges {
    let changes = changesByUser.get(userId);
    if (!changes) {
        // A channel does not receive its own messages, so sending and each
        // subscription use separate channels; that includes this tab.
        const sender = new BroadcastChannel(channelName(userId));
        changes = {
            announce: (pageId) => sender.postMessage(pageId),
            subscribe(listener) {
                const receiver = new BroadcastChannel(channelName(userId));
                receiver.onmessage = (event: MessageEvent<unknown>) => {
                    if (typeof event.data === "string") listener(event.data);
                };
                return () => receiver.close();
            },
        };
        changesByUser.set(userId, changes);
    }
    return changes;
}
