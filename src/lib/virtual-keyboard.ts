/**
 * The on-screen keyboard on phones (package 20). iOS does not shrink the
 * page when the keyboard opens, only the visual viewport; the app would
 * then be taller than what is visible and iOS pans it around while typing.
 * While the keyboard is open, `<html data-keyboard-open>` and the variables
 * `--keyboard-viewport-top/-height` let the CSS fit the app into the
 * visible area (see `index.css`).
 */

// The keyboard takes more than this; browser bars that come and go take less.
const KEYBOARD_MIN_HEIGHT = 150;
// A new width (rotation) starts over: the full height is a different one.
const WIDTH_CHANGE = 0.2;

export type ViewportSample = { width: number; height: number; scale: number };
export type KeyboardDetector = { fullHeight: number; width: number };

/**
 * Whether the keyboard is open: the visible height is clearly below the
 * largest one seen at this width. A zoomed page (pinch) is never "keyboard".
 */
export function detectKeyboard(sample: ViewportSample, detector: KeyboardDetector): boolean {
    if (Math.abs(sample.width - detector.width) > detector.width * WIDTH_CHANGE) {
        detector.width = sample.width;
        detector.fullHeight = 0;
    }
    detector.fullHeight = Math.max(detector.fullHeight, sample.height);
    return Math.abs(sample.scale - 1) < 0.01 && detector.fullHeight - sample.height > KEYBOARD_MIN_HEIGHT;
}

const isTouchDevice = () => navigator.maxTouchPoints > 0 && window.matchMedia("(pointer: coarse)").matches;

/** Follows the keyboard until the returned function is called. Nothing happens without touch. */
export function trackVirtualKeyboard(): () => void {
    const viewport = window.visualViewport;
    if (!viewport || !isTouchDevice()) return () => {};

    const root = document.documentElement;
    const detector: KeyboardDetector = { fullHeight: 0, width: viewport.width };
    const update = () => {
        const open = detectKeyboard(
            { width: viewport.width, height: viewport.height, scale: viewport.scale },
            detector,
        );
        root.toggleAttribute("data-keyboard-open", open);
        root.style.setProperty("--keyboard-viewport-top", `${viewport.offsetTop}px`);
        root.style.setProperty("--keyboard-viewport-height", `${viewport.height}px`);
    };

    update();
    viewport.addEventListener("resize", update);
    viewport.addEventListener("scroll", update);
    return () => {
        viewport.removeEventListener("resize", update);
        viewport.removeEventListener("scroll", update);
        root.removeAttribute("data-keyboard-open");
        root.style.removeProperty("--keyboard-viewport-top");
        root.style.removeProperty("--keyboard-viewport-height");
    };
}
