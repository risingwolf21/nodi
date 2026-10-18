import { lazy, Suspense, useMemo } from "react";
import { Plus } from "lucide-react";
import { LoadErrorBoundary } from "@/components/LoadErrorBoundary";
import { displayTitle } from "@/features/pages/page-display";
import { isPlaceValue, type DatabaseRow } from "../database-model";
import type { DatabaseProperty } from "../types";
import type { MapMarker } from "./MapCanvas";

const MapCanvas = lazy(() => import("./MapCanvas"));

type MapViewProps = {
    rows: DatabaseRow[];
    /** Undefined: the database has no place property yet. */
    placeProperty: DatabaseProperty | undefined;
    editable: boolean;
    onOpenEntry: (pageId: string) => void;
    /** Undefined: entries cannot be added here. */
    onCreateEntry?: () => Promise<void>;
    onAddPlaceProperty: () => Promise<void>;
    onError: (message: string) => void;
};

/** Notion-like map: one marker per entry with a place; a click opens the entry. */
export function MapView({
    rows,
    placeProperty,
    editable,
    onOpenEntry,
    onCreateEntry,
    onAddPlaceProperty,
    onError,
}: MapViewProps) {
    const markers = useMemo<MapMarker[]>(() => {
        if (!placeProperty) return [];
        return rows.flatMap((row) => {
            const place = row.values[placeProperty.id];
            return isPlaceValue(place)
                ? [{ id: row.page.id, lat: place.lat, lng: place.lng, title: displayTitle(row.page) }]
                : [];
        });
    }, [rows, placeProperty]);

    if (!placeProperty) {
        return (
            <div className="px-[var(--page-gutter)] py-6 text-sm text-muted-foreground">
                <p>Eine Landkarte zeigt Einträge an ihrem Ort.</p>
                {editable && (
                    <button
                        type="button"
                        onClick={() =>
                            onAddPlaceProperty().catch((err: unknown) =>
                                onError(err instanceof Error ? err.message : "Die Eigenschaft konnte nicht angelegt werden."),
                            )
                        }
                        className="mt-2 flex h-8 items-center gap-1.5 rounded border px-2 text-foreground hover:bg-accent/60"
                    >
                        <Plus className="size-4" />
                        Orts-Eigenschaft anlegen
                    </button>
                )}
            </div>
        );
    }

    const withoutPlace = rows.length - markers.length;

    return (
        <div className="space-y-2 px-[var(--page-gutter)] pb-4">
            <LoadErrorBoundary
                fallback={<p className="text-sm text-destructive">Die Karte konnte nicht geladen werden.</p>}
            >
                <Suspense fallback={<div className="h-[min(70vh,560px)] rounded-md border bg-muted/40" />}>
                    <MapCanvas
                        markers={markers}
                        label={`Landkarte nach ${placeProperty.name}`}
                        onMarkerClick={onOpenEntry}
                        className="h-[min(70vh,560px)]"
                    />
                </Suspense>
            </LoadErrorBoundary>
            <div className="flex items-center justify-between gap-2 text-sm text-muted-foreground">
                <span>
                    {withoutPlace === 0
                        ? `${markers.length} ${markers.length === 1 ? "Eintrag" : "Einträge"} auf der Karte`
                        : `${withoutPlace} ${withoutPlace === 1 ? "Eintrag" : "Einträge"} ohne ${placeProperty.name}`}
                </span>
                {editable && onCreateEntry && (
                    <button
                        type="button"
                        onClick={() => void onCreateEntry()}
                        className="flex h-8 items-center gap-1.5 rounded px-2 hover:bg-accent/60 pointer-coarse:h-10"
                    >
                        <Plus className="size-4" />
                        Neu
                    </button>
                )}
            </div>
        </div>
    );
}
