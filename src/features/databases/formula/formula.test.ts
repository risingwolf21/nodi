import { describe, expect, it } from "vitest";
import { evaluateFormula, formulaText, type FormulaValue } from "./formula-evaluator";
import { FormulaError, MAX_EXPRESSION_LENGTH, parseFormula } from "./formula-parser";

const props: Record<string, FormulaValue> = {
    Preis: 12.5,
    Menge: 4,
    Leer: null,
    Name: "Angebot",
    Erledigt: true,
    Fällig: new Date(2026, 0, 31),
};

const NOW = new Date(2026, 9, 19, 10, 30);

function run(source: string): FormulaValue {
    return evaluateFormula(parseFormula(source), {
        now: NOW,
        prop: (name) => {
            if (!(name in props)) throw new FormulaError(`Die Eigenschaft „${name}“ gibt es nicht.`);
            return props[name];
        },
    });
}

function failure(source: string): string {
    try {
        run(source);
    } catch (err) {
        if (err instanceof FormulaError) return err.message;
        throw err;
    }
    throw new Error(`Kein Fehler für ${source}`);
}

describe("operators", () => {
    it("calculates with the usual precedence", () => {
        expect(run('prop("Preis") * prop("Menge") + 1')).toBe(51);
        expect(run("2 + 3 * 4 ^ 2")).toBe(50);
        expect(run("-2 ^ 2")).toBe(-4);
        expect(run("2 ^ 3 ^ 2")).toBe(512);
        expect(run("(1 + 2) * 3 % 4")).toBe(1);
        expect(run('prop("Leer") + 1')).toBe(1);
    });

    it("joins text with + and compares values", () => {
        expect(run('"Nr. " + 7')).toBe("Nr. 7");
        expect(run('prop("Name") == "Angebot"')).toBe(true);
        expect(run('"a" < "b" and 2 >= 2 && !false')).toBe(true);
        expect(run('prop("Fällig") < now()')).toBe(true);
        expect(run("1 != 1 or 3 > 2")).toBe(true);
    });

    it("chooses with if and ?:", () => {
        expect(run('if(prop("Erledigt"), "✓", "offen")')).toBe("✓");
        expect(run('prop("Menge") > 10 ? "viel" : "wenig"')).toBe("wenig");
        // Only the chosen branch is evaluated.
        expect(run('if(true, 1, prop("Unbekannt"))')).toBe(1);
        expect(run('empty(prop("Leer")) and not(empty(prop("Name")))')).toBe(true);
    });
});

describe("functions", () => {
    it("works with text", () => {
        expect(run('concat(prop("Name"), " ", prop("Menge"))')).toBe("Angebot 4");
        expect(run('length("Größe")')).toBe(5);
        expect(run('upper("straße")')).toBe("STRASSE");
        expect(run('contains(prop("Name"), "bot")')).toBe(true);
        expect(run('replace("a.b.c", ".", "-")')).toBe("a-b.c");
        expect(run('replaceAll("a.b.c", ".", "-")')).toBe("a-b-c");
        expect(run("format(1234.5)")).toBe("1.234,5");
    });

    it("works with numbers", () => {
        expect(run("round(2.345, 2)")).toBe(2.35);
        expect(run("round(2.5)")).toBe(3);
        expect(run("abs(-3) + floor(1.9) + ceil(1.1)")).toBe(6);
        expect(run('min(3, prop("Leer"), 1)')).toBe(1);
        expect(run("max(3, 7, 5)")).toBe(7);
        expect(run('toNumber("1,5") + toNumber("2.5")')).toBe(4);
        expect(run('toNumber("abc")')).toBeNull();
    });

    it("works with dates", () => {
        expect(run('formatDate(dateAdd(prop("Fällig"), 1, "months"))')).toBe("28.02.2026");
        expect(run('formatDate(now(), "YYYY-MM-DD HH:mm")')).toBe("2026-10-19 10:30");
        expect(run('dateBetween(now(), prop("Fällig"), "months")')).toBe(8);
        expect(run('dateBetween(prop("Fällig"), now(), "days")')).toBe(-261);
        expect(run('dateBetween(dateAdd(prop("Fällig"), 2, "weeks"), prop("Fällig"), "days")')).toBe(14);
    });

    it("counts whole days across a change to summer time", () => {
        // In zones with summer time, 28 to 30 March 2026 is only 47 hours.
        props.Start = new Date(2026, 2, 28);
        props.Ende = new Date(2026, 2, 30);
        expect(run('dateBetween(prop("Ende"), prop("Start"), "days")')).toBe(2);
    });
});

describe("errors", () => {
    it("explains syntax errors with the position", () => {
        expect(failure("1 +")).toBe("Unerwartet: das Ende an Stelle 4.");
        expect(failure("(1 + 2")).toContain("„)“ erwartet");
        expect(failure('"offen')).toContain('nicht mit " beendet');
        expect(failure("1 = 1")).toContain("bitte == schreiben");
        expect(failure("Preis * 2")).toContain('prop("Preis")');
        expect(failure("prop(Name)")).toContain('prop("Name")');
        expect(failure('prop("A" + "B")')).toContain("genau einen Namen in Anführungszeichen");
        expect(failure("")).toBe("Noch keine Formel.");
    });

    it("explains problems while calculating", () => {
        expect(failure('prop("Fehlt")')).toBe("Die Eigenschaft „Fehlt“ gibt es nicht.");
        expect(failure("wurzel(4)")).toBe("Die Funktion „wurzel“ gibt es nicht.");
        expect(failure("toString(4)")).toBe("Die Funktion „toString“ gibt es nicht.");
        expect(failure("if(true, 1)")).toBe("if braucht 3 Angaben, nicht 2.");
        expect(failure("1 / 0")).toBe("Division durch null.");
        expect(failure('"a" * 2')).toBe("* rechnet nur mit Zahlen, nicht mit Text.");
        expect(failure('abs("x")')).toBe("abs braucht eine Zahl, nicht Text.");
        expect(failure('dateAdd(now(), 1, "fortnights")')).toContain("Einheit unbekannt");
        expect(failure("10 ^ 400")).toBe("Das Ergebnis ist keine endliche Zahl.");
    });

    it("limits length and nesting, and does not run JavaScript", () => {
        expect(failure("1".repeat(MAX_EXPRESSION_LENGTH + 1))).toContain("länger als");
        expect(failure("(".repeat(60) + "1" + ")".repeat(60))).toBe("Die Formel ist zu tief verschachtelt.");
        expect(failure("constructor(1)")).toBe("Die Funktion „constructor“ gibt es nicht.");
        expect(failure('prop("Name").length')).toContain("Unerwartetes Zeichen");
    });
});

describe("formulaText", () => {
    it("shows values as text", () => {
        expect(formulaText(null)).toBe("");
        expect(formulaText(true)).toBe("true");
        expect(formulaText(new Date(2026, 9, 3))).toBe("03.10.2026");
    });
});
