// The CSV of a Notion database ("Markdown & CSV" export, CLAUDE.md §12 P16b).
// It has no types: the first column is the title, every other column is
// guessed from its values. Notion writes select values as their name,
// multi-select as "A, B", checkboxes as "Yes"/"No", dates in the user's
// date format and relations as "Title (Path.md)".
import { OPTION_COLORS } from "@/features/databases/database-model";
import type { DateValue, NumberFormat, OptionColor, PropertyOption } from "@/features/databases/types";
import { resolveExportPath } from "./notion-export";

/** Property types a column can become; Notion's other types arrive as text. */
export type ImportedType =
    "text" | "number" | "checkbox" | "select" | "multi_select" | "status" | "date" | "url" | "email";

export type ImportedColumn = {
    name: string;
    type: ImportedType;
    /** Select and multi-select: one option per value, in order of appearance. */
    options: PropertyOption[];
    /** Dates like 05/10/2026: day first (seen a first number above 12). */
    dayFirst: boolean;
    /** Numbers: how Notion showed them (currency, percent). */
    numberFormat: NumberFormat;
    /** Numbers like 1.234,56: the comma separates the decimals. */
    decimalComma: boolean;
};

// Limits of the server (migration 20261018200000_databases.sql).
const MAX_NAME_LENGTH = 100;
const MAX_TEXT_LENGTH = 10_000;
const MAX_URL_LENGTH = 2000;
const MAX_EMAIL_LENGTH = 320;
const MAX_MULTI_SELECT_VALUES = 100;
// More different values than this is text, not a choice.
const MAX_OPTIONS = 50;
const MAX_OPTION_LENGTH = 100;

/** RFC 4180: quoted fields with commas, quotes ("") and line breaks. */
export function parseCsv(text: string): string[][] {
    const rows: string[][] = [];
    let row: string[] = [];
    let field = "";
    let quoted = false;
    for (let index = 0; index < text.length; index += 1) {
        const char = text[index];
        if (quoted) {
            if (char === '"' && text[index + 1] === '"') {
                field += '"';
                index += 1;
            } else if (char === '"') {
                quoted = false;
            } else {
                field += char;
            }
        } else if (char === '"') {
            quoted = true;
        } else if (char === ",") {
            row.push(field);
            field = "";
        } else if (char === "\n" || char === "\r") {
            if (char === "\r" && text[index + 1] === "\n") index += 1;
            row.push(field);
            rows.push(row);
            row = [];
            field = "";
        } else {
            field += char;
        }
    }
    if (field !== "" || row.length > 0) {
        row.push(field);
        rows.push(row);
    }
    // A leading byte order mark (TextDecoder removes it, other readers may not).
    if (rows[0]?.[0]) rows[0][0] = rows[0][0].replace(/^\uFEFF/, "");
    return rows.filter((cells) => cells.some((cell) => cell.trim() !== ""));
}

/**
 * The pages a relation cell links ("Bericht (Aufgaben%20…/Bericht%20….md), …"),
 * as paths in the export, resolved from the CSV's folder.
 */
export function relationLinks(cell: string, csvPath: string): string[] {
    // Paths are URL-encoded (no spaces) but may keep parentheses: "Notes (2) (../Notes%20(2)%20….md)".
    return [...cell.matchAll(/\((\S+?\.md)\)/gi)].flatMap(
        (match) => resolveExportPath(csvPath, match[1])?.normalize("NFC") ?? [],
    );
}

/** "Bericht (Aufgaben%20…/Bericht%20….md)" → "Bericht": relations and links to pages. */
export function cleanCell(value: string): string {
    return value.replace(/\s*\(\S+?\.(?:md|csv)\)/gi, "").trim();
}

const MONTHS: Record<string, number> = {
    january: 1, jan: 1, januar: 1, jän: 1,
    february: 2, feb: 2, februar: 2,
    march: 3, mar: 3, märz: 3, mär: 3,
    april: 4, apr: 4,
    may: 5, mai: 5,
    june: 6, jun: 6, juni: 6,
    july: 7, jul: 7, juli: 7,
    august: 8, aug: 8,
    september: 9, sep: 9, sept: 9,
    october: 10, oct: 10, oktober: 10, okt: 10,
    november: 11, nov: 11,
    december: 12, dec: 12, dezember: 12, dez: 12,
}; // prettier-ignore

const pad = (value: number) => String(value).padStart(2, "0");

function validDate(year: number, month: number, day: number): boolean {
    const date = new Date(year, month - 1, day);
    return date.getFullYear() === year && date.getMonth() === month - 1 && date.getDate() === day;
}

