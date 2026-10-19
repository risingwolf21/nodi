/** Property types of the server (packages 14a, 14e, 14f, 17d); formula and the last two are computed. */
export type PropertyType =
    | "text"
    | "number"
    | "checkbox"
    | "select"
    | "multi_select"
    | "status"
    | "date"
    | "url"
    | "email"
    | "place"
    | "formula"
    | "relation"
    | "created_time"
    | "last_edited_time";

export type OptionColor = "gray" | "brown" | "orange" | "yellow" | "green" | "blue" | "purple" | "pink" | "red";

/** A choice of a select, multi-select or status property. */
export type PropertyOption = {
    id: string;
    name: string;
    color: OptionColor;
};

/** How a number property shows its values (package 17b); the value stays a plain number. */
export type NumberFormat = "number" | "percent" | "euro" | "dollar" | "pound" | "franc" | "yen";

/** An entry of a related database, as relations show and pick it. */
export type RelatedEntry = {
    id: string;
    title: string;
    icon: string | null;
};

/** A relation points to the entries of one database; the server keeps its other side equal (package 17d). */
export type RelationSettings = {
    databaseId: string;
    pairedPropertyId: string;
    /** The readable entries of that database, loaded with this one (like the options of a select). */
    entries: RelatedEntry[];
};

export type DatabaseProperty = {
    id: string;
    databaseId: string;
    name: string;
    type: PropertyType;
    /** Choices; empty for types without any. */
    options: PropertyOption[];
    /** Formula properties: the expression in Notion's syntax (server: options.expression). */
    formula?: string;
    /** Number properties: how values are shown (server: options.format); missing means "number". */
    numberFormat?: NumberFormat;
    /** Relation properties: the related database (server: options.databaseId, options.pairedPropertyId). */
    relation?: RelationSettings;
    position: number;
};

/** Dates are "YYYY-MM-DD" (or ISO timestamps); `end` makes a range. */
export type DateValue = {
    start: string;
    end: string | null;
};

/** A point on the map; `label` is the address found by the search, if any. */
export type PlaceValue = {
    lat: number;
    lng: number;
    label: string | null;
};

/** A value as the editor shows it; null means empty. */
export type PropertyValue = string | number | boolean | string[] | DateValue | PlaceValue | null;

/** A stored value, as JSON from the server; read with `readValue`. */
export type StoredPropertyValue = {
    pageId: string;
    propertyId: string;
    value: unknown;
    updatedAt: string;
};

export type ViewType = "table" | "board" | "list" | "gallery" | "feed" | "calendar" | "map";

/** Sorting and filtering by the title uses this id instead of a property id. */
export const TITLE_FIELD = "title";

export type SortRule = {
    propertyId: string;
    direction: "asc" | "desc";
};

export type FilterOperator =
    | "contains"
    | "equals"
    | "notEquals"
    | "isEmpty"
    | "isNotEmpty"
    | "greaterThan"
    | "lessThan"
    | "before"
    | "after"
    | "checked"
    | "unchecked";

/** All rules of a view must match (AND). `value` is the text the user entered. */
export type FilterRule = {
    propertyId: string;
    operator: FilterOperator;
    value: string;
};

export type ViewConfig = {
    sort: SortRule[];
    filter: FilterRule[];
    hiddenPropertyIds: string[];
    /** Board: the select or status property whose options are the columns. */
    groupByPropertyId: string | null;
    /** Calendar: the date property that places entries on days. */
    datePropertyId: string | null;
    /** Map: the place property that puts entries on the map. */
    placePropertyId: string | null;
};

export type DatabaseView = {
    id: string;
    databaseId: string;
    name: string;
    type: ViewType;
    config: ViewConfig;
    position: number;
};

/** Everything of a database except its entries (those are pages). */
export type DatabaseData = {
    properties: DatabaseProperty[];
    views: DatabaseView[];
    values: StoredPropertyValue[];
    /** Last change of an entry's text, per entry id ("Geändert am"). */
    documentEditedAt: Record<string, string>;
    /** Start of an entry's text as plain text, per entry id (feed). */
    documentPreview: Record<string, string>;
    canEdit: boolean;
};
