import { BlockNoteSchema, defaultBlockSpecs } from "@blocknote/core";
import { createReactBlockSpec } from "@blocknote/react";
import { DEFAULT_CALLOUT_EMOJI, isCalloutColor } from "./callout";
import { CalloutIcon } from "./CalloutIcon";
import { DatabaseBlock } from "./DatabaseBlock";

/**
 * A "Datenbank" block (package 19c): an existing database with views of its
 * own, like a linked view in Notion. Only the database's id is in the text;
 * the views are stored per page and block (`block_views`).
 */
const databaseBlock = createReactBlockSpec(
    {
        type: "database",
        propSchema: { databaseId: { default: "" } },
        content: "none",
    },
    {
        render: ({ block, editor }) => (
            // Wide like the text column; the views bring their own spacing.
            <div className="w-full py-1" contentEditable={false}>
                <DatabaseBlock
                    blockId={block.id}
                    databaseId={block.props.databaseId}
                    onChoose={(databaseId) => editor.updateBlock(block.id, { props: { databaseId } })}
                />
            </div>
        ),
    },
);

/**
 * A callout (package 22): an emoji and text on a colored background, like
 * in Notion. Nested blocks (indented below it) share the background, see
 * `.nodi-callout` in `index.css`.
 */
const calloutBlock = createReactBlockSpec(
    {
        type: "callout",
        propSchema: { emoji: { default: DEFAULT_CALLOUT_EMOJI }, color: { default: "gray" } },
        content: "inline",
    },
    {
        render: ({ block, editor, contentRef }) => (
            <div className="nodi-callout flex w-full items-start gap-2">
                <CalloutIcon
                    emoji={block.props.emoji || DEFAULT_CALLOUT_EMOJI}
                    color={isCalloutColor(block.props.color) ? block.props.color : "gray"}
                    editable={editor.isEditable}
                    onChange={(props) => editor.updateBlock(block.id, { props })}
                />
                <div ref={contentRef} className="min-w-0 flex-1 py-0.5" />
            </div>
        ),
    },
);

/** The blocks of Nodi's documents: BlockNote's own, the database block and the callout. */
export const editorSchema = BlockNoteSchema.create({
    blockSpecs: { ...defaultBlockSpecs, database: databaseBlock(), callout: calloutBlock() },
});
