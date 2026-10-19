import { describe, expect, it } from "vitest";
import { detectKeyboard, type KeyboardDetector } from "./virtual-keyboard";

const phone = (height: number, width = 390, scale = 1) => ({ width, height, scale });

describe("detectKeyboard", () => {
    it("sees the keyboard when the visible height drops clearly below the full height", () => {
        const detector: KeyboardDetector = { fullHeight: 0, width: 390 };
        expect(detectKeyboard(phone(844), detector)).toBe(false);
        // Safari's bars coming and going are no keyboard.
        expect(detectKeyboard(phone(760), detector)).toBe(false);
        expect(detectKeyboard(phone(500), detector)).toBe(true);
        expect(detectKeyboard(phone(844), detector)).toBe(false);
    });

    it("starts over after a rotation and ignores a zoomed page", () => {
        const detector: KeyboardDetector = { fullHeight: 0, width: 390 };
        detectKeyboard(phone(844), detector);
        // Landscape: lower, but no keyboard.
        expect(detectKeyboard(phone(390, 844), detector)).toBe(false);
        expect(detectKeyboard(phone(200, 844), detector)).toBe(true);
        // Pinch zoom shrinks the visual viewport as well.
        expect(detectKeyboard(phone(200, 844, 2), detector)).toBe(false);
    });
});
