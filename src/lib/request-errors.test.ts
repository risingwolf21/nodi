import { describe, expect, it } from "vitest";
import { classifyRequestError } from "./request-errors";

describe("classifyRequestError", () => {
    it.each([
        [{ status: 0, code: "" }, "offline"],
        [{ status: 401, code: "PGRST301" }, "auth"],
        [{ status: 503, code: "" }, "temporary"],
        [{ status: 400, code: "40001" }, "temporary"],
        [{ status: 403, code: "42501" }, "permanent"],
        [{ status: 400, code: "22023" }, "permanent"],
    ] as const)("%o -> %s", (error, expected) => {
        expect(classifyRequestError(error)).toBe(expected);
    });
});
