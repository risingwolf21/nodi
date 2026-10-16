# Nodi -- Projektkontext und Architekturleitfaden für Claude Code

> Zweck: Diese Datei als Projektbriefing und dauerhafte Arbeitsanweisung
> für Claude Code verwenden. Sie beschreibt den bekannten Ist-Zustand,
> die Ziele und die Regeln für eine schrittweise, saubere
> Weiterentwicklung. Nicht bestätigte Details sind ausdrücklich als
> offen markiert.

## 1. Rolle und Arbeitsweise

Du arbeitest als erfahrener Softwarearchitekt und Senior
React-/TypeScript-Entwickler an **Nodi**, einer webbasierten
Wissensmanagement-App.

Arbeite pragmatisch, sicher und in kleinen, überprüfbaren Schritten:

1.  **Erst untersuchen, dann ändern.** Lies die betroffenen Dateien,
    prüfe vorhandene Muster und suche nach bestehenden Funktionen, bevor
    du etwas neu implementierst.
2.  **Keine unbegründeten Annahmen.** Wenn eine wichtige fachliche
    Entscheidung oder ein Schema unklar ist, stelle eine konkrete
    Rückfrage oder dokumentiere die Annahme klar, bevor du darauf
    aufbaust.
3.  **Kleine Änderungen.** Ändere nur, was für den aktuellen Schritt
    nötig ist. Keine großflächigen Refactorings nebenbei.
4.  **Bestehende Funktionalität erhalten.** Verändere keine bestehenden
    Auth-, Datenbank-, Routing- oder Editor-Abläufe ohne
    nachvollziehbaren Grund.
5.  **Qualität nachweisen.** Nach Änderungen passende Tests sowie
    `npm run lint` und `npm run build` ausführen. Fehler klar melden und
    nicht behaupten, ein Test sei erfolgreich gewesen, wenn er nicht
    ausgeführt wurde.
6.  **Erkläre die Änderung.** Nenne geänderte Dateien, die
    Architekturentscheidung, die Testresultate und einen konkreten
    manuellen Test.
7.  **Keine unnötige Abstraktion.** Baue keine generischen Frameworks,
    Service-Layer oder Hook-Sammlungen, solange sie nicht einen klaren
    Zweck erfüllen.
8.  **Keine Secrets ausgeben.** Niemals Supabase-Schlüssel, Tokens,
    `.env`-Inhalte oder andere Geheimnisse in Logs, Dokumentation oder
    Git einchecken. Nur öffentliche Client-Konfiguration darf im
    Frontend verwendet werden; Supabase-RLS bleibt eine
    Sicherheitsgrenze.
9.  **Keine stillen Datenmigrationen.** Änderungen an Datenbankschema,
    RLS, RPCs oder bestehenden Daten erfordern eine nachvollziehbare
    Migration und passende Prüfung.
10. **Nicht alles auf einmal implementieren.** Zuerst Architektur und
    Plan, dann kleine vertikale Schritte. Wenn mehrere große
    Entscheidungen nötig sind, arbeite die jeweils erste ab und warte
    auf Feedback.

Kommuniziere standardmäßig auf Deutsch, sofern der Nutzer nicht
ausdrücklich Englisch wünscht. Verwende konkrete Dateipfade und
ausführbare Befehle.

## 2. Produkt und Ziel

**Nodi** ist eine React-Web-App zur Verwaltung von Wissensseiten und
Dokumenten. Der Editor basiert auf BlockNote; Supabase ist Backend und
Datenspeicher.

Ein wichtiges Produktziel ist, Nodi als installierbare PWA auf **iOS und
Android** nutzbar zu machen. Die App soll auch ohne Netzwerk sinnvoll
funktionieren.

### Explizite Anforderungen

-   React + TypeScript mit klarer, wartbarer Struktur.
-   Bestehende BlockNote-Editorfunktionalität erhalten.
-   Supabase-Integration und Authentifizierung beibehalten.
-   PWA auf iOS und Android installierbar machen.
-   Ein neues, eigenständiges Nodi-App-Icon erstellen und in den
    passenden Plattformgrößen bereitstellen.
-   Bereits geladene Seiten **offline lesen und bearbeiten** können.
-   Offline vorgenommene Änderungen lokal dauerhaft speichern und später
    automatisch synchronisieren.
-   Konfliktstrategie: **Last-Write-Wins (LWW)**.
-   Die lokale Warteschlange muss Neustarts und vorübergehende
    Verbindungsabbrüche überstehen.
-   GitHub-Pages-Deployment unter `https://risingwolf21.github.io/nodi/`
    unterstützen.
-   Änderungen schrittweise entwickeln und testen.

### Getroffene Entscheidungen (Nutzer, 2026-10-16)

Diese Entscheidungen sind verbindlich:

