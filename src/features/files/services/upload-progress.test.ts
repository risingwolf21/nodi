import { describe, expect, it } from "vitest";
import { subscribeUploads, trackUpload, uploadsSnapshot } from "./upload-progress";

describe("trackUpload", () => {
    it("shows uploads with their progress until they are done", () => {
        let changes = 0;
        const stop = subscribeUploads(() => changes++);
        const photo = trackUpload("Foto.jpg");
        const plan = trackUpload("Plan.pdf");
        photo.progress(0.5);
        plan.progress(2);
        expect(uploadsSnapshot().map(({ name, progress }) => [name, progress])).toEqual([
            ["Foto.jpg", 0.5],
            ["Plan.pdf", 1],
        ]);
        photo.done();
        plan.done();
        expect(uploadsSnapshot()).toEqual([]);
        expect(changes).toBe(6);
        stop();
    });
});
