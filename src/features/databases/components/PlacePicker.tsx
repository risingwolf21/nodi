import { lazy, Suspense, useMemo, useState, type FormEvent } from "react";
import { MapPin, Search } from "lucide-react";
import { LoadErrorBoundary } from "@/components/LoadErrorBoundary";
import { Menu } from "@/components/ui/menu";
import { formatValue } from "../database-model";
import { searchPlaces } from "../services/geocoding";
import type { DatabaseProperty, PlaceValue } from "../types";

const MapCanvas = lazy(() => import("./MapCanvas"));

type PlacePickerProps = {
    property: DatabaseProperty;
    value: PlaceValue | null;
    onClose: () => void;
    /** null clears the place. */
    onChange: (place: PlaceValue | null) => void;
};

/**
 * Choosing a place: search an address with OpenStreetMap (on Enter only,
 * as its usage policy asks) or click on the map.
 */
export function PlacePicker({ property, value, onClose, onChange }: PlacePickerProps) {
    const [query, setQuery] = useState("");
    const [results, setResults] = useState<PlaceValue[] | null>(null);
    const [searching, setSearching] = useState(false);
    const [error, setError] = useState("");
    const markers = useMemo(
        () => (value ? [{ id: "place", lat: value.lat, lng: value.lng, title: formatValue(property, value) }] : []),
        [property, value],
    );

    async function search(event: FormEvent<HTMLFormElement>) {
        event.preventDefault();
        const text = query.trim();
        if (!text || searching) return;
        setSearching(true);
        setError("");
        try {
            const found = await searchPlaces(text);
            setResults(found);
        } catch (err) {
            setResults(null);
            setError(err instanceof Error ? err.message : "Die Adresssuche hat nicht geklappt.");
        } finally {
            setSearching(false);
        }
    }

    function choose(place: PlaceValue | null) {
        onChange(place);
        onClose();
    }

    return (
        <Menu detached open onClose={onClose} align="start" role="dialog" label={property.name} className="w-80 p-2">
            <form onSubmit={(event) => void search(event)} className="flex gap-1">
                <input
                    autoFocus
                    value={query}
                    onChange={(event) => setQuery(event.target.value)}
                    placeholder="Adresse suchen, Enter"
                    aria-label="Adresse suchen"
                    className="h-8 min-w-0 flex-1 rounded border bg-transparent px-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
                />
                <button
                    type="submit"
                    disabled={searching}
                    aria-label="Suchen"
                    className="flex size-8 shrink-0 items-center justify-center rounded border text-muted-foreground hover:bg-accent disabled:opacity-60"
                >
                    <Search className="size-4" />
                </button>
            </form>
            {searching && <p className="px-1 pt-2 text-xs text-muted-foreground">Suche …</p>}
            {error && (
                <p role="alert" className="px-1 pt-2 text-xs text-destructive">
                    {error}
                </p>
            )}
            {results && !searching && (
                <ul className="max-h-40 overflow-y-auto py-1" aria-label="Suchergebnisse">
                    {results.length === 0 && (
                        <li className="px-1 py-1 text-xs text-muted-foreground">Nichts gefunden.</li>
                    )}
                    {results.map((place) => (
                        <li key={`${place.lat},${place.lng}`}>
                            <button
                                type="button"
                                onClick={() => choose(place)}
                                className="flex w-full items-start gap-2 rounded px-1 py-1.5 text-left text-sm hover:bg-accent pointer-coarse:py-2"
                            >
                                <MapPin className="mt-0.5 size-3.5 shrink-0 text-muted-foreground" aria-hidden="true" />
                                <span className="line-clamp-2">{place.label}</span>
                            </button>
                        </li>
                    ))}
                </ul>
            )}
            <p className="px-1 pt-2 pb-1 text-xs text-muted-foreground">Oder auf der Karte klicken:</p>
            <LoadErrorBoundary
                fallback={<p className="px-1 text-xs text-destructive">Die Karte konnte nicht geladen werden.</p>}
            >
                <Suspense fallback={<div className="h-48 rounded-md border bg-muted/40" />}>
                    <MapCanvas
                        markers={markers}
                        label={`Karte für ${property.name}`}
                        onMapClick={(lat, lng) => onChange({ lat, lng, label: null })}
                        className="h-48"
                    />
                </Suspense>
            </LoadErrorBoundary>
            <div className="flex items-center justify-between pt-2">
                <span className="text-[11px] text-muted-foreground">Suche und Karte: OpenStreetMap</span>
                {value && (
                    <button
                        type="button"
                        onClick={() => choose(null)}
                        className="rounded px-2 py-1 text-xs text-muted-foreground hover:bg-accent"
                    >
                        Leeren
                    </button>
                )}
            </div>
        </Menu>
    );
}