-   **LWW-Ordnung:** Maßgeblich ist die **Bearbeitungszeit auf dem
    Client**, durchgesetzt vom Server. Eine serverseitige
    Funktion/RPC übernimmt einen Schreibvorgang nur, wenn seine
    Bearbeitungszeit neuer ist als der gespeicherte Stand; Zeitstempel
    aus der Zukunft werden auf die Serverzeit `now()` gekappt; bei
    Gleichstand entscheidet die Mutation-ID.
-   **Offline-Umfang:** Dokumentinhalt bereits geöffneter Seiten ist
    offline les- und bearbeitbar. Workspaces und Seitenbaum werden
    **nur lesend** gecacht.
-   **Neue Seiten offline:** vorerst **nein**. Seiten-IDs werden schon
    clientseitig erzeugt (`crypto.randomUUID()`), eine spätere
    Erweiterung bleibt möglich.
-   **Logout mit ungesyncten Änderungen:** zuerst synchronisieren. Ist
    das nicht möglich, warnen und wählen lassen: „Abbrechen" oder
    „Trotzdem abmelden und lokale Änderungen verwerfen". Danach den
    lokalen Cache dieses Kontos löschen.
-   **Berechtigungen:** `visibility` und `owner_id` einer Seite darf
    nur deren Owner ändern.
-   **Tests:** Vitest (mit `fake-indexeddb` für IndexedDB-Logik) darf
    eingeführt werden.
-   **Merge Requests:** Jedes Arbeitspaket bekommt einen eigenen Pull
    Request mit nachvollziehbarer Beschreibung. Die CI-Pipeline
    (`.github/workflows/ci.yml`) muss grün sein.

### Noch nicht festgelegt

-   Ob Konfliktinformationen für den Nutzer sichtbar sein sollen, obwohl
    die fachliche Strategie LWW ist.
-   Ob überschriebene Inhalte als Konfliktkopie aufbewahrt werden sollen.

## 3. Bekannter technischer Ist-Zustand

Die folgenden Angaben stammen aus einer bisherigen Codeprüfung. Vor
Änderungen erneut prüfen, weil sich der Code zwischenzeitlich geändert
haben kann.

### `package.json`

-   Projektname: `nodi`
-   `"type": "module"`
-   Skripte:
    -   `npm run dev` → `vite`
    -   `npm run build` → `tsc -b && vite build`
    -   `npm run lint` → `eslint .`
    -   `npm run preview` → `vite preview`
    -   `npm test` → `vitest run` (seit Paket 3)
-   Runtime-Abhängigkeiten umfassen unter anderem:
    -   React `^19.2.8`
    -   React DOM `^19.2.8`
    -   Vite `^8.3.0`
    -   TypeScript `~6.0.2`
    -   `@supabase/supabase-js` `^2.118.0`
    -   `@blocknote/core`, `@blocknote/react`, `@blocknote/mantine`
        jeweils `^0.56.0`
    -   Tailwind CSS 4 und `@tailwindcss/vite`
    -   shadcn-Ökosystem, `lucide-react`, Geist Variable Font
-   `vite-plugin-pwa` war in der geprüften `package.json` **nicht
    vorhanden**.

Versionsnummern vor Installation oder Upgrade erneut prüfen. Keine
größeren Versionsupdates durchführen, nur um eine PWA einzurichten.

### `vite.config.ts`

Der bisherige Inhalt enthält:

``` ts
export default defineConfig({
  base: "/nodi/",
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "src"),
    },
  },
});
```

Der `base`-Pfad ist für GitHub Pages wichtig. PWA-Manifest, Service
Worker, Icons und alle Assets müssen mit `/nodi/` funktionieren. **Keine
unbedachten root-absoluten URLs** einführen, die auf GitHub Pages an der
falschen Stelle aufgelöst werden könnten. Ausnahme: Verweise in
`index.html` auf Dateien in `public/` (z. B. `/favicon.svg`) schreibt
Vite im Build zu `/nodi/…` um; das ist geprüft. In Laufzeit-Code, im
Manifest und im Service Worker gilt diese Umschreibung **nicht**.

### `index.html`

Bisherige Struktur (seit Paket 1 mit `lang="de"`):

``` html
<!doctype html>
<html lang="de">
  <head>
    <meta charset="UTF-8" />
    <link rel="icon" type="image/svg+xml" href="/favicon.svg" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>nodi</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
```

Bekannte Punkte:

-   Der Favicon-Pfad `/favicon.svg` funktioniert unter `/nodi/`, weil
    Vite ihn im Build umschreibt. `favicon.svg` ist aber noch das
    Vite-Logo und wird mit dem neuen Icon ersetzt.
-   Manifest-Link, `theme-color` und iOS-PWA-Metadaten fehlen noch.
-   Viewport sollte für iOS Safe Areas `viewport-fit=cover`
    berücksichtigen.

