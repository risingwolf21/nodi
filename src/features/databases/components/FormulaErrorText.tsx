import { cn } from "@/lib/utils";
import { NO_FORMULA_MESSAGE } from "../formula/formula-parser";

/** Where a formula result would be: "Fehler" with the reason, or a hint that the formula is missing. */
export function FormulaErrorText({ error, className }: { error: string; className?: string }) {
    if (error === NO_FORMULA_MESSAGE) {
        return <span className={cn("text-muted-foreground", className)}>Formel fehlt</span>;
    }
    return (
        <span className={cn("text-destructive", className)} title={error}>
            <span aria-hidden="true">Fehler</span>
            <span className="sr-only">Fehler: {error}</span>
        </span>
    );
}