type Time = {
    hours: number;
    minutes: number;
    /** Minutes east of UTC ("(GMT+2)"); null: local time. */ offset: number | null;
};
type DateParts = { year: number; month: number; day: number; time: Time | null };

/** "+2", "-5:30" → minutes east of UTC. */
function zoneOffset(zone: string | undefined): number | null {
    const match = /^(?:GMT|UTC)(?:([+-])(\d{1,2})(?::?(\d{2}))?)?$/i.exec(zone?.trim() ?? "");
    if (!match) return null;
    const minutes = Number(match[2] ?? 0) * 60 + Number(match[3] ?? 0);
    return match[1] === "-" ? -minutes : minutes;
}

/** "10:30", "10:30 AM", "22:15 Uhr", "8:30 (GMT+2)" → hours and minutes (24 h); null for anything else. */
function parseTime(text: string): Time | null {
    const match = /^(\d{1,2}):(\d{2})(?::\d{2})?(?:\s*([AaPp])\.?[Mm]\.?)?(?:\s*Uhr)?(?:\s*\(([^)]*)\))?$/.exec(
        text.trim(),
    );
    if (!match) return null;
    const hours = Number(match[1]);
    const minutes = Number(match[2]);
    const meridiem = match[3]?.toLowerCase();
    if (minutes > 59 || hours > (meridiem ? 12 : 23) || (meridiem && hours < 1)) return null;
    return {
        hours: meridiem ? (hours % 12) + (meridiem === "p" ? 12 : 0) : hours,
        minutes,
        offset: zoneOffset(match[4]),
    };
}

/** One date (optionally with time) in one of Notion's date formats. */
function parseDateParts(text: string, dayFirst: boolean): DateParts | null {
    const value = text.trim().replace(/\s+/g, " ");
    let date: Omit<DateParts, "time"> | null = null;
    let rest = "";

    const patterns: [RegExp, (match: RegExpExecArray) => Omit<DateParts, "time"> | null][] = [
        // 2026-10-19, 2026/10/19
        [/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})/, (m) => ({ year: +m[1], month: +m[2], day: +m[3] })],
        // 10/19/2026 or 19/10/2026; 19.10.2026
        [
            /^(\d{1,2})\/(\d{1,2})\/(\d{4})/,
            (m) => (dayFirst ? { year: +m[3], month: +m[2], day: +m[1] } : { year: +m[3], month: +m[1], day: +m[2] }),
        ],
        [/^(\d{1,2})\.(\d{1,2})\.(\d{4})/, (m) => ({ year: +m[3], month: +m[2], day: +m[1] })],
        // October 19, 2026; Oct 19, 2026
        [
            /^([A-Za-zÄÖÜäöü]+)\.? (\d{1,2}), (\d{4})/,
            (m) => (MONTHS[m[1].toLowerCase()] ? { year: +m[3], month: MONTHS[m[1].toLowerCase()], day: +m[2] } : null),
        ],
        // 19. Oktober 2026; 19 October 2026
        [
            /^(\d{1,2})\.? ([A-Za-zÄÖÜäöü]+)\.? (\d{4})/,
            (m) => (MONTHS[m[2].toLowerCase()] ? { year: +m[3], month: MONTHS[m[2].toLowerCase()], day: +m[1] } : null),
        ],
    ];
    for (const [pattern, read] of patterns) {
        const match = pattern.exec(value);
        if (!match) continue;
        date = read(match);
        rest = value.slice(match[0].length).replace(/^,?\s*/, "");
        break;
    }
    if (!date || !validDate(date.year, date.month, date.day)) return null;
    if (!rest) return { ...date, time: null };
    const time = parseTime(rest.replace(/^T/, ""));
    return time ? { ...date, time } : null;
}

function dateValue({ year, month, day, time }: DateParts): string {
    if (!time) return `${year}-${pad(month)}-${pad(day)}`;
    // With a zone ("(GMT+2)") the time is exact; without one Notion wrote it as the user saw it: local time.
    if (time.offset !== null) {
        return new Date(Date.UTC(year, month - 1, day, time.hours, time.minutes) - time.offset * 60_000).toISOString();
    }
    return new Date(year, month - 1, day, time.hours, time.minutes).toISOString();
}

/**
 * "October 19, 2026", a range "October 19, 2026 → October 21, 2026", or a
 * range on one day whose end is only a time ("August 6, 2026 7:20 (GMT+2) → 16:00").
 */
export function parseNotionDate(text: string, dayFirst = false): DateValue | null {
    const [startText, endText, ...more] = text.split("→");
    if (more.length > 0) return null;
    const start = parseDateParts(startText, dayFirst);
    if (!start) return null;
    if (endText === undefined) return { start: dateValue(start), end: null };
    let end = parseDateParts(endText, dayFirst);
    const endTime = !end && start.time ? parseTime(endText) : null;
    if (start.time && endTime) end = { ...start, time: { ...endTime, offset: endTime.offset ?? start.time.offset } };
    return end ? { start: dateValue(start), end: dateValue(end) } : null;
}

