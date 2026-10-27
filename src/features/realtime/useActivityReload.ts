import { useEffect, useRef, useState } from "react";
import { onPageActivity, type PageActivity } from "./page-activity";

// Several changes in a row (typing on another device, a moved tree) cause
// one reload.
const RELOAD_DELAY_MS = 1000;

/**
 * Counts live changes that `matches` cares about, a short while after the
 * last one; use it like useServerReload as a dependency of the load. While
 * `busy` says so (own writes in flight), the reload waits.
 */
export function useActivityReload(matches: (activity: PageActivity) => boolean, busy?: () => boolean): number {
    const [count, setCount] = useState(0);
    const matchesRef = useRef(matches);
    const busyRef = useRef(busy);
    useEffect(() => {
        matchesRef.current = matches;
        busyRef.current = busy;
    });

    useEffect(() => {
        let timer: ReturnType<typeof setTimeout> | null = null;
        const schedule = () => {
            if (timer) clearTimeout(timer);
            timer = setTimeout(() => {
                timer = null;
                if (busyRef.current?.()) schedule();
                else setCount((current) => current + 1);
            }, RELOAD_DELAY_MS);
        };
        const unsubscribe = onPageActivity((activity) => {
            if (matchesRef.current(activity)) schedule();
        });
        return () => {
            unsubscribe();
            if (timer) clearTimeout(timer);
        };
    }, []);

    return count;
}
