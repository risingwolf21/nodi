// Photos are made smaller before they are uploaded (decision of the user,
// package 39: at most 2560 px on the longest side, JPEG at 85 %). Saves
// storage and mobile data, and the 10 MB limit is reached less often.
// Drawing on a canvas also drops the photo's metadata (location, camera).

export const MAX_IMAGE_SIDE = 2560;
export const JPEG_QUALITY = 0.85;
// Smaller images are uploaded as they are: re-encoding would only cost quality.
export const SHRINK_ABOVE_BYTES = 2 * 1024 * 1024;

// Types a canvas can read and that may become JPEG. GIF (animation) and SVG stay.
const SHRINKABLE_TYPES = new Set(["image/jpeg", "image/webp", "image/png"]);

export type ImageInfo = { type: string; size: number; width: number; height: number };

/** Whether an image is made smaller, and to which size; null: upload as it is. */
export function shrinkTarget({ type, size, width, height }: ImageInfo): { width: number; height: number } | null {
    if (!SHRINKABLE_TYPES.has(type) || width <= 0 || height <= 0) return null;
    const longest = Math.max(width, height);
    if (longest <= MAX_IMAGE_SIDE && size <= SHRINK_ABOVE_BYTES) return null;
    const scale = Math.min(1, MAX_IMAGE_SIDE / longest);
    return { width: Math.max(1, Math.round(width * scale)), height: Math.max(1, Math.round(height * scale)) };
}

/** The name of the JPEG copy: same name, extension `.jpg`. */
export function jpegName(name: string): string {
    const dot = name.lastIndexOf(".");
    return `${dot > 0 ? name.slice(0, dot) : name}.jpg`;
}

function hasTransparency(context: CanvasRenderingContext2D, width: number, height: number): boolean {
    const pixels = context.getImageData(0, 0, width, height).data;
    for (let index = 3; index < pixels.length; index += 4) {
        if (pixels[index] < 255) return true;
    }
    return false;
}

/**
 * A smaller JPEG copy of a photo, or the file itself when it needs none,
 * cannot be read here (e.g. HEIC outside Safari), has transparency, or the
 * copy would not be smaller.
 */
export async function shrinkImage(file: File): Promise<File> {
    if (!SHRINKABLE_TYPES.has(file.type)) return file;
    let bitmap: ImageBitmap;
    try {
        // Applies the orientation of the photo, as the browser shows it.
        bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
    } catch (error) {
        console.warn("Bild konnte nicht gelesen werden, es wird unverändert hochgeladen:", error);
        return file;
    }
    try {
        const target = shrinkTarget({ type: file.type, size: file.size, width: bitmap.width, height: bitmap.height });
        if (!target) return file;
        const canvas = document.createElement("canvas");
        canvas.width = target.width;
        canvas.height = target.height;
        const context = canvas.getContext("2d");
        if (!context) return file;
        context.drawImage(bitmap, 0, 0, target.width, target.height);
        // A transparent PNG would get a black background as JPEG.
        if (file.type === "image/png" && hasTransparency(context, target.width, target.height)) return file;
        const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", JPEG_QUALITY));
        if (!blob || blob.size >= file.size) return file;
        return new File([blob], jpegName(file.name), { type: "image/jpeg", lastModified: file.lastModified });
    } finally {
        bitmap.close();
    }
}
