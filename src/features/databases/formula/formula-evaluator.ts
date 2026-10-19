import { FormulaError, type FormulaNode } from "./formula-parser";

/** What a formula works with and returns; null is empty. */
export type FormulaValue = number | string | boolean | Date | null;

export type FormulaContext = {
    /** The value of a property (or the title) by name; throws a FormulaError if unknown. */
    prop: (name: string) => FormulaValue;
    now: Date;
};

const numberFormat = new Intl.NumberFormat("de-DE", { maximumFractionDigits: 10 });
const DEFAULT_DATE_PATTERN = "DD.MM.YYYY";

/** Text of a value, as concat and + with text use it. */
export function formulaText(value: FormulaValue): string {
    if (value === null) return "";
    if (typeof value === "number") return numberFormat.format(value);
    if (typeof value === "boolean") return value ? "true" : "false";
    if (value instanceof Date) return formatDate(value, DEFAULT_DATE_PATTERN);
    return value;
}

/** false, empty, 0 and "" count as false (like Notion). */
function isTruthy(value: FormulaValue): boolean {
    return !(value === null || value === false || value === 0 || value === "");
}

function finite(value: number): number {
    if (!Number.isFinite(value)) throw new FormulaError("Das Ergebnis ist keine endliche Zahl.");
    return value;
}

/** Empty counts as 0 when calculating, so an unset number does not break a sum. */
function toArithmetic(value: FormulaValue, operator: string): number {
    if (value === null) return 0;
    if (typeof value === "number") return value;
    throw new FormulaError(`${operator} rechnet nur mit Zahlen, nicht mit ${typeName(value)}.`);
}

function typeName(value: FormulaValue): string {
    if (value === null) return "leer";
    if (typeof value === "string") return "Text";
    if (typeof value === "boolean") return "Wahrheitswert";
    if (value instanceof Date) return "Datum";
    return "Zahl";
}

function same(left: FormulaValue, right: FormulaValue): boolean {
    if (left instanceof Date && right instanceof Date) return left.getTime() === right.getTime();
    return left === right;
}

function compare(left: FormulaValue, right: FormulaValue, operator: string): number {
    if (typeof left === "number" && typeof right === "number") return left - right;
    if (typeof left === "string" && typeof right === "string") return left.localeCompare(right, "de");
    if (left instanceof Date && right instanceof Date) return left.getTime() - right.getTime();
    throw new FormulaError(`${operator} vergleicht nur Zahlen, Texte oder Daten gleicher Art.`);
}

// ---------------------------------------------------------------------------
// Dates

const UNITS = {
    years: "years",
    year: "years",
    quarters: "quarters",
    quarter: "quarters",
    months: "months",
    month: "months",
    weeks: "weeks",
    week: "weeks",
    days: "days",
    day: "days",
    hours: "hours",
    hour: "hours",
    minutes: "minutes",
    minute: "minutes",
} as const;
type DateUnit = (typeof UNITS)[keyof typeof UNITS];

const UNIT_MS: Partial<Record<DateUnit, number>> = {
    weeks: 7 * 24 * 60 * 60 * 1000,
    days: 24 * 60 * 60 * 1000,
    hours: 60 * 60 * 1000,
    minutes: 60 * 1000,
};

function toUnit(value: FormulaValue): DateUnit {
    const unit = typeof value === "string" ? Object.entries(UNITS).find(([name]) => name === value)?.[1] : undefined;
    if (!unit) {
        throw new FormulaError(
            'Einheit unbekannt. Möglich: "years", "quarters", "months", "weeks", "days", "hours", "minutes".',
        );
    }
    return unit;
}

function addMonths(date: Date, months: number): Date {
    const result = new Date(date);
    const day = result.getDate();
    result.setDate(1);
    result.setMonth(result.getMonth() + months);
    // 31 January + 1 month is the last day of February, not 3 March.
    const lastDay = new Date(result.getFullYear(), result.getMonth() + 1, 0).getDate();
    result.setDate(Math.min(day, lastDay));
    return result;
}