### `src/main.tsx`

Bisheriger Inhalt:

``` tsx
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { AuthProvider } from "@/lib/auth-provider";

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <AuthProvider>
      <App />
    </AuthProvider>
  </StrictMode>,
)
```

`AuthProvider` umschließt die App. `@/` ist der Alias für `src/`.

### Styles

-   `src/index.css` verwendet Tailwind CSS 4, `tw-animate-css`,
    `shadcn/tailwind.css` und `@fontsource-variable/geist`.
-   Es gibt Light- und Dark-Theme-CSS-Variablen.
-   Die ungenutzte Vite-Vorlage `src/App.css` wurde in Paket 1 entfernt.
-   Mobile Layout und iOS Safe Areas müssen in der tatsächlichen App
    geprüft werden. Keine globale CSS-Neustrukturierung ohne Bedarf.

### Bekannte Dateien

Stand nach Paket 1:

``` text
.env.example
index.html
vite.config.ts
.github/workflows/
  ci.yml                    # Lint, Build, DB-Migrationen, pgTAP-Tests
  deploy.yml                # GitHub Pages, nur bei Push auf `production`
src/
  App.tsx
  main.tsx
  index.css
  vite-env.d.ts
  components/
    auth/AuthForm.tsx
    editor/BlockEditor.tsx
    ui/                     # shadcn: button, card, input, label, separator
    workspace/WorkspaceHome.tsx
  features/
    pages/
      CreatePageForm.tsx
      PageTree.tsx
      PageTreeItem.tsx
      types.ts
      components/PageActionsDialog.tsx
      components/TrashView.tsx
      hooks/usePages.ts
  lib/
    auth-context.tsx
    auth-provider.tsx
    supabase.ts
    use-auth.tsx
    utils.ts                # re-exportiert `cn` aus dem Paket `cn`
public/
  favicon.svg               # noch Vite-Logo
supabase/
  config.toml
  migrations/               # profiles, workspaces, pages, page_shares
  tests/page_permissions.test.sql   # pgTAP
```

Die tatsächliche Dateistruktur vor neuen Dateien erneut untersuchen.

### TypeScript

`tsconfig.app.json` setzt `strict` nicht explizit. Unter TypeScript 6
ist `strict` aber Standard (geprüft mit TS 6.0.3).

## 4. Bekannter Editor-Ablauf und wichtige Risiken

Datei: `src/components/editor/BlockEditor.tsx`

Der bisher geprüfte Editor:

-   nutzt `useCreateBlockNote`, `useEditorChange` und `BlockNoteView`;
-   erhält `pageId` als Prop;
-   lädt `document` aus Supabase-Tabelle `page_documents`, gefiltert
    nach `page_id`;
-   verwendet `maybeSingle()` und behandelt einen nicht vorhandenen
    Datensatz als leeres Dokument;
-   speichert Änderungen nach etwa **800 ms Debounce** per `upsert`;
-   schreibt Felder `page_id`, `document`, `updated_at`, `updated_by`;
-   serialisiert das Dokument vor dem Speichern als Snapshot;
-   führt Schreibvorgänge über eine Promise-Warteschlange nacheinander
    aus;
-   hält Statusmeldungen wie „Gespeichert", „Speichert ..." und
    „Speichern fehlgeschlagen" vor;
-   versucht beim Verlassen des Editors, ausstehende Änderungen an
    Supabase zu übergeben.

### Einschränkungen des bisherigen Ansatzes

1.  Der Editor lädt ausschließlich von Supabase. Offline ist der
    Ladevorgang nicht möglich.
2.  Der Debounce und die Promise-Warteschlange liegen nur im
    Arbeitsspeicher.
3.  Bei einem Netzwerkfehler bleibt keine dauerhafte lokale
    Synchronisierungswarteschlange bestehen.
4.  Ein Aufruf beim Unmount garantiert nicht, dass ein asynchroner
    Schreibvorgang abgeschlossen wird, bevor die Seite geschlossen oder
    die App beendet wird.
5.  `updated_at: new Date().toISOString()` stammt aus der Client-Uhr.
    Diese kann falsch oder gegenüber anderen Geräten abweichend sein.
6.  Ein `upsert` mit clientseitigem Zeitstempel setzt keine
    serverseitige Konfliktregel um. Zwei Geräte können sich gegenseitig
    Änderungen überschreiben, ohne dass eine echte LWW-Entscheidung nach
    einer verlässlichen Ordnung getroffen wird.
7.  `saveQueue` verhindert nur innerhalb dieser Editor-Instanz das
    Überholen eigener Schreibvorgänge; sie synchronisiert nicht mehrere
    Geräte oder Tabs.

**Wichtig:** Die PWA-Cache-Funktion löst diese Probleme nicht.
Offline-Dokumentbearbeitung braucht zusätzlich eine lokale Datenbank und
eine robuste Synchronisierung.

