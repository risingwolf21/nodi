import { useEffect, useMemo, useState } from "react";
import { Plus } from "lucide-react";
import { fileCacheFor } from "@/features/files/services/file-cache";
import { createFileUrlResolver } from "@/features/files/services/file-url-resolver";
import { signedFileUrl } from "@/features/files/services/page-files";
import { coverGradient } from "@/features/pages/page-cover";
import type { DatabaseRow } from "../database-model";
import type { DatabaseProperty } from "../types";
import { EntryCard } from "./EntryCard";

type GalleryViewProps = {
    rows: DatabaseRow[];
    properties: DatabaseProperty[];
    editable: boolean;
    /** First image of each entry's text, by entry id (package 42). */
    images: Record<string, string>;
    userId: string | undefined;
    onOpenEntry: (pageId: string) => void;
    /** Undefined: entries cannot be added here. */
    onCreateEntry?: () => Promise<void>;
};

type ResolveFileUrl = (url: string) => Promise<string>;

/** A cover gradient, or an image: from the image cache first, so it shows offline once seen. */
function CardImage({ source, resolve }: { source: string; resolve: ResolveFileUrl }) {
    const gradient = coverGradient(source);
    const [image, setImage] = useState<{ source: string; url: string | null }>({ source: "", url: null });

    useEffect(() => {
        if (gradient) return;
        let current = true;
        resolve(source)
            .then((url) => {
                if (current) setImage({ source, url });
            })
            .catch((err: unknown) => {
                console.warn("Bild der Karte konnte nicht geladen werden:", err);
                if (current) setImage({ source, url: null });
            });
        return () => {
            current = false;
        };
    }, [gradient, resolve, source]);

    if (gradient) return <span className="block h-28" style={{ backgroundImage: gradient.css }} />;
    const url = image.source === source ? image.url : null;
    return url ? (
        <img src={url} alt="" className="block h-28 w-full object-cover" />
    ) : (
        <span className="block h-28 bg-muted" />
    );
}

/** Notion-like gallery: a grid of cards with the entry's cover or first image (package 42). */
export function GalleryView({
    rows,
    properties,
    editable,
    images,
    userId,
    onOpenEntry,
    onCreateEntry,
}: GalleryViewProps) {
    const resolve = useMemo(
        () => createFileUrlResolver({ signedUrl: signedFileUrl, cache: userId ? fileCacheFor(userId) : undefined }),
        [userId],
    );

    return (
        <div className="px-[var(--page-gutter)]">
            {rows.length === 0 && (
                <p className="pb-3 text-sm text-muted-foreground">Keine Einträge in dieser Ansicht.</p>
            )}
            <div className="grid grid-cols-[repeat(auto-fill,minmax(13rem,1fr))] gap-3">
                {rows.map((row) => {
                    const source = row.page.cover ?? images[row.page.id];
                    return (
                        <EntryCard
                            key={row.page.id}
                            row={row}
                            properties={properties}
                            onOpen={() => onOpenEntry(row.page.id)}
                            media={source ? <CardImage source={source} resolve={resolve} /> : undefined}
                            className="min-h-24 justify-start"
                        />
                    );
                })}
                {editable && onCreateEntry && (
                    <button
                        type="button"
                        onClick={() => void onCreateEntry()}
                        className="flex min-h-24 items-center justify-center gap-1.5 rounded-md border border-dashed text-sm text-muted-foreground hover:bg-accent/40"
                    >
                        <Plus className="size-4" />
                        Neu
                    </button>
                )}
            </div>
        </div>
    );
}
