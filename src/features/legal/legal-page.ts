export type LegalPageKind = "impressum" | "datenschutz";

const PARAMETER = "seite";

/** `?seite=impressum` or `?seite=datenschutz`: shown without signing in, like a public page. */
export function legalPageFromSearch(search: string): LegalPageKind | null {
    const value = new URLSearchParams(search).get(PARAMETER);
    return value === "impressum" || value === "datenschutz" ? value : null;
}

/** Relative to the app, so it stays below /nodi/ on GitHub Pages. */
export const legalPageHref = (kind: LegalPageKind) => `${import.meta.env.BASE_URL}?${PARAMETER}=${kind}`;