## 5. Architekturprinzipien

Die Architektur soll sauber sein, aber nicht unnötig komplex. Verwende
die folgenden Leitlinien.

### TypeScript

-   `strict`-Modus und vorhandene TypeScript-Regeln beibehalten.
-   Keine unkontrollierte Verwendung von `any`. Typen nicht mit Type
    Assertions erzwingen, wenn sich die Daten korrekt validieren lassen.
-   Daten von Supabase und IndexedDB als externe Daten behandeln und an
    passenden Grenzen validieren.
-   Domänentypen von UI-Zuständen und Datenbank-DTOs unterscheiden, wenn
    sie fachlich unterschiedliche Aufgaben haben.
-   Keine Typdefinitionen duplizieren, wenn sie sinnvoll an einer
    gemeinsamen Stelle gepflegt werden können.

### React

-   Komponenten primär für Darstellung und Nutzerinteraktion verwenden.
-   Hooks für wiederverwendbare React-Logik; Services/Module für Logik,
    die nicht an React gebunden ist.
-   Keine unnötigen `useEffect`-Ketten für abgeleitete Zustände.
-   Abgeleitete Werte direkt berechnen, statt sie redundant im State zu
    speichern.
-   Effekt-Abhängigkeiten korrekt halten und Lifecycle-Probleme
    vermeiden.
-   Keine langen asynchronen Geschäftsabläufe direkt in UI-Komponenten,
    wenn sie besser in einen klar abgegrenzten Service gehören.
-   Keine globalen Stores hinzufügen, bevor ein konkreter Bedarf belegt
    ist.

### Verantwortlichkeiten und Abhängigkeiten

-   UI-Komponenten sollen nicht die komplette
    Offline-Synchronisierungslogik implementieren.
-   Supabase-Zugriffe, lokale Persistenz und Konfliktregeln sollten klar
    getrennt sein.
-   Domänenlogik möglichst unabhängig von React und UI halten.
-   Abhängigkeiten sollen in eine Richtung zeigen: UI → Anwendungslogik
    → Datenzugriff.
-   Die Datenzugriffsschicht sollte nicht von React-Komponenten
    abhängen.
-   Vermeide zyklische Imports.
-   Abstraktionen nur dort einführen, wo sie Verantwortlichkeiten
    tatsächlich trennen oder Tests vereinfachen.

### Fehlerbehandlung und Observability

-   Fehler nicht stillschweigend verschlucken.
-   Nutzerfreundliche Fehlermeldungen in der UI; technische Details
    angemessen für Debugging protokollieren.
-   Keine Dokumentinhalte, Tokens oder personenbezogenen Daten unnötig
    loggen.
-   Netzwerkfehler von Validierungs-, Berechtigungs- und permanenten
    Serverfehlern unterscheiden.
-   Wiederholungen nur für geeignete temporäre Fehler durchführen. Keine
    endlosen Retry-Schleifen.
-   Offline-/Sync-Status sichtbar und verständlich darstellen.

### Clean Code

-   Aussagekräftige Namen; keine kryptischen Abkürzungen.
-   Funktionen klein halten und jeweils eine klar erkennbare
    Verantwortung geben.
-   Duplikation vermeiden, aber nicht durch übergenerische Frameworks
    ersetzen.
-   Magische Werte als benannte Konstanten führen, wenn sie fachlich
    relevant sind.
-   Kommentare erklären vor allem Gründe, Invarianten und nicht
    offensichtliche Entscheidungen; sie wiederholen nicht den Code.
-   Veraltete Kommentare und ungenutzte Dateien erst entfernen, nachdem
    ihre Nutzung geprüft wurde.
-   Keine unnötigen Änderungen an Formatierung oder Importstil in
    unbeteiligten Dateien.

## 6. Vorgeschlagene Projektstruktur -- nur schrittweise einführen

Die aktuelle Struktur ist klein. Nicht alles auf einmal verschieben.
Nutze eine Feature-orientierte Struktur, wenn die jeweiligen
Verantwortlichkeiten tatsächlich entstehen.

Möglicher Zielzustand:

``` text
src/
  app/
    App.tsx
    providers/
    routes/
  components/
    ui/                     # bestehende shadcn-Komponenten
    layout/                 # gemeinsame Layout-Bausteine, falls nötig
  features/
    auth/
      components/
      hooks/
      services/
      types.ts
    pages/
      components/
      hooks/
      services/
      types.ts
    editor/
      components/
      hooks/
      services/
      types.ts
  lib/
    supabase.ts             # Supabase-Client und zentrale Konfiguration
    auth/                   # Auth-Hilfsfunktionen, wenn sinnvoll
  services/
    offline/                # nur wenn mehrere Features den Dienst benötigen
      database.ts
      sync-engine.ts
      sync-queue.ts
      types.ts
  assets/
  index.css
  main.tsx
public/
  icons/
  manifest.webmanifest
```

