// Rollups (package 24): a value computed from a property of the entries a
// relation links, with Notion's functions. Computed in the app like
// formulas, offline from the cache as well.
import type { DateValue, PropertyType, PropertyValue, RollupFunction } from "./types";

export const ROLLUP_FUNCTION_LABELS: Record<RollupFunction, string> = {
    show_original: "Werte anzeigen",
    count_all: "Anzahl",
    count_values: "Werte zählen",
    count_unique: "Eindeutige Werte zählen",
    count_empty: "Leere zählen",
    count_not_empty: "Nicht leere zählen",
    percent_empty: "Prozent leer",
    percent_not_empty: "Prozent nicht leer",
    sum: "Summe",
    average: "Durchschnitt",
    median: "Median",
    min: "Minimum",
    max: "Maximum",
    range: "Spanne",
    earliest: "Frühestes Datum",
    latest: "Spätestes Datum",
    checked: "Angehakt zählen",
    unchecked: "Nicht angehakt zählen",
    percent_checked: "Prozent angehakt",
};

export const ROLLUP_FUNCTIONS = Object.keys(ROLLUP_FUNCTION_LABELS) as RollupFunction[];

const COMMON: RollupFunction[] = [
    "show_original",
    "count_all",
    "count_values",
    "count_unique",
    "count_empty",
    "count_not_empty",
    "percent_empty",
    "percent_not_empty",
];

/** Properties a rollup can read: those with stored values, and the title. Computed ones are not loaded. */
export function canRollUp(type: PropertyType): boolean {
    return !["formula", "rollup", "relation", "created_time", "last_edited_time"].includes(type);
}

/** The functions that fit a target ("title" for the title), like Notion offers them. */
export function rollupFunctionsFor(type: PropertyType | "title"): RollupFunction[] {
    if (type === "number") return [...COMMON, "sum", "average", "median", "min", "max", "range"];
    if (type === "date") return [...COMMON, "earliest", "latest", "range"];
    if (type === "checkbox") return ["show_original", "count_all", "checked", "unchecked", "percent_checked"];
    return COMMON;
}

export function isPercentRollup(fn: RollupFunction): boolean {
    return fn === "percent_empty" || fn === "percent_not_empty" || fn === "percent_checked";
}

/** Functions whose result is a value of the target (shown in its number format). */
export function keepsTargetFormat(fn: RollupFunction): boolean {
    return ["sum", "average", "median", "min", "max", "range"].includes(fn);
}

const isEmpty = (value: PropertyValue) =>
    value === null || value === "" || (Array.isArray(value) && value.length === 0);

const isDate = (value: PropertyValue): value is DateValue =>
    typeof value === "object" && value !== null && !Array.isArray(value) && "start" in value;

const DAY_MS = 24 * 60 * 60 * 1000;

/** The point in time of a stored date: a day counts from its local midnight. */
function dateTime(value: string): number {
    const day = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
    return day ? new Date(Number(day[1]), Number(day[2]) - 1, Number(day[3])).getTime() : Date.parse(value);
}

function median(numbers: number[]): number | null {
    if (numbers.length === 0) return null;
    const sorted = [...numbers].sort((a, b) => a - b);
    const middle = Math.floor(sorted.length / 2);
    return sorted.length % 2 === 1 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}

/**
 * The rollup of the values of the related entries (one per entry, null if
 * empty). `format` shows a single value as text (for "Werte anzeigen" and
 * unique values). Percentages are fractions (0.25), like Notion stores them.
 */
export function computeRollup(
    fn: RollupFunction,
    values: PropertyValue[],
    format: (value: PropertyValue) => string,
): PropertyValue {
    const filled = values.filter((value) => !isEmpty(value));
    const share = (count: number) => (values.length === 0 ? 0 : count / values.length);
    const numbers = values.filter((value): value is number => typeof value === "number");
    const times = values.flatMap((value) =>
        isDate(value) ? [value.start, value.end].flatMap((part) => (part ? [part] : [])) : [],
    );
    const sortedTimes = [...times].sort((a, b) => dateTime(a) - dateTime(b));

    switch (fn) {
        case "show_original":
            return filled.map(format).filter(Boolean).join(", ") || null;
        case "count_all":
            return values.length;
        case "count_values":
            // A multi-select counts each of its choices.
            return filled.reduce((count: number, value) => count + (Array.isArray(value) ? value.length : 1), 0);
        case "count_unique":
            return new Set(filled.flatMap((value) => (Array.isArray(value) ? value : [format(value)]))).size;
        case "count_empty":
            return values.length - filled.length;
        case "count_not_empty":
            return filled.length;
        case "percent_empty":
            return share(values.length - filled.length);
        case "percent_not_empty":
            return share(filled.length);
        case "sum":
            return numbers.reduce((sum, value) => sum + value, 0);
        case "average":
            return numbers.length === 0 ? null : numbers.reduce((sum, value) => sum + value, 0) / numbers.length;
        case "median":
            return median(numbers);
        case "min":
            return numbers.length === 0 ? null : Math.min(...numbers);
        case "max":
            return numbers.length === 0 ? null : Math.max(...numbers);
        case "range":
            // Numbers: largest minus smallest; dates: the days from the first to the last.
            if (numbers.length > 0) return Math.max(...numbers) - Math.min(...numbers);
            return sortedTimes.length === 0
                ? null
                : Math.round((dateTime(sortedTimes[sortedTimes.length - 1]) - dateTime(sortedTimes[0])) / DAY_MS);
        case "earliest":
            return sortedTimes.length === 0 ? null : { start: sortedTimes[0], end: null };
        case "latest":
            return sortedTimes.length === 0 ? null : { start: sortedTimes[sortedTimes.length - 1], end: null };
        case "checked":
            return values.filter((value) => value === true).length;
        case "unchecked":
            return values.filter((value) => value !== true).length;
        case "percent_checked":
            return share(values.filter((value) => value === true).length);
    }
}
