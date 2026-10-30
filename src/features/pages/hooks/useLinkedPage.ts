import { useEffect, useState } from "react";
import { pageWorkspaceId } from "../services/page-location";

/** Why an open page cannot be shown yet: still looking, or it cannot be opened. */
export type LinkedPageStatus = "loading" | "missing" | "unavailable" | null;

type Lookup = { pageId: string; workspaceId: string | null } | { pageId: string; failed: true };

/**
 * A page opened by its address (package 46) that is not among the loaded
 * pages: finds its workspace and switches there, or says why it cannot open.
 */
export function useLinkedPage({
    pageId,
    found,
    pagesLoading,
    workspaceId,
    workspaceIds,
    onSwitchWorkspace,
}: {
    pageId: string;
    found: boolean;
    pagesLoading: boolean;
    workspaceId: string;
    workspaceIds: string[];
    onSwitchWorkspace: (workspaceId: string) => void;
}): LinkedPageStatus {
    const [lookup, setLookup] = useState<Lookup | null>(null);
    const lookingFor = pageId && !found && !pagesLoading ? pageId : "";

    useEffect(() => {
        if (!lookingFor) return;
        let active = true;
        pageWorkspaceId(lookingFor).then(
            (workspace) => {
                if (active) setLookup({ pageId: lookingFor, workspaceId: workspace });
            },
            (err: unknown) => {
                console.error("Seite des Links konnte nicht gefunden werden:", err);
                if (active) setLookup({ pageId: lookingFor, failed: true });
            },
        );
        return () => {
            active = false;
        };
    }, [lookingFor]);

    const current = lookup?.pageId === pageId ? lookup : null;
    const target = current && "workspaceId" in current ? current.workspaceId : null;
    const switchTo = !found && target && target !== workspaceId && workspaceIds.includes(target) ? target : "";
    useEffect(() => {
        if (switchTo) onSwitchWorkspace(switchTo);
    }, [switchTo, onSwitchWorkspace]);

    if (!pageId || found) return null;
    if (!current || pagesLoading || switchTo) return "loading";
    if ("failed" in current) return "unavailable";
    // Another workspace's page shared with the user comes with "Mit mir geteilt".
    if (current.workspaceId !== null && current.workspaceId !== workspaceId) return "loading";
    return "missing";
}