const CHECKED = new Set(["yes", "ja", "true", "✓"]);
const UNCHECKED = new Set(["no", "nein", "false", ""]);
// Notion writes numbers as it shows them: "1,234.5", "€12.00", "15%", "1.234,56 €".
const NUMBER_SYMBOLS: [RegExp, NumberFormat][] = [
    [/%/, "percent"],
    [/€|\bEUR\b/i, "euro"],
    [/US\$|\$|\bUSD\b/i, "dollar"],
    [/£|\bGBP\b/i, "pound"],
    [/\bCHF\b/i, "franc"],
    [/¥|\bJPY\b/i, "yen"],
];
const NUMBER_DIGITS = /^-?\d[\d.,]*$/;

/** The digits of a number and the format its symbol stands for; null for anything else. */
function numberParts(text: string): { digits: string; format: NumberFormat } | null {
    let rest = text.trim();
    let format: NumberFormat = "number";
    for (const [symbol, symbolFormat] of NUMBER_SYMBOLS) {
        if (!symbol.test(rest)) continue;
        format = symbolFormat;
        rest = rest.replace(symbol, "");
        break;
    }
    // Spaces around the symbol and after the sign; spaces between digits (a phone number) are no number.
    rest = rest.trim().replace(/^-\s+/, "-");
    return NUMBER_DIGITS.test(rest) ? { digits: rest, format } : null;
}

/** "1,234.5" or (decimal comma) "1.234,5" → 1234.5; percent values as fractions, like Notion stores them. */
function parseNumberValue(text: string, decimalComma: boolean): number | null {
    const parts = numberParts(text);
    if (!parts) return null;
    const normalized = decimalComma
        ? parts.digits.replace(/\./g, "").replace(",", ".")
        : parts.digits.replace(/,/g, "");
    if (!/^-?\d+(?:\.\d+)?$/.test(normalized)) return null;
    const value = Number(normalized);
    // 15 % is 0.15; toPrecision drops the rounding noise of the division.
    return parts.format === "percent" ? Number((value / 100).toPrecision(15)) : value;
}

/** A column of numbers: its format and decimal separator; null if a value is no number. */
function numberColumn(values: string[]): { numberFormat: NumberFormat; decimalComma: boolean } | null {
    const parts = values.map(numberParts);
    if (parts.some((part) => part === null)) return null;
    // "12,5" or "1.234,56" use a decimal comma; "1,234" stays a thousands separator.
    const decimalComma = parts.some((part) => part && /,\d{1,2}$|,\d{4,}$|\.\d{3},/.test(part.digits));
    if (values.some((value) => parseNumberValue(value, decimalComma) === null)) return null;
    const formats = new Set(parts.map((part) => part?.format));
    const [numberFormat] = formats;
    return { numberFormat: formats.size === 1 && numberFormat ? numberFormat : "number", decimalComma };
}
const URL_VALUE = /^https?:\/\/\S+$/i;
const EMAIL = /^[^@\s]+@[^@\s]+$/;

const splitMulti = (value: string) =>
    value
        .split(",")
        .map((part) => part.trim())
        .filter(Boolean);

function asChoice(values: string[]): string[] | null {
    const distinct = [...new Set(values)];
    const fits = distinct.length <= MAX_OPTIONS && distinct.every((value) => value.length <= MAX_OPTION_LENGTH);
    // Without a repeated value it is more likely free text.
    return fits && distinct.length < values.length ? distinct : null;
}

// Notion's status values (English and German) with the colors Notion gives them.
const STATUS_COLORS = new Map<string, OptionColor>([
    ["not started", "gray"],
    ["nicht begonnen", "gray"],
    ["in progress", "blue"],
    ["in bearbeitung", "blue"],
    ["in arbeit", "blue"],
    ["done", "green"],
    ["erledigt", "green"],
    ["fertig", "green"],
]);

/** A column "Status", or one with only Notion's status values (the CSV does not tell status from select). */
function isStatusColumn(name: string, values: string[]): boolean {
    return name.trim().toLowerCase() === "status" || values.every((value) => STATUS_COLORS.has(value.toLowerCase()));
}

function statusOptions(names: string[]): PropertyOption[] {
    return choiceOptions(names).map((option) => ({
        ...option,
        color: STATUS_COLORS.get(option.name.toLowerCase()) ?? option.color,
    }));
}

