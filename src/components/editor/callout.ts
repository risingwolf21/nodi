/** Backgrounds of a callout (package 22); the names match BlockNote's colors. */
export const CALLOUT_COLORS = [
    { value: "gray", label: "Grau" },
    { value: "brown", label: "Braun" },
    { value: "orange", label: "Orange" },
    { value: "yellow", label: "Gelb" },
    { value: "green", label: "Grün" },
    { value: "blue", label: "Blau" },
    { value: "purple", label: "Lila" },
    { value: "pink", label: "Rosa" },
    { value: "red", label: "Rot" },
] as const;

export type CalloutColor = (typeof CALLOUT_COLORS)[number]["value"];

export const DEFAULT_CALLOUT_EMOJI = "💡";

export const isCalloutColor = (value: string): value is CalloutColor =>
    CALLOUT_COLORS.some((color) => color.value === value);
