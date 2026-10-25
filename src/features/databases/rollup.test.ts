import { describe, expect, it } from "vitest";
import { computeRollup, rollupFunctionsFor } from "./rollup";

const text = (value: unknown) => (typeof value === "string" ? value : String(value));

describe("computeRollup", () => {
    it("counts and shows values", () => {
        const values = ["Rot", null, "Blau", "Rot"];
        expect(computeRollup("show_original", values, text)).toBe("Rot, Blau, Rot");
        expect(computeRollup("count_all", values, text)).toBe(4);
        expect(computeRollup("count_values", [["a", "b"], null, ["c"]], text)).toBe(3);
        expect(computeRollup("count_unique", values, text)).toBe(2);
        expect(computeRollup("count_empty", values, text)).toBe(1);
        expect(computeRollup("percent_not_empty", values, text)).toBe(0.75);
        expect(computeRollup("percent_empty", [], text)).toBe(0);
    });

    it("computes with numbers", () => {
        const values = [3, null, 1, 8];
        expect(computeRollup("sum", values, text)).toBe(12);
        expect(computeRollup("average", values, text)).toBe(4);
        expect(computeRollup("median", values, text)).toBe(3);
        expect(computeRollup("median", [1, 2, 3, 4], text)).toBe(2.5);
        expect([computeRollup("min", values, text), computeRollup("max", values, text)]).toEqual([1, 8]);
        expect(computeRollup("range", values, text)).toBe(7);
        expect(computeRollup("average", [], text)).toBeNull();
    });

    it("finds the earliest and latest date and the days between", () => {
        const values = [{ start: "2026-10-05", end: "2026-10-07" }, null, { start: "2026-10-01", end: null }];
        expect(computeRollup("earliest", values, text)).toEqual({ start: "2026-10-01", end: null });
        expect(computeRollup("latest", values, text)).toEqual({ start: "2026-10-07", end: null });
        expect(computeRollup("range", values, text)).toBe(6);
    });

    it("counts checkboxes", () => {
        const values = [true, false, true];
        expect(computeRollup("checked", values, text)).toBe(2);
        expect(computeRollup("unchecked", values, text)).toBe(1);
        expect(computeRollup("percent_checked", [true, false], text)).toBe(0.5);
    });

    it("offers the functions that fit the target", () => {
        expect(rollupFunctionsFor("number")).toContain("sum");
        expect(rollupFunctionsFor("title")).not.toContain("sum");
        expect(rollupFunctionsFor("date")).toContain("earliest");
        expect(rollupFunctionsFor("checkbox")).toEqual([
            "show_original",
            "count_all",
            "checked",
            "unchecked",
            "percent_checked",
        ]);
    });
});
