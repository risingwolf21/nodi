import { useContext } from "react";
import { personName } from "@/features/mentions/mentions";
import { DatabaseBlockContext } from "./database-block-context";

/**
 * A person mentioned with "@" (package 37). The name comes from the members
 * of the workspace; `label` (the e-mail at mentioning time) is the fallback,
 * e.g. in the public view or after the person left.
 */
export function PersonMention({ userId, label }: { userId: string; label: string }) {
    const context = useContext(DatabaseBlockContext);
    const email = context?.people.find((person) => person.userId === userId)?.email ?? label;
    return (
        <span className="nodi-mention rounded px-0.5 font-medium text-brand" title={email}>
            @{personName(email) || "Unbekannt"}
        </span>
    );
}