function dateAdd(date: Date, amount: number, unit: DateUnit): Date {
    if (unit === "years") return addMonths(date, amount * 12);
    if (unit === "quarters") return addMonths(date, amount * 3);
    if (unit === "months") return addMonths(date, amount);
    if (unit === "days" || unit === "weeks") {
        // Calendar days, so a change to summer time does not move the hour.
        const result = new Date(date);
        result.setDate(result.getDate() + amount * (unit === "weeks" ? 7 : 1));
        return result;
    }
    return new Date(date.getTime() + amount * (UNIT_MS[unit] ?? 0));
}

/** Whole units from end to start (like Notion: dateBetween(later, earlier, "days") > 0). */
function dateBetween(later: Date, earlier: Date, unit: DateUnit): number {
    if (unit === "years" || unit === "quarters" || unit === "months") {
        let months = (later.getFullYear() - earlier.getFullYear()) * 12 + (later.getMonth() - earlier.getMonth());
        // Not a full month yet: 31 January to 15 February is 0 months.
        if (months > 0 && addMonths(earlier, months) > later) months -= 1;
        if (months < 0 && addMonths(earlier, months) < later) months += 1;
        const perUnit = unit === "years" ? 12 : unit === "quarters" ? 3 : 1;
        return Math.trunc(months / perUnit);
    }
    const elapsed = later.getTime() - earlier.getTime();
    if (unit === "days" || unit === "weeks") {
        // Like Notion (moment.js): whole days, without the hour a change to
        // summer time adds or removes.
        const summerTimeShift = (later.getTimezoneOffset() - earlier.getTimezoneOffset()) * (UNIT_MS.minutes ?? 0);
        return Math.trunc((elapsed - summerTimeShift) / (UNIT_MS[unit] ?? 1));
    }
    return Math.trunc(elapsed / (UNIT_MS[unit] ?? 1));
}

const pad = (value: number, length = 2) => String(value).padStart(length, "0");

/** Tokens YYYY, YY, MM, M, DD, D, HH, H, mm, ss; everything else stays. */
function formatDate(date: Date, pattern: string): string {
    return pattern.replace(/YYYY|YY|MM|M|DD|D|HH|H|mm|ss/g, (token) => {
        switch (token) {
            case "YYYY":
                return String(date.getFullYear());
            case "YY":
                return pad(date.getFullYear() % 100);
            case "MM":
                return pad(date.getMonth() + 1);
            case "M":
                return String(date.getMonth() + 1);
            case "DD":
                return pad(date.getDate());
            case "D":
                return String(date.getDate());
            case "HH":
                return pad(date.getHours());
            case "H":
                return String(date.getHours());
            case "mm":
                return pad(date.getMinutes());
            default:
                return pad(date.getSeconds());
        }
    });
}

// ---------------------------------------------------------------------------
// Functions

type Evaluate = (node: FormulaNode) => FormulaValue;
type Call = {
    /** The function's name, for messages. */
    name: string;
    context: FormulaContext;
    /** The unevaluated arguments, for lazy functions. */
    nodes: FormulaNode[];
    evaluate: Evaluate;
};
type FormulaFunction = {
    /** Smallest and largest number of arguments (Infinity: any). */
    arity: [number, number];
    /** Arguments are evaluated by the function itself (if). */
    lazy?: boolean;
    run: (args: FormulaValue[], call: Call) => FormulaValue;
};

function requireNumber(value: FormulaValue, name: string): number {
    if (typeof value === "number") return value;
    throw new FormulaError(`${name} braucht eine Zahl, nicht ${typeName(value)}.`);
}

function requireDate(value: FormulaValue, name: string): Date {
    if (value instanceof Date) return value;
    throw new FormulaError(`${name} braucht ein Datum, nicht ${typeName(value)}.`);
}

