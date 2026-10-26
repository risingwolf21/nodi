import { BlockNoteSchema, defaultBlockSpecs, defaultInlineContentSpecs, defaultStyleSpecs } from "@blocknote/core";
import { createReactBlockSpec, createReactInlineContentSpec, createReactStyleSpec } from "@blocknote/react";
import { DEFAULT_CALLOUT_EMOJI, isCalloutColor } from "./callout";
import { CalloutIcon } from "./CalloutIcon";
import { CommentMark } from "./CommentMark";
import { DatabaseBlock } from "./DatabaseBlock";
import { PageLink } from "./PageLink";
import { PersonMention } from "./PersonMention";

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

/**
 * Columns (package 32e): a "columns" block whose children ("column" blocks)
 * stand side by side; each column's children are its content. The layout is
 * CSS only (`index.css`), so the document stays plain BlockNote blocks.
 * BlockNote's own multi-column package is not used (its license is GPL or
 * commercial).
 */
const columnsBlock = createReactBlockSpec(
    { type: "columns", propSchema: {}, content: "none" },
    { render: () => <div className="nodi-columns-handle" contentEditable={false} /> },
);

const columnBlock = createReactBlockSpec(
    { type: "column", propSchema: {}, content: "none" },
    { render: () => <div className="nodi-column-handle" contentEditable={false} /> },
);

/** A link to a page in the text, inserted with "@" (package 28). */
const pageLink = createReactInlineContentSpec(
    {
        type: "pageLink",
        propSchema: { pageId: { default: "" }, title: { default: "" } },
        content: "none",
    },
    {
        render: ({ inlineContent }) => (
            <PageLink pageId={inlineContent.props.pageId} title={inlineContent.props.title} />
        ),
    },
);

/** A person mentioned with "@" (package 37); the server notifies newly mentioned people. */
const mention = createReactInlineContentSpec(
    {
        type: "mention",
        propSchema: { userId: { default: "" }, label: { default: "" } },
        content: "none",
    },
    {
        render: ({ inlineContent }) => (
            <PersonMention userId={inlineContent.props.userId} label={inlineContent.props.label} />
        ),
    },
);

/** Text with a comment (package 31b): the value is the id of its thread in page_comments. */
const commentStyle = createReactStyleSpec(
    { type: "comment", propSchema: "string" },
    { render: ({ value, contentRef }) => <CommentMark threadId={value} contentRef={contentRef} /> },
);

/**
 * The blocks of Nodi's documents: BlockNote's own, the database block and the callout; page links and
 * mentions in the text; comments on text.
 */
export const editorSchema = BlockNoteSchema.create({
    blockSpecs: {
        ...defaultBlockSpecs,
        database: databaseBlock(),
        callout: calloutBlock(),
        columns: columnsBlock(),
        column: columnBlock(),
    },
    inlineContentSpecs: { ...defaultInlineContentSpecs, pageLink, mention },
    styleSpecs: { ...defaultStyleSpecs, comment: commentStyle },
});
