import { BlockNoteEditor } from "@blocknote/core";

// One editor without a view, only to use BlockNote's Markdown parser; the
// result has the same blocks as anything typed in the editor.
let parser: BlockNoteEditor | null = null;

export function markdownToBlocks(markdown: string): unknown[] {
    parser ??= BlockNoteEditor.create();
    return parser.tryParseMarkdownToBlocks(markdown);
}