Diese Struktur ist ein Vorschlag, keine Pflicht. Wenn die bestehende App
bereits etablierte Muster hat, diese bevorzugt weiterverwenden.
Insbesondere soll nicht allein wegen der Architektur Dateien verschoben
werden.

### Wo Code hingehört

-   `components/ui/`: generische UI-Primitives.
-   `features/pages/components/`: Seitennavigation, Seitenaktionen und
    Seitenformulare.
-   `features/editor/components/`: BlockNote-UI und Editor-Status.
-   Feature-Service: fachliche Abläufe eines Features, etwa Dokument
    laden oder speichern.
-   Offline-Service: IndexedDB, persistente Warteschlange und
    Synchronisierung, sofern diese Verantwortlichkeiten nicht nur für
    ein einzelnes kleines Modul relevant sind.
-   `lib/supabase.ts`: Client-Initialisierung, keine umfangreiche
    Geschäftslogik.
-   `app/`: Root-Provider, App-Zusammensetzung und Routing, soweit dies
    im Projekt benötigt wird.

## 7. PWA-Anforderungen

### Technische Ziele

-   PWA mit Manifest und Service Worker.
-   Installierbarkeit auf iOS und Android.
-   Korrekte Icons in den benötigten Größen und Formaten.
-   `name`, `short_name`, `start_url`, `scope`, `display`,
    `theme_color`, `background_color` und Icons im Manifest sinnvoll
    definieren.
-   Pfade müssen für GitHub Pages unter `/nodi/` korrekt sein.
-   iOS-Metadaten, `apple-touch-icon` und Safe-Area-Verhalten
    berücksichtigen.
-   Service Worker darf Updates nicht unkontrolliert oder zu einem
    inkonsistenten Zustand führen.
-   Keine vertraulichen oder nutzerspezifischen Supabase-Antworten
    unbedacht im Cache speichern.
-   Authentifizierte API-Antworten nicht pauschal mit einem
    Cache-First-Verfahren behandeln.
-   Offline-Start der App und Offline-Verfügbarkeit der zuletzt
    gespeicherten Seiten getrennt testen.

### App-Icon

Ein neues Icon ist gewünscht. Die zuvor generierte visuelle
Branding-Tafel ist **kein fertiges Icon-Asset**. Erzeuge bzw. exportiere
ein eigenständiges, quadratisches App-Icon, das auch bei kleiner
Darstellung lesbar ist. Erstelle daraus die tatsächlich benötigten
Assets und prüfe sie im Manifest und auf iOS. Erfinde keine Dateipfade,
bevor Dateien wirklich existieren.

Gestaltungsvorgabe des Nutzers (Branding-Tafel vom 2026-10-16):

-   Abgerundetes Quadrat mit Verlauf von Indigo (oben links) zu sehr
    dunklem Navy (unten rechts).
-   Darin ein weißes, kräftiges kleines „n" als Bogen; am Fuß des
    rechten Schenkels ein violetter Punkt (`#6366F1`).
-   Wortmarke „nodi" (klein, fett, dunkles Navy), Claim „Deine Ideen.
    Überall."
-   Manifest-Werte: `name`/`short_name` „nodi", `description` „Deine
    Ideen. Überall.", `display` `standalone`, `background_color`
    `#0B0F14`, `theme_color` `#6366F1`.
-   Größen: 192×192 und 512×512 (Android/PWA), 180×180
    (`apple-touch-icon`); 1024×1024 nur falls ein App-Store-Export
    nötig wird.
-   Achtung: Die Tafel zeigt root-absolute Icon-Pfade (`/icons/…`) und
    `purpose: "any maskable"` in einem Eintrag. Für `/nodi/` relative
    Pfade verwenden und `any` und `maskable` als getrennte Icons mit
    passendem Innenabstand bereitstellen.

## 8. Offline-Dokumente und Synchronisierung

### Grundprinzip

Ein Service Worker cached statische App-Dateien. Dokumentinhalte und
ausstehende Änderungen gehören dagegen in eine lokale Datenbank,
beispielsweise IndexedDB.

Eine mögliche Architektur:

1.  **Local document store:** speichert den zuletzt bekannten
    Dokumentstand dauerhaft.
2.  **Pending mutation queue:** speichert lokale Änderungen mit stabiler
    Mutation-ID, Dokument-ID, Inhalt/Snapshot und notwendigen
    Versions-/Zeitinformationen.
3.  **Sync engine:** verarbeitet ausstehende Änderungen, sobald eine
    Verbindung verfügbar ist und der Nutzer authentifiziert ist.
4.  **Remote document repository:** kapselt Supabase-Lese- und
    Schreibvorgänge.
