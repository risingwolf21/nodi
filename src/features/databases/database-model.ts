import type { Page } from "@/features/pages/types";
import { displayTitle } from "@/features/pages/page-display";
import {
    TITLE_FIELD,
    type DatabaseData,
    type DatabaseProperty,
    type DatabaseView,
    type DateValue,
    type FilterOperator,
    type FilterRule,
    type OptionColor,
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
    created_time: "Erstellt am",
    last_edited_time: "Geändert am",
};

export const VIEW_TYPES: readonly ViewType[] = ["table", "board", "list", "gallery", "feed", "calendar"];

export const VIEW_TYPE_LABELS: Record<ViewType, string> = {
    table: "Tabelle",
    board: "Board",
    list: "Liste",
    gallery: "Galerie",
    feed: "Feed",
    calendar: "Kalender",
};

/** View types the app can show so far (packages 14b–14d). */
export const AVAILABLE_VIEW_TYPES: readonly ViewType[] = ["table", "board", "list", "gallery"];

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
    return type === "created_time" || type === "last_edited_time";
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

export function parseProperties(rows: unknown): DatabaseProperty[] {
    if (!Array.isArray(rows)) throw new Error(INVALID_DATA);
    return rows.map((row: unknown) => {
        if (
            !isObject(row) ||
            typeof row.id !== "string" ||
            typeof row.databaseId !== "string" ||
            typeof row.name !== "string" ||
            !isPropertyType(row.type)
        ) {
            throw new Error(INVALID_DATA);
        }
        return {
            id: row.id,
            databaseId: row.databaseId,
            name: row.name,
            type: row.type,
            options: parseOptions(row.options),
            position: numberOrZero(row.position),
        };
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
    return { sort, filter, hiddenPropertyIds, groupByPropertyId };
}

export const EMPTY_VIEW_CONFIG: ViewConfig = { sort: [], filter: [], hiddenPropertyIds: [], groupByPropertyId: null };

export function parseViews(rows: unknown): DatabaseView[] {
    if (!Array.isArray(rows)) throw new Error(INVALID_DATA);
    return rows.map((row: unknown) => {
        if (
            !isObject(row) ||
            typeof row.id !== "string" ||
            typeof row.databaseId !== "string" ||
            typeof row.name !== "string" ||
            !isViewType(row.type)
        ) {
            throw new Error(INVALID_DATA);
        }
        return {
            id: row.id,
            databaseId: row.databaseId,
            name: row.name,
            type: row.type,
            config: parseViewConfig(row.config),
            position: numberOrZero(row.position),
        };
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
            documentEditedAt: isObject(value.documentEditedAt)
                ? Object.fromEntries(
                      Object.entries(value.documentEditedAt).filter(
                          (entry): entry is [string, string] => typeof entry[1] === "string",
                      ),
                  )
                : {},
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
        case "created_time":
        case "last_edited_time":
            return null;
    }
}

/** One entry of a database with its values, as views show it. */
export type DatabaseRow = {
    page: Page;
    values: Record<string, PropertyValue>;
    createdAt: string;
    lastEditedAt: string;
};

function latest(times: string[]): string {
    return times.reduce((newest, time) => (time > newest ? time : newest), "");
}

export function buildRows(entries: Page[], data: DatabaseData): DatabaseRow[] {
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
            } else {
                const raw = stored.find((value) => value.propertyId === property.id)?.value;
                values[property.id] = readValue(property, raw);
            }
        }
        return { page, values, createdAt: page.created_at, lastEditedAt };
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

/** "YYYY-MM-DD" is a calendar day, shown without a time zone shift. */
function formatDay(value: string): string {
    const day = /^\d{4}-\d{2}-\d{2}$/.test(value) ? new Date(`${value}T00:00:00`) : new Date(value);
    return Number.isNaN(day.getTime()) ? value : dateFormat.format(day);
}

/** Text for showing a value in a cell, a card or a filter. */
export function formatValue(property: DatabaseProperty, value: PropertyValue): string {
    if (value === null) return "";
    switch (property.type) {
        case "number":
            return typeof value === "number" ? numberFormat.format(value) : "";
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
            return isDateValue(value) ? [value.start, value.end].filter(Boolean).map((day) => formatDay(day ?? "")).join(" – ") : "";
        case "created_time":
        case "last_edited_time":
            return typeof value === "string" && !Number.isNaN(Date.parse(value)) ? dateTimeFormat.format(new Date(value)) : "";
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
            return ["contains", "isEmpty", "isNotEmpty"];
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

function dayOf(value: string): string {
    return value.slice(0, 10);
}

function fieldValue(row: DatabaseRow, propertyId: string): PropertyValue {
    return propertyId === TITLE_FIELD ? row.page.title || null : (row.values[propertyId] ?? null);
}

function isEmptyValue(value: PropertyValue): boolean {
    return value === null || value === false || (Array.isArray(value) && value.length === 0);
}

export function matchesFilter(row: DatabaseRow, rule: FilterRule, property: DatabaseProperty | undefined): boolean {
    const value = fieldValue(row, rule.propertyId);
    const type = rule.propertyId === TITLE_FIELD ? "text" : property?.type;
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

    const text = (typeof value === "string" ? value : "").toLocaleLowerCase("de");
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
    if (isDateValue(value)) return value.start;
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
    return sorted.find((property) => property.type === "status") ?? sorted.find((property) => property.type === "select");
}

/** One board column; `option` null collects the entries without a value. */
export type RowGroup = {
    option: PropertyOption | null;
    rows: DatabaseRow[];
};

/** Columns in the order of the options, "no value" first (like Notion); rows keep their order. */
export function groupRows(rows: DatabaseRow[], property: DatabaseProperty): RowGroup[] {
    const groups: RowGroup[] = [{ option: null, rows: [] }, ...property.options.map((option) => ({ option, rows: [] }))];
    for (const row of rows) {
        const value = row.values[property.id];
        const group = groups.find((item) => item.option?.id === value) ?? groups[0];
        group.rows.push(row);
    }
    return groups;
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
