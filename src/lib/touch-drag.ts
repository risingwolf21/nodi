// HTML drag and drop starts only with a mouse on most touch screens
// (package 41). A long press on a draggable element starts the same drag
// here: drag events go to the elements under the finger, so the existing
// handlers of the sidebar, the board and the calendar work unchanged.

const LONG_PRESS_MS = 400;
// Moving further before the long press ends is scrolling, not dragging.
const MOVE_TOLERANCE_PX = 8;
// Near the edge of a scrolled area it scrolls on, like a mouse drag.
const EDGE_PX = 48;
const SCROLL_STEP_PX = 12;
const SCROLL_INTERVAL_MS = 16;

type Point = { x: number; y: number };

type ActiveDrag = {
    source: HTMLElement;
    data: DataTransfer;
    ghost: HTMLElement;
    grab: Point;
    at: Point;
    over: Element | null;
    accepted: boolean;
    scrollTimer: ReturnType<typeof setInterval> | null;
};

function fire(type: string, target: EventTarget, at: Point, data: DataTransfer): boolean {
    return target.dispatchEvent(
        new DragEvent(type, { bubbles: true, cancelable: true, clientX: at.x, clientY: at.y, dataTransfer: data }),
    );
}

function pointOf(touch: Touch): Point {
    return { x: touch.clientX, y: touch.clientY };
}

/** A copy of the dragged element that follows the finger. */
function makeGhost(source: HTMLElement): HTMLElement {
    const rect = source.getBoundingClientRect();
    const ghost = source.cloneNode(true) as HTMLElement;
    ghost.removeAttribute("id");
    ghost.setAttribute("aria-hidden", "true");
    Object.assign(ghost.style, {
        position: "fixed",
        left: "0",
        top: "0",
        width: `${rect.width}px`,
        height: `${rect.height}px`,
        margin: "0",
        pointerEvents: "none",
        opacity: "0.85",
        zIndex: "1000",
        boxShadow: "0 8px 24px rgb(0 0 0 / 0.2)",
    });
    document.body.append(ghost);
    return ghost;
}

/** The elements around one that scroll on this axis, nearest first. */
function scrollablesAround(element: Element | null, horizontal: boolean): HTMLElement[] {
    const found: HTMLElement[] = [];
    for (let current = element; current instanceof HTMLElement; current = current.parentElement) {
        const style = getComputedStyle(current);
        const overflow = horizontal ? style.overflowX : style.overflowY;
        const scrolls = horizontal
            ? current.scrollWidth > current.clientWidth
            : current.scrollHeight > current.clientHeight;
        if (scrolls && (overflow === "auto" || overflow === "scroll")) found.push(current);
    }
    return found;
}

/** -1 or 1 near (or past) an edge on the axis, 0 elsewhere or outside the other axis. */
function nearEdge(at: Point, rect: DOMRect, horizontal: boolean): number {
    const along = horizontal ? at.x : at.y;
    const across = horizontal ? at.y : at.x;
    const [low, high] = horizontal ? [rect.left, rect.right] : [rect.top, rect.bottom];
    const [crossLow, crossHigh] = horizontal ? [rect.top, rect.bottom] : [rect.left, rect.right];
    if (across < crossLow || across > crossHigh) return 0;
    if (along < low + EDGE_PX) return -1;
    if (along > high - EDGE_PX) return 1;
    return 0;
}

/**
 * Scroll step at a point: the area under the finger or around the dragged
 * element (the finger may be past its edge) towards the edge it is near.
 */
function edgeScroll(
    at: Point,
    over: Element | null,
    source: Element,
): { element: HTMLElement; dx: number; dy: number } | null {
    for (const horizontal of [false, true]) {
        const candidates = new Set([...scrollablesAround(over, horizontal), ...scrollablesAround(source, horizontal)]);
        for (const element of candidates) {
            const near = nearEdge(at, element.getBoundingClientRect(), horizontal);
            if (near === 0) continue;
            const room = horizontal
                ? near < 0
                    ? element.scrollLeft > 0
                    : element.scrollLeft + element.clientWidth < element.scrollWidth
                : near < 0
                  ? element.scrollTop > 0
                  : element.scrollTop + element.clientHeight < element.scrollHeight;
            if (!room) continue;
            return horizontal
                ? { element, dx: near * SCROLL_STEP_PX, dy: 0 }
                : { element, dx: 0, dy: near * SCROLL_STEP_PX };
        }
    }
    return null;
}

