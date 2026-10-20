import { describe, expect, it } from "vitest";
import { COVER_GRADIENTS, coverGradient, gradientCover } from "./page-cover";

describe("coverGradient", () => {
    it("finds the gradient of a cover; an unknown one shows the first, an image none", () => {
        expect(coverGradient(gradientCover("ocean"))?.label).toBe("Meer");
        expect(coverGradient("gradient:neu")).toBe(COVER_GRADIENTS[0]);
        expect(coverGradient("nodi-file:p/x-Strand.png")).toBeNull();
    });
});
