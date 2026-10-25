/**
 * Who runs this nodi (package 33b). Fill in before publishing: the
 * Impressum and the privacy policy show these values. Placeholders stay in
 * square brackets until then, and both pages say so.
 */
export const OPERATOR = {
    name: "[Vor- und Nachname]",
    street: "[Straße und Hausnummer]",
    city: "[PLZ und Ort]",
    email: "[E-Mail-Adresse]",
    /** Where the Supabase project stores data, e.g. "Frankfurt (eu-central-1)". */
    supabaseRegion: "[Region des Supabase-Projekts]",
    supervisoryAuthority: "[zuständige Datenschutz-Aufsichtsbehörde]",
    updated: "[Datum]",
};

export const isPlaceholder = (value: string) => value.startsWith("[");

export const operatorIncomplete = Object.values(OPERATOR).some(isPlaceholder);
