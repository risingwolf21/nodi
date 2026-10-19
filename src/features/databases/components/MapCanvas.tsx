import { useEffect, useRef } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { cn } from "@/lib/utils";

// Loaded lazily (Leaflet is only needed when a map is shown). Tiles come
// straight from OpenStreetMap (decision of the user, CLAUDE.md §12 P14e):
// with attribution, without bulk downloads; the service worker does not
// cache them, so offline the map has markers but no background.
const TILE_URL = "https://tile.openstreetmap.org/{z}/{x}/{y}.png";
const TILE_ATTRIBUTION =
    '© <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer">OpenStreetMap</a>-Mitwirkende';
const MAX_ZOOM = 19;
/** Germany, when there is nothing to show yet. */
const DEFAULT_CENTER: L.LatLngExpression = [51.16, 10.45];
const DEFAULT_ZOOM = 5;
const SINGLE_MARKER_ZOOM = 15;

export type MapMarker = {
    id: string;
    lat: number;
    lng: number;
    title: string;
};

type MapCanvasProps = {
    markers: MapMarker[];
    /** Accessible name of the map region. */
    label: string;
    onMarkerClick?: (id: string) => void;
    /** Set: a click on the map picks that point. */
    onMapClick?: (lat: number, lng: number) => void;
    className?: string;
};

export default function MapCanvas({ markers, label, onMarkerClick, onMapClick, className }: MapCanvasProps) {
    const containerRef = useRef<HTMLDivElement>(null);
    const mapRef = useRef<L.Map | null>(null);
    const layerRef = useRef<L.LayerGroup | null>(null);
    // The newest callbacks, so the map is set up once and not on every render.
    const callbacks = useRef({ onMarkerClick, onMapClick });

    useEffect(() => {
        callbacks.current = { onMarkerClick, onMapClick };
    });

    useEffect(() => {
        const container = containerRef.current;
        if (!container) return;
        const map = L.map(container, { worldCopyJump: true }).setView(DEFAULT_CENTER, DEFAULT_ZOOM);
        L.tileLayer(TILE_URL, { maxZoom: MAX_ZOOM, attribution: TILE_ATTRIBUTION }).addTo(map);
        layerRef.current = L.layerGroup().addTo(map);
        map.on("click", (event: L.LeafletMouseEvent) => {
            callbacks.current.onMapClick?.(event.latlng.lat, L.Util.wrapNum(event.latlng.lng, [-180, 180], true));
        });
        // Leaflet ends a zoom animation with a timer that needs the map; removed
        // before (e.g. a marker click opens the entry right away), it throws.
        let zooming = false;
        map.on("zoomanim", () => (zooming = true));
        map.on("zoomend", () => (zooming = false));
        mapRef.current = map;
        return () => {
            if (zooming) {
                map.once("zoomend", () => map.remove());
            } else {
                map.remove();
            }
            mapRef.current = null;
            layerRef.current = null;
        };
    }, []);

    useEffect(() => {
        const map = mapRef.current;
        const layer = layerRef.current;
        if (!map || !layer) return;
        layer.clearLayers();
        for (const marker of markers) {
            const circle = L.circleMarker([marker.lat, marker.lng], {
                radius: 8,
                weight: 2,
                fillOpacity: 0.85,
                className: "nodi-map-marker",
            });
            // Text, not HTML: titles are user input.
            const tooltip = document.createElement("span");
            tooltip.textContent = marker.title;
            circle.bindTooltip(tooltip, { direction: "top", offset: [0, -8] });
            circle.on("click", () => callbacks.current.onMarkerClick?.(marker.id));
            circle.addTo(layer);
        }
        if (markers.length === 1) {
            map.setView([markers[0].lat, markers[0].lng], Math.max(map.getZoom(), SINGLE_MARKER_ZOOM));
        } else if (markers.length > 1) {
            map.fitBounds(L.latLngBounds(markers.map((marker) => [marker.lat, marker.lng])), {
                padding: [32, 32],
                maxZoom: SINGLE_MARKER_ZOOM,
            });
        }
    }, [markers]);

    return (
        <div
            ref={containerRef}
            role="region"
            aria-label={label}
            className={cn("z-0 overflow-hidden rounded-md border", onMapClick && "cursor-crosshair", className)}
        />
    );
}
