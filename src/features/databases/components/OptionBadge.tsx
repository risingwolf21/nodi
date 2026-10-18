import { cn } from "@/lib/utils";
import type { OptionColor, PropertyOption } from "../types";

// Calm colors like Notion's, readable in light and dark mode.
const COLOR_CLASSES: Record<OptionColor, string> = {
    gray: "bg-stone-200/70 text-stone-700 dark:bg-stone-700/60 dark:text-stone-200",
    brown: "bg-amber-900/15 text-amber-900 dark:bg-amber-900/40 dark:text-amber-100",
    orange: "bg-orange-200/70 text-orange-800 dark:bg-orange-900/50 dark:text-orange-100",
    yellow: "bg-yellow-200/70 text-yellow-800 dark:bg-yellow-900/50 dark:text-yellow-100",
    green: "bg-emerald-200/70 text-emerald-800 dark:bg-emerald-900/50 dark:text-emerald-100",
    blue: "bg-sky-200/70 text-sky-800 dark:bg-sky-900/50 dark:text-sky-100",
    purple: "bg-violet-200/70 text-violet-800 dark:bg-violet-900/50 dark:text-violet-100",
    pink: "bg-pink-200/70 text-pink-800 dark:bg-pink-900/50 dark:text-pink-100",
    red: "bg-red-200/70 text-red-800 dark:bg-red-900/50 dark:text-red-100",
};

export function OptionBadge({ option, className }: { option: PropertyOption; className?: string }) {
    return (
        <span
            className={cn(
                "inline-flex max-w-full items-center truncate rounded px-1.5 py-0.5 text-xs leading-4",
                COLOR_CLASSES[option.color],
                className,
            )}
        >
            {option.name}
        </span>
    );
}
