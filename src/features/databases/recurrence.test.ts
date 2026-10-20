import { describe, expect, it } from "vitest";
import { describeRecurrence, parseRecurrence, weekdayOf } from "./recurrence";

describe("recurrence", () => {
    it("reads a server row and rejects anything else", () => {
        const row = {
            pageId: "e1",
            frequency: "weekly",
            interval: 1,
            weekdays: [1, 3, 9],
            startDate: "2026-10-05",
            nextDate: "2026-10-07",
            datePropertyId: null,
        };
        expect(parseRecurrence(row)).toEqual({ ...row, weekdays: [1, 3] });
        expect(parseRecurrence({ ...row, frequency: "hourly" })).toBeNull();
        expect(parseRecurrence(null)).toBeNull();
    });

    it("describes the rule in German", () => {
        const rule = { interval: 1, weekdays: [], startDate: "2026-10-31" };
        expect(describeRecurrence({ ...rule, frequency: "daily" })).toBe("Täglich");
        expect(describeRecurrence({ ...rule, frequency: "daily", interval: 2 })).toBe("Alle 2 Tage");
        expect(describeRecurrence({ ...rule, frequency: "weekly", weekdays: [3, 1] })).toBe("Wöchentlich am Mo, Mi");
        // Without weekdays: the start's weekday (2026-10-31 is a Saturday).
        expect(describeRecurrence({ ...rule, frequency: "weekly" })).toBe("Wöchentlich am Sa");
        expect(describeRecurrence({ ...rule, frequency: "monthly" })).toBe("Monatlich am 31.");
        expect(describeRecurrence({ ...rule, frequency: "yearly", interval: 3 })).toBe("Alle 3 Jahre");
        expect(weekdayOf("2026-10-05")).toBe(1);
    });
});
