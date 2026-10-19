import type { Page } from "@/features/pages/types";
import { displayTitle } from "@/features/pages/page-display";
import { evaluateFormula, type FormulaValue } from "./formula/formula-evaluator";
import { FormulaError, NO_FORMULA_MESSAGE, parseFormula, type FormulaNode } from "./formula/formula-parser";
import {
    TITLE_FIELD,
    type DatabaseData,
    type DatabaseProperty,
    type DatabaseView,
    type DateValue,
    type FilterOperator,
    type FilterRule,
    type OptionColor,
    type PlaceValue,
    type NumberFormat,
    type PropertyOption,
    type PropertyType,
    type PropertyValue,
    type SortRule,
    type StoredPropertyValue,
    type ViewConfig,
    type ViewType,
} from "./types";

export const PROPERTY_TYPES: readonly PropertyType[] = [
    "text",
    "number",
    "checkbox",
    "select",
    "multi_select",
    "status",
    "date",
    "url",
    "email",
    "place",
    "formula",
    "created_time",
    "last_edited_time",
];

export const PROPERTY_TYPE_LABELS: Record<PropertyType, string> = {
    text: "Text",
    number: "Zahl",
    checkbox: "Checkbox",
    select: "Auswahl",
    multi_select: "Mehrfachauswahl",
    status: "Status",
    date: "Datum",
    url: "URL",
    email: "E-Mail",
    place: "Ort",
    formula: "Formel",
    created_time: "Erstellt am",
    last_edited_time: "Geändert am",
};

/** All view types of the server (packages 14a, 14e). */
export const VIEW_TYPES: readonly ViewType[] = ["table", "board", "list", "gallery", "feed", "calendar", "map"];

export const VIEW_TYPE_LABELS: Record<ViewType, string> = {
    table: "Tabelle",
    board: "Board",
    list: "Liste",
    gallery: "Galerie",
    feed: "Feed",
    calendar: "Kalender",
    map: "Landkarte",
};

export const OPTION_COLORS: readonly OptionColor[] = [
    "gray",
    "brown",
    "orange",
    "yellow",
    "green",
    "blue",
    "purple",
    "pink",
    "red",
];

/** Types with choices. */
export function hasOptions(type: PropertyType): boolean {
    return type === "select" || type === "multi_select" || type === "status";
}

/** Computed by the app, not set by hand. */
export function isComputed(type: PropertyType): boolean {
    return type === "created_time" || type === "last_edited_time" || type === "formula";
}

/** A new status property starts like Notion's. */
export function defaultOptions(type: PropertyType): PropertyOption[] {
    if (type !== "status") return [];
    return [
        { id: "not-started", name: "Nicht begonnen", color: "gray" },
        { id: "in-progress", name: "In Arbeit", color: "blue" },
        { id: "done", name: "Erledigt", color: "green" },
    ];
}

// ---------------------------------------------------------------------------
// Validation of server rows and cached data (CLAUDE.md §5: external data).

