import { useCreateBlockNote } from "@blocknote/react";
import { BlockNoteView } from "@blocknote/mantine";
import { de } from "@blocknote/core/locales";
import "@blocknote/mantine/style.css";

import { editorTheme } from "@/components/editor/editor-theme";
import type { DocumentContent } from "@/features/editor/types";
import { createFileUrlResolver } from "@/features/files/services/file-url-resolver";
import { signedFileUrl } from "@/features/files/services/page-files";

/** Read-only content of a published page. */
export default function PublicDocument({ content }: { content: DocumentContent }) {
    const editor = useCreateBlockNote({
        dictionary: de,
        initialContent: content.length > 0 ? content : undefined,
        // The public link decides; nothing is kept on the device.
        resolveFileUrl: createFileUrlResolver({ signedUrl: signedFileUrl }),
    });

    return <BlockNoteView editor={editor} editable={false} theme={{ light: editorTheme, dark: editorTheme }} />;
}
