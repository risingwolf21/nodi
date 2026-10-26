import { useEffect, useState } from "react";
import { workspaceMembers, type WorkspaceMember } from "../services/workspace-members";

/**
 * The members of a workspace, for "@" mentions in the text (package 37).
 * Online only; without them the "@" menu offers pages only.
 */
export function useWorkspaceMembers(workspaceId: string, online: boolean): WorkspaceMember[] {
    const [loaded, setLoaded] = useState<{ workspaceId: string; members: WorkspaceMember[] } | null>(null);

    useEffect(() => {
        if (!workspaceId || !online) return;
        let active = true;
        workspaceMembers
            .list(workspaceId)
            .then((members) => {
                if (active) setLoaded({ workspaceId, members });
            })
            .catch((error: unknown) => {
                console.warn("Mitglieder für Erwähnungen konnten nicht geladen werden:", error);
            });
        return () => {
            active = false;
        };
    }, [workspaceId, online]);

    return loaded?.workspaceId === workspaceId ? loaded.members : [];
}
