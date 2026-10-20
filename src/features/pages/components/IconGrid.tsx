import { useState } from "react";
import { searchIcons, typedEmoji } from "../page-icons";

/** Search and grid of emojis, for page icons and callouts (package 30). */
export function IconGrid({ onChoose }: { onChoose: (icon: string) => void }) {
    const [query, setQuery] = useState("");
    const typed = typedEmoji(query);
    const icons = typed ? [typed] : searchIcons(query);

    return (
        <div>
            <input
                autoFocus
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                onKeyDown={(event) => {
                    if (event.key === "Enter" && icons[0]) {
                        event.preventDefault();
                        onChoose(icons[0]);
                    }
                }}
                placeholder="Emoji suchen oder einfügen"
                aria-label="Emoji suchen"
                className="mb-2 h-8 w-full rounded border bg-transparent px-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
            />
            <div className="grid max-h-56 grid-cols-8 gap-0.5 overflow-y-auto" role="group" aria-label="Icons">
                {icons.map((icon) => (
                    <button
                        key={icon}
                        type="button"
                        role="menuitem"
                        aria-label={`Icon ${icon}`}
                        onClick={() => onChoose(icon)}
                        className="flex size-8 items-center justify-center rounded text-xl hover:bg-accent"
                    >
                        {icon}
                    </button>
                ))}
            </div>
            {icons.length === 0 && <p className="px-1 py-2 text-xs text-muted-foreground">Kein Emoji gefunden.</p>}
        </div>
    );
}