function numeric(run: (value: number) => number): FormulaFunction["run"] {
    return ([value], { name }) => (value === null ? null : finite(run(requireNumber(value, name))));
}

const FUNCTIONS: Record<string, FormulaFunction> = {
    if: {
        arity: [3, 3],
        lazy: true,
        run: (_args, { nodes: [condition, then, otherwise], evaluate }) =>
            isTruthy(evaluate(condition)) ? evaluate(then) : evaluate(otherwise),
    },
    and: { arity: [1, Infinity], run: (args) => args.every(isTruthy) },
    or: { arity: [1, Infinity], run: (args) => args.some(isTruthy) },
    not: { arity: [1, 1], run: ([value]) => !isTruthy(value) },
    empty: { arity: [1, 1], run: ([value]) => !isTruthy(value) },
    concat: { arity: [1, Infinity], run: (args) => args.map(formulaText).join("") },
    length: { arity: [1, 1], run: ([value]) => [...formulaText(value)].length },
    upper: { arity: [1, 1], run: ([value]) => formulaText(value).toLocaleUpperCase("de") },
    lower: { arity: [1, 1], run: ([value]) => formulaText(value).toLocaleLowerCase("de") },
    contains: { arity: [2, 2], run: ([text, search]) => formulaText(text).includes(formulaText(search)) },
    // Plain text, not regular expressions: user input stays harmless.
    replace: {
        arity: [3, 3],
        run: ([text, search, replacement]) =>
            formulaText(text).replace(formulaText(search), () => formulaText(replacement)),
    },
    replaceAll: {
        arity: [3, 3],
        run: ([text, search, replacement]) => {
            const needle = formulaText(search);
            return needle ? formulaText(text).split(needle).join(formulaText(replacement)) : formulaText(text);
        },
    },
    format: { arity: [1, 1], run: ([value]) => formulaText(value) },
    toNumber: {
        arity: [1, 1],
        run: ([value]) => {
            if (value === null || typeof value === "number") return value;
            if (typeof value === "boolean") return value ? 1 : 0;
            if (value instanceof Date) return value.getTime();
            // German or English decimals: "1,5" and "1.5".
            const text = value.trim().replace(/\s/g, "");
            const normalized =
                text.includes(",") && !text.includes(".") ? text.replace(",", ".") : text.replace(/,/g, "");
            const number = Number(normalized);
            return text && Number.isFinite(number) ? number : null;
        },
    },
    round: {
        arity: [1, 2],
        run: ([value, digits]) => {
            if (value === null) return null;
            const places = digits === undefined || digits === null ? 0 : requireNumber(digits, "round");
            const factor = 10 ** Math.trunc(places);
            return finite(Math.round(requireNumber(value, "round") * factor) / factor);
        },
    },
    abs: { arity: [1, 1], run: numeric(Math.abs) },
    floor: { arity: [1, 1], run: numeric(Math.floor) },
    ceil: { arity: [1, 1], run: numeric(Math.ceil) },
    min: {
        arity: [1, Infinity],
        run: (args) => {
            const numbers = args.filter((value) => value !== null).map((value) => requireNumber(value, "min"));
            return numbers.length > 0 ? Math.min(...numbers) : null;
        },
    },
    max: {
        arity: [1, Infinity],
        run: (args) => {
            const numbers = args.filter((value) => value !== null).map((value) => requireNumber(value, "max"));
            return numbers.length > 0 ? Math.max(...numbers) : null;
        },
    },
    now: { arity: [0, 0], run: (_args, { context }) => new Date(context.now) },
    dateAdd: {
        arity: [3, 3],
        run: ([date, amount, unit]) => {
            if (date === null) return null;
            return dateAdd(requireDate(date, "dateAdd"), requireNumber(amount, "dateAdd"), toUnit(unit));
        },
    },
    dateBetween: {
        arity: [3, 3],
        run: ([later, earlier, unit]) => {
            if (later === null || earlier === null) return null;
            return dateBetween(requireDate(later, "dateBetween"), requireDate(earlier, "dateBetween"), toUnit(unit));
        },
    },
    formatDate: {
        arity: [1, 2],
        run: ([date, pattern]) => {
            if (date === null) return null;
            return formatDate(
                requireDate(date, "formatDate"),
                pattern === undefined ? DEFAULT_DATE_PATTERN : formulaText(pattern),
            );
        },
    },
};