5.  **UI status:** zeigt „Offline", „Lokale Änderungen",
    „Synchronisiert" oder einen behebbaren Fehler.
6.  **Recovery:** ausstehende Änderungen bleiben bei Reload,
    App-Neustart und temporären Netzwerkfehlern erhalten.

Die konkrete Umsetzung soll erst nach Prüfung der vorhandenen Tabellen,
RLS-Regeln, Authentifizierung und des vollständigen `BlockEditor.tsx`
festgelegt werden.

### Anforderungen an die lokale Warteschlange

-   Änderungen lokal dauerhaft speichern, bevor sie als sicher lokal
    gesichert angezeigt werden.
-   Mehrere schnelle Änderungen am selben Dokument können sinnvoll
    zusammengefasst werden; die letzte lokale Version muss aber erhalten
    bleiben.
-   Jede Mutation muss idempotent wiederholbar sein oder eine stabile ID
    besitzen, damit Wiederholungen nicht zu unerwarteten Nebeneffekten
    führen.
-   Fehlerhafte Mutationen dürfen nicht stillschweigend gelöscht werden.
-   Temporäre Netzwerkfehler sollen später erneut versucht werden.
-   Bei Abmeldung/Kontowechsel darf ein Dokument nicht versehentlich mit
    einem anderen Konto synchronisiert werden.
-   App-Neustart muss ausstehende Änderungen wiederfinden.
-   Ein Unmount-Callback allein ist keine ausreichende
    Persistenzstrategie.
-   Sync nicht nur von `navigator.onLine` abhängig machen: Dieser Wert
    ist ein Hinweis, kein sicherer Nachweis, dass Supabase erreichbar
    ist.
-   Mehrere Tabs/Geräte und Rennen zwischen Lese- und Schreibvorgängen
    berücksichtigen.

### Last-Write-Wins (LWW)

LWW ist die gewünschte fachliche Konfliktstrategie. Die Implementierung
darf nicht einfach blind `new Date()` auf dem Client als Wahrheit
verwenden.

Vor Implementierung klären und dokumentieren:

-   Was bedeutet „latest": serverseitig bestätigte Reihenfolge,
    serverseitiger Zeitstempel oder eine andere definierte Ordnung?
-   Wie werden gleichzeitige Updates geordnet?
-   Wie wird verhindert, dass ein älterer, verspäteter Request einen
    neueren Stand überschreibt?
-   Welche Operation ist atomar, wenn mehrere Geräte gleichzeitig
    schreiben?

Bevorzugte Richtung: eine klar definierte, serverseitig durchgesetzte
Konfliktregel, zum Beispiel über eine geeignete PostgreSQL-Funktion/RPC
oder atomare bedingte Updates, passend zum tatsächlichen Schema. Ein
gewöhnliches `upsert` mit Client-Zeitstempel genügt dafür nicht. Keine
Datenbankfunktion oder Migration erfinden, bevor die tatsächlichen
Spalten, Constraints und RLS-Regeln geprüft sind.

LWW kann Änderungen eines anderen Geräts bewusst überschreiben. Falls
die App später wertvolle Inhalte schützt, sollte geprüft werden, ob
überschriebenen Inhalt als Konfliktkopie aufbewahrt werden soll; das ist
eine fachliche Entscheidung und nicht automatisch einzuführen.

### Lokale Daten und Sicherheit

-   Lokale Dokumente sind auf dem Gerät gespeichert und können auf
    gemeinsam genutzten Geräten ein Datenschutzrisiko sein.
-   Keine anderen Nutzer oder Konten dürfen Zugriff auf die lokale
    Warteschlange bekommen.
-   Beim Logout muss eine klare, dokumentierte Policy greifen:
    ausstehende Änderungen entweder sicher synchronisieren, geschützt
    aufbewahren oder nach ausdrücklicher Produktentscheidung löschen.
    Nicht stillschweigend Daten verlieren.
-   Supabase RLS bleibt maßgeblich für den Serverzugriff.
-   Keine Auth-Tokens in eigenen IndexedDB-Tabellen duplizieren, sofern
    es keinen zwingenden Grund gibt.

## 9. GitHub Pages und Build

Deployment-Ziel: `https://risingwolf21.github.io/nodi/`.

-   `base: "/nodi/"` beibehalten, solange dies das Deployment-Ziel ist.
-   Asset- und Navigationspfade unter diesem Prefix prüfen.
-   Nach PWA-Änderungen prüfen, dass Manifest, Icons und Service Worker
    im Build aufgelöst werden.
-   `npm run build` ausführen und `dist/` kontrollieren.
-   Wenn verfügbar, die App über `npm run preview` testen.
-   Einen GitHub-Pages-Deploy und einen lokalen Preview-Server nicht
    gleichsetzen; beide relevanten Pfade testen.
