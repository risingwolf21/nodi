import { describe, expect, it } from "vitest";
import {
    filePathFromReference,
    fileReference,
    fileStoragePath,
    isImagePath,
    pageIdOfFilePath,
    safeFileName,
} from "./file-reference";

const PAGE = "b0000000-0000-4000-8000-000000000001";
const ID = "c0000000-0000-4000-8000-000000000002";

describe("safeFileName", () => {
    it("keeps simple names", () => {
        expect(safeFileName("foto.png")).toBe("foto.png");
        expect(safeFileName("Plan_2026-10.pdf")).toBe("Plan_2026-10.pdf");
    });

    it("replaces umlauts, spaces and folders", () => {
        expect(safeFileName("Größe Übersicht.png")).toBe("Grosse-Ubersicht.png");
        expect(safeFileName("../../etc/passwd")).toBe("passwd");
        expect(safeFileName("C:\\Bilder\\Strand (1).jpg")).toBe("Strand-1-.jpg");
    });

    it("never returns an empty or hidden name and keeps the extension of long names", () => {
        expect(safeFileName("???")).toBe("datei");
        expect(safeFileName(".env")).toBe("env");
        const long = safeFileName(`${"a".repeat(300)}.jpeg`);
        expect(long).toHaveLength(100);
        expect(long.endsWith(".jpeg")).toBe(true);
    });
});

describe("references", () => {
    it("round-trip a storage path", () => {
        const path = fileStoragePath(PAGE, "Urlaub.JPG", ID);
        expect(path).toBe(`${PAGE}/${ID}-Urlaub.JPG`);
        expect(filePathFromReference(fileReference(path))).toBe(path);
        expect(pageIdOfFilePath(path)).toBe(PAGE);
    });

    it("leave other URLs and malformed paths alone", () => {
        expect(filePathFromReference("https://example.com/bild.png")).toBeNull();
        expect(filePathFromReference("nodi-file:../geheim.png")).toBeNull();
        expect(filePathFromReference(`nodi-file:${PAGE}/x.png`)).toBeNull();
        expect(pageIdOfFilePath("nicht/da.png")).toBeNull();
    });

    it("recognize images by their extension", () => {
        expect(isImagePath(`${PAGE}/${ID}-Urlaub.JPG`)).toBe(true);
        expect(isImagePath(`${PAGE}/${ID}-plan.pdf`)).toBe(false);
    });
});
