import { useBlockNoteEditor, useComponentsContext, useEditorState } from "@blocknote/react";
import { MessageSquarePlus } from "lucide-react";
import { MAX_QUOTE_LENGTH, requestComment } from "@/features/comments/comment-marks";
import { editorSchema } from "./editor-schema";

/** Removes the comment marks of one thread, e.g. when its first comment is not sent. */
function removeCommentMark(editor: typeof editorSchema.BlockNoteEditor, threadId: string) {
    editor.transact((tr) => {
        const type = tr.doc.type.schema.marks.comment;
        if (!type) return;
        tr.doc.descendants((node, pos) => {
            const mark = node.marks.find((item) => item.type === type && item.attrs.stringValue === threadId);
            if (mark) tr.removeMark(pos, pos + node.nodeSize, mark);
        });
    });
}

/**
 * "Kommentieren" in the formatting toolbar (package 31b): marks the selected
 * text with a new thread id and asks the comment list for the first comment.
 */
export function CommentButton({ pageId }: { pageId: string }) {
    const Components = useComponentsContext();
    const editor = useBlockNoteEditor(editorSchema);
    const selectedText = useEditorState({
        editor,
        selector: ({ editor }) => (editor.isEditable ? editor.getSelectedText().trim() : ""),
    });
    if (!Components || !selectedText) return null;

    return (
        <Components.FormattingToolbar.Button
            className="bn-button"
            label="Kommentieren"
            mainTooltip="Kommentieren"
            icon={<MessageSquarePlus size={18} />}
            onClick={() => {
                const threadId = crypto.randomUUID();
                editor.addStyles({ comment: threadId });
                requestComment({
                    pageId,
                    threadId,
                    quote: selectedText.slice(0, MAX_QUOTE_LENGTH),
                    cancel: () => removeCommentMark(editor, threadId),
                });
            }}
        />
    );
}
