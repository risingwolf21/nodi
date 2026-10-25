import type { ReactNode } from "react";
import { ArrowLeft } from "lucide-react";
import { OPERATOR, isPlaceholder, operatorIncomplete } from "./operator";
import type { LegalPageKind } from "./legal-page";

const OSMF_PRIVACY = "https://osmfoundation.org/wiki/Privacy_Policy";
const GITHUB_PRIVACY = "https://docs.github.com/de/site-policy/privacy-policies/github-general-privacy-statement";
const SUPABASE_PRIVACY = "https://supabase.com/privacy";

/** A value from operator.ts; placeholders are marked so they stand out. */
function Value({ children }: { children: string }) {
    return isPlaceholder(children) ? (
        <mark className="rounded bg-amber-200 px-0.5 text-black">{children}</mark>
    ) : (
        children
    );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
    return (
        <section className="space-y-2">
            <h2 className="text-lg font-semibold">{title}</h2>
            {children}
        </section>
    );
}

function ExternalLink({ href, children }: { href: string; children: ReactNode }) {
    return (
        <a href={href} target="_blank" rel="noreferrer" className="text-brand underline-offset-4 hover:underline">
            {children}
        </a>
    );
}

function Contact() {
    return (
        <p>
            <Value>{OPERATOR.name}</Value>
            <br />
            <Value>{OPERATOR.street}</Value>
            <br />
            <Value>{OPERATOR.city}</Value>
            <br />
            E-Mail: <Value>{OPERATOR.email}</Value>
        </p>
    );
}

function Impressum() {
    return (
        <>
            <h1 className="text-3xl font-bold">Impressum</h1>
            <Section title="Angaben gemäß § 5 DDG">
                <Contact />
            </Section>
            <Section title="Verantwortlich für den Inhalt">
                <p>
                    <Value>{OPERATOR.name}</Value>, Anschrift wie oben.
                </p>
                <p>
                    Für Inhalte, die Nutzerinnen und Nutzer in ihren Workspaces anlegen oder über einen öffentlichen
                    Link teilen, sind diese selbst verantwortlich.
                </p>
            </Section>
        </>
    );
}

