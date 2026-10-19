import { BlockNoteSchema, defaultBlockSpecs } from "@blocknote/core";
import { createReactBlockSpec } from "@blocknote/react";
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

/** The blocks of Nodi's documents: BlockNote's own and the database block. */
export const editorSchema = BlockNoteSchema.create({
    blockSpecs: { ...defaultBlockSpecs, database: databaseBlock() },
});