-   Keine Änderungen an GitHub Actions oder Firebase-Konfiguration ohne
    vorherige Prüfung des tatsächlichen Deployment-Workflows.
-   `.github/workflows/deploy.yml` deployt bei Push auf den Branch
    **`production`** (nicht `master`) und liest `VITE_SUPABASE_URL` und
    `VITE_SUPABASE_PUBLISHABLE_KEY` aus Repository-Secrets.
-   `.github/workflows/ci.yml` läuft für jeden Pull Request und jeden
    Push auf `master`: Lint, Build, Base-Pfad-Prüfung, alle Migrationen
    auf frischer DB, `supabase db lint`, `supabase test db`.

## 10. Test- und Qualitätsstrategie

Vorhandene Test-Infrastruktur zuerst ermitteln. Kein Test-Framework nur
aus Gewohnheit hinzufügen; wenn Tests fehlen, einen kleinen Vorschlag
mit Aufwand und Nutzen machen.

Aktueller Stand: Datenbanktests mit pgTAP unter `supabase/tests/`,
lokal ausführbar mit `supabase db start` und `supabase test db`.
Frontend-Unit-Tests mit Vitest (`npm test`), Testdateien liegen als
`*.test.ts` neben dem getesteten Modul. Reine Logik (z. B.
`src/features/pages/page-hierarchy.ts`) wird ohne React und Supabase
getestet.

Mindestens prüfen:

### Allgemein

-   `npm run lint`
-   `npm run build`
-   vorhandene Tests, sofern eingerichtet
-   Browser-Konsole auf neue Fehler

### PWA

-   Manifest wird unter dem richtigen Base-Pfad geladen.
-   Icons laden ohne 404.
-   Service Worker wird registriert und kontrolliert die App.
-   Reload funktioniert.
-   Update eines neuen Builds funktioniert nachvollziehbar.
-   Installation/Zum-Home-Bildschirm auf realem iOS- und Android-Gerät
    prüfen.

### Offline

-   Seite online öffnen und warten, bis der Inhalt lokal gespeichert
    ist.
-   Flugmodus aktivieren und die Seite erneut öffnen.
-   Dokument offline ändern.
-   App schließen und erneut starten; lokale Änderung muss erhalten
    bleiben.
-   Netzwerk wieder aktivieren; ausstehende Änderung muss synchronisiert
    werden.
-   Wiederholte Synchronisierung darf keine Daten beschädigen.
-   Zwei Geräte mit unterschiedlichen Änderungen testen und die
    definierte LWW-Regel überprüfen.
-   Fehlende Berechtigungen, Logout und Kontowechsel testen.
-   Netzwerkfehler dürfen nicht fälschlich als „Gespeichert" angezeigt
    werden.

## 11. Arbeitsablauf für Claude Code

Bei Beginn einer Aufgabe:

1.  `pwd`, `git status --short` und relevante Projektdateien prüfen.
2.  `package.json`, `vite.config.ts`, `index.html`, relevante
    Komponenten und Datenbankmigrationen lesen.
3.  Bestehende Architektur kurz zusammenfassen.
4.  Einen kleinen Implementierungsplan mit betroffenen Dateien
    formulieren.
5.  Bei wichtigen unklaren Entscheidungen eine gezielte Frage stellen.
6.  Änderungen in kleinen, nachvollziehbaren Schritten umsetzen.
7.  Nach jedem sinnvollen Schritt lint/build bzw. passende Tests
    ausführen.
8.  Diff prüfen: `git diff --check` und `git diff`.
9.  Ergebnis, Tests, offene Punkte und manuellen Test knapp
    dokumentieren.

### Nicht tun

-   Nicht sofort die gesamte Codebasis umstrukturieren.
-   Keine Dateien erstellen, ohne ihre Rolle und Einbindung zu kennen.
-   Keine unbekannten Spalten, RPCs, Policies oder Constraints
    voraussetzen.
-   Keine Secrets lesen oder ausgeben, wenn es nicht notwendig ist.
-   Keine `localStorage`-Lösung als Ersatz für eine robuste
    Offline-Dokumentdatenbank verwenden.
-   Nicht behaupten, offline zu funktionieren, nur weil die App Shell
    gecacht wird.
-   Keine automatisch synchronisierten Schreibvorgänge als erfolgreich
    anzeigen, bevor sie tatsächlich lokal dauerhaft gespeichert oder
    remote bestätigt wurden.
-   Keine unüberprüften absoluten URLs verwenden, die GitHub Pages
    brechen.
-   Keine Fehler mit `catch(() => undefined)` verstecken, ohne sie an
    geeigneter Stelle sichtbar zu machen oder kontrolliert zu behandeln.

## 12. Erste konkrete Aufgabe

Beginne **nicht** mit einem großen Refactor. Untersuche zuerst den
aktuellen Repository-Zustand und liefere eine kurze Ist-Analyse.