function isObject(value: unknown): value is Record<string, unknown> {
    return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isPropertyType(value: unknown): value is PropertyType {
    return typeof value === "string" && (PROPERTY_TYPES as readonly string[]).includes(value);
}

export const NUMBER_FORMATS: readonly NumberFormat[] = ["number", "percent", "euro", "dollar", "pound", "franc", "yen"];

export const NUMBER_FORMAT_LABELS: Record<NumberFormat, string> = {
    number: "Zahl",
    percent: "Prozent",
    euro: "Euro (€)",
    dollar: "US-Dollar ($)",
    pound: "Pfund (£)",
    franc: "Franken (CHF)",
    yen: "Yen (¥)",
};

export function isNumberFormat(value: unknown): value is NumberFormat {
    return typeof value === "string" && (NUMBER_FORMATS as readonly string[]).includes(value);
}

function isViewType(value: unknown): value is ViewType {
    return typeof value === "string" && (VIEW_TYPES as readonly string[]).includes(value);
}

function isOptionColor(value: unknown): value is OptionColor {
    return typeof value === "string" && (OPTION_COLORS as readonly string[]).includes(value);
}

/**
 * Choices: the server stores `{"options": [...]}`, the app keeps the list.
 * Invalid entries are left out.
 */
export function parseOptions(value: unknown): PropertyOption[] {
    const list = Array.isArray(value) ? value : isObject(value) && Array.isArray(value.options) ? value.options : [];
    return list.flatMap((option: unknown) =>
        isObject(option) && typeof option.id === "string" && typeof option.name === "string"
            ? [{ id: option.id, name: option.name, color: isOptionColor(option.color) ? option.color : "gray" }]
            : [],
    );
}

const INVALID_DATA = "Unerwartete Daten der Datenbank.";

function numberOrZero(value: unknown): number {
    return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

// The parsers below take the app's field names: the repository renames the
// columns in the query (PostgREST aliases), and the cache stores the same.

// A type of a newer app version is left out instead of failing the whole
// database (package 14e added "place" and "map").

export function parseProperties(rows: unknown): DatabaseProperty[] {
    if (!Array.isArray(rows)) throw new Error(INVALID_DATA);
    return rows.flatMap((row: unknown): DatabaseProperty[] => {
        if (
            !isObject(row) ||
            typeof row.id !== "string" ||
            typeof row.databaseId !== "string" ||
            typeof row.name !== "string" ||
            typeof row.type !== "string"
        ) {
            throw new Error(INVALID_DATA);
        }
        if (!isPropertyType(row.type)) return [];
        // The server keeps the expression in options, the cache next to them.
        // The server keeps the number format in options as well.
        const numberFormat = isNumberFormat(row.numberFormat)
            ? row.numberFormat
            : isObject(row.options) && isNumberFormat(row.options.format)
              ? row.options.format
              : null;
        const expression =
            typeof row.formula === "string"
                ? row.formula
                : isObject(row.options) && typeof row.options.expression === "string"
                  ? row.options.expression
                  : "";
        return [
            {
                id: row.id,
                databaseId: row.databaseId,
                name: row.name,
                type: row.type,
                options: parseOptions(row.options),
                position: numberOrZero(row.position),
                ...(row.type === "formula" ? { formula: expression } : {}),
                ...(row.type === "number" && numberFormat ? { numberFormat } : {}),
            },
        ];
    });
}

/** View settings are written by clients; whatever is not valid is left out. */
export function parseViewConfig(value: unknown): ViewConfig {
    const config = isObject(value) ? value : {};
    const sort = Array.isArray(config.sort)
        ? config.sort.flatMap((rule: unknown): SortRule[] =>
              isObject(rule) &&
              typeof rule.propertyId === "string" &&
              (rule.direction === "asc" || rule.direction === "desc")
                  ? [{ propertyId: rule.propertyId, direction: rule.direction }]
                  : [],
          )
        : [];
    const filter = Array.isArray(config.filter)
        ? config.filter.flatMap((rule: unknown): FilterRule[] =>
              isObject(rule) &&
              typeof rule.propertyId === "string" &&
              isFilterOperator(rule.operator) &&
              typeof rule.value === "string"
                  ? [{ propertyId: rule.propertyId, operator: rule.operator, value: rule.value }]
                  : [],
          )
        : [];
    const hiddenPropertyIds = Array.isArray(config.hiddenPropertyIds)
        ? config.hiddenPropertyIds.filter((id: unknown): id is string => typeof id === "string")
        : [];
    const groupByPropertyId = typeof config.groupByPropertyId === "string" ? config.groupByPropertyId : null;
    const datePropertyId = typeof config.datePropertyId === "string" ? config.datePropertyId : null;
    const placePropertyId = typeof config.placePropertyId === "string" ? config.placePropertyId : null;
    return { sort, filter, hiddenPropertyIds, groupByPropertyId, datePropertyId, placePropertyId };
}

export const EMPTY_VIEW_CONFIG: ViewConfig = {
    sort: [],
    filter: [],
    hiddenPropertyIds: [],
    groupByPropertyId: null,
    datePropertyId: null,
    placePropertyId: null,
};

function stringRecord(value: unknown): Record<string, string> {
    if (!isObject(value)) return {};
    return Object.fromEntries(
        Object.entries(value).filter((entry): entry is [string, string] => typeof entry[1] === "string"),
    );
}

export function parseViews(rows: unknown): DatabaseView[] {
    if (!Array.isArray(rows)) throw new Error(INVALID_DATA);
    return rows.flatMap((row: unknown): DatabaseView[] => {
        if (
            !isObject(row) ||
            typeof row.id !== "string" ||
            typeof row.databaseId !== "string" ||
            typeof row.name !== "string" ||
            typeof row.type !== "string"
        ) {
            throw new Error(INVALID_DATA);
        }
        if (!isViewType(row.type)) return [];
        return [
            {
                id: row.id,
                databaseId: row.databaseId,
                name: row.name,
                type: row.type,
                config: parseViewConfig(row.config),
                position: numberOrZero(row.position),
            },
        ];
    });
}

export function parseValues(rows: unknown): StoredPropertyValue[] {
    if (!Array.isArray(rows)) throw new Error(INVALID_DATA);
    return rows.map((row: unknown) => {
        if (
            !isObject(row) ||
            typeof row.pageId !== "string" ||
            typeof row.propertyId !== "string" ||
            !("value" in row) ||
            typeof row.updatedAt !== "string"
        ) {
            throw new Error(INVALID_DATA);
        }
        return { pageId: row.pageId, propertyId: row.propertyId, value: row.value, updatedAt: row.updatedAt };
    });
}

/** The cached copy; invalid data counts as missing. */
export function parseCachedDatabase(value: unknown): DatabaseData | null {
    if (!isObject(value)) return null;
    try {
        return {
            properties: parseProperties(value.properties),
            views: parseViews(value.views),
            values: parseValues(value.values),
            documentEditedAt: stringRecord(value.documentEditedAt),
            documentPreview: stringRecord(value.documentPreview),
            canEdit: value.canEdit === true,
        };
    } catch {
        return null;
    }
}

// ---------------------------------------------------------------------------
// Values.

function isFilterOperator(value: unknown): value is FilterOperator {
    return (
        typeof value === "string" &&
        [
            "contains",
            "equals",
            "notEquals",
            "isEmpty",
            "isNotEmpty",
            "greaterThan",
            "lessThan",
            "before",
            "after",
            "checked",
            "unchecked",
        ].includes(value)
    );
}

export function isDateValue(value: unknown): value is DateValue {
    return (
        isObject(value) &&
        typeof value.start === "string" &&
        !Number.isNaN(Date.parse(value.start)) &&
        (value.end === undefined || value.end === null || typeof value.end === "string")
    );
}

export const LATITUDE_LIMIT = 90;
export const LONGITUDE_LIMIT = 180;

/** The same rule as the server (`is_valid_property_value`, package 14e). */
export function isPlaceValue(value: unknown): value is PlaceValue {
    return (
        isObject(value) &&
        typeof value.lat === "number" &&
        typeof value.lng === "number" &&
        Number.isFinite(value.lat) &&
        Number.isFinite(value.lng) &&
        Math.abs(value.lat) <= LATITUDE_LIMIT &&
        Math.abs(value.lng) <= LONGITUDE_LIMIT &&
        (value.label === undefined || value.label === null || typeof value.label === "string")
    );
}

/** A stored value as the type expects it; anything else counts as empty. */
export function readValue(property: DatabaseProperty, raw: unknown): PropertyValue {
    switch (property.type) {
        case "text":
        case "url":
        case "email":
            return typeof raw === "string" && raw !== "" ? raw : null;
        case "number":
            return typeof raw === "number" && Number.isFinite(raw) ? raw : null;
        case "checkbox":
            return raw === true;
        case "select":
        case "status":
            return typeof raw === "string" && property.options.some((option) => option.id === raw) ? raw : null;
        case "multi_select": {
            if (!Array.isArray(raw)) return null;
            const ids = raw.filter(
                (id: unknown): id is string =>
                    typeof id === "string" && property.options.some((option) => option.id === id),
            );
            return ids.length > 0 ? ids : null;
        }
        case "date":
            return isDateValue(raw) ? { start: raw.start, end: typeof raw.end === "string" ? raw.end : null } : null;
        case "place":
            return isPlaceValue(raw) ? { lat: raw.lat, lng: raw.lng, label: raw.label || null } : null;
        case "formula":
        case "created_time":
        case "last_edited_time":
            return null;
    }
}

/** One entry of a database with its values, as views show it. */
export type DatabaseRow = {
    page: Page;
    values: Record<string, PropertyValue>;
    /** Formulas that could not be computed: the message per property id. */
    errors: Record<string, string>;
    createdAt: string;
    lastEditedAt: string;
};

function latest(times: string[]): string {
    return times.reduce((newest, time) => (time > newest ? time : newest), "");
}

// ---------------------------------------------------------------------------
// Formulas (package 14f): computed for every entry when the rows are built.

/** prop("Name") is the title of the entry, unless a property has that name. */
const TITLE_PROPERTY_NAME = "Name";

type CompiledFormula = { node: FormulaNode } | { error: string };

/** A formula that depends on itself, directly or through other formulas. */
class FormulaCycleError extends FormulaError {}

function compileFormula(expression: string): CompiledFormula {
    try {
        return { node: parseFormula(expression) };
    } catch (err) {
        if (err instanceof FormulaError) return { error: err.message };
        throw err;
    }
}

const DAY_ONLY = /^\d{4}-\d{2}-\d{2}$/;

/** A date without a time ("YYYY-MM-DD"); otherwise an ISO timestamp (package 17c). */
function isDay(value: string): boolean {
    return DAY_ONLY.test(value);
}

export function dateHasTime(value: DateValue): boolean {
    return !isDay(value.start);
}

const pad2 = (value: number) => String(value).padStart(2, "0");

/** The value of `<input type="date">` or `"datetime-local"` (local time) for a stored date. */
export function dateInputValue(value: string): string {
    if (isDay(value)) return value;
    const date = toDate(value);
    return date ? `${localDay(date)}T${pad2(date.getHours())}:${pad2(date.getMinutes())}` : "";
}

/** What an input gives back: a day stays a day; a local date and time becomes a timestamp. */
export function dateFromInput(input: string): string | null {
    if (isDay(input)) return input;
    const date = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(input) ? new Date(input) : null;
    return date && !Number.isNaN(date.getTime()) ? date.toISOString() : null;
}

// Like a calendar: a date that gets a time starts in the morning.
const DEFAULT_HOURS = 9;

/** Adds a time (09:00 local) to both ends, or drops it (the local day stays). */
export function setDateTime(value: DateValue, withTime: boolean): DateValue {
    const convert = (part: string) => {
        if (withTime === !isDay(part)) return part;
        if (!withTime) return dayOf(part);
        const [year, month, day] = part.split("-").map(Number);
        return new Date(year, month - 1, day, DEFAULT_HOURS).toISOString();
    };
    return { start: convert(value.start), end: value.end ? convert(value.end) : null };
}

/** "14:30" for a date with a time, in local time; null for a day. */
export function timeOfDay(value: string): string | null {
    const date = isDay(value) ? null : toDate(value);
    return date ? `${pad2(date.getHours())}:${pad2(date.getMinutes())}` : null;
}

/** "YYYY-MM-DD" is a local calendar day; anything else a point in time. */
function toDate(value: string): Date | null {
    const day = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
    const date = day ? new Date(Number(day[1]), Number(day[2]) - 1, Number(day[3])) : new Date(value);
    return Number.isNaN(date.getTime()) ? null : date;
}

/** A value as formulas see it: numbers and checkboxes as such, dates as dates, the rest as its text. */
function formulaInput(property: DatabaseProperty, value: PropertyValue): FormulaValue {
    if (value === null) return null;
    switch (property.type) {
        case "number":
            return typeof value === "number" ? value : null;
        case "checkbox":
            return value === true;
        case "date":
            return isDateValue(value) ? toDate(value.start) : null;
        case "created_time":
        case "last_edited_time":
            return typeof value === "string" ? toDate(value) : null;
        default:
            return formatValue(property, value) || null;
    }
}

/** A result as views show, sort and filter it; a date keeps its time only if it has one. */
function formulaOutput(value: FormulaValue): PropertyValue {
    if (!(value instanceof Date)) return value;
    const midnight = value.getHours() === 0 && value.getMinutes() === 0 && value.getSeconds() === 0;
    return { start: midnight ? localDay(value) : value.toISOString(), end: null };
}

type FormulaSetup = {
    formulas: DatabaseProperty[];
    compiled: Map<string, CompiledFormula>;
    byName: Map<string, DatabaseProperty>;
    now: Date;
};

function setUpFormulas(properties: DatabaseProperty[]): FormulaSetup {
    const formulas = properties.filter((property) => property.type === "formula");
    const byName = new Map<string, DatabaseProperty>();
    for (const property of [...properties].sort((a, b) => a.position - b.position)) {
        if (!byName.has(property.name)) byName.set(property.name, property);
    }
    return {
        formulas,
        compiled: new Map(formulas.map((property) => [property.id, compileFormula(property.formula ?? "")])),
        byName,
        now: new Date(),
    };
}

/** Results of all formulas of one entry; formulas may use other formulas. */
function computeFormulas(page: Page, values: Record<string, PropertyValue>, setup: FormulaSetup) {
    const results = new Map<string, FormulaValue>();
    const errors: Record<string, string> = {};
    const active = new Set<string>();

    const compute = (property: DatabaseProperty): FormulaValue => {
        if (results.has(property.id)) return results.get(property.id) ?? null;
        if (errors[property.id]) throw new FormulaError(errors[property.id]);
        if (active.has(property.id)) {
            throw new FormulaCycleError(`Zirkelbezug: „${property.name}“ verwendet sich selbst.`);
        }
        active.add(property.id);
        try {
            const compiled = setup.compiled.get(property.id);
            if (!compiled || "error" in compiled) throw new FormulaError(compiled?.error ?? NO_FORMULA_MESSAGE);
            const result = evaluateFormula(compiled.node, { now: setup.now, prop: lookup });
            results.set(property.id, result);
            return result;
        } catch (err) {
            if (err instanceof FormulaError && !errors[property.id]) errors[property.id] = err.message;
            throw err;
        } finally {
            active.delete(property.id);
        }
    };

    function lookup(name: string): FormulaValue {
        const property = setup.byName.get(name);
        if (!property) {
            if (name === TITLE_PROPERTY_NAME) return page.title || null;
            throw new FormulaError(`Die Eigenschaft „${name}“ gibt es nicht.`);
        }
        if (property.type !== "formula") return formulaInput(property, values[property.id] ?? null);
        try {
            return compute(property);
        } catch (err) {
            // A cycle is the problem of every formula in it; other errors stay with their formula.
            if (err instanceof FormulaCycleError || !(err instanceof FormulaError)) throw err;
            throw new FormulaError(`Die Formel „${name}“ hat einen Fehler.`);
        }
    }

    const output: Record<string, PropertyValue> = {};
    for (const property of setup.formulas) {
        try {
            output[property.id] = formulaOutput(compute(property));
        } catch (err) {
            if (!(err instanceof FormulaError)) throw err;
            output[property.id] = null;
        }
    }
    return { values: output, errors };
}

export function buildRows(entries: Page[], data: DatabaseData): DatabaseRow[] {
    const formulaSetup = setUpFormulas(data.properties);
    const storedByEntry = new Map<string, StoredPropertyValue[]>();
    for (const stored of data.values) {
        const list = storedByEntry.get(stored.pageId) ?? [];
        list.push(stored);
        storedByEntry.set(stored.pageId, list);
    }

    return entries.map((page) => {
        const stored = storedByEntry.get(page.id) ?? [];
        const lastEditedAt = latest([
            page.created_at,
            data.documentEditedAt[page.id] ?? "",
            ...stored.map((value) => value.updatedAt),
        ]);
        const values: Record<string, PropertyValue> = {};
        for (const property of data.properties) {
            if (property.type === "created_time") {
                values[property.id] = page.created_at || null;
            } else if (property.type === "last_edited_time") {
                values[property.id] = lastEditedAt || null;
            } else if (property.type !== "formula") {
                const raw = stored.find((value) => value.propertyId === property.id)?.value;
                values[property.id] = readValue(property, raw);
            }
        }
        const formulas = computeFormulas(page, values, formulaSetup);
        return {
            page,
            values: { ...values, ...formulas.values },
            errors: formulas.errors,
            createdAt: page.created_at,
            lastEditedAt,
        };
    });
}

// ---------------------------------------------------------------------------
// Display.

const dateFormat = new Intl.DateTimeFormat("de-DE", { day: "numeric", month: "short", year: "numeric" });
const dateTimeFormat = new Intl.DateTimeFormat("de-DE", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
});
const numberFormat = new Intl.NumberFormat("de-DE");
const currencyFormat = (currency: string) => new Intl.NumberFormat("de-DE", { style: "currency", currency });
// Percent like Notion: 0.15 is shown as 15 %.
const NUMBER_FORMATTERS: Record<NumberFormat, Intl.NumberFormat> = {
    number: numberFormat,
    percent: new Intl.NumberFormat("de-DE", { style: "percent", maximumFractionDigits: 2 }),
    euro: currencyFormat("EUR"),
    dollar: currencyFormat("USD"),
    pound: currencyFormat("GBP"),
    franc: currencyFormat("CHF"),
    yen: currencyFormat("JPY"),
};
const coordinateFormat = new Intl.NumberFormat("de-DE", { maximumFractionDigits: 5 });

const formulaNumberFormat = new Intl.NumberFormat("de-DE", { maximumFractionDigits: 10 });

/** A formula result: its type shows only at runtime. */
function formatFormulaResult(value: PropertyValue): string {
    if (typeof value === "number") return formulaNumberFormat.format(value);
    if (typeof value === "boolean") return value ? "Ja" : "Nein";
    if (isDateValue(value)) return formatDateText(value.start);
    return typeof value === "string" ? value : "";
}

/** "48,13720; 11,57560"-style text for a point without an address. */
function formatCoordinates(place: PlaceValue): string {
    return `${coordinateFormat.format(place.lat)}; ${coordinateFormat.format(place.lng)}`;
}

/** "YYYY-MM-DD" is a calendar day, shown without a time zone shift; a timestamp with its local time. */
function formatDateText(value: string): string {
    const date = toDate(value);
    if (!date) return value;
    return isDay(value) ? dateFormat.format(date) : dateTimeFormat.format(date);
}

/** Text for showing a value in a cell, a card or a filter. */
export function formatValue(property: DatabaseProperty, value: PropertyValue): string {
    if (value === null) return "";
    switch (property.type) {
        case "number":
            return typeof value === "number" ? NUMBER_FORMATTERS[property.numberFormat ?? "number"].format(value) : "";
        case "checkbox":
            return value === true ? "Ja" : "Nein";
        case "select":
        case "status":
            return property.options.find((option) => option.id === value)?.name ?? "";
        case "multi_select":
            return Array.isArray(value)
                ? value.map((id) => property.options.find((option) => option.id === id)?.name ?? "").join(", ")
                : "";
        case "date":
            return isDateValue(value)
                ? [value.start, value.end]
                      .filter(Boolean)
                      .map((day) => formatDateText(day ?? ""))
                      .join(" – ")
                : "";
        case "place":
            return isPlaceValue(value) ? (value.label ?? formatCoordinates(value)) : "";
        case "formula":
            return formatFormulaResult(value);
        case "created_time":
        case "last_edited_time":
            return typeof value === "string" && !Number.isNaN(Date.parse(value))
                ? dateTimeFormat.format(new Date(value))
                : "";
        default:
            return typeof value === "string" ? value : "";
    }
}

// ---------------------------------------------------------------------------
// Filters and sorting of a view (applied in the app, CLAUDE.md §12 P14).

export const FILTER_OPERATOR_LABELS: Record<FilterOperator, string> = {
    contains: "enthält",
    equals: "ist",
    notEquals: "ist nicht",
    isEmpty: "ist leer",
    isNotEmpty: "ist nicht leer",
    greaterThan: "größer als",
    lessThan: "kleiner als",
    before: "vor",
    after: "nach",
    checked: "ist angehakt",
    unchecked: "ist nicht angehakt",
};

/** Operators that fit a field; the title behaves like text. */
export function operatorsFor(type: PropertyType | typeof TITLE_FIELD): FilterOperator[] {
    switch (type) {
        case "number":
            return ["equals", "notEquals", "greaterThan", "lessThan", "isEmpty", "isNotEmpty"];
        case "checkbox":
            return ["checked", "unchecked"];
        case "select":
        case "status":
            return ["equals", "notEquals", "isEmpty", "isNotEmpty"];
        case "multi_select":
        case "place":
            return ["contains", "isEmpty", "isNotEmpty"];
        case "formula":
            return ["contains", "equals", "notEquals", "greaterThan", "lessThan", "isEmpty", "isNotEmpty"];
        case "date":
        case "created_time":
        case "last_edited_time":
            return ["equals", "before", "after", "isEmpty", "isNotEmpty"];
        default:
            return ["contains", "equals", "notEquals", "isEmpty", "isNotEmpty"];
    }
}

/** Whether an operator needs a value from the user. */
export function operatorNeedsValue(operator: FilterOperator): boolean {
    return !["isEmpty", "isNotEmpty", "checked", "unchecked"].includes(operator);
}

/** The local calendar day of a date or a timestamp. */
export function dayOf(value: string): string {
    if (isDay(value)) return value;
    const date = toDate(value);
    return date ? localDay(date) : value.slice(0, 10);
}

function fieldValue(row: DatabaseRow, propertyId: string): PropertyValue {
    return propertyId === TITLE_FIELD ? row.page.title || null : (row.values[propertyId] ?? null);
}

function isEmptyValue(value: PropertyValue): boolean {
    return value === null || value === false || (Array.isArray(value) && value.length === 0);
}

/** Formulas filter by what they return: numbers and dates as such, the rest as text. */
function formulaFilterType(value: PropertyValue): "number" | "date" | "formula" {
    if (typeof value === "number") return "number";
    if (isDateValue(value)) return "date";
    return "formula";
}

export function matchesFilter(row: DatabaseRow, rule: FilterRule, property: DatabaseProperty | undefined): boolean {
    const value = fieldValue(row, rule.propertyId);
    const type =
        rule.propertyId === TITLE_FIELD
            ? "text"
            : property?.type === "formula"
              ? formulaFilterType(value)
              : property?.type;
    // A rule for a deleted property does not hide anything.
    if (!type) return true;
    const needle = rule.value.trim().toLocaleLowerCase("de");

    switch (rule.operator) {
        case "isEmpty":
            return isEmptyValue(value);
        case "isNotEmpty":
            return !isEmptyValue(value);
        case "checked":
            return value === true;
        case "unchecked":
            return value !== true;
    }
    // An empty input does not filter yet (the user is still typing).
    if (!needle) return true;

    if (type === "number") {
        const target = Number(needle.replace(",", "."));
        if (Number.isNaN(target)) return true;
        if (typeof value !== "number") return rule.operator === "notEquals";
        if (rule.operator === "equals") return value === target;
        if (rule.operator === "notEquals") return value !== target;
        if (rule.operator === "greaterThan") return value > target;
        if (rule.operator === "lessThan") return value < target;
        return true;
    }

    if (type === "date" || type === "created_time" || type === "last_edited_time") {
        const day = isDateValue(value) ? dayOf(value.start) : typeof value === "string" ? dayOf(value) : null;
        if (!day) return false;
        if (rule.operator === "equals") return day === needle;
        if (rule.operator === "before") return day < needle;
        if (rule.operator === "after") return day > needle;
        return true;
    }

    if (type === "select" || type === "status") {
        // The rule stores the option id.
        if (rule.operator === "equals") return value === rule.value;
        if (rule.operator === "notEquals") return value !== rule.value;
        return true;
    }

    if (type === "multi_select") {
        return rule.operator === "contains" ? Array.isArray(value) && value.includes(rule.value) : true;
    }

    // A place is found by its address (or coordinates), a formula by its shown result, like text.
    const shown =
        (type === "place" || type === "formula") && property
            ? formatValue(property, value)
            : typeof value === "string"
              ? value
              : "";
    const text = shown.toLocaleLowerCase("de");
    if (rule.operator === "contains") return text.includes(needle);
    if (rule.operator === "equals") return text === needle;
    if (rule.operator === "notEquals") return text !== needle;
    return true;
}

const collator = new Intl.Collator("de", { numeric: true, sensitivity: "base" });

/** Sort key of a value: numbers and times compare as such, the rest as text. */
function sortKey(property: DatabaseProperty | undefined, value: PropertyValue): string | number | null {
    if (value === null) return null;
    if (typeof value === "number") return value;
    if (typeof value === "boolean") return value ? 1 : 0;
    // A day counts from its local midnight, a time as that moment.
    if (isDateValue(value)) return toDate(value.start)?.getTime() ?? null;
    if (property?.type === "place") return formatValue(property, value) || null;
    if (property && (property.type === "select" || property.type === "status")) {
        // Like Notion: by the order of the options.
        const index = property.options.findIndex((option) => option.id === value);
        return index === -1 ? null : index;
    }
    if (property && Array.isArray(value)) return formatValue(property, value);
    return typeof value === "string" ? value : null;
}

function compareKeys(a: string | number | null, b: string | number | null): number {
    // Empty values last, whatever the direction (like Notion).
    if (a === null || b === null) return a === b ? 0 : a === null ? 1 : -1;
    if (typeof a === "number" && typeof b === "number") return a - b;
    return collator.compare(String(a), String(b));
}

/** Manual order, then creation; used when a view has no sort rules. */
export function compareByPosition(a: Page, b: Page): number {
    if (a.position !== null && b.position !== null && a.position !== b.position) return a.position - b.position;
    if (a.position !== null && b.position === null) return -1;
    if (a.position === null && b.position !== null) return 1;
    return a.created_at.localeCompare(b.created_at);
}

/** Rows of a view: filtered (all rules), sorted by its rules or by position. */
export function applyView(rows: DatabaseRow[], config: ViewConfig, properties: DatabaseProperty[]): DatabaseRow[] {
    const byId = new Map(properties.map((property) => [property.id, property]));
    const filtered = rows.filter((row) =>
        config.filter.every((rule) => matchesFilter(row, rule, byId.get(rule.propertyId))),
    );

    return filtered.sort((a, b) => {
        for (const rule of config.sort) {
            const property = byId.get(rule.propertyId);
            if (rule.propertyId !== TITLE_FIELD && !property) continue;
            const difference = compareKeys(
                sortKey(property, fieldValue(a, rule.propertyId)),
                sortKey(property, fieldValue(b, rule.propertyId)),
            );
            // Empty values stay last in both directions.
            const aEmpty = fieldValue(a, rule.propertyId) === null;
            const bEmpty = fieldValue(b, rule.propertyId) === null;
            if (difference !== 0) return rule.direction === "desc" && !aEmpty && !bEmpty ? -difference : difference;
        }
        return compareByPosition(a.page, b.page);
    });
}

/** Columns of a view: all properties in order, without the hidden ones. */
export function visibleProperties(properties: DatabaseProperty[], config: ViewConfig): DatabaseProperty[] {
    const hidden = new Set(config.hiddenPropertyIds);
    return [...properties].sort((a, b) => a.position - b.position).filter((property) => !hidden.has(property.id));
}

// ---------------------------------------------------------------------------
// Board.

/** A board groups by the options of a select or status property. */
export function canGroupBy(type: PropertyType): boolean {
    return type === "select" || type === "status";
}

/** The chosen group property, otherwise the first status, then the first select property. */
export function groupProperty(properties: DatabaseProperty[], config: ViewConfig): DatabaseProperty | undefined {
    const sorted = [...properties].sort((a, b) => a.position - b.position);
    const chosen = sorted.find((property) => property.id === config.groupByPropertyId);
    if (chosen && canGroupBy(chosen.type)) return chosen;
    return (
        sorted.find((property) => property.type === "status") ?? sorted.find((property) => property.type === "select")
    );
}

/** One board column; `option` null collects the entries without a value. */
export type RowGroup = {
    option: PropertyOption | null;
    rows: DatabaseRow[];
};

/** Columns in the order of the options, "no value" first (like Notion); rows keep their order. */
export function groupRows(rows: DatabaseRow[], property: DatabaseProperty): RowGroup[] {
    const groups: RowGroup[] = [
        { option: null, rows: [] },
        ...property.options.map((option) => ({ option, rows: [] })),
    ];
    for (const row of rows) {
        const value = row.values[property.id];
        const group = groups.find((item) => item.option?.id === value) ?? groups[0];
        group.rows.push(row);
    }
    return groups;
}

// ---------------------------------------------------------------------------
// Feed.

export const PREVIEW_LENGTH = 280;

/** Text of BlockNote inline content: text and links, nested. */
function inlineText(content: unknown): string {
    if (!Array.isArray(content)) return "";
    return content
        .map((item: unknown) => {
            if (!isObject(item)) return "";
            if (typeof item.text === "string") return item.text;
            return inlineText(item.content);
        })
        .join("");
}

/**
 * Plain text of the first BlockNote blocks for a feed: one line per block,
 * empty blocks and other content (tables, images) left out.
 */
export function previewText(blocks: unknown[]): string {
    const text = blocks
        .map((block) => (isObject(block) ? inlineText(block.content).trim() : ""))
        .filter(Boolean)
        .join("\n");
    return text.length > PREVIEW_LENGTH ? `${text.slice(0, PREVIEW_LENGTH).trimEnd()} …` : text;
}

// ---------------------------------------------------------------------------
// Calendar.

/** The chosen date property, otherwise the first one. */
export function dateProperty(properties: DatabaseProperty[], config: ViewConfig): DatabaseProperty | undefined {
    const dates = [...properties]
        .sort((a, b) => a.position - b.position)
        .filter((property) => property.type === "date");
    return dates.find((property) => property.id === config.datePropertyId) ?? dates[0];
}

const DAY_MS = 24 * 60 * 60 * 1000;
/** A range longer than this is shown only on its first days. */
const MAX_RANGE_DAYS = 62;

function utcDay(day: string): number {
    return Date.parse(`${day}T00:00:00Z`);
}

function dayString(time: number): string {
    return new Date(time).toISOString().slice(0, 10);
}

/** "YYYY-MM-DD" of a local date (today in the user's time zone). */
export function localDay(date: Date): string {
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");
    return `${date.getFullYear()}-${month}-${day}`;
}

/** Weeks of a month, Monday first (as in Germany), filled with days of the neighbor months. */
export function monthGrid(year: number, month: number): string[][] {
    const first = Date.UTC(year, month, 1);
    const mondayOffset = (new Date(first).getUTCDay() + 6) % 7;
    const start = first - mondayOffset * DAY_MS;
    const daysInMonth = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
    const weekCount = Math.ceil((mondayOffset + daysInMonth) / 7);
    return Array.from({ length: weekCount }, (_, week) =>
        Array.from({ length: 7 }, (_, weekday) => dayString(start + (week * 7 + weekday) * DAY_MS)),
    );
}

/** Entries per day ("YYYY-MM-DD"); a range appears on each of its days. Rows keep their order. */
export function rowsByDay(rows: DatabaseRow[], property: DatabaseProperty): Map<string, DatabaseRow[]> {
    const days = new Map<string, DatabaseRow[]>();
    for (const row of rows) {
        const value = row.values[property.id];
        if (!isDateValue(value)) continue;
        const start = utcDay(dayOf(value.start));
        const end = value.end ? utcDay(dayOf(value.end)) : start;
        if (Number.isNaN(start)) continue;
        const last = Number.isNaN(end) || end < start ? start : Math.min(end, start + (MAX_RANGE_DAYS - 1) * DAY_MS);
        for (let time = start; time <= last; time += DAY_MS) {
            const day = dayString(time);
            days.set(day, [...(days.get(day) ?? []), row]);
        }
    }
    return days;
}

// ---------------------------------------------------------------------------
// Map.

/** The chosen place property, otherwise the first one. */
export function placeProperty(properties: DatabaseProperty[], config: ViewConfig): DatabaseProperty | undefined {
    const places = [...properties]
        .sort((a, b) => a.position - b.position)
        .filter((property) => property.type === "place");
    return places.find((property) => property.id === config.placePropertyId) ?? places[0];
}

/** A name for a new property or view that is not taken yet. */
export function uniqueName(base: string, taken: string[]): string {
    const names = new Set(taken);
    if (!names.has(base)) return base;
    for (let index = 2; ; index += 1) {
        const candidate = `${base} ${index}`;
        if (!names.has(candidate)) return candidate;
    }
}

/** Title of an entry for sorting and display. */
export function rowTitle(row: DatabaseRow): string {
    return displayTitle(row.page);
}

/** For the sort and filter pickers. */
export function sortRuleLabel(rule: SortRule, properties: DatabaseProperty[]): string {
    const name = rule.propertyId === TITLE_FIELD ? "Name" : properties.find((p) => p.id === rule.propertyId)?.name;
    return `${name ?? "?"} ${rule.direction === "asc" ? "aufsteigend" : "absteigend"}`;
}
