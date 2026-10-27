import { fileNameOfPath, filePathFromReference, fileReference, fileStoragePath } from "@/features/files/file-reference";
import { isDocumentContent } from "./document-sync";
import type { DocumentContent } from "./types";

// The text of a page template for a new page (package 38b). Blocks get new
// ids (BlockNote assigns them); comment marks are left out, since their
// threads belong to the template. Files are copied into the new page's
// folder: Storage checks the page in the path, so readers of the new page
// may not see the template's files, and they go when the template does.

type JsonObject = Record<string, unknown>;

/** A file of the template and where its copy goes. */
export type FileCopy = { from: string; to: string };

export type TemplateCopy = { content: DocumentContent; files: FileCopy[] };

const isObject = (value: unknown): value is JsonObject => typeof value === "object" && value !== null;

function withoutCommentMarks(value: unknown): unknown {
    if (Array.isArray(value)) return value.map(withoutCommentMarks);
    if (!isObject(value)) return value;
    const copy = Object.fromEntries(Object.entries(value).map(([key, item]) => [key, withoutCommentMarks(item)]));
    if (copy.type === "text" && isObject(copy.styles) && "comment" in copy.styles) {
        copy.styles = Object.fromEntries(Object.entries(copy.styles).filter(([key]) => key !== "comment"));
    }
    return copy;
}

/** Collects file copies for one page; the same file is copied once. */
class FileCopies {
    private readonly copies = new Map<string, string>();
    private readonly pageId: string;

    constructor(pageId: string) {
        this.pageId = pageId;
    }

    /** The reference of the copy, or the value itself if it is no file of the bucket. */
    reference(url: string): string {
        const path = filePathFromReference(url);
        if (!path) return url;
        let target = this.copies.get(path);
        if (!target) {
            target = fileStoragePath(this.pageId, fileNameOfPath(path));
            this.copies.set(path, target);
        }
        return fileReference(target);
    }

    list(): FileCopy[] {
        return [...this.copies].map(([from, to]) => ({ from, to }));
    }
}

function copyBlock(block: unknown, files: FileCopies): unknown {
    if (!isObject(block)) return block;
    const { children, content, props, ...rest } = block;
    // The id goes; BlockNote gives the block a new one.
    delete rest.id;
    return {
        ...rest,
        ...(isObject(props)
            ? { props: typeof props.url === "string" ? { ...props, url: files.reference(props.url) } : props }
            : {}),
        ...(content !== undefined ? { content: withoutCommentMarks(content) } : {}),
        ...(Array.isArray(children) ? { children: children.map((child) => copyBlock(child, files)) } : {}),
    };
}

/** The template's blocks as new blocks of the page; null if the result is no valid document. */
export function templateContent(content: DocumentContent, pageId: string): TemplateCopy | null {
    const files = new FileCopies(pageId);
    const copy: unknown = content.map((block) => copyBlock(block, files));
    return isDocumentContent(copy) ? { content: copy, files: files.list() } : null;
}

/** A template's cover for the page: a gradient as it is, an image as a copy. */
export function templateCover(cover: string, pageId: string): { cover: string; files: FileCopy[] } {
    const files = new FileCopies(pageId);
    return { cover: files.reference(cover), files: files.list() };
}
