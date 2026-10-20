import { useState } from "react";
import { Menu } from "@/components/ui/menu";
import { PAGE_ICONS } from "@/features/pages/page-icons";
import { CALLOUT_COLORS, type CalloutColor } from "./callout";

/** The emoji of a callout; when editable, a menu to choose the emoji and the background. */
export function CalloutIcon({
    emoji,
    color,
    editable,
    onChange,
}: {
    emoji: string;
    color: CalloutColor;
    editable: boolean;
    onChange: (changes: { emoji?: string; color?: CalloutColor }) => void;
}) {
    const [open, setOpen] = useState(false);
    if (!editable) {
        return (
            <span className="flex size-7 shrink-0 items-center justify-center text-xl" aria-hidden="true">
                {emoji}
            </span>
        );
    }
    const choose = (changes: { emoji?: string; color?: CalloutColor }) => {
        setOpen(false);
        onChange(changes);
    };

    return (
        <span className="relative shrink-0" contentEditable={false}>
            <button
                type="button"
                onClick={() => setOpen((value) => !value)}
                className="flex size-7 items-center justify-center rounded text-xl hover:bg-black/5 dark:hover:bg-white/10"
                aria-label="Callout-Icon und Farbe ändern"
                aria-haspopup="menu"
                aria-expanded={open}
            >
                {emoji}
            </button>
            <Menu open={open} onClose={() => setOpen(false)} align="start" detached className="w-72 p-2">
                <div className="grid grid-cols-8 gap-0.5" role="group" aria-label="Icons">
                    {PAGE_ICONS.map((icon) => (
                        <button
                            key={icon}
                            type="button"
                            role="menuitem"
                            aria-label={`Icon ${icon}`}
                            onClick={() => choose({ emoji: icon })}
                            className="flex size-8 items-center justify-center rounded text-xl hover:bg-accent"
                        >
                            {icon}
                        </button>
                    ))}
                </div>
                <div className="mt-2 grid grid-cols-3 gap-1" role="group" aria-label="Hintergrund">
                    {CALLOUT_COLORS.map(({ value, label }) => (
                        <button
                            key={value}
                            type="button"
                            role="menuitemradio"
                            aria-checked={value === color}
                            onClick={() => choose({ color: value })}
                            className="flex items-center gap-1.5 rounded px-1.5 py-1 text-left text-sm hover:bg-accent aria-checked:font-medium"
                        >
                            <span className="nodi-callout-swatch size-3.5 rounded-sm border" data-color={value} />
                            {label}
                        </button>
                    ))}
                </div>
            </Menu>
        </span>
    );
}
