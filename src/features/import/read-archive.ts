import { unzip, type Unzipped } from "fflate";

/** Larger exports would not fit into the browser's memory reliably. */
export const MAX_ARCHIVE_BYTES = 1024 * 1024 * 1024;

function unzipAsync(data: Uint8Array): Promise<Unzipped> {
    return new Promise((resolve, reject) => {
        unzip(
            data,
            // Folders and macOS metadata carry no content.
            { filter: (file) => !file.name.endsWith("/") && !/(^|\/)(__MACOSX\/|\.DS_Store$)/.test(file.name) },
            (error, files) => (error ? reject(error) : resolve(files)),
        );
    });
}

/**
 * All files of a Notion export by path. Large exports come as a ZIP of ZIP
 * parts ("…-Part-1.zip"); their contents are merged. Paths are NFC, like the
 * links in the Markdown files (ZIPs from macOS use NFD).
 */
export async function readExportArchive(archive: Blob): Promise<Map<string, Uint8Array>> {
    if (archive.size > MAX_ARCHIVE_BYTES) {
        throw new Error("Der Export ist größer als 1 GB. Bitte in Notion einzelne Bereiche exportieren.");
    }
    let entries: Unzipped;
    try {
        entries = await unzipAsync(new Uint8Array(await archive.arrayBuffer()));
    } catch (error) {
        console.error("ZIP konnte nicht gelesen werden:", error);
        throw new Error("Die Datei ist keine lesbare ZIP-Datei. Bitte den Notion-Export unverändert auswählen.", {
            cause: error,
        });
    }

    const files = new Map<string, Uint8Array>();
    for (const [name, data] of Object.entries(entries)) {
        if (name.toLowerCase().endsWith(".zip")) {
            for (const [innerName, innerData] of await readExportArchive(new Blob([data]))) {
                files.set(innerName, innerData);
            }
        } else {
            files.set(name.normalize("NFC"), data);
        }
    }
    return files;
}