export const FORMULA_FUNCTION_NAMES = Object.keys(FUNCTIONS);

// ---------------------------------------------------------------------------
// Evaluation

function binary(operator: string, left: FormulaValue, right: FormulaValue): FormulaValue {
    switch (operator) {
        case "+":
            // Like Notion: + with text joins the texts.
            if (typeof left === "string" || typeof right === "string") return formulaText(left) + formulaText(right);
            return finite(toArithmetic(left, "+") + toArithmetic(right, "+"));
        case "-":
            return finite(toArithmetic(left, "-") - toArithmetic(right, "-"));
        case "*":
            return finite(toArithmetic(left, "*") * toArithmetic(right, "*"));
        case "/": {
            const divisor = toArithmetic(right, "/");
            if (divisor === 0) throw new FormulaError("Division durch null.");
            return finite(toArithmetic(left, "/") / divisor);
        }
        case "%": {
            const divisor = toArithmetic(right, "%");
            if (divisor === 0) throw new FormulaError("Division durch null.");
            return finite(toArithmetic(left, "%") % divisor);
        }
        case "^":
            return finite(toArithmetic(left, "^") ** toArithmetic(right, "^"));
        case "==":
            return same(left, right);
        case "!=":
            return !same(left, right);
        case "<":
            return compare(left, right, "<") < 0;
        case "<=":
            return compare(left, right, "<=") <= 0;
        case ">":
            return compare(left, right, ">") > 0;
        default:
            return compare(left, right, ">=") >= 0;
    }
}

/** The result of a parsed formula; throws a FormulaError with a German message. */
export function evaluateFormula(node: FormulaNode, context: FormulaContext): FormulaValue {
    const evaluate: Evaluate = (current) => {
        switch (current.kind) {
            case "number":
            case "string":
            case "boolean":
                return current.value;
            case "prop":
                return context.prop(current.name);
            case "unary": {
                const operand = evaluate(current.operand);
                return current.operator === "-" ? finite(-toArithmetic(operand, "-")) : !isTruthy(operand);
            }
            case "conditional":
                return isTruthy(evaluate(current.condition)) ? evaluate(current.then) : evaluate(current.otherwise);
            case "binary":
                if (current.operator === "and")
                    return isTruthy(evaluate(current.left)) && isTruthy(evaluate(current.right));
                if (current.operator === "or")
                    return isTruthy(evaluate(current.left)) || isTruthy(evaluate(current.right));
                return binary(current.operator, evaluate(current.left), evaluate(current.right));
            case "call": {
                const fn = Object.hasOwn(FUNCTIONS, current.name) ? FUNCTIONS[current.name] : undefined;
                if (!fn) throw new FormulaError(`Die Funktion „${current.name}“ gibt es nicht.`);
                const [least, most] = fn.arity;
                const count = current.args.length;
                if (count < least || count > most) {
                    const expected =
                        least === most
                            ? `${least}`
                            : most === Infinity
                              ? `mindestens ${least}`
                              : `${least} bis ${most}`;
                    throw new FormulaError(`${current.name} braucht ${expected} Angaben, nicht ${count}.`);
                }
                const args = fn.lazy ? [] : current.args.map(evaluate);
                return fn.run(args, { name: current.name, context, nodes: current.args, evaluate });
            }
        }
    };
    return evaluate(node);
}
