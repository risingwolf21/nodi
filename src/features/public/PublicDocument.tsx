import { useCreateBlockNote } from "@blocknote/react";
import { BlockNoteView } from "@blocknote/mantine";
import { de } from "@blocknote/core/locales";
import "@blocknote/mantine/style.css";

import { editorTheme } from "@/components/editor/editor-theme";
import type { DocumentContent } from "@/features/editor/types";

/** Read-only content of a published page. */
export default function PublicDocument({ content }: { content: DocumentContent }) {
    const editor = useCreateBlockNote({
        dictionary: de,
        initialContent: content.length > 0 ? content : undefined,
    });

    return (
        <BlockNoteView
            editor={editor}
            editable={false}
            theme={{ light: editorTheme, dark: editorTheme }}
        />
    );
}