/** Starts dragging by long press on touch screens; returns how to stop. */
export function startTouchDrag(): () => void {
    let pending: { source: HTMLElement; start: Point; at: Point; timer: ReturnType<typeof setTimeout> } | null = null;
    let drag: ActiveDrag | null = null;

    const cancelPending = () => {
        if (pending) clearTimeout(pending.timer);
        pending = null;
    };

    const finish = (dropped: boolean) => {
        const current = drag;
        if (!current) return;
        drag = null;
        if (current.scrollTimer) clearInterval(current.scrollTimer);
        current.ghost.remove();
        if (current.over) {
            if (dropped && current.accepted) fire("drop", current.over, current.at, current.data);
            else fire("dragleave", current.over, current.at, current.data);
        }
        fire("dragend", current.source, current.at, current.data);
    };

    const moveTo = (at: Point) => {
        const current = drag;
        if (!current) return;
        current.at = at;
        current.ghost.style.transform = `translate(${at.x - current.grab.x}px, ${at.y - current.grab.y}px)`;
        const over = document.elementFromPoint(at.x, at.y);
        if (over !== current.over) {
            if (current.over) fire("dragleave", current.over, at, current.data);
            if (over) fire("dragenter", over, at, current.data);
            current.over = over;
        }
        // A handler that accepts the drop cancels dragover, as with a mouse.
        current.accepted = over !== null && !fire("dragover", over, at, current.data);

        const scroll = edgeScroll(at, over, current.source);
        if (scroll && !current.scrollTimer) {
            current.scrollTimer = setInterval(() => {
                const step = drag ? edgeScroll(drag.at, drag.over, drag.source) : null;
                if (!step || !drag) {
                    if (drag?.scrollTimer) clearInterval(drag.scrollTimer);
                    if (drag) drag.scrollTimer = null;
                    return;
                }
                step.element.scrollBy(step.dx, step.dy);
                moveTo(drag.at);
            }, SCROLL_INTERVAL_MS);
        }
    };

    const begin = () => {
        const started = pending;
        pending = null;
        if (!started || !started.source.isConnected) return;
        const data = new DataTransfer();
        if (!fire("dragstart", started.source, started.at, data)) return;
        const rect = started.source.getBoundingClientRect();
        drag = {
            source: started.source,
            data,
            ghost: makeGhost(started.source),
            grab: { x: started.at.x - rect.left, y: started.at.y - rect.top },
            at: started.at,
            over: null,
            accepted: false,
            scrollTimer: null,
        };
        navigator.vibrate?.(10);
        moveTo(started.at);
    };

    const onTouchStart = (event: TouchEvent) => {
        cancelPending();
        if (drag || event.touches.length !== 1 || !(event.target instanceof Element)) return;
        const source = event.target.closest<HTMLElement>('[draggable="true"]');
        // BlockNote's block handle has its own handling (and no touch menu).
        if (!source || source.closest(".bn-side-menu")) return;
        const start = pointOf(event.touches[0]);
        pending = { source, start, at: start, timer: setTimeout(begin, LONG_PRESS_MS) };
    };

    const onTouchMove = (event: TouchEvent) => {
        const touch = event.touches[0];
        if (!touch) return;
        if (drag) {
            // Dragging, not scrolling.
            event.preventDefault();
            moveTo(pointOf(touch));
            return;
        }
        if (pending) {
            const at = pointOf(touch);
            pending.at = at;
            if (Math.hypot(at.x - pending.start.x, at.y - pending.start.y) > MOVE_TOLERANCE_PX) cancelPending();
        }
    };

    const onTouchEnd = (event: TouchEvent) => {
        cancelPending();
        if (!drag) return;
        // No click on the element under the finger.
        event.preventDefault();
        finish(event.type === "touchend");
    };

    // A long press opens no context menu while it may become a drag.
    const onContextMenu = (event: Event) => {
        if (pending || drag) event.preventDefault();
    };

    // Where the browser drags natively (iOS), it does the work.
    const onNativeDragStart = (event: DragEvent) => {
        if (!event.isTrusted) return;
        cancelPending();
        if (drag) {
            if (drag.scrollTimer) clearInterval(drag.scrollTimer);
            drag.ghost.remove();
            drag = null;
        }
    };

    document.addEventListener("touchstart", onTouchStart, { passive: true });
    document.addEventListener("touchmove", onTouchMove, { passive: false });
    document.addEventListener("touchend", onTouchEnd, { passive: false });
    document.addEventListener("touchcancel", onTouchEnd, { passive: false });
    document.addEventListener("contextmenu", onContextMenu);
    document.addEventListener("dragstart", onNativeDragStart, true);

    return () => {
        cancelPending();
        finish(false);
        document.removeEventListener("touchstart", onTouchStart);
        document.removeEventListener("touchmove", onTouchMove);
        document.removeEventListener("touchend", onTouchEnd);
        document.removeEventListener("touchcancel", onTouchEnd);
        document.removeEventListener("contextmenu", onContextMenu);
        document.removeEventListener("dragstart", onNativeDragStart, true);
    };
}
