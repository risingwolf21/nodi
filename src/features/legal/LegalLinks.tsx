import { cn } from "@/lib/utils";
import { legalPageHref } from "./legal-page";

const linkClass = "underline-offset-4 hover:text-foreground hover:underline";

/** Impressum and privacy policy, on the login screen and in the workspace menu. */
export function LegalLinks({ className }: { className?: string }) {
    return (
        <p className={cn("flex justify-center gap-3 text-xs text-muted-foreground", className)}>
            <a href={legalPageHref("impressum")} className={linkClass}>
                Impressum
            </a>
            <a href={legalPageHref("datenschutz")} className={linkClass}>
                Datenschutz
            </a>
        </p>
    );
}
