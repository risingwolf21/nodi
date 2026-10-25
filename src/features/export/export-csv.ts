import { formatValue, type DatabaseRow } from "@/features/databases/database-model";
import type { DatabaseProperty, DateValue, NumberFormat, PropertyValue } from "@/features/databases/types";

// A database as the CSV of a Notion export (package 34b), in the forms nodi's
// import recognizes again: Yes/No, numbers with their currency symbol, ISO
// days, times with "(GMT+0)", ranges with "→", choices by name, relations as
// "Title (path.md)".

export type CsvLinks = {
    /** An entry of the export (relations): its title and the link from the CSV to its page; null if not exported. */
    entry: (pageId: string) => { title: string; href: string } | null;
    /** A file of a "Dateien & Medien" value, put into the export: the link from the CSV to it. */
    file: (entryId: string, storagePath: string) => string;
};

/** RFC 4180: quoted when needed, quotes doubled. */
export function csvCell(text: string): string {
    return /[",\r\n]|^\s|\s$/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

// The import reads the symbol back as the number format ("€12.5" → euro); percent separately.
const CURRENCY_PREFIX: Partial<Record<NumberFormat, string>> = {
    euro: "€",
    dollar: "$",
    pound: "£",
    franc: "CHF ",
    yen: "¥",
};

const pad = (value: number) => String(value).padStart(2, "0");

/** A day stays a day; a time is written in UTC with its zone, so it imports exactly. */
function dateText(value: string): string {
    if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return "";
    return `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())} ${pad(date.getUTCHours())}:${pad(date.getUTCMinutes())} (GMT+0)`;
}

const isDateValue = (value: PropertyValue): value is DateValue =>
    typeof value === "object" && value !== null && "start" in value;

function computedText(property: DatabaseProperty, value: PropertyValue): string {
    if (typeof value === "number") return String(value);
    if (typeof value === "boolean") return value ? "Yes" : "No";
    if (isDateValue(value))
        return [value.start, value.end]
            .filter((day) => day !== null)
            .map(dateText)
            .join(" → ");
    return formatValue(property, value);
}

export function cellText(property: DatabaseProperty, row: DatabaseRow, links: CsvLinks): string {
    const value = row.values[property.id] ?? null;
    switch (property.type) {
        case "checkbox":
            return value === true ? "Yes" : "No";
        case "number":
            if (typeof value !== "number") return "";
            // The import reads "15%" as 0.15 with the percent format.
            if (property.numberFormat === "percent") return `${Number((value * 100).toPrecision(12))}%`;
            return `${CURRENCY_PREFIX[property.numberFormat ?? "number"] ?? ""}${value}`;
        case "date":
            return isDateValue(value)
                ? [value.start, value.end]
                      .filter((day) => day !== null)
                      .map(dateText)
                      .join(" → ")
                : "";
        case "created_time":
        case "last_edited_time":
            return typeof value === "string" ? dateText(value) : "";
        case "relation":
            return Array.isArray(value)
                ? value
                      .flatMap((id) => {
                          const target = links.entry(id);
                          return target ? [`${target.title || "Ohne Titel"} (${target.href})`] : [];
                      })
                      .join(", ")
                : "";
        case "files":
            return Array.isArray(value) ? value.map((path) => links.file(row.page.id, path)).join(", ") : "";
        case "formula":
        case "rollup":
            return computedText(property, value);
        default:
            return formatValue(property, value);
    }
}

/** Properties that have a column: a button has no value. */
export const exportedProperties = (properties: readonly DatabaseProperty[]) =>
    [...properties].sort((a, b) => a.position - b.position).filter((property) => property.type !== "button");

/** The CSV of a database: "Name" (the title) first, then its properties. */
export function databaseCsv(
    properties: readonly DatabaseProperty[],
    rows: readonly DatabaseRow[],
    links: CsvLinks,
): string {
    const columns = exportedProperties(properties);
    const lines = [
        ["Name", ...columns.map((property) => property.name)],
        ...rows.map((row) => [row.page.title, ...columns.map((property) => cellText(property, row, links))]),
    ];
    return `${lines.map((line) => line.map(csvCell).join(",")).join("\n")}\n`;
}
