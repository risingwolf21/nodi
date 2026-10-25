import { BlockNoteEditor, type PartialBlock } from "@blocknote/core";

// One editor without a view, only for BlockNote's Markdown conversion (as the
// import uses its parser). exportBlocks has turned nodi's own blocks into
// BlockNote's standard ones, so the default schema fits.
let converter: BlockNoteEditor | null = null;

export function blocksToMarkdown(blocks: Record<string, unknown>[]): string {
    converter ??= BlockNoteEditor.create();
    // The blocks come from a stored document; BlockNote checks them while converting.
    return converter.blocksToMarkdownLossy(blocks as PartialBlock[]);
}