function Datenschutz() {
    return (
        <>
            <h1 className="text-3xl font-bold">Datenschutzerklärung</h1>
            <p className="text-sm text-muted-foreground">
                Stand: <Value>{OPERATOR.updated}</Value>
            </p>

            <Section title="1. Verantwortlich">
                <Contact />
            </Section>

            <Section title="2. Überblick">
                <p>
                    nodi ist eine Web-App für Notizen, Seiten und Datenbanken. Wir verarbeiten nur die Daten, die für
                    dein Konto und deine Inhalte nötig sind. Es gibt keine Werbung, kein Tracking und keine
                    Analyse-Dienste.
                </p>
            </Section>

            <Section title="3. Aufruf der App (GitHub Pages)">
                <p>
                    Die App-Dateien liefert GitHub Pages aus (GitHub, Inc., USA). Beim Aufruf verarbeitet GitHub
                    technisch notwendige Daten wie IP-Adresse, Zeitpunkt und Browser, um die Seite auszuliefern und vor
                    Missbrauch zu schützen. Rechtsgrundlage ist unser berechtigtes Interesse an einer sicheren
                    Bereitstellung (Art. 6 Abs. 1 lit. f DSGVO). Siehe die{" "}
                    <ExternalLink href={GITHUB_PRIVACY}>Datenschutzerklärung von GitHub</ExternalLink>.
                </p>
            </Section>

            <Section title="4. Konto und Inhalte (Supabase)">
                <p>
                    Konto, Seiten, Datenbanken, Kommentare, Freigaben und hochgeladene Dateien speichert Supabase
                    (Supabase, Inc.) für uns; Speicherort: <Value>{OPERATOR.supabaseRegion}</Value>. Verarbeitet werden
                    deine E-Mail-Adresse, dein Passwort (nur als Hash), deine Inhalte und technische Angaben wie
                    Zeitpunkte von Änderungen. Rechtsgrundlage ist die Bereitstellung der App, die du nutzt (Art. 6 Abs.
                    1 lit. b DSGVO). Siehe die{" "}
                    <ExternalLink href={SUPABASE_PRIVACY}>Datenschutzerklärung von Supabase</ExternalLink>.
                </p>
                <p>
                    Inhalte werden verschlüsselt übertragen (TLS) und von der Plattform verschlüsselt gespeichert, aber
                    nicht Ende-zu-Ende verschlüsselt. Wer die Datenbank betreibt, kann Inhalte technisch einsehen. Wir
                    tun das nur, wenn es für den Betrieb, zur Fehlerbehebung oder auf deinen Wunsch nötig ist.
                </p>
            </Section>

            <Section title="5. Teilen und öffentliche Links">
                <p>
                    Mitglieder eines Workspace und Personen, mit denen du eine Seite teilst, sehen diese Inhalte und
                    deine E-Mail-Adresse (etwa in der Mitgliederliste, bei Kommentaren und in Personen-Eigenschaften).
                    Eine Seite mit öffentlichem Link kann jede Person mit dem Link lesen, auch ohne Konto; wird der Link
                    veröffentlicht, können auch Suchmaschinen die Seite finden.
                </p>
            </Section>

            <Section title="6. Karten und Adresssuche (OpenStreetMap)">
                <p>
                    Nur wenn du eine Landkarte öffnest oder einen Ort suchst: Kartenkacheln kommen von
                    tile.openstreetmap.org, die Adresssuche nutzt Nominatim (beides OpenStreetMap Foundation,
                    Vereinigtes Königreich). Dabei erhält die OpenStreetMap Foundation deine IP-Adresse, den
                    Kartenausschnitt bzw. den Suchtext. Rechtsgrundlage ist Art. 6 Abs. 1 lit. b DSGVO. Siehe die{" "}
                    <ExternalLink href={OSMF_PRIVACY}>Datenschutzerklärung der OpenStreetMap Foundation</ExternalLink>.
                </p>
            </Section>

            <Section title="7. Daten auf deinem Gerät">
                <p>
                    Damit nodi offline funktioniert, speichert die App auf deinem Gerät: deine Anmeldesitzung sowie
                    Konto-ID und E-Mail-Adresse (Local Storage), Kopien geöffneter Seiten, den Seitenbaum und angesehene
                    Bilder (IndexedDB) und die App-Dateien (Service Worker). Das ist für die Funktion der App technisch
                    erforderlich (§ 25 Abs. 2 Nr. 2 TDDDG). Beim Abmelden und beim Löschen des Kontos werden die Daten
                    deines Kontos auf dem Gerät gelöscht; die App-Dateien bleiben.
                </p>
                <p>
                    Ein Notion-Import wird nur in deinem Browser gelesen; an den Server gehen nur die importierten
                    Seiten und Dateien.
                </p>
            </Section>

            <Section title="8. Speicherdauer und Löschen">
                <p>
                    Deine Daten bleiben gespeichert, bis du sie löschst oder dein Konto löschst (Workspace-Menü → „Konto
                    löschen …“). Dabei werden deine privaten Seiten gelöscht; Seiten im geteilten Bereich eines
                    Workspace bleiben für dessen Mitglieder erhalten. Hochgeladene Dateien gelöschter Seiten werden
                    derzeit nicht automatisch entfernt; auf Anfrage löschen wir sie.
                </p>
            </Section>

            <Section title="9. Deine Rechte">
                <p>
                    Du hast das Recht auf Auskunft, Berichtigung, Löschung, Einschränkung der Verarbeitung,
                    Datenübertragbarkeit und Widerspruch (Art. 15 bis 21 DSGVO). Wende dich dafür an{" "}
                    <Value>{OPERATOR.email}</Value>. Außerdem kannst du dich bei einer Datenschutz-Aufsichtsbehörde
                    beschweren, etwa bei <Value>{OPERATOR.supervisoryAuthority}</Value>.
                </p>
            </Section>
        </>
    );
}

/** Impressum and privacy policy (package 33b); a template until operator.ts is filled in. */
export function LegalPage({ kind }: { kind: LegalPageKind }) {
    return (
        <main className="min-h-svh bg-background px-[max(1rem,env(safe-area-inset-left))] py-[max(2rem,env(safe-area-inset-top))]">
            <article className="mx-auto max-w-2xl space-y-6 text-sm leading-relaxed">
                <a
                    href={import.meta.env.BASE_URL}
                    className="inline-flex items-center gap-1.5 text-muted-foreground hover:text-foreground"
                >
                    <ArrowLeft className="size-4" />
                    Zu nodi
                </a>
                {operatorIncomplete && (
                    <p
                        role="note"
                        className="rounded-md border border-amber-400 bg-amber-50 p-3 text-amber-900 dark:bg-amber-950 dark:text-amber-100"
                    >
                        Vorlage: Die markierten Angaben sind noch nicht ausgefüllt (src/features/legal/operator.ts).
                    </p>
                )}
                {kind === "impressum" ? <Impressum /> : <Datenschutz />}
            </article>
        </main>
    );
}
