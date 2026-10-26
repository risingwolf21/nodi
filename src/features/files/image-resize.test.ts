import { describe, expect, it } from "vitest";
import { jpegName, MAX_IMAGE_SIDE, SHRINK_ABOVE_BYTES, shrinkTarget } from "./image-resize";

const MB = 1024 * 1024;

describe("shrinkTarget", () => {
    it("scales a large photo down to the longest side", () => {
        expect(shrinkTarget({ type: "image/jpeg", size: 4 * MB, width: 4032, height: 3024 })).toEqual({
            width: MAX_IMAGE_SIDE,
            height: 1920,
        });
        expect(shrinkTarget({ type: "image/webp", size: MB, width: 3000, height: 6000 })).toEqual({
            width: 1280,
            height: MAX_IMAGE_SIDE,
        });
    });

    it("re-encodes a heavy image that is small enough at its size", () => {
        expect(shrinkTarget({ type: "image/png", size: SHRINK_ABOVE_BYTES + 1, width: 1170, height: 2532 })).toEqual({
            width: 1170,
            height: 2532,
        });
    });

    it("leaves small images, GIFs, SVGs and other files as they are", () => {
        expect(shrinkTarget({ type: "image/jpeg", size: MB, width: 2000, height: 1500 })).toBeNull();
        expect(shrinkTarget({ type: "image/gif", size: 8 * MB, width: 4000, height: 3000 })).toBeNull();
        expect(shrinkTarget({ type: "image/svg+xml", size: 3 * MB, width: 5000, height: 5000 })).toBeNull();
        expect(shrinkTarget({ type: "application/pdf", size: 9 * MB, width: 0, height: 0 })).toBeNull();
    });
});

describe("jpegName", () => {
    it("keeps the name and makes it a JPEG", () => {
        expect(jpegName("Urlaub 2026.PNG")).toBe("Urlaub 2026.jpg");
        expect(jpegName("IMG_0001.jpeg")).toBe("IMG_0001.jpg");
        expect(jpegName("foto")).toBe("foto.jpg");
    });
});
