import type { Theme } from "@blocknote/mantine";

// The app's tokens switch with the system color scheme, so one theme
// serves light and dark; BlockNote keeps its own colors for the rest.
export const editorTheme: Theme = {
    colors: {
        editor: { text: "var(--foreground)", background: "var(--background)" },
    },
    fontFamily: "var(--font-sans)",
};
