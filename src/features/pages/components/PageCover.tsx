import { useEffect, useMemo, useState } from "react";
import { ImagePlus } from "lucide-react";
import { Menu, MenuItem } from "@/components/ui/menu";
import { fileCacheFor } from "@/features/files/services/file-cache";
import { createFileUrlResolver } from "@/features/files/services/file-url-resolver";
import { signedFileUrl, uploadPageFile } from "@/features/files/services/page-files";
import { isImagePath } from "@/features/files/file-reference";
import { cn } from "@/lib/utils";
import { COVER_GRADIENTS, coverGradient, gradientCover } from "../page-cover";

type CoverPickerProps = {
    pageId: string;
    label: string;
    hasCover: boolean;
    onSetCover: (cover: string | null) => Promise<void>;
    className?: string;
};

/** A button with the cover choices: gradients, an uploaded image, removing it. */
export function CoverPicker({ pageId, label, hasCover, onSetCover, className }: CoverPickerProps) {
    const [open, setOpen] = useState(false);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState("");

    async function choose(next: () => Promise<string | null>) {
        setOpen(false);
        setError("");
        setBusy(true);
        try {
            await onSetCover(await next());
        } catch (err) {
            setError(err instanceof Error ? err.message : "Das Titelbild konnte nicht gespeichert werden.");
        } finally {
            setBusy(false);
        }
    }

    // Made on demand: a file input in the page would be the first one there, next to the editor's.
    function pickImage() {
        const input = document.createElement("input");
        input.type = "file";
        input.accept = "image/*";
        input.addEventListener("change", () => {
            const file = input.files?.[0];
            if (!file) return;
            if (!isImagePath(file.name)) {
                setError("Bitte wähle ein Bild (PNG, JPG, GIF, WebP …).");
                return;
            }
            void choose(() => uploadPageFile(pageId, file));
        });
        input.click();
    }

    return (
        <span className="relative inline-flex flex-col items-start">
            <button
                type="button"
                disabled={busy}
                aria-expanded={open}
                onClick={() => setOpen((value) => !value)}
                className={cn(
                    "flex items-center gap-1.5 rounded-md px-1.5 py-1 text-sm text-muted-foreground hover:bg-accent disabled:opacity-60",
                    className,
                )}
            >
                <ImagePlus className="size-4" aria-hidden="true" />
                {busy ? "Wird gespeichert …" : label}
            </button>
            <Menu open={open} onClose={() => setOpen(false)} align="start" className="w-64 p-2">
                <div className="grid grid-cols-3 gap-1" role="group" aria-label="Farbverläufe">
                    {COVER_GRADIENTS.map((gradient) => (
                        <button
                            key={gradient.id}
                            type="button"
                            role="menuitem"
                            aria-label={`Farbverlauf ${gradient.label}`}
                            onClick={() => void choose(() => Promise.resolve(gradientCover(gradient.id)))}
                            className="h-10 rounded border hover:ring-2 hover:ring-ring/50"
                            style={{ backgroundImage: gradient.css }}
                        />
                    ))}
                </div>
                <div className="mt-2 border-t pt-1">
                    <MenuItem onSelect={pickImage}>Bild hochladen (höchstens 10 MB)</MenuItem>
                    {hasCover && (
                        <MenuItem onSelect={() => void choose(() => Promise.resolve(null))}>
                            Titelbild entfernen
                        </MenuItem>
                    )}
                </div>
            </Menu>
            {error && (
                <span className="mt-1 text-sm text-destructive" role="alert">
                    {error}
                </span>
            )}
        </span>
    );
}

type PageCoverProps = {
    pageId: string;
    cover: string;
    userId: string | undefined;
    editable: boolean;
    onSetCover: (cover: string | null) => Promise<void>;
};

/**
 * The cover above the title. Images come from the image cache first, so a
 * cover seen once shows offline too (package 15).
 */
export function PageCover({ pageId, cover, userId, editable, onSetCover }: PageCoverProps) {
    const gradient = coverGradient(cover);
    const resolve = useMemo(
        () => createFileUrlResolver({ signedUrl: signedFileUrl, cache: userId ? fileCacheFor(userId) : undefined }),
        [userId],
    );
    const [image, setImage] = useState<{ cover: string; url: string | null }>({ cover: "", url: null });

    useEffect(() => {
        if (gradient) return;
        let current = true;
        resolve(cover)
            .then((url) => {
                if (current) setImage({ cover, url });
            })
            .catch((err: unknown) => {
                console.warn("Titelbild konnte nicht geladen werden:", err);
                if (current) setImage({ cover, url: null });
            });
        return () => {
            current = false;
        };
    }, [cover, gradient, resolve]);

    const url = image.cover === cover ? image.url : null;

    return (
        <div
            className="group/cover relative mb-6 h-36 w-full bg-muted bg-cover bg-center md:h-52 md:rounded-lg"
            style={gradient ? { backgroundImage: gradient.css } : url ? { backgroundImage: `url("${url}")` } : {}}
            role="img"
            aria-label="Titelbild"
        >
            {editable && (
                <div className="absolute right-2 bottom-2 opacity-0 group-hover/cover:opacity-100 focus-within:opacity-100 pointer-coarse:opacity-100">
                    <CoverPicker
                        pageId={pageId}
                        label="Titelbild ändern"
                        hasCover
                        onSetCover={onSetCover}
                        className="bg-background/90 text-foreground shadow-sm hover:bg-background"
                    />
                </div>
            )}
        </div>
    );
}
