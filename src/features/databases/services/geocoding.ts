import { isPlaceValue } from "../database-model";
import type { PlaceValue } from "../types";

// Address search with Nominatim, the geocoder of OpenStreetMap (decision of
// the user, CLAUDE.md §12 P14e). Its usage policy allows at most one request
// per second and no search while typing, so the app only searches on Enter
// and waits between requests. The search text goes to the OSM Foundation.
const NOMINATIM_SEARCH_URL = "https://nominatim.openstreetmap.org/search";
const MIN_REQUEST_INTERVAL_MS = 1000;
const RESULT_LIMIT = 5;
const LABEL_MAX_LENGTH = 500;

const GEOCODING_OFFLINE_MESSAGE = "Ohne Internetverbindung kann keine Adresse gesucht werden.";

let nextRequestAt = 0;

/** Waits until a request is allowed; a second search right after the first queues behind it. */
async function waitForTurn(): Promise<void> {
    const start = Math.max(Date.now(), nextRequestAt);
    nextRequestAt = start + MIN_REQUEST_INTERVAL_MS;
    const wait = start - Date.now();
    if (wait > 0) await new Promise((resolve) => setTimeout(resolve, wait));
}

function isObject(value: unknown): value is Record<string, unknown> {
    return typeof value === "object" && value !== null;
}

/** Nominatim answers with strings for coordinates; anything unusable is left out. */
export function parseSearchResults(data: unknown): PlaceValue[] {
    if (!Array.isArray(data)) throw new Error("Unerwartete Antwort der Adresssuche.");
    return data.flatMap((item: unknown): PlaceValue[] => {
        if (!isObject(item) || typeof item.lat !== "string" || typeof item.lon !== "string") return [];
        const label = typeof item.display_name === "string" ? item.display_name.slice(0, LABEL_MAX_LENGTH) : "";
        const place = { lat: Number(item.lat), lng: Number(item.lon), label: label || null };
        return isPlaceValue(place) ? [place] : [];
    });
}

/** Up to five places for an address or a place name, in German where available. */
export async function searchPlaces(query: string, signal?: AbortSignal): Promise<PlaceValue[]> {
    const params = new URLSearchParams({
        q: query,
        format: "jsonv2",
        limit: String(RESULT_LIMIT),
        "accept-language": "de",
    });

    await waitForTurn();
    let response: Response;
    try {
        response = await fetch(`${NOMINATIM_SEARCH_URL}?${params}`, { signal });
    } catch (err) {
        if (signal?.aborted) throw err;
        console.warn("Adresssuche nicht erreichbar:", err);
        throw new Error(navigator.onLine ? "Die Adresssuche ist gerade nicht erreichbar." : GEOCODING_OFFLINE_MESSAGE, {
            cause: err,
        });
    }
    if (!response.ok) {
        console.warn("Adresssuche fehlgeschlagen:", response.status);
        throw new Error(
            response.status === 429
                ? "Zu viele Suchen in kurzer Zeit. Bitte kurz warten."
                : "Die Adresssuche ist gerade nicht erreichbar.",
        );
    }
    return parseSearchResults(await response.json());
}