Dateien/Bereiche, die besonders wichtig sind:

-   `package.json`
-   `vite.config.ts`
-   `index.html`
-   `src/main.tsx`
-   `src/App.tsx`
-   `src/components/editor/BlockEditor.tsx` vollständig
-   `src/lib/supabase.ts`
-   `src/lib/auth-provider.tsx`
-   `src/lib/use-auth.tsx`
-   `src/features/pages/`
-   vorhandene Supabase-Migrationen und RLS-Policies für
    `page_documents`
-   GitHub-Actions-Workflow für GitHub Pages, falls vorhanden
-   vorhandene Tests und ESLint-/TypeScript-Konfiguration

Die Ist-Analyse ist erledigt (2026-10-16). Vereinbarte Reihenfolge der
Arbeitspakete, je ein Pull Request:

1.  **Aufräumen und Doku:** `lang="de"`, ungenutzte Vorlagen-Dateien
    entfernen, `.env.example`, README, diese Datei aktualisieren.
2.  **RLS härten:** `owner_id`/`visibility`/`workspace_id` von Seiten
    nur durch den Owner änderbar; `updated_by`/`updated_at` von
    `page_documents` serverseitig setzen; pgTAP-Tests.
3.  **Papierkorb-Bug:** wiederhergestellte Unterseite mit archivierter
    Elternseite ist unsichtbar.
4.  **PWA-Basis:** `vite-plugin-pwa`, Manifest, neues Icon, iOS-Meta,
    kontrollierte Updates, Editor per `lazy()` laden.
5.  **Mobiles Layout:** responsive Sidebar, Seitenaktionen auf Touch
    sichtbar, Safe Areas.
6.  **Serverseitige LWW-Regel:** RPC mit atomarem bedingtem Update
    gemäß §2; pgTAP-Tests.
7.  **Lokaler Dokument-Store:** IndexedDB je Nutzer; Datenzugriff aus
    `BlockEditor` herauslösen.
8.  **Persistente Sync-Warteschlange:** Mutation-ID, Zusammenfassen,
    Backoff, Fehlerklassen, Mehrfach-Tabs.
9.  **Offline-Start, Status, Logout:** Seitenbaum lesend cachen,
    Sync-Status, Logout-Policy gemäß §2.

Jedes Arbeitspaket soll einen klaren Umfang, die betroffenen Dateien und
überprüfbare Akzeptanzkriterien haben. Nach jedem Paket anhalten und das
Ergebnis erklären, bevor größere Folgeänderungen vorgenommen werden.

------------------------------------------------------------------------

## 13. Aktuelle offene Fragen / bekannte Lücken

Bekannte Lücken (geprüft 2026-10-16, Behebung siehe §12):

-   `BlockEditor` lädt nur von Supabase und speichert nur im Speicher;
    kein Speichern bei `pagehide`/`visibilitychange`.
-   Read-only geteilte Seiten sind im Editor bearbeitbar; Speichern
    scheitert dann an RLS.
-   Layout ist nicht mobil nutzbar (feste Sidebar `w-64`,
    Hover-only-Aktionen im Seitenbaum).

Behoben in Paket 2 (`20261016175500_protect_page_columns.sql`):
Trigger erzwingen, dass nur der Owner `owner_id`/`visibility` ändert,
`id`/`workspace_id`/`created_by`/`created_at` unveränderlich sind und
`page_documents.updated_at`/`updated_by` vom Server gesetzt werden.

Behoben in Paket 3: Wiederherstellen einer Unterseite stellt auch ihre
archivierten Elternseiten wieder her (Variante A, Nutzerentscheidung
2026-10-16); die UI fragt vorher nach. Logik in
`src/features/pages/page-hierarchy.ts`.

Noch nicht abschließend geprüft:

-   Bestandsdaten: Aktive Seiten, deren Elternseite archiviert ist
    (durch den alten Bug entstanden), sind unsichtbar und würden beim
    endgültigen Löschen der Elternseite mitgelöscht.
-   Löschen: Jedes Workspace-Mitglied kann workspace-sichtbare Seiten
    endgültig löschen (`can_edit_page`). Ob das gewollt ist, ist offen.
-   Verschieben (`parent_id`-Update) prüft nicht, ob die neue
    Elternseite lesbar ist, und verhindert keine Zyklen. Die UI bietet
    Verschieben derzeit nicht an.
-   Auth-Verhalten bei Offline-Start, Token-Erneuerung und Logout.
-   Tatsächliche finale Icon-Dateien (Vorgabe siehe §7).

**Arbeitsregel:** Wenn diese Datei und der aktuelle Code
auseinanderlaufen, ist der aktuelle Code die Quelle für den Ist-Zustand.
Die Produktanforderungen und die expliziten Entscheidungen des Nutzers
bleiben verbindlich, sofern sie nicht geändert wurden.
