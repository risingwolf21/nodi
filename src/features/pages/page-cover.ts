// Covers of pages (package 30c): a gradient of the app or an image of the
// page (`nodi-file:` reference, package 15). The server checks the form
// (`pages_cover_check`); an unknown gradient shows the first one.

export type CoverGradient = { id: string; label: string; css: string };

export const COVER_GRADIENTS: readonly CoverGradient[] = [
    { id: "indigo", label: "Indigo", css: "linear-gradient(135deg, #6366f1 0%, #1e1b4b 100%)" },
    { id: "sunset", label: "Abendrot", css: "linear-gradient(135deg, #f97316 0%, #db2777 100%)" },
    { id: "ocean", label: "Meer", css: "linear-gradient(135deg, #06b6d4 0%, #1d4ed8 100%)" },
    { id: "forest", label: "Wald", css: "linear-gradient(135deg, #22c55e 0%, #14532d 100%)" },
    { id: "rose", label: "Rosé", css: "linear-gradient(135deg, #fda4af 0%, #f5d0fe 100%)" },
    { id: "slate", label: "Schiefer", css: "linear-gradient(135deg, #94a3b8 0%, #334155 100%)" },
];

const GRADIENT_PREFIX = "gradient:";

export const gradientCover = (id: string) => GRADIENT_PREFIX + id;

/** The gradient of a cover, or null for an image. */
export function coverGradient(cover: string): CoverGradient | null {
    if (!cover.startsWith(GRADIENT_PREFIX)) return null;
    const id = cover.slice(GRADIENT_PREFIX.length);
    return COVER_GRADIENTS.find((gradient) => gradient.id === id) ?? COVER_GRADIENTS[0];
}