function choiceOptions(names: string[]): PropertyOption[] {
    return names.map((name, index) => ({
        id: crypto.randomUUID(),
        name,
        color: OPTION_COLORS[index % OPTION_COLORS.length],
    }));
}

/** Guesses the property type of a column from its (cleaned) values. */
export function inferColumn(name: string, values: readonly string[]): ImportedColumn {
    const column = (type: ImportedType, settings: Partial<ImportedColumn> = {}): ImportedColumn => ({
        name: name.trim().slice(0, MAX_NAME_LENGTH),
        type,
        options: [],
        dayFirst: false,
        numberFormat: "number",
        decimalComma: false,
        ...settings,
    });
    const filled = values.map((value) => value.trim()).filter(Boolean);
    if (filled.length === 0) return column("text");

    const lower = filled.map((value) => value.toLowerCase());
    if (lower.every((value) => CHECKED.has(value) || UNCHECKED.has(value))) return column("checkbox");
    const numbers = numberColumn(filled);
    if (numbers) return column("number", numbers);

    const dayFirst = filled.some((value) => {
        const match = /(?:^|→\s*)(\d{1,2})\/\d{1,2}\/\d{4}/.exec(value);
        return match !== null && Number(match[1]) > 12;
    });
    if (filled.every((value) => parseNotionDate(value, dayFirst))) return column("date", { dayFirst });
    if (filled.every((value) => URL_VALUE.test(value) && value.length <= MAX_URL_LENGTH)) return column("url");
    if (filled.every((value) => EMAIL.test(value) && value.length <= MAX_EMAIL_LENGTH)) return column("email");

    const distinct = [...new Set(filled)];
    const fitsChoice = distinct.length <= MAX_OPTIONS && distinct.every((value) => value.length <= MAX_OPTION_LENGTH);
    // A status column is one even if every value occurs only once.
    if (fitsChoice && isStatusColumn(name, filled)) return column("status", { options: statusOptions(distinct) });

    if (filled.some((value) => value.includes(","))) {
        const parts = filled.flatMap(splitMulti);
        const choices = asChoice(parts);
        if (choices && filled.every((value) => splitMulti(value).length <= MAX_MULTI_SELECT_VALUES)) {
            return column("multi_select", { options: choiceOptions(choices) });
        }
    } else {
        const choices = asChoice(filled);
        if (choices) return column("select", { options: choiceOptions(choices) });
    }
    return column("text");
}

/** The value for set_page_property; undefined leaves the field empty. */
export function columnValue(column: ImportedColumn, raw: string): unknown {
    const value = raw.trim();
    if (column.type === "checkbox") return CHECKED.has(value.toLowerCase()) ? true : undefined;
    if (!value) return undefined;
    const optionId = (name: string) => column.options.find((option) => option.name === name)?.id;
    switch (column.type) {
        case "number":
            return parseNumberValue(value, column.decimalComma) ?? undefined;
        case "date":
            return parseNotionDate(value, column.dayFirst) ?? undefined;
        case "select":
        case "status":
            return optionId(value);
        case "multi_select": {
            const ids = [...new Set(splitMulti(value).map(optionId))].filter((id) => id !== undefined);
            return ids.length > 0 ? ids : undefined;
        }
        case "url":
        case "email":
        case "text":
            return value.slice(0, MAX_TEXT_LENGTH);
    }
}

/**
 * An entry's Markdown repeats its properties as "Name: Value" lines below
 * the title; they are values now, not text.
 */
export function stripPropertyLines(body: string, columnNames: readonly string[]): string {
    const lines = body.split(/\r?\n/);
    let index = 0;
    while (index < lines.length && lines[index].trim() === "") index += 1;
    const start = index;
    while (
        index < lines.length &&
        columnNames.some((name) => name && (lines[index] === `${name}:` || lines[index].startsWith(`${name}: `)))
    ) {
        index += 1;
    }
    return index === start ? body : lines.slice(index).join("\n");
}

// "Name: Value" or "Name:" (empty); names have no colon.
const PROPERTY_LINE = /^([^:\n]{1,100}):(?: (.*))?$/;

/**
 * The "Name: Value" lines below an entry's title. Newer exports write
 * properties there that the CSV leaves out (relations, rollups, formulas,
 * package 21b); they end at the first other line.
 */
export function readPropertyLines(body: string): { name: string; value: string }[] {
    const lines = body.split(/\r?\n/);
    let index = 0;
    while (index < lines.length && lines[index].trim() === "") index += 1;
    const properties: { name: string; value: string }[] = [];
    for (; index < lines.length; index += 1) {
        const match = PROPERTY_LINE.exec(lines[index]);
        if (!match) break;
        properties.push({ name: match[1], value: match[2] ?? "" });
    }
    return properties;
}
