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

- React + TypeScript mit klarer, wartbarer Struktur.
- Bestehende BlockNote-Editorfunktionalität erhalten.
- Supabase-Integration und Authentifizierung beibehalten.
- PWA auf iOS und Android installierbar machen.
- Ein neues, eigenständiges Nodi-App-Icon erstellen und in den
  passenden Plattformgrößen bereitstellen.
- Bereits geladene Seiten **offline lesen und bearbeiten** können.
- Offline vorgenommene Änderungen lokal dauerhaft speichern und später
  automatisch synchronisieren.
- Konfliktstrategie: **Last-Write-Wins (LWW)**.
- Die lokale Warteschlange muss Neustarts und vorübergehende
  Verbindungsabbrüche überstehen.
- GitHub-Pages-Deployment unter `https://risingwolf21.github.io/nodi/`
  unterstützen.
- Änderungen schrittweise entwickeln und testen.

### Getroffene Entscheidungen (Nutzer, 2026-10-16)

Diese Entscheidungen sind verbindlich:

- **LWW-Ordnung:** Maßgeblich ist die **Bearbeitungszeit auf dem
  Client**, durchgesetzt vom Server. Eine serverseitige
  Funktion/RPC übernimmt einen Schreibvorgang nur, wenn seine
  Bearbeitungszeit neuer ist als der gespeicherte Stand; Zeitstempel
  aus der Zukunft werden auf die Serverzeit `now()` gekappt; bei
  Gleichstand entscheidet die Mutation-ID.
- **Offline-Umfang:** Dokumentinhalt bereits geöffneter Seiten ist
  offline les- und bearbeitbar. Workspaces und Seitenbaum werden
  **nur lesend** gecacht.
- **Neue Seiten offline:** vorerst **nein**. Seiten-IDs werden schon
  clientseitig erzeugt (`crypto.randomUUID()`), eine spätere
  Erweiterung bleibt möglich.
- **Logout mit ungesyncten Änderungen:** zuerst synchronisieren. Ist
  das nicht möglich, warnen und wählen lassen: „Abbrechen" oder
  „Trotzdem abmelden und lokale Änderungen verwerfen". Danach den
  lokalen Cache dieses Kontos löschen.
- **Berechtigungen:** `visibility` und `owner_id` einer Seite darf
  nur deren Owner ändern.
- **Tests:** Vitest (mit `fake-indexeddb` für IndexedDB-Logik) darf
  eingeführt werden.
- **Merge Requests:** Jedes Arbeitspaket bekommt einen eigenen Pull
  Request mit nachvollziehbarer Beschreibung. Die CI-Pipeline
  (`.github/workflows/ci.yml`) muss grün sein.
- **Verdrängte Schreibvorgänge (Nutzer, 2026-10-17, Option A):**
  Lehnt der Server eine lokale Änderung ab, weil ein anderes Gerät
  eine neuere Version hat, lädt die App automatisch den Serverstand
  und zeigt einen kurzen, nicht blockierenden Hinweis: „Diese Seite
  wurde auf einem anderen Gerät geändert. Die neuere Version wurde
  geladen.“ Kein Dialog, keine Rückfrage. Nie „Gespeichert“ anzeigen,
  wenn die eigene Änderung verdrängt wurde.

### Noch nicht festgelegt

- Ob überschriebene Inhalte als Konfliktkopie aufbewahrt werden sollen
  (vorerst nein; später nachrüstbar).

## 3. Bekannter technischer Ist-Zustand

Die folgenden Angaben stammen aus einer bisherigen Codeprüfung. Vor
Änderungen erneut prüfen, weil sich der Code zwischenzeitlich geändert
haben kann.

### `package.json`

- Projektname: `nodi`
- `"type": "module"`
- Skripte:
  - `npm run dev` → `vite`
  - `npm run build` → `tsc -b && vite build`
  - `npm run lint` → `eslint .`
  - `npm run preview` → `vite preview`
  - `npm test` → `vitest run` (seit Paket 3)
  - `npm run test:e2e` → `playwright test` (Browser-Tests)
  - `npm run format` → `prettier --write .`, `npm run format:check` →
    `prettier --check .` (seit dem Clean-Code-Paket)
- Runtime-Abhängigkeiten umfassen unter anderem:
  - React `^19.2.8`
  - React DOM `^19.2.8`
  - Vite `^8.3.0`
  - TypeScript `~6.0.2`
  - `@supabase/supabase-js` `^2.118.0`
  - `@blocknote/core`, `@blocknote/react`, `@blocknote/mantine`
    jeweils `^0.56.0`
  - Tailwind CSS 4 und `@tailwindcss/vite`
  - shadcn-Ökosystem, `lucide-react`, Geist Variable Font
- Seit Paket 4: `vite-plugin-pwa` `^2.0.0` und `workbox-build`
  (devDependencies), `workbox-window` (dependency).
- Seit Paket 7: `fake-indexeddb` (devDependency, nur für Tests).
- `@playwright/test` `1.63.0` (devDependency, exakt gepinnt; die CI
  installiert den passenden Chromium).
- Prettier `3.9.9` (devDependency, exakt gepinnt, damit sich die
  Formatierung nicht mit einem Update ändert). `.prettierrc.json`: 4
  Leerzeichen, doppelte Anführungszeichen, Semikolons, Zeilenbreite 120;
  JSON, YAML und Markdown mit 2 Leerzeichen (npm schreibt `package.json`
  so).
- Seit Paket 14e: `leaflet` `1.9.4` (dependency, nur in der
  nachgeladenen Karte) und `@types/leaflet` (devDependency).
- Seit Paket 16a: `fflate` (dependency, ZIP lesen beim Notion-Import,
  nur im nachgeladenen Import-Dialog).

Versionsnummern vor Installation oder Upgrade erneut prüfen. Keine
größeren Versionsupdates durchführen, nur um eine PWA einzurichten.

### `vite.config.ts`

Enthält `base: "/nodi/"`, die Plugins `react()`, `tailwindcss()` und
seit Paket 4 `VitePWA(...)` sowie den Alias `@` → `src`.

PWA-Konfiguration (Paket 4):

- `generateSW`, `registerType: "prompt"`, `injectRegister: false`:
  Registrierung und Update-Hinweis in
  `src/components/pwa/UpdatePrompt.tsx`. Ein neuer Service Worker
  übernimmt erst nach Bestätigung durch den Nutzer; stündliche
  Update-Prüfung für installierte Apps.
- Precache nur für die App-Shell (`js, css, html, svg, png, woff2`).
  Keine `runtimeCaching`-Regeln: Supabase-Anfragen (cross-origin)
  laufen am Service Worker vorbei und landen in keinem Cache.
- Manifest-Werte gemäß §7, Icon-Pfade relativ zum Manifest.

Der `base`-Pfad ist für GitHub Pages wichtig. PWA-Manifest, Service
Worker, Icons und alle Assets müssen mit `/nodi/` funktionieren. **Keine
unbedachten root-absoluten URLs** einführen, die auf GitHub Pages an der
falschen Stelle aufgelöst werden könnten. Ausnahme: Verweise in
`index.html` auf Dateien in `public/` (z. B. `/favicon.svg`) schreibt
Vite im Build zu `/nodi/…` um; das ist geprüft. In Laufzeit-Code, im
Manifest und im Service Worker gilt diese Umschreibung **nicht**.

### `index.html`

`lang="de"`, Favicon (`/favicon.svg`, neues Icon),
`apple-touch-icon`, `description`, `theme-color`,
`apple-mobile-web-app-title` und `apple-mobile-web-app-status-bar-style`
(`default`). Den Manifest-Link fügt `vite-plugin-pwa` im Build ein.
Root-absolute Pfade auf `public/` schreibt Vite zu `/nodi/…` um.

Seit Paket 5 mit `viewport-fit=cover`. Safe-Area-Abstände
(`env(safe-area-inset-*)`) sitzen gezielt an Kopfzeile, Seitenleiste,
Inhaltsbereich und Update-Hinweis.

### `src/main.tsx`

Bisheriger Inhalt:

```tsx
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./index.css";
import App from "./App.tsx";
import { AuthProvider } from "@/lib/auth-provider";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <AuthProvider>
      <App />
    </AuthProvider>
  </StrictMode>,
);
```

`AuthProvider` umschließt die App. `@/` ist der Alias für `src/`.

### Styles

- `src/index.css` verwendet Tailwind CSS 4, `tw-animate-css`,
  `shadcn/tailwind.css` und `@fontsource-variable/geist`.
- Es gibt Light- und Dark-Theme-CSS-Variablen.
- Die ungenutzte Vite-Vorlage `src/App.css` wurde in Paket 1 entfernt.
- Optik (Paket 10): neutrale Palette, nodi-Indigo nur als Akzent
  (Token `--brand`: Fokus, Auswahl, Links, Logo). Dark Mode folgt
  `prefers-color-scheme` (Variante `dark:` ebenso, keine `.dark`-Klasse).
  `--page-gutter` hält Titel und Editortext bündig. Textspalte max.
  860 px; je Seite umschaltbar auf „Volle Breite“ (Seitenmenü, Spalte
  `pages.full_width`, Migration `20261018090000_page_full_width.sql`,
  über Geräte synchronisiert, nur mit Schreibrecht und online).
- Layout (Paket 10, ersetzt die Schublade aus Paket 5): ab `md`
  Seitenleiste + Seite nebeneinander. Unter `md` wie die Notion-App:
  Startbildschirm ist die Seitenliste, eine Seite öffnet sich im
  Vollbild mit Zurück-Pfeil. Offene Seiten sind History-Einträge ohne
  URL-Änderung (`history.pushState`), daher funktionieren Browser- und
  Android-Zurück, und Neuladen bleibt auf GitHub Pages sicher.
  Touch-Geräte (`pointer-coarse:`) zeigen Aktionen immer und mit
  größeren Tap-Flächen.

### Bekannte Dateien

Stand nach Paket 10:

```text
.env.example
index.html
vite.config.ts
.github/workflows/
  ci.yml                    # Lint, Build, DB-Migrationen, pgTAP-Tests
  deploy.yml                # GitHub Pages, nur bei Push auf `production`
  purge-deleted-files.yml   # täglich: Dateien gelöschter Seiten entfernen (35b)
src/
  App.tsx
  main.tsx
  index.css
  vite-env.d.ts
  components/
    LoadErrorBoundary.tsx   # Fehler beim Nachladen: Hinweis + „Neu laden“
    auth/AuthForm.tsx       # Anmelden, Registrieren, Passwort vergessen (33b)
    auth/NewPasswordForm.tsx # neues Passwort nach dem Link aus der E-Mail (33b)
    editor/BlockEditor.tsx  # nachgeladen; Status, Hinweise, BlockNote (de)
    editor/EditorFrame.tsx  # Rahmen einer Seite: Top-Leiste + Textspalte
    editor/editor-theme.ts  # BlockNote-Theme (Editor und öffentliche Ansicht)
    editor/editor-schema.tsx # Blöcke: BlockNote + „Datenbank“ (19c) + „Callout“ (22)
    editor/CalloutIcon.tsx  # Emoji und Farbe eines Callouts; Farben in callout.ts
    editor/DatabaseBlock.tsx # Datenbank-Block; Kontext in database-block-context.ts
    editor/PageLink.tsx     # Seitenlink im Text („@“, 28)
    editor/CommentMark.tsx  # Kommentar an einer Textstelle (31b); CommentButton.tsx in der Leiste
                            # editor-schema.tsx auch: Spalten (columns/column, 32e)
    pwa/UpdatePrompt.tsx    # SW-Registrierung und Update-Hinweis
    ui/                     # shadcn: button, card, input, label, separator;
                            # menu.tsx (schließt bei Klick außerhalb;
                            # `detached`: fest positioniert, für Menüs
                            # in Scroll-Containern wie Tabellen);
                            # dialog.tsx (natives <dialog>: Escape, Fokus
                            # bleibt im Dialog und kehrt zurück; alle Modals)
    workspace/WorkspaceHome.tsx   # Layout, Navigation (History), Logout
    workspace/PageView.tsx        # Pfad, Seitenmenü, Kopf, lazy BlockEditor, DatabaseView, PropertyBar
  features/
    auth/
      sign-out.ts           # Logout-Policy: syncen, dann lokale Daten löschen
      SignOutDialog.tsx     # Warnung bei ungesyncten Änderungen
      DeleteAccountDialog.tsx # Konto löschen mit Passwort (33b)
    legal/                  # Impressum/Datenschutz unter ?seite= (33b); Angaben in operator.ts
    databases/              # Paket 14b
      types.ts              # Eigenschaften, Werte, Ansichten, Filter/Sortierung
      database-model.ts     # Parser, Werte lesen/formatieren, Filter, Sortierung (Vitest)
      services/database-repository.ts # Supabase: laden, Eigenschaften, Ansichten, RPC set_page_property, Verknüpfungen
      hooks/useDatabase.ts  # Cache zuerst, Änderungen nur online, Werte optimistisch, Einträge anlegen
      components/DatabaseView.tsx    # Ansichts-Tabs, Filter/Sortierung/Eigenschaften, Tabelle
      components/TableView.tsx       # Tabelle: Name, Werte, Spalten, „Neu“
      components/PropertyBar.tsx     # Eigenschaften eines Eintrags über dem Text
      components/BoardView.tsx       # Board: Spalten je Option, Ziehen setzt den Wert (14c)
      components/ListView.tsx        # Liste (14c)
      components/GalleryView.tsx     # Galerie (14c); EntryCard.tsx: Karte/Werte
      components/FeedView.tsx        # Feed mit Textvorschau (14d)
      components/CalendarView.tsx    # Kalender: Monat/Woche, Ziehen (14d, 32b)
      components/TimelineView.tsx    # Zeitleiste (32d); GroupedRows.tsx: Gruppen in Tabelle/Liste (32c)
      components/MapView.tsx         # Landkarte (14e); MapCanvas.tsx: Leaflet, nachgeladen
      components/DatabaseBlockContent.tsx # Datenbank als Block im Text: Auswahl, eigene Ansichten (19c)
      components/PlacePicker.tsx     # Ort wählen: Adresssuche oder Klick auf die Karte (14e)
      services/geocoding.ts          # Nominatim, höchstens 1 Anfrage/s (14e)
      formula/formula-parser.ts      # Formeln: Tokenizer/Parser, Notion-Syntax, kein eval (14f)
      formula/formula-evaluator.ts   # Formeln: Auswertung, Funktionen, deutsche Fehler (14f)
      rollup.ts                      # Rollups: Funktionen und Berechnung (24); RollupEditor.tsx
      components/ButtonEditor.tsx    # Button-Eigenschaft: Beschriftung, Aktionen (32f)
      recurrence.ts                  # Wiederholungen: Regel, Texte (25); services/recurring-entries.ts, RecurrenceSetting.tsx
      components/FormulaEditor.tsx   # Formel schreiben mit Vorschau (14f)
      components/RelationPicker.tsx  # Einträge einer verknüpften Datenbank wählen (17e), auch Personen (29)
      components/FilesPicker.tsx     # Dateien & Medien: öffnen, entfernen, hochladen (29)
      components/…          # Wert-Editor, Optionen, Spaltenkopf, Einstellungs-Panels
    editor/
      components/SyncStatusIndicator.tsx  # Gesamtstatus in der Kopfzeile
      types.ts              # Dokument-, Versions- und Sync-Typen
      document-sync.ts      # Validierung, LWW-Vergleich, Fehlerklassen
      services/
        local-document-store.ts      # IndexedDB `nodi-<userId>`
        remote-document-repository.ts # Supabase: laden, RPC speichern
        page-document-session.ts     # Bearbeiten einer offenen Seite
        sync-engine.ts               # sendet alle ungesyncten Änderungen
        account-sync.ts              # eine Sync-Engine je Konto und Tab
        document-changes.ts          # BroadcastChannel zwischen Tabs
        revoked-documents.ts         # lokale Kopien nicht mehr lesbarer Seiten löschen
    files/                  # Paket 15b
      file-reference.ts     # Verweis `nodi-file:<pfad>`, Pfad, Dateiname (Vitest)
      services/page-files.ts        # Storage: hochladen, signierte URL
      services/file-cache.ts        # IndexedDB `nodi-<userId>-files` (Bilder offline)
      services/file-url-resolver.ts # BlockNote `resolveFileUrl`: Cache, sonst signierte URL
    search/                 # Paket 27: SearchDialog, page-search.ts (Server/Gerät), search-text.ts
    comments/               # Paket 31a: PageComments, services/page-comments.ts, comment-threads.ts
    export/                 # Paket 34: export-tree, export-markdown, export-csv, build-export; ExportDialog (nachgeladen)
    realtime/               # Paket 36: page-activity.ts (Realtime-Abo), useActivityReload.ts
    import/                 # Paket 16a
      read-archive.ts       # ZIP lesen (fflate), Teil-ZIPs, NFC-Pfade
      notion-export.ts      # Titel, Pfade, Seitenbaum aus dem Export (Vitest)
      notion-csv.ts         # CSV lesen, Eigenschaftstypen ableiten, Notion-Daten (16b, Vitest)
      import-blocks.ts      # Links/Dateien in BlockNote-Blöcken umschreiben (Vitest)
      notion-import.ts      # Ablauf: Seiten/Datenbanken anlegen, Dateien, Werte, speichern (Vitest)
      markdown-to-blocks.ts # BlockNote-Markdown-Parser ohne Ansicht
      components/NotionImportDialog.tsx # nachgeladen; Auswahl, Fortschritt, Ergebnis
    pages/
      PageTree.tsx
      PageTreeItem.tsx      # kompakte Zeile: Pfeil, Emoji, Aktionen
      types.ts
      page-display.ts       # „Ohne Titel“ für leere Namen (Einträge)
      components/Sidebar.tsx        # Workspace/Konto, Baum, Neue Seite/Datenbank, Papierkorb
      components/PageHeader.tsx     # Emoji-Auswahl, Titel direkt bearbeitbar
      components/IconGrid.tsx       # Emoji suchen/einfügen (30a); Liste in page-icons.ts
      components/PageCover.tsx      # Titelbild und Auswahl (30c); Farbverläufe in page-cover.ts
      components/PageActionsDialog.tsx
      components/MembersDialog.tsx  # Workspace-Mitglieder: einladen, entfernen, verlassen
      components/MoveSectionDialog.tsx # Rückfrage „In den Workspace/In Privat verschieben“
      components/MovePageDialog.tsx    # „Verschieben nach …“: Ziel suchen, Rückfrage bei Bereichswechsel (18b)
      components/SubpageList.tsx       # Unterseiten eines Datenbank-Eintrags (23)
      components/Backlinks.tsx         # „Verlinkt von“ (28); services/page-links.ts: RPC page_backlinks
      components/ShareDialog.tsx    # Teilen per E-Mail, Rolle, Entfernen, öffentlicher Link (nur Owner)
      components/TrashView.tsx
      hooks/usePages.ts     # Seitenbaum, Cache zuerst, offline nur lesend
      hooks/usePageNavigation.ts    # offene Seite als History-Eintrag (pushState/popstate)
      hooks/useSharedPages.ts       # „Mit mir geteilt“, Cache zuerst, nur lesend
      hooks/useWorkspaces.ts
      services/page-tree-cache.ts   # IndexedDB `nodi-<userId>-tree`
      services/page-sharing.ts      # RPCs share_page/list_page_shares, Entziehen, Links
      services/workspace-members.ts # RPCs für Mitglieder (Paket 12a)
    public/
      public-page.ts        # Token aus `?p=`, Link-URL, RPC get_public_page
      PublicPage.tsx        # öffentliche Ansicht ohne Login (in main.tsx gewählt)
      PublicDocument.tsx    # nachgeladen; BlockNote nur lesend, Bilder per signierter URL
      page-hierarchy.ts     # reine Baumlogik, mit Vitest getestet
  lib/
    auth-context.tsx
    auth-provider.tsx       # Anmelden, Registrieren, Abmelden; Offline-Modus
    remembered-account.ts   # id/E-Mail des Kontos (keine Tokens)
    indexed-db.ts           # Verbindung, die ein Logout schließen kann
    request-errors.ts       # Fehlerklassen offline/auth/temporär/dauerhaft
    supabase.ts             # setzt `authStorageKey` ausdrücklich
    use-auth.tsx
    utils.ts                # re-exportiert `cn` aus dem Paket `cn`
    virtual-keyboard.ts     # Bildschirmtastatur erkennen, sichtbarer Bereich (20)
public/
  favicon.svg               # App-Icon (abgerundet), Quelle für pwa-*.png
  icons/                    # pwa-192, pwa-512, maskable-512, apple-touch-icon-180
e2e/                        # Playwright: *.e2e.ts, fake-supabase.ts, test.ts
design/
  icon-full-bleed.svg       # Quelle für maskable- und apple-touch-Icon
  README.md                 # wie die PNGs erzeugt werden
supabase/
  config.toml
  functions/purge-deleted-files/ # Edge Function: Dateien gelöschter Seiten (35b)
  migrations/               # profiles, workspaces, pages, page_shares,
                            # Spaltenschutz (P2), save_page_document (P6),
                            # nur noch per RPC schreibbar (P8),
                            # pages.full_width (P10), Teilen und
                            # öffentliche Links (P11a), endgültig
                            # löschen nur Owner, Reparatur
                            # unsichtbarer Seiten (Bestandsdaten),
                            # Mitglieder und Bereiche (P12a),
                            # Seitenbaum/Teilen gehärtet (P13a),
                            # Datenbanken (P14a), Orte und Landkarte (P14e),
                            # Formeln (P14f), Datei-Speicher (P15a),
                            # Verknüpfungen (P17d), Verschieben (P18a),
                            # Ansichten je Block (P19b), Einträge mit
                            # Unterseiten (P23), Rollups (P24),
                            # wiederkehrende Einträge (P25), Vorlagen (P26),
                            # Suche (P27), Rückverweise (P28),
                            # Person und Dateien (P29), Favoriten (P30b),
                            # Titelbilder (P30c), Kommentare (P31a/b),
                            # Zeitleiste (P32d), Buttons (P32f),
                            # Konto löschen (P33a), Speicher aufräumen (P35a),
                            # Echtzeit (P36a), Erwähnungen (P37a)
  tests/                    # pgTAP: Berechtigungen, Spaltenschutz, LWW,
                            # Seiteneinstellungen, Teilen, Löschrecht,
                            # Reparatur, Titel/Icon geteilter Seiten,
                            # Mitglieder und Bereiche (P12a), Härtung (P13a),
                            # Datenbanken (P14a), Orte (P14e), Formeln (P14f),
                            # Dateien (P15a), Verknüpfungen (P17d),
                            # Verschieben (P18a), Ansichten je Block (P19b)
```

Die tatsächliche Dateistruktur vor neuen Dateien erneut untersuchen.

### TypeScript

`tsconfig.app.json` setzt `strict` nicht explizit. Unter TypeScript 6
ist `strict` aber Standard (geprüft mit TS 6.0.3).

## 4. Bekannter Editor-Ablauf und wichtige Risiken

Datei: `src/components/editor/BlockEditor.tsx` (seit Paket 7 nur noch
Darstellung; Ablauf in `src/features/editor/services/`).

- **Laden:** zuerst aus dem lokalen Store (IndexedDB, eine Datenbank
  `nodi-<userId>` je Konto, Store `documents`, Schlüssel `pageId`).
  Nur eine hier noch nie geöffnete Seite wird von Supabase geladen
  und sofort lokal abgelegt. Ohne Server und ohne lokale Kopie
  erscheint ein Hinweis statt eines leeren Editors.
- **Abgleich:** Eine lokale Kopie wird nach dem Öffnen einmal mit dem
  Server verglichen. Eine ungesyncte lokale Änderung wird gesendet;
  eine neuere Serverversion ersetzt eine synchronisierte Kopie. Was
  der Nutzer währenddessen tippt, wird nicht überschrieben.
- **Speichern:** Bearbeitungszeit = Zeitpunkt der Eingabe; nach
  800 ms Debounce wird ein Snapshot mit neuer Mutation-ID lokal
  geschrieben (`synced: false`). Je Seite gibt es nur den letzten
  Stand; schnelle Änderungen werden so zusammengefasst. „Gespeichert"
  erst nach Serverbestätigung und nur, wenn die lokale Version noch
  dieselbe ist (Compare-and-set in einer IndexedDB-Transaktion).
  Lokales Schreiben wartet nie auf das Netz (Paket 13b): Der Anstoß an
  die Sync-Engine und die Abfrage einer neueren Version laufen außerhalb
  der Warteschlange der Sitzung. Bis eine Änderung im Store liegt, gilt
  sie als „Tippen gewinnt“ (auch gegen andere Tabs).
- **Warteschlange (Paket 8):** Alle Dokumente mit `synced: false`
  bilden die Warteschlange; sie übersteht Neustarts, weil sie in
  IndexedDB liegt. Die `SyncEngine` (eine je Konto und Tab, gestartet
  in `WorkspaceHome`) sendet sie per RPC `save_page_document`, auch
  für Seiten, die gerade nicht offen sind. Auslöser: Start, neue
  Änderung, `online`, App wieder sichtbar, „Erneut versuchen".
- **Wiederholung:** offline/temporär/Auth → Backoff 2 s, 4 s, 8 s …
  bis höchstens 5 min, nach 10 erfolglosen Durchläufen keine
  zeitgesteuerten Versuche mehr (die Auslöser oben gelten weiter).
  Dauerhafte Fehler werden nicht wiederholt, bis der Nutzer „Erneut
  versuchen" wählt oder die App neu startet; die Änderung bleibt
  lokal.
- **Mehrere Tabs:** Durchläufe sind per Web Locks
  (`nodi-sync-<userId>`) über Tabs serialisiert. Jede Änderung am
  lokalen Store wird per `BroadcastChannel` gemeldet; offene Editoren
  lesen dann den Store und zeigen den neuen Stand, sofern dort
  gerade nicht getippt wird.
- **Verdrängt (Option A):** Serverstand laden, lokale Kopie ersetzen,
  kurzer Hinweis.
- **Fehler:** offline/temporär/Auth → „lokal gespeichert" mit
  „Erneut versuchen"; dauerhafte Fehler → Fehlermeldung, die
  Änderung bleibt lokal erhalten. Scheitert nur das Laden einer
  neueren Version, steht dort „Aktualisieren fehlgeschlagen“ (kein
  Speicherfehler). Ein ungültiges Dokument vom Server ist dauerhaft.
- **Verlassen:** `visibilitychange` (hidden), `pagehide` und Unmount
  schreiben ausstehende Änderungen sofort lokal und senden sie.
- **Rechte:** `can_edit_page` wird mitgeladen und lokal gemerkt;
  ohne Schreibrecht ist der Editor schreibgeschützt.

### Offline-Start, Status und Logout (Paket 9)

- **Seitenbaum und Workspaces:** je Konto in IndexedDB
  `nodi-<userId>-tree` (eigene DB, damit die Dokument-DB kein
  Schema-Upgrade braucht, das offene alte Tabs blockieren würden).
  Der Cache antwortet zuerst, der Server ersetzt ihn. Ist der Server
  nicht erreichbar, bleibt der Cache stehen und die Seitenleiste ist
  nur lesend (Anlegen, Umbenennen, Papierkorb ausgeblendet; die Hooks
  lehnen Änderungen zusätzlich ab). `online` lädt neu.
  Seit 13c gemeinsam in `hooks/load-cache-then-server.ts`: Ohne
  Sitzung dieses Kontos wird der Server nicht gefragt (eine anonyme
  Antwort wäre eine leere Liste und überschriebe den Cache). Zeigt die
  Liste schon Serverdaten, kommt beim Neuladen nicht erst der Cache
  (kein Flackern zu „nur lesbar“). Solange Cache oder Fehler angezeigt
  werden, laden auch „App wieder sichtbar“ und eine erneuerte Sitzung
  neu. Serverdaten werden wie der Cache validiert. Änderungen prüfen
  die zurückgegebenen Zeilen (RLS filtert ohne Fehler) und verwerfen
  ihr Ergebnis nach einem Workspace-Wechsel; während der nächste
  Workspace lädt, ist der alte Baum ausgeblendet und die offene Seite
  geschlossen.
- **Anmeldung offline:** Ist das Zugriffstoken abgelaufen und kein
  Netz da, liefert `getSession()` keine Sitzung, obwohl sie
  gespeichert bleibt; supabase-js wiederholt die Erneuerung bis zu
  ~30 s. Der `AuthProvider` merkt sich daher id und E-Mail des Kontos
  (`nodi-account` in `localStorage`, keine Tokens) und startet damit
  im Offline-Modus (`offline: true`): sofort, wenn der Browser
  offline meldet, sonst nach 3 s. Eine spätere Antwort von Supabase
  entscheidet (neue Sitzung oder Login). Bei `online` wird die
  Erneuerung angestoßen.
- **Gesamtstatus:** Die Engine führt eine Übersicht (ungesyncte
  Seiten, Grund des letzten Abbruchs), die Kopfzeile zeigt sie per
  `useSyncExternalStore`, ab `sm` mit Grund und „Erneut versuchen“.
  Ohne ausstehende Änderungen steht dort „Offline“, wenn Sitzung oder
  Seitenbaum aus lokalen Daten stammen.
- **Logout (Policy §2):** offene Editoren speichern lokal, dann
  `syncAll()`. Bleibt etwas ungesynct: Dialog „Abbrechen“ /
  „Trotzdem abmelden und lokale Änderungen verwerfen“. Danach
  `signOut()`; erst wenn das klappt, werden Engine gestoppt, die
  Datenbanken (Dokumente, Seitenbaum, seit 15b Bilder) geschlossen und
  gelöscht und `nodi-account` entfernt.
  Offline kann der Server die Sitzung nicht widerrufen; sie wird dann
  nur auf dem Gerät entfernt (`authStorageKey`). Eine gelöschte
  Datenbank wird von keinem Tab neu angelegt (`DatabaseConnection`
  schließt sich bei `versionchange` endgültig).

**Wichtig:** Die PWA-Cache-Funktion löst diese Probleme nicht.
Offline-Dokumentbearbeitung braucht zusätzlich eine lokale Datenbank und
eine robuste Synchronisierung.

## 5. Architekturprinzipien

Die Architektur soll sauber sein, aber nicht unnötig komplex. Verwende
die folgenden Leitlinien.

### TypeScript

- `strict`-Modus und vorhandene TypeScript-Regeln beibehalten.
- Keine unkontrollierte Verwendung von `any`. Typen nicht mit Type
  Assertions erzwingen, wenn sich die Daten korrekt validieren lassen.
- Daten von Supabase und IndexedDB als externe Daten behandeln und an
  passenden Grenzen validieren.
- Domänentypen von UI-Zuständen und Datenbank-DTOs unterscheiden, wenn
  sie fachlich unterschiedliche Aufgaben haben.
- Keine Typdefinitionen duplizieren, wenn sie sinnvoll an einer
  gemeinsamen Stelle gepflegt werden können.

### React

- Komponenten primär für Darstellung und Nutzerinteraktion verwenden.
- Hooks für wiederverwendbare React-Logik; Services/Module für Logik,
  die nicht an React gebunden ist.
- Keine unnötigen `useEffect`-Ketten für abgeleitete Zustände.
- Abgeleitete Werte direkt berechnen, statt sie redundant im State zu
  speichern.
- Effekt-Abhängigkeiten korrekt halten und Lifecycle-Probleme
  vermeiden.
- Keine langen asynchronen Geschäftsabläufe direkt in UI-Komponenten,
  wenn sie besser in einen klar abgegrenzten Service gehören.
- Keine globalen Stores hinzufügen, bevor ein konkreter Bedarf belegt
  ist.

### Verantwortlichkeiten und Abhängigkeiten

- UI-Komponenten sollen nicht die komplette
  Offline-Synchronisierungslogik implementieren.
- Supabase-Zugriffe, lokale Persistenz und Konfliktregeln sollten klar
  getrennt sein.
- Domänenlogik möglichst unabhängig von React und UI halten.
- Abhängigkeiten sollen in eine Richtung zeigen: UI → Anwendungslogik
  → Datenzugriff.
- Die Datenzugriffsschicht sollte nicht von React-Komponenten
  abhängen.
- Vermeide zyklische Imports.
- Abstraktionen nur dort einführen, wo sie Verantwortlichkeiten
  tatsächlich trennen oder Tests vereinfachen.

### Fehlerbehandlung und Observability

- Fehler nicht stillschweigend verschlucken.
- Nutzerfreundliche Fehlermeldungen in der UI; technische Details
  angemessen für Debugging protokollieren.
- Keine Dokumentinhalte, Tokens oder personenbezogenen Daten unnötig
  loggen.
- Netzwerkfehler von Validierungs-, Berechtigungs- und permanenten
  Serverfehlern unterscheiden.
- Wiederholungen nur für geeignete temporäre Fehler durchführen. Keine
  endlosen Retry-Schleifen.
- Promises immer abwarten oder ihre Fehler behandeln. ESLint prüft das
  mit Typinformationen (`no-floating-promises`, `no-misused-promises`,
  `await-thenable`). Bewusst nicht abgewartet, weil die Funktion ihre
  Fehler selbst behandelt (z. B. Submit-Handler): `void handler(event)`.
- Offline-/Sync-Status sichtbar und verständlich darstellen.

### Clean Code

- Aussagekräftige Namen; keine kryptischen Abkürzungen.
- Funktionen klein halten und jeweils eine klar erkennbare
  Verantwortung geben.
- Duplikation vermeiden, aber nicht durch übergenerische Frameworks
  ersetzen.
- Magische Werte als benannte Konstanten führen, wenn sie fachlich
  relevant sind.
- Kommentare erklären vor allem Gründe, Invarianten und nicht
  offensichtliche Entscheidungen; sie wiederholen nicht den Code.
- Veraltete Kommentare und ungenutzte Dateien erst entfernen, nachdem
  ihre Nutzung geprüft wurde.
- Keine unnötigen Änderungen an Formatierung oder Importstil in
  unbeteiligten Dateien.

## 6. Vorgeschlagene Projektstruktur -- nur schrittweise einführen

Die aktuelle Struktur ist klein. Nicht alles auf einmal verschieben.
Nutze eine Feature-orientierte Struktur, wenn die jeweiligen
Verantwortlichkeiten tatsächlich entstehen.

Möglicher Zielzustand:

```text
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

- `components/ui/`: generische UI-Primitives.
- `features/pages/components/`: Seitennavigation, Seitenaktionen und
  Seitenformulare.
- `features/editor/components/`: BlockNote-UI und Editor-Status.
- Feature-Service: fachliche Abläufe eines Features, etwa Dokument
  laden oder speichern.
- Offline-Service: IndexedDB, persistente Warteschlange und
  Synchronisierung, sofern diese Verantwortlichkeiten nicht nur für
  ein einzelnes kleines Modul relevant sind.
- `lib/supabase.ts`: Client-Initialisierung, keine umfangreiche
  Geschäftslogik.
- `app/`: Root-Provider, App-Zusammensetzung und Routing, soweit dies
  im Projekt benötigt wird.

## 7. PWA-Anforderungen

### Technische Ziele

- PWA mit Manifest und Service Worker.
- Installierbarkeit auf iOS und Android.
- Korrekte Icons in den benötigten Größen und Formaten.
- `name`, `short_name`, `start_url`, `scope`, `display`,
  `theme_color`, `background_color` und Icons im Manifest sinnvoll
  definieren.
- Pfade müssen für GitHub Pages unter `/nodi/` korrekt sein.
- iOS-Metadaten, `apple-touch-icon` und Safe-Area-Verhalten
  berücksichtigen.
- Service Worker darf Updates nicht unkontrolliert oder zu einem
  inkonsistenten Zustand führen.
- Keine vertraulichen oder nutzerspezifischen Supabase-Antworten
  unbedacht im Cache speichern.
- Authentifizierte API-Antworten nicht pauschal mit einem
  Cache-First-Verfahren behandeln.
- Offline-Start der App und Offline-Verfügbarkeit der zuletzt
  gespeicherten Seiten getrennt testen.

### App-Icon

Ein neues Icon ist gewünscht. Die zuvor generierte visuelle
Branding-Tafel ist **kein fertiges Icon-Asset**. Erzeuge bzw. exportiere
ein eigenständiges, quadratisches App-Icon, das auch bei kleiner
Darstellung lesbar ist. Erstelle daraus die tatsächlich benötigten
Assets und prüfe sie im Manifest und auf iOS. Erfinde keine Dateipfade,
bevor Dateien wirklich existieren.

Gestaltungsvorgabe des Nutzers (Branding-Tafel vom 2026-10-16):

- Abgerundetes Quadrat mit Verlauf von Indigo (oben links) zu sehr
  dunklem Navy (unten rechts).
- Darin ein weißes, kräftiges kleines „n" als Bogen; am Fuß des
  rechten Schenkels ein violetter Punkt (`#6366F1`).
- Wortmarke „nodi" (klein, fett, dunkles Navy), Claim „Deine Ideen.
  Überall."
- Manifest-Werte: `name`/`short_name` „nodi", `description` „Deine
  Ideen. Überall.", `display` `standalone`, `background_color`
  `#0B0F14`, `theme_color` `#6366F1`.
- Größen: 192×192 und 512×512 (Android/PWA), 180×180
  (`apple-touch-icon`); 1024×1024 nur falls ein App-Store-Export
  nötig wird.
- Achtung: Die Tafel zeigt root-absolute Icon-Pfade (`/icons/…`) und
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

- Änderungen lokal dauerhaft speichern, bevor sie als sicher lokal
  gesichert angezeigt werden.
- Mehrere schnelle Änderungen am selben Dokument können sinnvoll
  zusammengefasst werden; die letzte lokale Version muss aber erhalten
  bleiben.
- Jede Mutation muss idempotent wiederholbar sein oder eine stabile ID
  besitzen, damit Wiederholungen nicht zu unerwarteten Nebeneffekten
  führen.
- Fehlerhafte Mutationen dürfen nicht stillschweigend gelöscht werden.
- Temporäre Netzwerkfehler sollen später erneut versucht werden.
- Bei Abmeldung/Kontowechsel darf ein Dokument nicht versehentlich mit
  einem anderen Konto synchronisiert werden.
- App-Neustart muss ausstehende Änderungen wiederfinden.
- Ein Unmount-Callback allein ist keine ausreichende
  Persistenzstrategie.
- Sync nicht nur von `navigator.onLine` abhängig machen: Dieser Wert
  ist ein Hinweis, kein sicherer Nachweis, dass Supabase erreichbar
  ist.
- Mehrere Tabs/Geräte und Rennen zwischen Lese- und Schreibvorgängen
  berücksichtigen.

### Last-Write-Wins (LWW)

LWW ist die gewünschte fachliche Konfliktstrategie. Die Implementierung
darf nicht einfach blind `new Date()` auf dem Client als Wahrheit
verwenden.

Vor Implementierung klären und dokumentieren:

- Was bedeutet „latest": serverseitig bestätigte Reihenfolge,
  serverseitiger Zeitstempel oder eine andere definierte Ordnung?
- Wie werden gleichzeitige Updates geordnet?
- Wie wird verhindert, dass ein älterer, verspäteter Request einen
  neueren Stand überschreibt?
- Welche Operation ist atomar, wenn mehrere Geräte gleichzeitig
  schreiben?

Bevorzugte Richtung: eine klar definierte, serverseitig durchgesetzte
Konfliktregel, zum Beispiel über eine geeignete PostgreSQL-Funktion/RPC
oder atomare bedingte Updates, passend zum tatsächlichen Schema. Ein
gewöhnliches `upsert` mit Client-Zeitstempel genügt dafür nicht. Keine
Datenbankfunktion oder Migration erfinden, bevor die tatsächlichen
Spalten, Constraints und RLS-Regeln geprüft sind.

**Umsetzung (Paket 6, `20261017180000_save_page_document_lww.sql`):**

- Neue Spalten `page_documents.client_updated_at` (Bearbeitungszeit,
  `not null`, Default `now()`; Bestand mit `updated_at` befüllt) und
  `last_mutation_id`.
- RPC `save_page_document(p_page_id, p_document, p_edited_at,
p_mutation_id)` → `(applied, stored_edited_at, stored_mutation_id)`.
  Seit Paket 8 (`20261018070000_save_page_document_only.sql`)
  `security definer` mit ausdrücklicher Prüfung
  `can_edit_page(p_page_id)`; `insert`/`update` auf `page_documents`
  sind für `anon`/`authenticated` entzogen, die LWW-Regel ist also
  nicht mehr umgehbar. `execute` nur für `authenticated`.
  `updated_by` bleibt der Aufrufer (`auth.uid()` aus dem JWT).
- Ordnung: `(client_updated_at, last_mutation_id)`. Übernommen wird
  nur ein streng größeres Paar, atomar per
  `insert … on conflict do update … where`. `p_edited_at` wird auf
  `now()` gekappt.
- Auswertung im Client: `applied = true` → synchronisiert.
  `applied = false` und `stored_mutation_id` = eigene ID → schon
  früher übernommen (Wiederholung). Sonst → von einem neueren Stand
  verdrängt; Serverstand neu laden.
- Fehlercodes: `42501` keine Schreibrechte oder Seite existiert
  nicht (RLS greift vor dem Fremdschlüssel), `22023` Dokument ist
  kein JSON-Array, `22004` Argument fehlt. Alle dauerhaft, nicht
  wiederholen.
- `updated_at`/`updated_by` bleiben Serverzeit und Autor des letzten
  übernommenen Schreibvorgangs.

LWW kann Änderungen eines anderen Geräts bewusst überschreiben. Falls
die App später wertvolle Inhalte schützt, sollte geprüft werden, ob
überschriebenen Inhalt als Konfliktkopie aufbewahrt werden soll; das ist
eine fachliche Entscheidung und nicht automatisch einzuführen.

### Lokale Daten und Sicherheit

- Lokale Dokumente sind auf dem Gerät gespeichert und können auf
  gemeinsam genutzten Geräten ein Datenschutzrisiko sein.
- Keine anderen Nutzer oder Konten dürfen Zugriff auf die lokale
  Warteschlange bekommen.
- Beim Logout muss eine klare, dokumentierte Policy greifen:
  ausstehende Änderungen entweder sicher synchronisieren, geschützt
  aufbewahren oder nach ausdrücklicher Produktentscheidung löschen.
  Nicht stillschweigend Daten verlieren.
- Supabase RLS bleibt maßgeblich für den Serverzugriff.
- Keine Auth-Tokens in eigenen IndexedDB-Tabellen duplizieren, sofern
  es keinen zwingenden Grund gibt.
- Umsetzung siehe §4 „Offline-Start, Status und Logout“.

## 9. GitHub Pages und Build

Deployment-Ziel: `https://risingwolf21.github.io/nodi/`.

- `base: "/nodi/"` beibehalten, solange dies das Deployment-Ziel ist.
- Asset- und Navigationspfade unter diesem Prefix prüfen.
- Nach PWA-Änderungen prüfen, dass Manifest, Icons und Service Worker
  im Build aufgelöst werden.
- `npm run build` ausführen und `dist/` kontrollieren.
- Wenn verfügbar, die App über `npm run preview` testen.
- Einen GitHub-Pages-Deploy und einen lokalen Preview-Server nicht
  gleichsetzen; beide relevanten Pfade testen.
- Keine Änderungen an GitHub Actions oder Firebase-Konfiguration ohne
  vorherige Prüfung des tatsächlichen Deployment-Workflows.
- `.github/workflows/deploy.yml` deployt bei Push auf den Branch
  **`production`** (nicht `master`) und liest `VITE_SUPABASE_URL` und
  `VITE_SUPABASE_PUBLISHABLE_KEY` aus Repository-Secrets.
- Ablauf des Deploys (seit 13d): **`build` und `verify-database` →
  `migrate` → `deploy`**. `build` führt Lint, Unit-Tests, den
  Produktions-Build und die Prüfungen auf Base-Pfad und geheime
  Schlüssel aus; `verify-database` spielt alle Migrationen auf eine
  frische Datenbank und führt `db lint` und die pgTAP-Tests aus. Erst
  danach verknüpft `migrate` das Supabase-Projekt und führt
  `supabase db push --yes` aus (nur fehlende Migrationen) und deployt
  danach die Edge Function `purge-deleted-files` (seit 35b). Schlägt ein
  Job fehl, bleiben Datenbank und Seite unverändert. Benötigte Secrets:
  `SUPABASE_ACCESS_TOKEN`, `SUPABASE_DB_PASSWORD`,
  `SUPABASE_PROJECT_ID`. Laufende Deploys werden nicht abgebrochen
  (`cancel-in-progress: false`).
- **Regel für Migrationen:** Zwischen `migrate` und `deploy` läuft noch
  das alte Frontend gegen das neue Schema. Migrationen müssen daher
  rückwärtskompatibel sein (erst erweitern, alte Wege später in einer
  eigenen Migration entfernen).
- Passt die Remote-Historie nicht zu `supabase/migrations` (z. B. eine
  Migration wurde von Hand im SQL-Editor eingespielt), bricht
  `db push` ab. Abhilfe lokal:
  `supabase migration repair --status applied <version>`.
- `.github/workflows/ci.yml` läuft für jeden Pull Request und jeden
  Push auf `master`: Lint, Formatierung (`npm run format:check`),
  Unit-Tests, Build (mit Platzhalterwerten für Supabase), Prüfung von Base-Pfad,
  PWA-Dateien und Bundle (`sb_secret_`), Browser-Tests (Playwright), alle
  Migrationen auf frischer DB, `supabase db lint`, `supabase test db`.

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

Browser-Tests mit Playwright (`npm run test:e2e`) unter `e2e/*.e2e.ts`:
Sie bauen die App mit Platzhalterwerten (`dist-e2e/`), starten
`vite preview` und beantworten alle Supabase-Anfragen aus einem
Speicher-Fake (`e2e/fake-supabase.ts`), ebenso Kacheln und Nominatim.
Kein echter Server, keine Secrets. `e2e/test.ts` lässt jeden Test bei
einem unbehandelten Fehler auf der Seite scheitern. Keine Wiederholungen
(`retries: 0`): ein wackeliger Test ist ein Fehler. Neue Abläufe der
Oberfläche bekommen hier einen Test. Lokal mit einem vorinstallierten
Chromium anderer Version: `PLAYWRIGHT_CHROMIUM_EXECUTABLE=<Pfad>`.

Mindestens prüfen:

### Allgemein

- `npm run lint`
- `npm run format:check` (vorher `npm run format`)
- `npm run build`
- vorhandene Tests, sofern eingerichtet
- Browser-Konsole auf neue Fehler

### PWA

- Manifest wird unter dem richtigen Base-Pfad geladen.
- Icons laden ohne 404.
- Service Worker wird registriert und kontrolliert die App.
- Reload funktioniert.
- Update eines neuen Builds funktioniert nachvollziehbar.
- Installation/Zum-Home-Bildschirm auf realem iOS- und Android-Gerät
  prüfen.

### Offline

- Seite online öffnen und warten, bis der Inhalt lokal gespeichert
  ist.
- Flugmodus aktivieren und die Seite erneut öffnen.
- Dokument offline ändern.
- App schließen und erneut starten; lokale Änderung muss erhalten
  bleiben.
- Netzwerk wieder aktivieren; ausstehende Änderung muss synchronisiert
  werden.
- Wiederholte Synchronisierung darf keine Daten beschädigen.
- Zwei Geräte mit unterschiedlichen Änderungen testen und die
  definierte LWW-Regel überprüfen.
- Fehlende Berechtigungen, Logout und Kontowechsel testen.
- Netzwerkfehler dürfen nicht fälschlich als „Gespeichert" angezeigt
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

- Nicht sofort die gesamte Codebasis umstrukturieren.
- Keine Dateien erstellen, ohne ihre Rolle und Einbindung zu kennen.
- Keine unbekannten Spalten, RPCs, Policies oder Constraints
  voraussetzen.
- Keine Secrets lesen oder ausgeben, wenn es nicht notwendig ist.
- Keine `localStorage`-Lösung als Ersatz für eine robuste
  Offline-Dokumentdatenbank verwenden.
- Nicht behaupten, offline zu funktionieren, nur weil die App Shell
  gecacht wird.
- Keine automatisch synchronisierten Schreibvorgänge als erfolgreich
  anzeigen, bevor sie tatsächlich lokal dauerhaft gespeichert oder
  remote bestätigt wurden.
- Keine unüberprüften absoluten URLs verwenden, die GitHub Pages
  brechen.
- Keine Fehler mit `catch(() => undefined)` verstecken, ohne sie an
  geeigneter Stelle sichtbar zu machen oder kontrolliert zu behandeln.

## 12. Erste konkrete Aufgabe

Beginne **nicht** mit einem großen Refactor. Untersuche zuerst den
aktuellen Repository-Zustand und liefere eine kurze Ist-Analyse.

Dateien/Bereiche, die besonders wichtig sind:

- `package.json`
- `vite.config.ts`
- `index.html`
- `src/main.tsx`
- `src/App.tsx`
- `src/components/editor/BlockEditor.tsx` vollständig
- `src/lib/supabase.ts`
- `src/lib/auth-provider.tsx`
- `src/lib/use-auth.tsx`
- `src/features/pages/`
- vorhandene Supabase-Migrationen und RLS-Policies für
  `page_documents`
- GitHub-Actions-Workflow für GitHub Pages, falls vorhanden
- vorhandene Tests und ESLint-/TypeScript-Konfiguration

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
10. **Notion-Look-and-Feel** (Nutzerwunsch 2026-10-17, nach 7–9).
    Muster und Anmutung wie Notion, aber keine Logos, Icons oder Grafiken
    von Notion übernehmen. Entscheidungen des Nutzers:
    - **Seitenleiste:** heller grauer Hintergrund, kompakte Zeilen,
      Aufklapp-Pfeile, Emoji je Seite, Workspace oben, „Neue Seite“ und
      Papierkorb unten, Aktionen beim Überfahren (Touch: sichtbar).
    - **Seitenkopf:** großer, direkt im Inhalt bearbeitbarer Titel,
      wählbares Emoji-Icon (Spalte `pages.icon` existiert bereits, keine
      Migration nötig), schmale Leiste oben mit Pfad, Speicherstatus und
      „…“-Menü.
    - **Optik:** ruhige, neutrale Palette und Abstände, schmale
      zentrierte Textspalte, Dark Mode automatisch nach
      Systemeinstellung. **Branding:** neutral, nodi-Indigo `#6366F1`
      nur als Akzent (Logo, Auswahl, Fokus, Links).
    - **Editor auf Deutsch:** BlockNote-Übersetzung aktivieren.
    - **Mobil (PWA):** wie die Notion-App. Startansicht ist die
      Seitenliste als ganzer Bildschirm, eine Seite öffnet sich mit
      Zurück-Pfeil oben links. Ersetzt die Schublade aus Paket 5 auf
      kleinen Bildschirmen.
    - Nicht im ersten Wurf: Titelbilder (Storage), Verschieben per
      Drag & Drop (braucht Zyklenprüfung), Suche, Favoriten.
11. **Teilen und Berechtigungen nach dem Notion-Modell**
    (Nutzerwunsch 2026-10-18).
    - **Verschlüsselung:** keine Ende-zu-Ende-Verschlüsselung; der
      Server darf Inhalte lesen (Suche, Teilen, Server-Funktionen).
      Encryption at rest übernimmt die Plattform (Supabase/AWS,
      AES-256), keine eigene Krypto im App-Code. In transit nur TLS,
      nur HTTPS-Endpunkte.
    - **Klartext in der Datenbank (Nutzerentscheidung 2026-10-18):**
      Dokumente und Titel stehen lesbar in `page_documents`/`pages`.
      RLS schützt vor anderen Nutzern, nicht vor Betreibern: Wer das
      Supabase-Dashboard oder den Service-Role-Key nutzt, umgeht RLS
      und kann Inhalte lesen; Encryption at rest ändert daran nichts.
      Gewollt, wie bei Notion. Ausgleich: Dashboard-Zugang klein halten
      (2FA) und in der Datenschutzerklärung offenlegen. Server- oder
      Ende-zu-Ende-Verschlüsselung der Inhalte vorerst nicht.
    - **Zugriff über Berechtigungen, nicht über Schlüssel:** Teilen ist
      ein Eintrag in einer Berechtigungstabelle, kein Schlüsseltausch.
    - **Regeln:** Jede Lese- und Schreiboperation ist durch RLS
      abgesichert: Zugriff nur für Owner, Workspace-Mitglieder oder
      geteilte Nutzer, inklusive Vererbung über `parent_id`.
      Berechtigungen nie nur im Frontend prüfen. Der Service-Role-Key
      nur in Edge Functions, nie im Client.
    - **Abgleich mit dem Ist-Stand (2026-10-18):**
      - `page_shares` (`read`/`edit`) entspricht dem vorgeschlagenen
        `page_permissions` (`viewer`/`editor`); der Owner ist
        `pages.owner_id`. Vorschlag: Tabelle behalten statt umbenennen;
        eine eigene Rolle `owner` wäre eine zweite Quelle der Wahrheit.
      - Der Inhalt liegt in `page_documents` (LWW-RPC, Pakete 6–8),
        nicht in `pages.content`; so bleibt es.
      - RLS gibt es bereits über `can_read_page`/`can_edit_page`.
        **Neu nötig:** Vererbung: ein Share auf eine Seite gilt für
        alle Unterseiten (rekursiv über `parent_id`, mit begrenzter
        Tiefe, solange Verschieben keine Zyklenprüfung hat, §13).
      - **Neu nötig:** Oberfläche zum Teilen (Nutzer per E-Mail
        einladen, Rolle ändern, Zugriff entziehen; nur der Owner).
      - **Neu nötig:** Wird der Zugriff entzogen, löscht der Client
        beim nächsten Kontakt mit dem Server die lokale Kopie und den
        Eintrag im Seitenbaum-Cache. Offline bleibt eine bereits
        geladene Kopie bis dahin auf dem Gerät; „sofort“ gilt für den
        Server.
      - Prüfen: kein Service-Role-Key im Frontend-Bundle (z. B.
        CI-Check auf `dist/`).
    - **Entschieden (Nutzer, 2026-10-18):** (1) Freigaben gelten
      **nicht** für `private` Unterseiten; die Vererbung endet an einer
      privaten Seite (sie und alles darunter brauchen eine eigene
      Freigabe). (2) Öffentliche Links **jetzt**, nur über eine RPC.
      (3) Nutzer finden per **exakter E-Mail-Eingabe**.
    - **Annahme:** Ein öffentlicher Link gilt nur für genau diese Seite,
      nicht für ihre Unterseiten (später erweiterbar).
    - **Aufteilung:** 11a Datenbank (RPCs, Vererbung, Links, pgTAP,
      Schlüssel-Checks), 11b Oberfläche zum Teilen und „Mit mir
      geteilt“, lokale Kopie bei Entzug löschen, 11c öffentlicher Link
      im Teilen-Dialog und öffentliche Seitenansicht ohne Login (der
      Link-Schalter kam nach 11c, damit ein erzeugter Link sofort
      funktioniert).
    - **Umsetzung 11a** (`20261018120000_page_sharing.sql`):
      `has_page_share(page, require_edit)` geht rekursiv über
      `parent_id` nach oben (Stopp an `private`, Tiefe ≤ 50 gegen
      Zyklen); `can_read_page`/`can_edit_page` nutzen es, damit gelten
      alle bestehenden Policies und `save_page_document` automatisch.
      `share_page(page, email, 'read'|'edit')` (nur Owner; `42501`,
      `22023`, `P0002` unbekannte E-Mail; erneutes Teilen ändert die
      Rolle), `list_page_shares(page)` mit E-Mails (nur Owner).
      Ändern/Entziehen über die bestehenden Owner-Policies auf
      `page_shares`. Tabelle `page_public_links` (ein Token je Seite,
      nur Owner), `get_public_page(token)` für `anon` (nur diese
      Seite, nicht archiviert). Die Fehlermeldung bei unbekannter
      E-Mail verrät dem Owner, ob ein Konto existiert (bewusst, wie bei
      Einladungen üblich). Deploy lehnt `sb_secret_`- und
      `service_role`-Schlüssel als Publishable Key ab; CI prüft das
      Bundle auf `sb_secret_`.
    - **Erfolgskriterien (pgTAP):** Nutzer ohne Berechtigung bekommt 0
      Zeilen (`pages`, `page_documents`), auch für Unterseiten.
      Viewer kann lesen, aber nicht schreiben (`save_page_document` →
      `42501`). Editor kann beides. Entzug wirkt sofort: nach dem
      Löschen des Shares 0 Zeilen und `42501`, auch für Unterseiten.
    - **Umsetzung 11b** (nur Frontend, keine Migration):
      - `pages.owner_id` wird mitgeladen (`Page.owner_id`; alte
        Caches ohne Owner gelten als „nicht teilbar“ bis zum
        nächsten Laden). „Teilen“ im Seitenmenü nur für den Owner
        und nur online; der Server prüft es ohnehin.
      - `ShareDialog`: Einladen per E-Mail mit Rolle „Kann lesen“ /
        „Kann bearbeiten“ (`share_page`), Liste (`list_page_shares`),
        Rolle ändern = erneut `share_page`, Entfernen = `delete` auf
        `page_shares`. Fehlercodes als deutsche Meldungen.
      - „Mit mir geteilt“ (`useSharedPages`): lesbare, nicht
        archivierte Seiten außerhalb der eigenen Workspaces
        (`workspace_id not in (…)`, RLS entscheidet). Seiten, deren
        Elternseite nicht sichtbar ist, sind Wurzeln. Cache zuerst
        (Schlüssel `shared-pages` in `nodi-<userId>-tree`), offline
        nur lesend. Mit Bearbeitungsrecht (`can_edit_page`) und
        online sind Titel und Icon änderbar (Update nur per `id`,
        die zurückgegebenen Zeilen zeigen, ob RLS es erlaubt hat);
        Breite, Papierkorb und Teilen (Seitenmenü) bleiben dem
        eigenen Workspace vorbehalten.
      - Entzug: `deleteRevokedLocalCopies` fragt beim Start und bei
        `online` alle lesbaren Seiten-IDs ab und löscht lokal nur
        **synchronisierte** Kopien anderer Seiten (in einer
        Transaktion). Ungesyncte Änderungen bleiben (keine stillen
        Datenverluste; die Sync-Engine meldet `42501`). Ohne
        vollständige Antwort (Fehler, offline, `count` ≠ Zeilen)
        wird nichts gelöscht. Seitenbaum- und Geteilt-Cache werden
        bei der nächsten Serverantwort ersetzt.
    - **Umsetzung 11c** (nur Frontend, keine Migration):
      - Link: `…/nodi/?p=<token>` (Query-Parameter, braucht auf
        GitHub Pages keine eigene Route; URL relativ zu `BASE_URL`).
      - Teilen-Dialog: „Link erstellen“ (`insert` in
        `page_public_links`, Token vom Server), „Kopieren“, „Link
        deaktivieren“ (`delete`, wirkt sofort; ein neuer Link hat
        einen neuen Token). Nur Owner, nur online.
      - `main.tsx` zeigt bei `?p=` die öffentliche Ansicht statt der
        App, ohne `AuthProvider`: kein Login, keine Sync-Engine,
        nichts in IndexedDB. Ein ungültiges Token wird nicht
        angefragt. Inhalt per `get_public_page`, validiert, BlockNote
        mit `editable={false}`. Fehler: ungültig/deaktiviert/
        archiviert („Dieser Link ist ungültig oder wurde
        deaktiviert.“), offline, sonstige.
12. **Workspace-Mitglieder und Bereiche** (Nutzerwunsch 2026-10-18), wie
    Notion: je Workspace ein geteilter Bereich „Workspace“ (alle
    Mitglieder lesen und bearbeiten) und ein Bereich „Privat“ (nur der
    Owner der Seite, plus einzelne Freigaben aus Paket 11).
    - **Entschieden (Nutzer, 2026-10-18):** (1) Bestehende Seiten werden
      privat; geteilt wird gezielt. (2) Verschieben zwischen den
      Bereichen in beide Richtungen, für oberste Seiten, nur durch
      deren Owner, Unterseiten wandern mit. (3) Nur der Workspace-Owner
      lädt ein und entfernt. (4) Bei Austritt/Entfernen gehen geteilte
      Seiten der Person an den Workspace-Owner, private bleiben
      unangetastet, aber unsichtbar, bis sie wieder beitritt.
    - **Annahmen:** Alle Mitglieder bearbeiten alle geteilten Seiten
      (keine Rechte je Seite im Workspace). Eingeladen werden nur
      bestehende Konten per exakter E-Mail, sofort Mitglied (keine
      Einladung zum Annehmen). Endgültig löschen bleibt beim Owner der
      Seite.
    - **Aufteilung:** 12a Datenbank, 12b Oberfläche (Bereiche in der
      Seitenleiste, Verschieben im Seitenmenü, Mitglieder-Dialog).
      Beide zusammen releasen: Nach 12a sehen bestehende Mitglieder
      nichts mehr, bis Seiten in den Workspace verschoben werden.
    - **Umsetzung 12a** (`20261018160000_workspace_members_and_sections.sql`):
      - Alle Seiten mit `visibility = 'workspace'` werden einmalig
        `private`.
      - Bereichsregel (Trigger `require_page_section`, läuft nach
        `protect_page_columns`): Eine Unterseite einer privaten
        Seite ist privat. Beim Anlegen wird das gesetzt (auch für
        ältere App-Versionen), Änderungen, die es verletzen, werden
        mit `22023` abgelehnt. Eine private Unterseite einer
        geteilten Seite bleibt möglich (11a: Freigaben erreichen sie
        nicht).
      - `has_page_share` geht nur noch an der Grenze geteilt → privat
        nicht weiter nach oben; innerhalb eines privaten Baums wirkt
        eine Freigabe auf alle Unterseiten.
      - Owner-Zugriff (`can_read_page`, `can_edit_page`, Löschen) nur
        als Mitglied des Workspace.
      - `protect_page_columns` lässt vertrauenswürdige
        Server-Funktionen (`security definer`, `current_user` ist
        nicht `authenticated`/`anon`) Owner und Sichtbarkeit ändern;
        direkte API-Updates bleiben eingeschränkt.
      - RPCs: `add_workspace_member(workspace, email)` (nur Owner;
        `42501`, `P0002`, `22023`), `list_workspace_members(workspace)`
        mit E-Mail (nur Mitglieder), `remove_workspace_member` (nur
        Owner, nicht den Owner), `leave_workspace` (nicht der Owner),
        `set_page_section(page, 'workspace'|'private')` (nur oberste
        Seiten, nur deren Owner; nach privat werden auch fremde
        Unterseiten dem Aufrufer übertragen). Austritt und Entfernen
        übertragen geteilte Seiten an den Workspace-Owner und löschen
        die Freigaben an die Person in diesem Workspace. Die
        Delete-Policy auf `workspace_members` ist entfernt, damit die
        Übertragung nicht umgangen werden kann.
    - **Umsetzung 12b** (nur Frontend, keine Migration):
      - `Page.visibility` (`PageSection`) wird mitgeladen; alte
        Caches ohne Bereich gelten als privat.
      - Seitenleiste: Bereiche „Workspace“ und „Privat“
        (`pagesInSection`: jede Wurzel mit ihren Unterseiten), je
        mit „+“; „Neue Seite“ unten legt eine private Seite an.
        Unterseiten übernehmen den Bereich der Elternseite.
      - Seitenmenü: „In den Workspace verschieben“ / „In Privat
        verschieben“ (nur oberste eigene Seiten, mit Rückfrage,
        `set_page_section`).
      - Workspace-Menü → „Mitglieder“: Liste mit Rolle, für den
        Owner Hinzufügen per E-Mail und Entfernen (mit Rückfrage),
        für Mitglieder „Workspace verlassen“ (mit Warnung; danach
        Workspace-Liste neu laden und lokale Kopien bereinigen).

13. **Korrekturen aus dem Code-Review** (Nutzerauftrag 2026-10-18, je
    Teil ein PR, in dieser Reihenfolge).
    - **13a Sicherheit (Datenbank)**
      (`20261018180000_harden_page_tree_and_sharing.sql`):
      - `parent_id` ist für API-Clients unveränderlich (`42501`), bis
        es eine Funktion zum Verschieben mit Prüfungen gibt. Vorher
        konnte ein Mitglied fremde Workspace-Bäume unter die eigene
        Seite hängen und mit `set_page_section` übernehmen, und eine
        Bearbeitungsfreigabe reichte zum Weiterteilen oder für Zyklen.
      - Unterseiten nur mit Schreibrecht auf die Elternseite
        (Insert-Policy `can_edit_page(parent_id)`).
      - `set_page_section` lässt private Seiten anderer Mitglieder
        (samt Unterseiten) in beide Richtungen unverändert.
      - Trigger `drop_access_of_previous_owner`: Wechselt der Owner
        einer Seite (Austritt, Entfernen, Verschieben nach privat),
        enden Freigaben und öffentlicher Link des bisherigen Owners.
      - `is_page_owner(page)` = Owner und Mitglied des Workspace; gilt
        für `share_page`, `list_page_shares` und die Policies zum
        Lesen, Anlegen und Ändern von Freigaben und Links. Entziehen
        bleibt ohne Mitgliedschaft möglich.
      - `share_page`/`add_workspace_member` finden nur bestätigte
        Konten (`email_confirmed_at`).
      - Das Token eines öffentlichen Links setzt der Server.
      - Workspaces sind per API nicht mehr löschbar (die App bietet
        es nicht an; Kaskade hätte private Seiten anderer gelöscht).
      - pgTAP: `page_tree_hardening.test.sql`.
    - **13b Editor-Speichern** unabhängig vom Netz: Lokales Speichern
      wartet nicht mehr auf Sync oder Netz; eine Eingabe gilt als
      „wird getippt“, bis sie lokal liegt; `WorkspaceHome` je Konto.
    - **13c Seitenbaum-Hooks** und Fehlerzustände der Dialoge (siehe §4,
      `hooks/load-cache-then-server.ts`).
    - **13d Deploy-Gate:** `build` (Lint, Tests, Build, Bundle-Checks)
      und `verify-database` (Migrationen, `db lint`, pgTAP) laufen vor
      `migrate` und `deploy`.
    - **13e Aufräumen:** ein natives `<dialog>` für alle Modals
      (`components/ui/dialog.tsx`), kein doppeltes Absenden bei „Neue
      Seite“/„Workspace erstellen“, Papierkorb-Korrekturen, Doku.

14. **Datenbanken wie Notion** (Nutzerwunsch 2026-10-18).
    - **Entschieden (Nutzer, 2026-10-18):** (1) Eigenschaften gibt es nur
      an Einträgen einer Datenbank. (2) Eigenschaften (und Ansichten)
      anlegen, ändern, löschen darf jeder mit Schreibrecht. (3) Ein
      Eintrag ist eine Seite mit Eigenschaften (eigener Inhalt im
      Editor). (4) Mehrere Ansichten wie bei Notion; im ersten Wurf
      Tabelle, Board, Liste, Galerie, Feed, Kalender; „Karte“ heißt
      Landkarte (Map) und kommt später. (5) Eigenschaften zuerst nur
      online bearbeitbar; offline werden sie aus dem Cache angezeigt.
    - **Annahmen:** Zuerst Datenbanken als eigene Seite (inline im Text
      später). Einträge haben im ersten Wurf keine eigenen Unterseiten
      in der Oberfläche. Einen Eintrag anlegen braucht Internet (wie
      neue Seiten, §2). Ansichten gelten für alle (wie bei Notion).
    - **Aufteilung:** 14a Datenbank, 14b Oberfläche: Datenbank anlegen,
      Ansichts-Tabs, Tabelle (Werte bearbeiten, Spalten anlegen, Filter,
      Sortierung), Eintrag mit Eigenschaftsleiste; 14c Board, Liste,
      Galerie; 14d Feed, Kalender. Später: Landkarte (Orts-Eigenschaft,
      Kartendienst wählen), Person, Dateien (Storage), Relation, Rollup,
      Formel.
    - **Umsetzung 14a** (`20261018200000_databases.sql`):
      - `pages.kind` (`page`/`database`, unveränderlich) und
        `pages.position` (manuelle Reihenfolge, Mittelwert zweier
        Nachbarn). Einträge sind Unterseiten einer Datenbank; eine
        Datenbank kann kein Eintrag sein (`22023`).
      - `database_properties` (Name, Typ, `options` als JSON-Objekt,
        Reihenfolge) und `database_views` (Typ, `config` für Filter,
        Sortierung, Gruppierung, sichtbare Eigenschaften). Lesen mit
        `can_read_page`, Schreiben mit `can_edit_page` der Datenbank.
        Eine neue Datenbank bekommt per Trigger die Ansicht „Tabelle“.
      - Typen: `text`, `number`, `checkbox`, `select`, `multi_select`,
        `status`, `date` (`{start, end}`), `url` (nur http/https),
        `email`, `created_time`, `last_edited_time` (berechnet, nicht
        setzbar). Ein Typwechsel löscht die Werte der Eigenschaft.
      - `page_property_values` (je Eintrag und Eigenschaft ein Wert,
        JSON `null` = geleert) nur über
        `set_page_property(page, property, value, edited_at,
mutation_id)` → `(applied, stored_edited_at,
stored_mutation_id)`: LWW je Feld wie `save_page_document`
        (Kappung auf `now()`, Gleichstand per Mutation-ID). Fehler:
        `42501` keine Schreibrechte, `22023` falsche Eigenschaft oder
        ungültiger Wert, `22004` Argument fehlt. Direkte Schreibrechte
        sind entzogen.
      - pgTAP: `databases.test.sql`.
    - **Umsetzung 14b** (nur Frontend, keine Migration):
      - `Page` lädt `kind`, `position`, `created_at` mit (alte Caches:
        `page`, `null`, leer). Seitenleiste: „Neue Datenbank“ (privat,
        Titel „Unbenannte Datenbank“); Einträge erscheinen nicht im
        Baum, Datenbanken haben kein „+“ für Unterseiten.
      - Eine Datenbank-Seite zeigt statt des Editors Ansichts-Tabs
        (umbenennen, löschen außer der letzten, „+“ = neue Tabelle),
        Filter (alle Regeln müssen passen), Sortierung (leere Werte
        zuletzt, Auswahl/Status nach Reihenfolge der Optionen),
        ein-/ausblendbare Eigenschaften und die Tabelle. Einstellungen
        gehören zur Ansicht und gelten für alle.
      - Tabelle: Name direkt bearbeitbar, „Öffnen“, Werte je Typ direkt
        bearbeitbar, Spaltenkopf (umbenennen, Typ ändern mit Rückfrage,
        ausblenden, löschen mit Rückfrage), „+“ legt eine Eigenschaft
        an, „Neu“ einen Eintrag (Name hat sofort den Fokus; Einträge
        dürfen ohne Namen sein, „Ohne Titel“). Neue Einträge hängen
        hinten an (`position`).
      - Ein Eintrag zeigt unter dem Titel die Eigenschaftsleiste
        (gleiche Wert-Editoren, „Eigenschaft hinzufügen“), darunter den
        Editor wie bei jeder Seite.
      - `useDatabase`: Cache zuerst (`database:<id>` in
        `nodi-<userId>-tree`, nur vom Server bestätigte Daten), dann
        Server. Aus dem Cache und ohne `can_edit_page` ist alles nur
        lesbar. Werte erscheinen sofort; lehnt der Server ab, wird der
        alte Wert wiederhergestellt (nur wenn kein neuerer Schreibvorgang
        für das Feld läuft); verdrängt (LWW) → neu laden.
        „Zuletzt bearbeitet“ = jüngste Änderung an Text oder Werten.
      - Noch nicht: Einträge in geteilten Datenbanken anderer Workspaces
        anlegen (nur ansehen und Werte ändern), manuelle Reihenfolge per
        Ziehen, Optionen umbenennen/einfärben/löschen.
    - **Umsetzung 14c** (nur Frontend, keine Migration):
      - Neue Ansichten Board, Liste, Galerie („+“ an den Tabs wählt den
        Typ). Filter, Sortierung und sichtbare Eigenschaften gelten wie
        in der Tabelle.
      - Board: eine Spalte je Option einer Auswahl- oder
        Status-Eigenschaft, vorn „Ohne <Name>“ für Einträge ohne
        (gültigen) Wert. Gruppiert wird nach `config.groupByPropertyId`,
        sonst nach der ersten Status-, dann Auswahl-Eigenschaft
        („Gruppieren“ in der Leiste). Ohne passende Eigenschaft bietet
        das Board „Status-Eigenschaft anlegen“ an. Karten per Ziehen
        (Maus) in eine andere Spalte = Wert setzen (`set_page_property`,
        sofort sichtbar); auf Touch-Geräten ändert man den Wert im
        Eintrag. Die Gruppen-Eigenschaft steht nicht auf den Karten.
      - Liste: eine Zeile je Eintrag, Werte rechts (ab `sm`). Galerie:
        Karten im Raster, ohne Titelbilder.
      - „Neu“ in Board, Liste und Galerie legt einen Eintrag an und
        öffnet ihn; in einer Board-Spalte bekommt er deren Wert.
      - Noch nicht: Reihenfolge innerhalb einer Spalte per Ziehen,
        Spalten ausblenden, Titelbilder in der Galerie.
    - **Umsetzung 14d** (nur Frontend, keine Migration):
      - Feed: Einträge untereinander mit „Zuletzt bearbeitet“,
        Eigenschaften und dem Anfang des Textes (`previewText`: Text
        der ersten drei Blöcke, höchstens 280 Zeichen; Tabellen und
        Bilder ausgelassen). Die Abfrage holt dafür nur
        `document->0..2`, keine ganzen Dokumente; die Vorschau wird mit
        der Datenbank gecacht (`documentPreview`). Sie zeigt den Stand
        des Servers: ungesyncte lokale Änderungen erscheinen erst nach
        dem Sync und neuem Laden.
      - Kalender: Monatsraster ab Montag mit Vor/Zurück/„Heute“ (Monat
        nur im Tab, nicht gespeichert). Einträge stehen am Tag einer
        Datums-Eigenschaft (`config.datePropertyId`, sonst die erste;
        „Datum“ in der Leiste), Zeiträume an jedem Tag (höchstens 62).
        „+“ an einem Tag legt einen Eintrag mit diesem Datum an und
        öffnet ihn. Ohne Datums-Eigenschaft: „Datums-Eigenschaft
        anlegen“. Einträge ohne Datum erscheinen im Kalender nicht.
      - Alle sechs Ansichtstypen der Datenbank sind damit nutzbar.
      - Noch nicht: Einträge im Kalender per Ziehen verschieben,
        Wochenansicht.
    - **Landkarte (Nutzerentscheidung 2026-10-18):** Kartendienst
      OpenStreetMap. Kacheln direkt von `tile.openstreetmap.org` (mit
      Quellenangabe, ohne Massenabruf; IP-Adresse und Kartenausschnitt
      gehen an die OSM Foundation, in der Datenschutzerklärung nennen;
      offline keine Kacheln). Einen Ort setzt man per Adresssuche über
      Nominatim (Suchtext geht an die OSM Foundation; nur auf Enter,
      höchstens eine Anfrage pro Sekunde, keine Vorschläge beim Tippen)
      oder per Klick auf die Karte. Aufteilung: 14e-a Datenbank, 14e-b
      Oberfläche (Leaflet, nachgeladen).
    - **Umsetzung 14e-a** (`20261018220000_place_property_and_map_view.sql`):
      - Eigenschaftstyp `place`: `{lat, lng, label}` mit `lat` −90…90,
        `lng` −180…180 (Zahlen), `label` Text bis 500 Zeichen oder
        leer; andere Schlüssel werden abgelehnt (`22023`). Geprüft
        schrittweise, damit falsche Formen `22023` liefern und keinen
        Cast-Fehler.
      - Ansichtstyp `map`. Die Migration erweitert nur die erlaubten
        Werte (rückwärtskompatibel).
      - Achtung: Die Parser aus 14b lehnen unbekannte Typen ab; eine
        App-Version vor 14e kann eine Datenbank mit Ort oder Landkarte
        nicht laden. 14e daher zusammen mit 14b–14d releasen; 14e-b
        lässt unbekannte Typen künftig aus.
      - pgTAP: `database_places.test.sql`.
    - **Umsetzung 14e-b** (nur Frontend, keine Migration):
      - Eigenschaft „Ort“: In Tabelle und Eintrag öffnet ein Klick den
        Orts-Editor mit Adresssuche (Nominatim, nur auf Enter, eine
        Anfrage pro Sekunde, deutsche Ergebnisse, höchstens fünf) und
        kleiner Karte (Klick setzt den Punkt ohne Adresse) sowie
        „Leeren“. Angezeigt wird die Adresse, sonst die Koordinaten;
        „Karte“ öffnet den Ort auf openstreetmap.org. Filtern und
        Sortieren nach dem angezeigten Text.
      - Ansicht „Landkarte“: ein Marker je Eintrag mit Ort (Tooltip mit
        Titel als Text, Klick öffnet den Eintrag), Ausschnitt passt
        sich den Markern an; „Ort“ in der Leiste wählt die Eigenschaft
        (`config.placePropertyId`, sonst die erste); ohne
        Orts-Eigenschaft: „Orts-Eigenschaft anlegen“. Darunter die Zahl
        der Einträge ohne Ort und „Neu“.
      - Leaflet und `leaflet.css` stecken in einem eigenen, nachgeladenen
        Chunk (`MapCanvas`); Marker sind `circleMarker` (keine
        Icon-Bilder). Kacheln von `tile.openstreetmap.org` mit
        Quellenangabe; der Service Worker cached sie nicht, offline
        zeigt die Karte Marker ohne Hintergrund.
      - Die Parser lassen unbekannte Eigenschafts- und Ansichtstypen
        aus, statt die ganze Datenbank abzulehnen.
      - Noch nicht: Marker gruppieren bei vielen Einträgen, Einträge
        auf der Karte verschieben, Kacheln offline.
    - **Formeln (Nutzerentscheidung 2026-10-19):** Schreibweise wie Notion
      (`prop("Preis") * prop("Menge")`, englische Funktionsnamen).
      Grundumfang: Rechnen, Vergleiche, `and`/`or`/`not`, `if`, Text
      (`concat`, `length`, `upper`, `lower`, `contains`, `replace`), Zahlen
      (`round`, `abs`, `min`, `max`, `floor`, `ceil`), `empty`, `format`,
      `toNumber`, Datum (`now`, `dateAdd`, `dateBetween`, `formatDate`);
      Formeln dürfen andere Formeln verwenden. Berechnet wird in der App
      (auch offline, kein `eval`). Aufteilung: 14f-a Datenbank, 14f-b
      Oberfläche mit Formel-Engine.
    - **Umsetzung 14f-a** (`20261019090000_formula_property.sql`):
      - Eigenschaftstyp `formula`; der Ausdruck steht in
        `options.expression` (Text bis 2000 Zeichen oder noch leer,
        Check-Constraint, `23514`). Werte gibt es nicht:
        `set_page_property` lehnt jeden Wert ab (`22023`), wie bei den
        berechneten Zeit-Eigenschaften.
      - Die Migration erweitert nur die erlaubten Werte
        (rückwärtskompatibel; die App ab 14e lässt den unbekannten Typ
        aus).
      - pgTAP: `database_formulas.test.sql`.
    - **Umsetzung 14f-b** (nur Frontend, keine Migration):
      - Engine in `features/databases/formula/`: Tokenizer und
        rekursiver Parser (Rangfolge `?:` < `or`/`||` < `and`/`&&` <
        `==`/`!=` < Vergleich < `+`/`-` < `*`/`/`/`%` < unär `-`/`not`/`!`
        < `^`, rechtsassoziativ), Ausdruck bis 2000 Zeichen,
        Verschachtelung bis 50. `prop()` nur mit festem Namen in
        Anführungszeichen. Ausgewertet wird der Baum, nie JavaScript;
        `replace`/`replaceAll` ersetzen reinen Text (keine regulären
        Ausdrücke).
      - Werte: Zahl, Text, Wahrheitswert, Datum, leer. Leer zählt beim
        Rechnen als 0; `+` mit Text hängt an; falsch, leer, 0 und ""
        gelten als falsch. Eigenschaften gehen als Zahl, Checkbox als
        Wahrheitswert, Datum/Zeiten als Datum ein, alles andere als der
        angezeigte Text (Auswahl: Name der Option). `prop("Name")` ist
        der Titel, wenn keine Eigenschaft so heißt. Datum: `dateAdd`
        (Monatsende bleibt Monatsende), `dateBetween` (ganze Einheiten,
        ohne Sommerzeit-Stunde, wie Notion), `formatDate` (YYYY, MM,
        DD, HH, mm …).
      - Berechnet in `buildRows` für jeden Eintrag (auch offline aus dem
        Cache); Formeln dürfen Formeln verwenden. Fehler stehen je
        Eintrag in `row.errors`: Zirkelbezug bei allen beteiligten
        Formeln, sonst „Die Formel „X“ hat einen Fehler.“ an der
        verwendenden Formel. Anzeige „Fehler“ (Grund im Tooltip und für
        Screenreader), leere Formel „Formel fehlt“.
      - Ergebnis wird angezeigt, gefiltert (Zahlen und Daten als
        solche, sonst als Text) und sortiert wie andere Werte.
      - Formel-Editor (Dialog): Eingabe, Vorschau für den ersten Eintrag
        (bzw. den offenen Eintrag) oder Prüfung der Schreibweise,
        Eigenschaften und Funktionen zum Einfügen, Strg/⌘+Enter
        speichert. Öffnet sich nach „Formel“ anlegen, über „Formel
        bearbeiten“ im Spaltenkopf und über den Namen in der
        Eigenschaftsleiste.
      - Noch nicht: Listen-Funktionen (`map`, `filter`, `sum`), `let`,
        reguläre Ausdrücke, Formelergebnis als Board-Gruppe.

15. **Datei-Speicher** (Nutzerwunsch 2026-10-19, Voraussetzung für den
    Notion-Import, Paket 16).
    - **Entschieden (Nutzer, 2026-10-19):** (1) Bilder und beliebige
      Anhänge; Bilder im Text, andere Dateien zum Herunterladen.
      (2) Höchstens 10 MB je Datei. (3) Einmal angesehene Bilder sind
      offline sichtbar (je Konto lokal gespeichert, beim Abmelden
      gelöscht); Hochladen nur online. (4) Über einen öffentlichen Link
      sind die Dateien genau dieser Seite sichtbar, solange der Link
      aktiv ist.
    - **Aufteilung:** 15a Datenbank (Bucket, Regeln, pgTAP), 15b
      Oberfläche (Hochladen im Editor, Anzeige, Offline-Cache,
      öffentliche Ansicht).
    - **Umsetzung 15a** (`20261019120000_page_files_storage.sql`):
      - Privater Bucket `page-files`, `file_size_limit` 10 MB, alle
        Dateitypen (Bilder zeigt die App nur per `<img>`; Dateien liegen
        auf der Supabase-Domain, nicht auf der App-Domain).
      - Pfad `<pageId>/<zufällige ID>-<Dateiname>`; die Seite steckt im
        Pfad (`page_id_from_file_path`, andere Formen gehören zu keiner
        Seite). Rechte folgen der Seite: Lesen mit `can_read_page`,
        Hochladen und Löschen mit `can_edit_page`, kein Ändern
        (eine neue Version ist eine neue Datei). Über einen aktiven,
        nicht archivierten öffentlichen Link (`has_active_public_link`)
        lesen auch `anon` und angemeldete Fremde.
      - Signierte URLs (`createSignedUrl`) prüfen dieselben Regeln.
      - pgTAP: `page_files.test.sql`; zusätzlich gegen die lokale
        Storage-API geprüft (Hochladen, signierte URL, Fremde, 11 MB,
        Überschreiben, öffentlicher Link).
      - Noch nicht: Dateien endgültig gelöschter Seiten bleiben liegen
        (`storage.objects` erlaubt kein direktes Löschen, nur die
        Storage-API); Aufräumen später.
    - **Umsetzung 15b** (nur Frontend, keine Migration;
      `src/features/files/`):
      - Im Dokument steht ein Verweis `nodi-file:<pfad>` statt einer URL
        (signierte URLs laufen ab). `file-reference.ts`: Pfad, Verweis,
        Dateiname für Storage (Umlaute → Grundbuchstaben, sonst `-`,
        höchstens 100 Zeichen, Endung bleibt), Bild an der Endung.
      - Editor: BlockNote `uploadFile` lädt in den Ordner der Seite
        (`uploadPageFile`, vorher Prüfung auf 10 MB), `resolveFileUrl`
        (`createFileUrlResolver`) löst Verweise auf; fremde URLs bleiben.
        Bilder: zuerst aus dem Cache, sonst signierte URL laden und im
        Cache ablegen; je Editor eine Object-URL je Bild. Andere Anhänge:
        bei jedem Öffnen eine neue signierte URL (1 h), kein Cache.
        Scheitert ein Upload, zeigt BlockNote nur seinen Text; der nennt
        daher Internet und 10 MB.
      - Cache: IndexedDB `nodi-<userId>-files` (eigene DB, kein Upgrade
        der Dokument-DB), Schlüssel = Pfad. Abmelden schließt und löscht
        ihn mit den anderen Datenbanken. Die Bereinigung entzogener
        Seiten (`deleteRevokedLocalCopies`) löscht auch Bilder von Seiten,
        die nicht mehr lesbar sind.
      - Öffentliche Ansicht: derselbe Resolver ohne Cache; die
        signierte URL erlaubt der aktive Link (15a). Nichts wird auf dem
        Gerät gespeichert.
      - Tests: Vitest (`file-reference.test.ts`, `file-storage.test.ts`),
        Playwright `page-files.e2e.ts` (Fake-Storage in
        `e2e/fake-supabase.ts`); zusätzlich gegen die lokale Supabase mit
        echtem Storage geprüft (Hochladen, Verweis, Bild ohne Storage aus
        dem Cache, 11 MB abgelehnt, öffentlicher Link, Abmelden löscht
        den Cache).
      - Noch nicht: Anzeige des Upload-Fortschritts, Dateien beim
        Entfernen aus dem Text löschen, Bilder vor dem Hochladen
        verkleinern.

16. **Notion-Import** (Nutzerwunsch 2026-10-19), nach Paket 15.
    - **Entschieden (Nutzer, 2026-10-19):** (1) Quelle ist der
      Notion-Export als ZIP („Markdown & CSV“), verarbeitet im Browser,
      ohne Server und ohne Notion-Zugangsdaten. (2) Erst Seiten (16a),
      dann Datenbanken aus den CSV-Dateien (16b). (3) Bilder und
      Anhänge kommen in den Datei-Speicher (Paket 15). (4) Alles landet
      unter einer neuen privaten Seite „Notion-Import“ im aktuellen
      Workspace.
    - **Umsetzung 16a** (nur Frontend, keine Migration;
      `src/features/import/`):
      - Workspace-Menü → „Aus Notion importieren“ (nur online und mit
        Workspace). Der Dialog ist nachgeladen (fflate und der
        Markdown-Parser nur bei Bedarf).
      - ZIP im Browser lesen: höchstens 1 GB, Teil-ZIPs großer Exporte
        (`…-Part-N.zip`) werden zusammengeführt, `__MACOSX`/`.DS_Store`
        übersprungen, Pfade NFC (macOS schreibt zerlegte Umlaute).
      - Seitenbaum: jede `Titel <32hex>.md` ist eine Seite; Unterseiten
        liegen im gleichnamigen Ordner, Elternseite ist der nächste
        Ordner mit passender `.md`. Reihenfolge der Geschwister wie die
        Links in der Elternseite, sonst nach Titel. Titel aus der ersten
        Überschrift `# …`, sonst aus dem Dateinamen ohne ID.
      - Inhalt per BlockNote `tryParseMarkdownToBlocks`, dann
        umgeschrieben: Bilder und Anhänge des Exports werden in den
        Ordner der Seite hochgeladen (`uploadPageFile`, 10 MB) und als
        `nodi-file:`-Verweis gespeichert; ein Absatz, der nur aus einem
        Link auf eine Datei besteht, wird Bild- bzw. Datei-Block (ohne
        Inline-Inhalt, sonst lehnt BlockNote das Dokument ab). Links auf
        andere Seiten und Datenbanken werden Text, Web-Links bleiben.
        Fehlende oder zu große Dateien stehen als kursiver Hinweis im
        Text und in der Liste der Hinweise.
      - Gespeichert wird per `save_page_document` (wie die Sync-Engine),
        Seiten per `createPage` (privat). Der Import läuft Seite für
        Seite, „Nach dieser Seite anhalten“ bricht ab; bei einem Fehler
        stoppt er, Importiertes bleibt. Die Seite „Notion-Import“
        enthält Datum und Anzahl der Seiten und Datenbanken.
      - Datenbanken (`.csv` und ihre Eintrags-Ordner) wurden in 16a nur
        genannt; seit 16b werden sie importiert.
      - Tests: Vitest (`notion-export`, `import-blocks`, `notion-import`
        mit fflate-ZIPs), Playwright `notion-import.e2e.ts` (das
        Fake-Backend liefert gespeicherte Dokumente jetzt zurück);
        zusätzlich gegen die lokale Supabase geprüft (Baum, Dateien im
        Bucket, Seite öffnet mit Bild und Anhang).
      - Noch nicht: Notion-Callouts werden normale Absätze (Emoji
        bleibt), Spalten und eingebettete Inhalte nur als Text, Links
        auf importierte Seiten springen nicht zur Seite; kein Import
        in den Bereich „Workspace“.
    - **Umsetzung 16b** (nur Frontend, keine Migration):
      - Eine Datenbank `Titel <id>.csv` steht im Baum wie eine Seite
        (gleiche Elternregel, Reihenfolge nach Links). Gelesen wird
        `…_all.csv` (alle Eigenschaften), sonst die `.csv` (nur die der
        Ansicht). RFC-4180-CSV mit Anführungszeichen, Zeilenumbrüchen,
        BOM und CRLF.
      - Erste Spalte = Titel der Einträge; jede weitere wird eine
        Eigenschaft. Notions CSV hat keine Typen, daher abgeleitet aus
        allen Werten der Spalte (leere zählen nicht): Yes/No (auch
        Ja/Nein) → Checkbox; Zahlen (`-12.5`) → Zahl; Daten in Notions
        Formaten („October 19, 2026“, „Oct 19, 2026“, „19. Oktober 2026“,
        `2026-10-19`, `2026/10/19`, `10/19/2026` bzw. Tag zuerst, wenn
        ein Tag über 12 vorkommt, `19.10.2026`, Zeiträume mit „→“) →
        Datum; http(s)-Links → URL; E-Mail-Adressen → E-Mail; mit
        Komma und wiederholten Teilen → Mehrfachauswahl; wiederholte
        Werte (höchstens 50 verschiedene, je ≤ 100 Zeichen) → Auswahl;
        sonst Text. Optionen in der Reihenfolge des Auftretens, Farben
        reihum. (Uhrzeiten seit 17c, Zahlenformate seit 17b, Status seit
        17a.)
      - Relationen („Titel (Pfad.md)“) werden zu Text mit den Titeln.
        Status, Personen, Dateien, Formeln, Rollups usw. kommen als
        Auswahl oder Text an (Notion exportiert ihr Ergebnis).
      - Einträge: je CSV-Zeile eine Unterseite der Datenbank (Position
        in Zeilenreihenfolge), Werte per `set_page_property` (je
        Eintrag parallel). Der Text kommt aus der passenden
        `.md` im Ordner der Datenbank (nach Titel zugeordnet), ohne die
        Zeilen „Eigenschaft: Wert“, die Notion unter den Titel
        schreibt; Bilder und Anhänge wie bei Seiten. Einträge ohne
        Zeile (`.md` ohne CSV-Zeile) werden ohne Werte angelegt.
        Unterseiten und Datenbanken in Einträgen werden nicht
        übernommen (Hinweis mit Anzahl).
      - „Nach dieser Seite anhalten“ hält auch zwischen Einträgen.
      - `usePages.createPage` liest die Elternseite und die Positionen
        aus dem neuesten Stand (Ref, sofort ergänzt), nicht aus dem
        Stand des letzten Renders: Der Import legt eine Datenbank und
        gleich danach ihre Einträge an.
      - Tests: Vitest (`notion-csv`, `notion-export`, `notion-import`),
        Playwright „Eine Notion-Datenbank wird … übernommen“; zusätzlich
        gegen die lokale Supabase mit einem Export mit allen Typen,
        Relation, Zeitraum und Eintrag mit Bild geprüft.
      - Noch nicht: Ansichten (Board, Kalender …) aus Notion (nur die
        Tabelle), Status-Typ, Relationen als Verknüpfung, Uhrzeiten,
        Zahlen mit Tausendertrennern oder Währung (werden Text). Siehe
        Paket 17.

17. **Notion-Import und Datenbanken ergänzen** (Nutzerwunsch 2026-10-19,
    je Teil ein PR).
    - **Entschieden (Nutzer, 2026-10-19):** (1) Ansichten: Der Export
      enthält keine; abgeleitet werden ausgeblendete Spalten (aus der
      CSV der Ansicht) sowie ein Board (Status/Auswahl) und ein Kalender
      (Datum). (2) Relationen als eigener Eigenschaftstyp
      „Verknüpfung“, **beidseitig wie Notion** (der Server hält beide
      Seiten gleich). (3) Uhrzeiten **je Wert ein-/ausschaltbar** wie
      Notion; Anzeige, Kalender, Filter, Sortierung berücksichtigen sie.
      (4) Zahl-Eigenschaften bekommen ein **Zahlenformat** (Zahl,
      Prozent, Euro, Dollar …); der Import erkennt Trennzeichen und
      Symbole. Status-Spalten erkennt der Import am Namen oder an
      Notions Statuswerten.
    - **Aufteilung:** 17a Import: Status und Ansichten; 17b Zahlenformat;
      17c Uhrzeiten; 17d Verknüpfung (Datenbank); 17e Verknüpfung
      (Oberfläche und Import).
    - **Umsetzung 17a** (nur Frontend, keine Migration):
      - Status: Eine Spalte wird Status, wenn sie „Status“ heißt oder nur
        Notions Statuswerte hat (Not started/In progress/Done, deutsch
        Nicht begonnen/In Bearbeitung/Erledigt), auch wenn jeder Wert
        nur einmal vorkommt. Bekannte Werte bekommen Notions Farben
        (grau, blau, grün).
      - Ansichten: Die Tabelle blendet Eigenschaften aus, die in der CSV
        der exportierten Ansicht fehlen (nur wenn es eine `_all.csv`
        gibt). Dazu ein Board (gruppiert nach der ersten Status-, sonst
        Auswahl-Eigenschaft) und ein Kalender (erste Datums-Eigenschaft),
        mit denselben ausgeblendeten Eigenschaften.
        `databaseRepository.listViews` findet die vom Server angelegte
        Tabelle.
    - **Umsetzung 17b** (nur Frontend, keine Migration):
      - `DatabaseProperty.numberFormat` (`number`, `percent`, `euro`,
        `dollar`, `pound`, `franc`, `yen`); auf dem Server in
        `options.format` (das JSON-Objekt erlaubt beliebige Schlüssel; die
        App liest nur bekannte Formate, unbekannte gelten als „Zahl“). Ein
        Typwechsel setzt `options` neu und damit das Format zurück.
      - Gespeichert bleibt die reine Zahl; das Format betrifft nur die
        Anzeige (`formatValue`, Intl `de-DE`, Währungen mit zwei
        Nachkommastellen). Prozent wie Notion: 0,15 wird „15 %“; Eingabe,
        Filter, Sortierung und Formeln sehen die Zahl.
      - Spaltenmenü der Tabelle: Abschnitt „Zahlenformat“ bei
        Zahl-Eigenschaften.
      - Import: Zahlen mit Tausendertrennern, Dezimalkomma (je Spalte:
        „12,5“ oder „1.234,56“ → Komma; „1,234“ bleibt Tausender),
        Währungssymbolen (€, $, £, CHF, ¥, auch EUR/USD/…) und Prozent
        (Wert / 100). Haben alle Werte dasselbe Symbol, bekommt die
        Eigenschaft dieses Format. Leerzeichen zwischen Ziffern
        (Telefonnummern) sind keine Zahl.
    - **Umsetzung 17c** (nur Frontend, keine Migration; der Server
      erlaubt schon Zeitstempel in Datumswerten):
      - Ein Datumswert ist ein Tag (`YYYY-MM-DD`) oder ein Zeitpunkt
        (ISO-Zeitstempel in UTC); je Wert, wie Notion. Angezeigt und
        bearbeitet wird in der Ortszeit des Geräts.
      - Editor: Uhr-Schalter neben dem Datum (`aria-pressed`). An: beide
        Enden bekommen 09:00 Ortszeit, Eingabe `datetime-local`. Aus: der
        lokale Tag bleibt.
      - Anzeige „19. Okt. 2026, 14:30“; Kalender ordnet nach dem lokalen
        Tag und zeigt die Uhrzeit vor dem Titel (nur am ersten Tag eines
        Zeitraums). Filter „ist/vor/nach“ vergleichen den lokalen Tag
        (gilt jetzt auch für „Erstellt“/„Zuletzt bearbeitet“, vorher
        UTC-Tag). Sortieren nach dem Zeitpunkt; ein Tag zählt ab
        Mitternacht.
      - Import: Notions Uhrzeiten (ohne Zeitzone) gelten als Ortszeit des
        Geräts und werden als Zeitstempel gespeichert.
    - **Umsetzung 17d** (`20261019150000_relation_property.sql`):
      - Eigenschaftstyp `relation`; `options` =
        `{databaseId, pairedPropertyId}`. Jede Verknüpfung hat eine
        Gegenseite in der Ziel-Datenbank; beide legt nur die RPC
        `add_relation_property(database, name, target, paired_name)` →
        `(property_id, paired_property_id)` an (Schreibrecht auf beide
        Datenbanken, gleicher Workspace; `42501`, `22023`, `22004`).
        Ziel kann dieselbe Datenbank sein (zwei Eigenschaften).
      - Trigger `protect_relation_properties`: API-Clients legen keine
        Verknüpfung direkt an (`42501`), ändern weder Typ von/zu
        `relation` (`22023`) noch `options` (`42501`); umbenennen und
        verschieben geht. Löschen entfernt die Gegenseite mit und
        braucht Schreibrecht auf beide Datenbanken (`42501`); wird eine
        Datenbank gelöscht, verschwinden die Gegenseiten ihrer
        Verknüpfungen.
      - Wert: JSON-Array von Eintrags-IDs der Ziel-Datenbank (höchstens
        100, Duplikate entfernt, Reihenfolge bleibt; leer = JSON `null`).
        `set_page_property` (Signatur unverändert) ruft für Verknüpfungen
        `set_relation_value`: LWW für das eigene Feld; die Gegenseite
        ändert sich als Menge (Eintrag hinzu/weg) und ihre
        Bearbeitungszeit rückt vor, damit ein älteres Überschreiben dort
        die Verknüpfung nicht einseitig aufhebt. Sperren auf die
        betroffenen Seiten in fester Reihenfolge. Hinzufügen oder
        Entfernen braucht Schreibrecht auf jeden betroffenen Eintrag
        (`42501`).
      - IDs später endgültig gelöschter Einträge bleiben in den Arrays;
        die App übergeht sie.
      - pgTAP: `database_relations.test.sql`.
      - App-Versionen ab 14e lassen den unbekannten Typ aus; die
        Oberfläche folgt in 17e.
    - **Umsetzung 17e-a** (nur Frontend, keine Migration):
      - `DatabaseProperty.relation` = `{databaseId, pairedPropertyId,
entries}`. Die lesbaren, nicht archivierten Einträge der
        Ziel-Datenbanken (`id`, Titel, Icon) lädt `databaseRepository.load`
        mit (eine Abfrage `parent_id in (…)`, RLS entscheidet) und hängt
        sie an die Eigenschaft, wie Optionen an eine Auswahl; so stehen
        sie auch im Cache und offline zur Verfügung.
      - Anlegen: „+“ → „Verknüpfung“ → Datenbank des Workspace (auch
        dieselbe); Name = Titel der Ziel-Datenbank, Gegenseite = eigener
        Titel (`addRelation`, RPC, danach neu laden). Nur im eigenen
        Workspace (geteilte Datenbanken anderer Workspaces: kein
        „Verknüpfung“).
      - Wert: Einträge als Chips; Klick öffnet die Auswahl (Suche,
        Haken, „Leeren“). Unbekannte IDs (gelöscht, nicht lesbar)
        werden übergangen. Anzeige in Karten, Liste usw., Filter
        „enthält/leer“ und Sortieren nach den Titeln; Formeln sehen die
        Titel als Text.
      - Spaltenmenü: kein Typwechsel von oder zu „Verknüpfung“; Löschen
        warnt, dass die Gegenseite mit verschwindet.
      - Neu geladen wird nach Anlegen, nach Löschen und Setzen einer
        Verknüpfung innerhalb derselben Datenbank (die Gegenseite liegt
        dann hier). Umbenennen behält die geladenen Einträge.
      - Fake-Backend: Eigenschaften je Datenbank, verknüpfte Einträge,
        `add_relation_property`, Spiegeln der Gegenseite.
      - Noch nicht: Einträge der Ziel-Datenbank aus der Auswahl heraus
        anlegen, verknüpften Eintrag direkt öffnen, Rollups.
    - **Umsetzung 17e-b** (nur Frontend, keine Migration):
      - Eine CSV-Spalte ist eine Relation, wenn jede gefüllte Zelle nur
        Links „Titel (Pfad.md)“ enthält (aufgelöst vom Ordner der CSV) und
        alle auf Einträge **einer** Datenbank dieses Exports zeigen. Sonst
        bleibt sie Text (Titel ohne Pfade, wie bisher).
      - Relationen werden erst nach allen Datenbanken angelegt (dann gibt
        es die verknüpften Einträge). Hat die Ziel-Datenbank eine Spalte
        zurück, wird sie zur Gegenseite (Name übernommen), sonst heißt
        die Gegenseite wie die Quell-Datenbank. Werte beider Spalten
        werden vereinigt und nur auf einer Seite gesetzt; der Server
        verknüpft die andere. Höchstens 100 Einträge je Wert.
      - Ist die Ziel-Datenbank nicht importiert (angehalten), entfällt
        die Spalte mit Hinweis.

18. **Seiten verschieben** (Nutzerwunsch 2026-10-19).
    - **Entschieden (Nutzer, 2026-10-19):** (1) Seitenmenü „Verschieben
      nach…“ mit Suche und zusätzlich Ziehen in der Seitenleiste (Maus).
      (2) Verschieben darf, wer Schreibrecht auf Seite und Ziel hat (wie
      Notion); ein Wechsel zwischen Privat und Workspace nur der Owner
      der Seite (§2). (3) Datenbanken wie Notion: Eine Seite wird beim
      Verschieben in eine Datenbank zum Eintrag, ein Eintrag beim
      Herausnehmen zur normalen Seite (seine Werte entfallen).
    - **Annahme:** Eine Seite mit Unterseiten wird vorerst kein Eintrag
      (Einträge zeigen in Nodi keine Unterseiten; sie wären versteckt).
    - **Aufteilung:** 18a Datenbank, 18b Oberfläche.
    - **Umsetzung 18a** (`20261019180000_move_page.sql`):
      - RPC `move_page(page, parent, section)`: Ziel ist eine Seite
        (`parent`) oder die oberste Ebene eines Bereichs (`section`,
        `workspace`/`private`). `parent_id` bleibt für API-Clients
        gesperrt (13a); die Funktion ist der einzige Weg.
      - Prüft Schreibrecht auf Seite und Ziel (`42501`), gleichen
        Workspace, nichts im Papierkorb, keine Zyklen (Ziel ist weder die
        Seite noch darunter; Tiefe ≤ 50), keine Datenbank als Eintrag,
        keine Seite mit Unterseiten als Eintrag (`22023`), fehlende
        Argumente (`22004`).
      - Die Seite übernimmt den Bereich ihres neuen Platzes. Ein
        Bereichswechsel nur durch den Owner (`42501`) und für den ganzen
        Unterbaum wie `set_page_section` (nach privat von den Blättern
        her, Owner wird der Aufrufer; in den Workspace von der Wurzel
        her; private Seiten anderer bleiben, wie sie sind).
      - In eine Datenbank: Eintrag am Ende (`position` = Maximum + 1).
        Aus einer Datenbank heraus (oder in eine andere): Werte gelöscht,
        Verknüpfungen auf der Gegenseite gelöst; `position` wird `null`.
      - pgTAP: `move_page.test.sql`.
      - Die Oberfläche folgt in 18b.
    - **Umsetzung 18b** (nur Frontend, keine Migration):
      - `moveProblem` (`page-hierarchy.ts`) prüft dieselben Regeln wie
        `move_page` (nicht in sich selbst/Unterseiten, Datenbank/Seite
        mit Unterseiten nicht als Eintrag, schon dort, Bereichswechsel nur
        Owner); die Rechte aufs Ziel prüft der Server.
      - `usePages.movePage(page, {parentId} | {section})`: RPC, die Seite
        hängt sofort am neuen Platz, danach lädt der Baum vom Server neu
        (Bereich und Owner im Unterbaum, Position als Eintrag).
      - „Verschieben nach …“ im Seitenmenü und im Menü der Baumzeile
        (`MovePageDialog`): Suche, Bereiche „Workspace/Privat (oberste
        Ebene)“, Seiten und Datenbanken mit Pfad; ungültige Ziele sind
        deaktiviert (Grund im Tooltip). Wechselt der Bereich, kommt eine
        Rückfrage wie bei „In Privat verschieben“. Bei einem Eintrag steht
        der Hinweis, dass Eigenschaften und Verknüpfungen außerhalb der
        Datenbank entfallen. Nicht für geteilte Seiten anderer Workspaces.
      - Ziehen in der Seitenleiste (Maus, HTML-Drag-and-Drop): auf eine
        Seite oder Datenbank = darunter bzw. als Eintrag, auf den Titel
        „Workspace“/„Privat“ = oberste Ebene. Nur gültige Ziele werden
        hervorgehoben; in einen anderen Bereich öffnet sich die
        Rückfrage. Auf Touch-Geräten verschiebt man über das Menü.
      - Noch nicht: Reihenfolge unter Geschwistern per Ziehen (Seiten
        stehen nach Erstellung), Verschieben in andere Workspaces.

19. **Notion-Import nachbessern, Datenbank-Ansichten in Seiten**
    (Nutzerwunsch 2026-10-19): Ein großer Import ließ sich nicht in den
    Papierkorb legen, Ansichten von Datenbanken in Seiten fehlten, und
    bestehende Datenbanken sollen sich in eine Seite einbinden lassen.
    - **Entschieden (Nutzer, 2026-10-19):** (1) Ein Block „Datenbank“ im
      Text zeigt eine bestehende Datenbank mit **eigenen Ansichten je
      Block** (wie verknüpfte Ansichten in Notion): Typ, Filter,
      Sortierung und sichtbare Eigenschaften des Blocks ändern die
      Ansichten der Datenbank nicht. (2) Der Import legt diese Blöcke
      künftig an; bestehende Importe werden nicht umgebaut (der Nutzer
      löscht seinen Import und importiert neu).
    - **Aufteilung:** 19a Papierkorb für große Bäume (Fehlerbehebung),
      19b Datenbank (Ansichten je Block), 19c Block „Datenbank“ im
      Editor, 19d Import erzeugt die Blöcke.
    - **Umsetzung 19b** (`20261019200000_block_views.sql`):
      - Tabelle `block_views`: Seite (`page_id`), Block im Dokument
        (`block_id`, die BlockNote-ID, 1–100 Zeichen), gezeigte
        Datenbank (`database_id`, muss eine Datenbank sein, `22023`),
        Name, Typ (wie `database_views`), `config` (JSON-Objekt),
        `position`. Löschen der Seite oder der Datenbank löscht die
        Zeilen mit; Ansichten eines aus dem Text entfernten Blocks
        bleiben bis dahin liegen (der Server liest keine Dokumente).
      - Lesen mit `can_read_page` auf Seite **und** Datenbank (die
        Ansicht zeigt deren Daten). Anlegen und Ändern mit
        `can_edit_page` der Seite und `can_read_page` der Datenbank,
        Löschen mit `can_edit_page` der Seite (`42501` per RLS).
      - Nur eine neue Tabelle (rückwärtskompatibel).
      - pgTAP: `block_views.test.sql`.
    - **Umsetzung 19c** (nur Frontend, keine Migration):
      - Editor-Schema `components/editor/editor-schema.tsx`: BlockNotes
        Blöcke plus `database` (`props.databaseId`, kein Inhalt).
        `DocumentContent` ist an dieses Schema gebunden; Editor und
        öffentliche Ansicht nutzen es.
      - Slash-Menü „/Datenbank“ (Gruppe „Datenbanken“) fügt den Block ein;
        er fragt zuerst, welche Datenbank des Workspace er zeigt (Suche).
        Ohne Schreibrecht steht dort nur ein Hinweis.
      - Der Block (`DatabaseBlock`, Inhalt nachgeladen im
        Datenbank-Chunk: `DatabaseBlockContent`) zeigt Titel (öffnet die
        Datenbank) und `DatabaseView` mit den Ansichten des Blocks.
        Kontext aus der App per `DatabaseBlockContext` (bekannte Seiten,
        Datenbanken, Öffnen, Einträge anlegen und umbenennen).
      - Ansichten des Blocks: `useDatabase(…, block)` liest und schreibt
        `block_views` statt `database_views`. Ohne eigene Ansichten zeigt
        der Block eine Tabelle, die erst bei der ersten Änderung
        gespeichert wird (Lesen schreibt nichts). Ansichten ändern darf,
        wer die Seite bearbeiten darf; Werte, Eigenschaften und Einträge
        wie auf der Datenbank-Seite.
      - Offline: Cache je Block (`database-block:<page>:<block>` in
        `nodi-<userId>-tree`), nur lesbar.
      - Fehlt die Datenbank (Papierkorb, gelöscht, nicht freigegeben),
        steht ein Hinweis da. Die öffentliche Ansicht zeigt statt der
        Datenbank einen Hinweis (Einträge sind nicht veröffentlicht).
      - Achtung: App-Versionen vor 19c kennen den Block nicht und können
        Seiten mit Datenbank-Block nicht öffnen; installierte Apps nach
        dem Update-Hinweis aktualisieren.
      - Tests: Playwright `database-block.e2e.ts` (Fake `block_views`);
        zusätzlich gegen die lokale Supabase geprüft.
    - **Umsetzung 19d** (nur Frontend, keine Migration):
      - Der Import vergibt die IDs der Datenbanken vorab
        (`createPage(…, id)`): Der Text einer Seite wird gespeichert, bevor
        die Datenbanken darunter angelegt sind.
      - Ein Absatz, der nur aus einem Link auf eine importierte Datenbank
        besteht (`….csv`), wird zum Block „Datenbank“ (feste Block-ID).
        Links auf nicht importierte Datenbanken bleiben Text wie bisher.
      - Am Ende bekommt jeder solche Block eine Kopie der Ansichten seiner
        Datenbank (Tabelle mit ausgeblendeten Spalten, Board, Kalender) in
        `block_views`; danach lassen sie sich je Block ändern.
      - Wird der Import vorher abgebrochen, zeigt ein Block auf eine nicht
        angelegte Datenbank den Hinweis „nicht verfügbar“.
      - Bestehende Importe werden nicht umgebaut (Entscheidung des
        Nutzers: neu importieren).
      - Tests: Vitest (`import-blocks.test.ts`, `notion-import.test.ts`),
        Playwright `notion-import.e2e.ts`; zusätzlich ein Export mit
        Datenbank in einer Seite gegen die lokale Supabase importiert.

20. **Tippen auf dem Handy** (Nutzerwunsch 2026-10-19): Auf dem iPhone
    sah die Formatierungsleiste beim Schreiben seltsam aus und sprang;
    über der Tastatur blieb wenig Platz.
    - **Entschieden (Nutzer, 2026-10-19):** (1) Die Formatierungsleiste
      erscheint auf Touch-Geräten nur bei markiertem Text (sonst „/“ und
      Markdown-Kürzel). (2) Die obere Leiste einer Seite wird auf dem Handy
      ausgeblendet, solange die Tastatur offen ist. (3) Der iOS-Balken mit
      ˄ ˅ „Fertig“ über der Tastatur gehört zu Safari; eine Web-App kann ihn
      nicht ausblenden.
    - **Umsetzung** (nur Frontend, keine Migration):
      - Ursache: iOS verkleinert bei offener Tastatur nur den sichtbaren
        Bereich (`visualViewport`), nicht die Seite; die App (`h-svh`) war
        höher als sichtbar und wurde beim Tippen verschoben. BlockNote
        (0.56) heftet auf Touch-Geräten seine Leiste bei Fokus immer über
        die Tastatur, mit Safe-Area-Lücke darunter und Nachzieh-Animation.
      - `lib/virtual-keyboard.ts`: erkennt die Tastatur (sichtbare Höhe
        mehr als 150 px unter der größten bei dieser Breite, nicht
        gezoomt, nur Touch) und setzt `<html data-keyboard-open>` sowie
        `--keyboard-viewport-top/-height`; gestartet in `WorkspaceHome`.
      - `index.css`: Mit offener Tastatur ist die App (`.nodi-app-viewport`)
        fest auf den sichtbaren Bereich gesetzt; unter `md` ist die obere
        Leiste (`.nodi-page-top-bar`) ausgeblendet. BlockNotes Leiste ohne
        Safe-Area-Abstand und ohne Animation.
      - `BlockEditor`: `formattingToolbar={false}`; auf Touch-Geräten
        `MobileFormattingToolbarController` nur bei Textauswahl, sonst wie
        bisher `FormattingToolbarController`. `useVirtualKeyboard` läuft ab
        dem Öffnen, damit BlockNote die volle Höhe kennt.
      - Tests: Vitest `virtual-keyboard.test.ts`, Playwright
        `mobile-keyboard.e2e.ts` (Touch-Emulation, nachgebautes
        `visualViewport`). Auf einem echten iPhone noch nicht geprüft.

### Plan ab Paket 21 (Nutzer, 2026-10-19)

Ziel: Ein vollständiger Notion-Export soll nach dem Import so funktionieren
wie in Notion. Grundlage ist der echte Export des Nutzers (465 Dateien,
34 Datenbanken). Reihenfolge nach seiner Priorität; je Paket ein PR (bei
Bedarf a/b für Datenbank und Oberfläche). Versionsverlauf ist vorerst
nicht gewünscht.

- **Entschieden (Nutzer, 2026-10-19):** (1) Suche online als Volltext auf
  dem Server über alle Seiten, offline über Titel und die lokal
  gespeicherten Seiten. (2) Callouts bekommen einen eigenen Block wie in
  Notion (Emoji, farbiger Hintergrund). (3) Am wichtigsten: Rollups,
  Unterseiten in Einträgen, wiederkehrende Einträge, Vorlagen.

21. **Import: neues Notion-Exportformat** (Fehler: Datenbank-Einträge
    kommen als einzelne Seiten an). Befund im Export des Nutzers:
    - Ordner tragen **keine ID** mehr: Unterseiten von `Aufgaben <id>.md`
      liegen in `Aufgaben/`, Einträge von `Tasks <id>_all.csv` in `Tasks/`.
      Der Import sucht bisher `Aufgaben <id>/`, findet nichts, und der Baum
      zerfällt in lose Seiten.
    - Datenbanken gibt es nur als `…_all.csv` (keine Ansichts-CSV).
    - Eine ganzseitige Datenbank hat zusätzlich `Name <id>.md` mit
      derselben ID; das ist die Datenbank selbst, keine eigene Seite.
    - Die CSV enthält **keine** Verknüpfungen, Rollups und Formeln. Sie
      stehen nur in den Eigenschaftszeilen der Eintragsseiten
      („Workout: Titel (../Workouts/….md)“, „Volume: 175“).
    - Eingebettete Ansichten sind Kopien in der obersten Ebene
      (`Untitled 8fe7-1f36_all.csv`: erste und letzte vier Zeichen der
      Datenbank-ID); darunter stehen im Text „filters:“ (nicht lesbar) und
      „sort:“ (lesbar, z. B. „Status: ascending“).
    - Neue Datumsformate: „September 20, 2026 8:30 (GMT+2)“,
      „09/09/2026 8:00 AM (GMT+2)“, Zeitraum „… 7:20 (GMT+2) → 16:00“.
    - Kleinere Punkte: Titel mit Zeilenumbruch, Dateinamen mit Klammern,
      Datenbanken in Einträgen (Paket 23), Callouts als `<aside>`
      (Paket 22), Link-Ziele außerhalb des Exports (Hinweis).
    - **Umfang:** Baum für beide Formate (Ordner mit und ohne ID),
      Datenbank-Seite = Datenbank, Einträge aus `Name/`, Eigenschaften
      aus CSV **und** Eintragsseiten (Verknüpfungen werden echte
      Verknüpfungen, Rollup-/Formelwerte feste Werte), eingebettete
      Ansichten werden Datenbank-Blöcke auf die echte Datenbank mit der
      Sortierung, „filters:/sort:“-Zeilen verschwinden aus dem Text. Test
      mit einem Ausschnitt des echten Formats (ohne persönliche Inhalte).
    - **Nicht möglich:** Filter der Ansichten, Formel-Ausdrücke,
      Seiten-Icons und Titelbilder (nicht im Export).
    - **Aufteilung:** 21a Struktur (Baum, Datenbanken, Einträge,
      eingebettete Ansichten), 21b Eigenschaften aus den Eintragsseiten
      (Verknüpfungen, Rollup-/Formelwerte) und neue Datumsformate.
    - **Umsetzung 21a** (nur Frontend, keine Migration):
      - `planNotionImport` kennt beide Ordnerformen (`X <id>/` und `X/`).
        Teilen sich gleichnamige Geschwister einen Ordner, gehört eine
        Unterseite der Seite, die sie verlinkt (sonst der ersten).
      - Datenbank = `X <id>.csv` und/oder `X <id>_all.csv`; Einträge im
        Ordner `X <id>/` oder `X/`. Eine `.md` mit der ID einer Datenbank
        im selben Ordner ist die Datenbank selbst (keine eigene Seite);
        Links auf sie oder auf `_all.csv` ordnen die Datenbank ein.
      - Gibt es nur `_all.csv`, blendet die Tabelle nichts aus (vorher
        waren dann alle Eigenschaften ausgeblendet).
      - Kopien eingebetteter Ansichten (`Untitled abcd-wxyz_all.csv`, ohne
        volle ID) werden keine Datenbanken: `plan.databaseCopies` ordnet
        sie der einen Datenbank zu, deren ID mit `abcd` beginnt und auf
        `wxyz` endet. Der Link wird ein Datenbank-Block auf die echte
        Datenbank.
      - `takeViewSettings`: Unter dem Link stehende „filters:“/„sort:“-
        Zeilen (bis zur nächsten Leerzeile oder einem HTML-Tag wie
        `</aside>`) verschwinden aus dem Text; „Name: ascending/descending“
        wird die Sortierung aller Ansichten des Blocks (Spaltenname →
        Eigenschaft, Titelspalte → Titel; unbekannte Namen entfallen).
        Filter sind nicht lesbar und entfallen.
      - Fehlt eine verlinkte Datenbank im Export, bleibt ihr Name als Text
        und es gibt einen Hinweis.
      - Geprüft gegen den echten Export des Nutzers (nur lokal, nicht im
        Repository): 20 Seiten, 20 Datenbanken, 374 Einträge, 63
        Datenbank-Blöcke, keine Fehler. Tests: Vitest (`notion-export`,
        `notion-import`), Playwright „Ein neuerer Notion-Export …“.
    - **Umsetzung 21b** (nur Frontend, keine Migration):
      - `readPropertyLines`: die Zeilen „Name: Wert“ direkt unter dem Titel
        eines Eintrags (bis zur ersten anderen Zeile). Namen, die die CSV
        nicht hat, werden Eigenschaften, wenn sie in mindestens zwei
        Einträgen stehen oder neben einer CSV-Eigenschaft (sonst könnte es
        Text sein, „Fazit: gut“). Der CSV-Wert hat Vorrang; Einträge ohne
        CSV-Zeile bekommen alle Werte ihrer Seite.
      - Diese Werte laufen durch dieselbe Typerkennung wie CSV-Spalten.
        Links auf Einträge **einer** Datenbank werden Verknüpfungen
        (aufgelöst vom Ordner der Eintragsseite); Rollup- und Formelwerte
        werden feste Zahlen, Texte usw. Ein Rollup, das verknüpfte Seiten
        zeigt, sieht aus wie eine Verknüpfung und wird eine.
      - Daten: Zeitzone aus „(GMT+2)“/„(GMT-5:30)“ wird berücksichtigt
        (ohne Zone: Ortszeit des Geräts); ein Zeitraum, dessen Ende nur eine
        Uhrzeit ist („… 7:20 (GMT+2) → 16:00“), endet am selben Tag.
      - Links und Relationszellen, deren Pfad Klammern enthält
        („Notizen%20(2)%20….md“), werden erkannt.
      - Titel mit führendem Zeilenumbruch: schon durch `trim` abgedeckt.
      - Echter Export (nur lokal): 113 Eigenschaften (vorher 74), davon 15
        Verknüpfungen, 1747 Werte (vorher 1041), keine Fehler.
22. **Callout-Block:** eigener BlockNote-Block (Emoji, Farbe, Text),
    „/Callout“, Anzeige in der öffentlichen Ansicht; Import aus `<aside>`.
    - **Umsetzung 22** (nur Frontend, keine Migration):
      - Block `callout` in `editor-schema.tsx`: Inline-Text, Props `emoji`
        (Standard 💡) und `color` (BlockNotes Farbnamen, Standard grau;
        `components/editor/callout.ts`). Verschachtelte Blöcke (Tab) stehen
        mit im farbigen Kasten (`.nodi-callout`-Regeln in `index.css` per
        `:has`, hell und dunkel).
      - Klick auf das Emoji (nur mit Schreibrecht): Emoji-Auswahl (dieselbe
        Liste wie Seiten-Icons, jetzt `features/pages/page-icons.ts`) und
        Hintergrund. Slash-Menü „/Callout“ (auch „hinweis“, „info“).
      - Öffentliche Ansicht: dasselbe Schema, Emoji nicht klickbar.
      - Import: `markdownToImportedBlocks` macht aus `<aside>…</aside>`
        einen Callout; der erste Absatz ist sein Text (ein führendes Emoji
        wird das Icon), der Rest wird verschachtelt. Steht am Anfang nur
        ein Link (Datenbank, Datei), bleibt er ein eigener Block im Callout.
      - Achtung: App-Versionen vor 22 kennen den Block nicht und können
        Seiten mit Callout nicht öffnen (wie 19c); installierte Apps nach
        dem Update-Hinweis aktualisieren.
      - Tests: Vitest `import-blocks.test.ts`, Playwright `callout.e2e.ts`
        und „Notion-Callouts werden Callout-Blöcke“.
23. **Unterseiten in Datenbank-Einträgen:** Einträge zeigen und haben
    Unterseiten und Datenbanken (Seitenleiste, Eintrag, Verschieben;
    `move_page` erlaubt dann Seiten mit Unterseiten als Eintrag). Import
    übernimmt sie statt sie zu überspringen.
    - **Annahme:** Einträge bleiben aus der Seitenleiste heraus (14b), ebenso
      alles unter ihnen; ihre Unterseiten stehen im Eintrag (wie Notion sie im
      Text zeigt). Der Pfad oben führt zurück.
    - **Umsetzung 23** (`20261020090000_entries_with_subpages.sql`):
      - `move_page` ohne die Regel „Seite mit Unterseiten wird kein Eintrag“
        (sonst unverändert). Unterseiten und Datenbanken unter Einträgen
        erlaubte der Server schon (Insert mit `can_edit_page(parent_id)`).
        pgTAP: `entry_subpages.test.sql`, in `move_page.test.sql` entfällt
        die alte Prüfung.
      - `withoutDatabaseEntries` lässt Einträge **und alles darunter** aus
        dem Baum (vorher wären Unterseiten von Einträgen als oberste Seiten
        erschienen); `moveProblem` ohne die alte Regel.
      - Ein Eintrag zeigt unter der Eigenschaftsleiste `SubpageList`:
        Unterseiten und Datenbanken (Klick öffnet) und „+ Unterseite“ /
        „+ Datenbank“ (nur mit Schreibrecht, online, eigener Workspace).
      - Import: Eine `.md` direkt im Ordner einer Datenbank ist ein Eintrag;
        alles tiefer (Seiten, Datenbanken, deren Einträge) wird mit dem
        Eintrag als Elternseite übernommen, nach der Datenbank. Der Hinweis
        „… nicht übernommen“ entfällt. Echter Export: 3 Datenbanken und 18
        Einträge mehr, keine Fehler.
      - Tests: Vitest (`page-hierarchy`, `notion-export`, `notion-import`),
        Playwright `entry-subpages.e2e.ts`.
24. **Rollups:** Eigenschaftstyp „Rollup“ (Verknüpfung, Eigenschaft der
    Ziel-Datenbank, Funktion: Anzahl, Summe, Durchschnitt, Min/Max,
    Anzeigen …), berechnet in der App wie Formeln. Import: Rollup- und
    Formelwerte bleiben feste Werte; die Rechnung legt man einmal neu an.
    - **Umsetzung 24** (`20261020100000_rollup_property.sql`):
      - Eigenschaftstyp `rollup`; Einstellungen in `options`:
        `relationPropertyId`, `targetPropertyId` (Eigenschaft der
        verknüpften Datenbank oder `title`), `function` (Check-Constraint,
        `23514`; alle drei fehlen, solange das Rollup nicht eingerichtet
        ist). Keine Werte: `set_page_property` lehnt ab (`22023`). pgTAP:
        `database_rollups.test.sql`.
      - Funktionen (`features/databases/rollup.ts`, wie Notion): Werte
        anzeigen, Anzahl, Werte/Eindeutige/Leere/Nicht leere zählen, Prozent
        leer/nicht leer; bei Zahlen Summe, Durchschnitt, Median, Minimum,
        Maximum, Spanne; bei Daten frühestes/spätestes Datum und Spanne in
        Tagen; bei Checkboxen angehakt/nicht angehakt zählen, Prozent
        angehakt. Angeboten wird, was zum Typ passt.
      - `databaseRepository.load` lädt zu jedem Rollup die Ziel-Eigenschaft
        und ihre gespeicherten Werte (`withRollupTargets`, RLS entscheidet)
        und hängt sie an die Eigenschaft (`rollup.target`, auch im Cache:
        offline berechnet). Berechnet in `buildRows` vor den Formeln (Formeln
        sehen Rollups als Zahl, Datum oder Text). Anzeige: Prozent als
        Prozent, Summe & Co. im Zahlenformat des Ziels.
      - Oberfläche: „+“ → „Rollup“ öffnet den `RollupEditor` (Verknüpfung,
        Eigenschaft, Berechnung), ebenso „Rollup bearbeiten“ im Spaltenkopf
        und der Name in der Eigenschaftsleiste. Nach einer Änderung wird neu
        geladen. Filter und Sortierung wie bei Formeln.
      - Noch nicht: Rollups über Formeln, Rollups, Verknüpfungen und die
        Zeit-Eigenschaften der Ziel-Datenbank (dort gibt es keine
        gespeicherten Werte); mehr als 1000 Werte je Ziel-Eigenschaft
        (`max_rows`); der Import legt keine Rollups an (feste Werte, §24).
      - Tests: Vitest `rollup.test.ts`, `database-model.test.ts`,
        Playwright `database-rollups.e2e.ts`.
25. **Wiederkehrende Einträge:** Eintrag als Wiederholung („täglich“,
    „wöchentlich am …“), neue Einträge entstehen automatisch.
    - **Entschieden (Nutzer, 2026-10-20):** beim Öffnen der App (nicht
      zeitgesteuert auf dem Server); der Server verhindert doppelte
      Einträge.
    - **Annahmen:** Der wiederholte Eintrag ist die Vorlage: Jede Kopie
      bekommt Titel, Icon, Werte und Text, das Datum in einer gewählten
      Datums-Eigenschaft. Verpasste Termine (App länger nicht geöffnet)
      werden nachgeholt, höchstens 31 je Regel und Aufruf. Eine neue oder
      geänderte Regel beginnt frühestens heute. Tage sind Server-Tage (UTC).
    - **Umsetzung 25** (`20261020110000_entry_recurrences.sql`):
      - Tabelle `entry_recurrences` (je Eintrag eine Regel: `frequency`
        daily/weekly/monthly/yearly, `interval`, `weekdays` 1 = Montag,
        `start_date`, `next_date`, `date_property_id`); der Trigger setzt
        `database_id` (nur Einträge, `22023`), prüft die
        Datums-Eigenschaft und berechnet `next_date`. RLS: lesen mit
        `can_read_page`, ändern mit `can_edit_page` des Eintrags.
      - `next_recurrence_date(…)`: nächster Termin nach einem Tag
        (Monatsende bleibt Monatsende, jede n-te Woche ab der Startwoche).
      - RPC `create_due_recurring_entries(workspace)` → Anzahl: alle
        fälligen Regeln des Workspace mit Schreibrecht auf die Datenbank,
        `for update skip locked` (zwei Geräte legen nichts doppelt an);
        Kopie per `copy_recurring_entry` (Werte über `set_page_property`,
        damit Verknüpfungen beidseitig bleiben; Text als neues Dokument).
        pgTAP: `entry_recurrences.test.sql`.
      - App: `usePages` ruft die RPC vor jedem Laden des Seitenbaums vom
        Server (Start, `online`, App wieder sichtbar); scheitert sie, lädt
        der Baum trotzdem (Fehler in der Konsole). Klein gehalten in
        `services/recurring-entries.ts`, damit der Datenbank-Code im
        eigenen Chunk bleibt.
      - Eigenschaftsleiste eines Eintrags: Zeile „Wiederholen“ mit Regel
        und nächstem Termin; Dialog mit Rhythmus, „Alle …“, Wochentagen,
        Start, Datums-Eigenschaft, „Nicht mehr wiederholen“
        (`recurrence.ts`: Texte und Validierung).
      - Tests: Vitest `recurrence.test.ts`, Playwright
        `entry-recurrence.e2e.ts`.
      - Noch nicht: Uhrzeit des Termins, Ende einer Wiederholung
        (eine Vorlage kann sich seit Paket 26 wiederholen).
26. **Vorlagen:** Seiten- und Eintragsvorlagen mit Inhalt und
    Eigenschaften (je Datenbank), „Neu“ mit Vorlagen-Auswahl.
    - **Annahme:** Vorlagen gibt es je Datenbank (wie in Notion); eine
      Vorlage ist ein markierter Eintrag mit Text und Werten. Seitenvorlagen
      außerhalb von Datenbanken vorerst nicht.
    - **Umsetzung 26** (`20261020120000_entry_templates.sql`):
      - `pages.is_template` (Standard `false`); nur Einträge einer
        Datenbank (Trigger, `22023`). RPC
        `create_entry_from_template(template)` → ID des neuen Eintrags:
        lesbar, Vorlage, nicht im Papierkorb (`22023`), Schreibrecht auf die
        Datenbank (`42501`); kopiert mit `copy_recurring_entry` (Titel,
        Icon, Werte, Text). pgTAP: `entry_templates.test.sql`.
      - App: `Page.is_template` (alte Caches: keine Vorlage). Die Ansichten
        lassen Vorlagen aus (`DatabaseView` trennt sie), Verknüpfungen
        bieten sie nicht an. Leiste der Datenbank: „Vorlagen“ (nur mit
        Schreibrecht, online, eigener Workspace): neuer Eintrag aus einer
        Vorlage (öffnet ihn), Vorlage bearbeiten, „Neue Vorlage“.
        `usePages.createEntryFromTemplate`: Eintrag sofort im Baum, danach
        neu laden; `createPage(…, { id, isTemplate })`.
      - Eine Vorlage zeigt den Hinweis „Vorlage in „…““; sie kann sich
        wiederholen (Paket 25) und macht dann Einträge aus sich.
      - Achtung: App-Versionen vor 26 zeigen Vorlagen als normale Einträge.
      - Tests: Vitest `page-tree-cache.test.ts`, Playwright
        `entry-templates.e2e.ts`.
      - Noch nicht: Standardvorlage für „Neu“, Vorlagen in Datenbank-Blöcken,
        Seitenvorlagen ohne Datenbank.
27. **Suche:** Volltext auf dem Server (Titel und Inhalt, RLS), offline
    lokal; Suchfeld in der Seitenleiste und Tastenkürzel.
    - **Umsetzung 27** (`20261020130000_page_search.sql`):
      - `page_documents.search_text`: generierte Spalte mit dem Klartext
        des Dokuments (`document_plain_text`: alle `text`-Werte der Blöcke,
        höchstens 200 000 Zeichen); für bestehende Zeilen berechnet, ohne
        `updated_at` zu ändern. Trigramm-Indizes (`pg_trgm`) auf Text und
        `pages.title`.
      - RPC `search_pages(query, limit)` mit den Rechten des Aufrufers (RLS
        entscheidet): Teilstring in Titel oder Text, Groß/klein egal,
        mindestens zwei Zeichen, `%`/`_` sind Zeichen; Titel-Treffer zuerst,
        mit Textausschnitt um den ersten Treffer; höchstens 100 (App: 30).
        pgTAP: `page_search.test.sql`.
      - App (`features/search/`): „Suchen“ oben in der Seitenleiste und
        Strg/⌘+K öffnen `SearchDialog` (kurze Tipp-Pause, Pfeiltasten,
        Enter öffnet, Treffer hervorgehoben, Pfad und Ausschnitt). Gezeigt
        werden nur Seiten, die die App öffnen kann (Workspace und „Mit mir
        geteilt“).
      - Offline oder ohne Server: Titel der bekannten Seiten und Text der auf
        dem Gerät gespeicherten Dokumente (`LocalDocumentStore.listAll`,
        `documentText`), mit Hinweis.
      - Tests: Vitest `search-text.test.ts`, Playwright `search.e2e.ts`.
      - Noch nicht: Suche in Datenbank-Werten (Eigenschaften), Filter nach
        Workspace oder Typ, Rangfolge nach Relevanz.
28. **Seitenlinks und Erwähnungen:** Links auf Seiten im Text (`@Seite`),
    Klick öffnet die Seite, Rückverweise; Import macht aus Links auf
    exportierte Seiten echte Seitenlinks.
    - **Umsetzung 28** (`20261020140000_page_backlinks.sql`):
      - Inline-Inhalt `pageLink` (`props.pageId`, `props.title` = Titel beim
        Verlinken) im Editor-Schema. „@“ im Text öffnet eine Auswahl der
        bekannten Seiten und Datenbanken (ohne Vorlagen und die Seite selbst,
        höchstens 12, Tippen filtert); der Link zeigt den aktuellen Titel aus
        dem Seitenbaum (folgt Umbenennen), Klick öffnet die Seite. Unbekannte
        Seiten (gelöscht, nicht freigegeben) und die öffentliche Ansicht zeigen
        den gespeicherten Titel als grauen Text.
      - RPC `page_backlinks(page)` (SQL mit den Rechten des Aufrufers, RLS
        entscheidet): aktive Seiten, deren Dokument einen `pageLink` auf die
        Seite enthält (`jsonb_path_exists`), höchstens 100. Liest jedes
        lesbare Dokument; ein Index kann später folgen. pgTAP:
        `page_backlinks.test.sql`.
      - Unter dem Seitenkopf „Verlinkt von“ mit den verlinkenden Seiten (nur
        online, nur Seiten, die die App öffnen kann).
      - Import: Seiten, Datenbanken und Einträge des Exports bekommen ihre ID
        vorab; ein Link auf eine importierte Seite wird ein `pageLink` (vorher
        Text). Links auf nicht importierte Seiten bleiben Text.
      - Tests: Vitest (`import-blocks`, `notion-import`), Playwright
        `page-links.e2e.ts`.
      - Noch nicht: Erwähnungen von Personen und Daten, Seitenlinks in der
        Suche (der Titel im Link zählt nicht als Text), Rückverweise offline.
29. **Eigenschaften Person und Dateien:** Person = Workspace-Mitglieder;
    Dateien & Medien im Datei-Speicher (Paket 15).
    - **Umsetzung 29** (`20261020150000_person_and_files_properties.sql`):
      - Typ `person`: Wert = JSON-Array von Nutzer-IDs (UUIDs, höchstens
        100). Der Server prüft nur die Form, nicht die Mitgliedschaft (eine
        ID verrät nichts; die App zeigt nur bekannte Mitglieder).
      - Typ `files` („Dateien & Medien“): Wert = JSON-Array von
        Storage-Pfaden `<seite>/<id>-<name>` im Bucket `page-files`
        (höchstens 100). Ein fremder Pfad verrät nichts: Storage prüft beim
        Lesen die Seite im Pfad.
      - Nur die erlaubten Werte wachsen (rückwärtskompatibel; Apps ab 14e
        lassen die Typen aus). pgTAP: `database_person_files.test.sql`.
      - App: Die Mitglieder des Workspace der Datenbank
        (`list_workspace_members`) lädt `databaseRepository.load` mit und
        hängt sie an Person-Eigenschaften (auch an das Ziel eines Rollups),
        wie die Einträge einer Verknüpfung; so stehen sie im Cache. Wer kein
        Mitglied ist (geteilte Datenbank), sieht keine Namen. Anzeige per
        E-Mail-Adresse, Auswahl mit Suche (`RelationPicker` mit eigenen
        Texten).
      - Dateien: `FilesPicker` öffnet eine Datei per signierter URL in einem
        neuen Tab, entfernt sie aus dem Wert und lädt neue in den Ordner des
        Eintrags hoch (`uploadPageFile`, 10 MB, nur online und mit
        Schreibrecht). Angezeigt wird der Dateiname aus dem Pfad
        (`fileNameOfPath`, so wie Storage ihn speichert).
      - Filter „enthält/leer“ und Sortieren nach E-Mail bzw. Dateinamen;
        Formeln sehen den Text.
      - Tests: Vitest `database-model.test.ts`, Playwright
        `database-person-files.e2e.ts`.
      - Noch nicht: Dateien beim Entfernen aus dem Wert löschen, Bilder als
        Titelbild der Galerie, Personen aus dem Notion-Import (die CSV
        enthält nur Namen; bleibt Text), Benachrichtigungen.
30. **Favoriten, Titelbilder, Emoji-Suche.** Aufteilung: 30a Emoji-Suche,
    30b Favoriten, 30c Titelbilder (je ein PR).
    - **Umsetzung 30a** (nur Frontend, keine Migration):
      - `page-icons.ts`: rund 140 Emojis mit deutschen Suchwörtern
        (`searchIcons`: jedes Wort der Eingabe muss einen Wortanfang
        treffen). Ein eingetipptes oder eingefügtes einzelnes Emoji
        (`typedEmoji`, auch mit Hautton, ZWJ-Folgen und Flaggen) lässt sich
        ebenfalls wählen, auch wenn es nicht in der Liste steht.
      - `IconGrid` (Suchfeld mit Fokus, Enter wählt das erste) für das
        Seiten-Icon (`PageHeader`) und das Callout-Icon.
      - Tests: Vitest `page-icons.test.ts`, Playwright `page-icon.e2e.ts`.
    - **Umsetzung 30b** (`20261020160000_page_favorites.sql`):
      - Tabelle `page_favorites (user_id, page_id, created_at)`, je Nutzer;
        RLS: nur eigene Zeilen lesen und löschen, anlegen nur für lesbare
        Seiten und nur für sich selbst (`42501`). Löschen der Seite oder
        des Kontos löscht die Favoriten mit. pgTAP: `page_favorites.test.sql`.
      - Geladen mit dem Seitenbaum: `PAGE_COLUMNS` bettet
        `favorites:page_favorites(created_at)` ein (RLS lässt nur die eigenen
        Zeilen); `parseStoredPages` macht daraus `Page.favorite`, so steht es
        auch im Cache (offline sichtbar, nicht änderbar). Gegen die lokale
        Supabase geprüft (Einbettung, Anlegen, Löschen).
      - Seitenmenü „Zu Favoriten hinzufügen“/„Aus Favoriten entfernen“
        (`usePages.setFavorite`, nur online). Seitenleiste: Abschnitt
        „Favoriten“ über „Workspace“, nach Titel sortiert, auch Einträge von
        Datenbanken.
      - Noch nicht: Favoriten geteilter Seiten anderer Workspaces,
        Reihenfolge per Ziehen.
      - Tests: Vitest `page-tree-cache.test.ts`, Playwright
        `page-favorites.e2e.ts`.
    - **Umsetzung 30c** (`20261020170000_page_cover.sql`):
      - `pages.cover`: `null`, ein Farbverlauf der App (`gradient:<name>`,
        nur Buchstaben) oder ein Bild aus dem Datei-Speicher
        (`nodi-file:<seite>/<id>-<name>`); Check-Constraint (`23514`). Ändern
        darf, wer die Seite bearbeiten darf (RLS wie beim Icon). pgTAP:
        `page_cover.test.sql`.
      - App: `Page.cover` (mit dem Seitenbaum geladen und gecacht; alte
        Caches: keins). Im Seitenkopf „Titelbild hinzufügen“ neben „Icon
        hinzufügen“; Auswahl (`CoverPicker`): sechs Farbverläufe
        (`page-cover.ts`), „Bild hochladen“ (nur Bilder, 10 MB, in den Ordner
        der Seite) und „Titelbild entfernen“. Das Bild steht über dem Titel
        (`PageCover`, „Titelbild ändern“ beim Überfahren, Touch: immer) und
        kommt zuerst aus dem Bild-Cache, ist also nach einmaligem Ansehen
        offline sichtbar. Nur online und mit Schreibrecht änderbar.
      - Noch nicht: Titelbilder in der öffentlichen Ansicht (die RPC
        `get_public_page` liefert sie nicht) und in der Galerie, Position des
        Bildes verschieben, Bilder aus dem Web, Titelbilder aus dem
        Notion-Import (nicht im Export).
      - Tests: Vitest `page-cover.test.ts`, `page-tree-cache.test.ts`,
        Playwright `page-cover.e2e.ts`.
31. **Kommentare** an Seiten und Textstellen. Aufteilung: 31a Kommentare
    zur Seite, 31b Kommentare an Textstellen.
    - **Annahme:** Kommentieren, antworten und erledigen darf, wer die Seite
      bearbeiten darf (es gibt keine eigene Rolle „Kann kommentieren“); wer
      sie lesen darf, liest die Kommentare.
    - **Umsetzung 31a** (`20261020180000_page_comments.sql`):
      - Tabelle `page_comments`: Seite, `parent_id` (Antwort auf einen
        Thread, eine Ebene wie Notion; sonst `22023`), Autor (Standard
        `auth.uid()`), Text 1–5000 Zeichen, `created_at`, `edited_at`,
        `resolved_at`/`resolved_by` (nur am Thread). RLS: lesen mit
        `can_read_page`, schreiben mit `can_edit_page`, ändern nur Autor
        (Text) bzw. Bearbeiter (erledigt), löschen nur der Autor; ein
        gelöschter Thread nimmt seine Antworten mit. Der Trigger
        `check_page_comment` setzt Zeiten und wer erledigt hat und hält den
        Rest unveränderlich (`42501`).
      - RPC `list_page_comments(page)` (security definer, prüft
        `can_read_page`): Kommentare mit E-Mail der Autoren (wer die Seite
        lesen darf, sieht, wer kommentiert hat). pgTAP:
        `page_comments.test.sql`.
      - App (`features/comments/`): unter dem Seitenkopf (bei Einträgen unter
        den Eigenschaften) offene Threads mit Antworten, „Kommentar
        hinzufügen“, „Antworten“, „Erledigt“/„Wieder öffnen“, eigene
        Kommentare bearbeiten und löschen (Rückfrage per zweitem Klick);
        Strg/⌘+Enter sendet. Erledigte Threads hinter „Erledigte Kommentare
        (n)“. Nur online; nach jeder Änderung neu geladen (der Server setzt
        Zeiten und Autoren).
      - Noch nicht: Benachrichtigungen, @-Erwähnungen in Kommentaren,
        Kommentare offline, Echtzeit-Aktualisierung.
      - Tests: Vitest `comment-threads.test.ts`, Playwright
        `page-comments.e2e.ts`.
    - **Umsetzung 31b** (`20261020190000_comment_quotes.sql`):
      - Im Text steht ein eigener Stil `comment` (Editor-Schema), dessen
        Wert die ID des Threads ist; die App wählt die ID, damit Markierung
        und Thread zusammenpassen. `page_comments.quote` (höchstens 500
        Zeichen, nur am Thread, beim Anlegen gesetzt, danach unveränderlich)
        hält den zitierten Text, falls der Text sich ändert oder die
        Markierung gelöscht wird. `list_page_comments` liefert ihn mit (neu
        angelegt, weil sich der Rückgabetyp ändert). pgTAP:
        `comment_quotes.test.sql`.
      - Editor: In der Formatierungsleiste (auch mobil) „Kommentieren“, solange
        Text markiert ist und die Seite bearbeitbar ist (`CommentButton`): Der
        Text bekommt die Markierung, unter dem Seitenkopf erscheint das Feld
        für den ersten Kommentar mit dem Zitat. „Abbrechen“ entfernt die
        Markierung wieder.
      - `features/comments/comment-marks.ts` verbindet Editor und
        Kommentarliste: Die Liste meldet, welche Threads offen sind; nur
        diese Markierungen sind hervorgehoben (`CommentMark`, Klick springt
        zum Thread und rahmt ihn ein). Erledigte, gelöschte oder unbekannte
        Threads (auch in der öffentlichen Ansicht) lassen normalen Text.
      - Achtung: App-Versionen vor 31b kennen den Stil nicht und können
        Seiten mit Textkommentaren eventuell nicht öffnen (wie 19c/22);
        installierte Apps nach dem Update-Hinweis aktualisieren.
      - Noch nicht: Markierung beim Löschen eines Threads aus dem Text
        entfernen (sie bleibt unsichtbar stehen), Kommentare am Rand neben
        dem Text, Verlassen der Seite mit offenem Entwurf (die Markierung
        bleibt ohne Thread, unsichtbar).
      - Tests: Vitest `comment-threads.test.ts`, Playwright
        `page-comments.e2e.ts` (Textstelle kommentieren, Abbrechen).
32. **Kleinere Lücken:** Reihenfolge per Ziehen (Seitenleiste,
    Board-Spalten), Kalender mit Woche und Ziehen, Gruppierung in Tabelle
    und Liste, Ansicht Zeitleiste, Spalten-Layout im Text,
    Button-Eigenschaft. Aufteilung: 32a Reihenfolge, 32b Kalender, 32c
    Gruppierung, 32d Zeitleiste, 32e Spalten im Text, 32f Button (je ein PR).
    - **Umsetzung 32a** (nur Frontend, keine Migration; `pages.position` ist
      für Bearbeiter schon änderbar):
      - Geschwister in der Seitenleiste stehen nach `position`, dann nach
        Erstellung (`compareByPosition`, jetzt in `page-hierarchy.ts`; die
        Datenbank-Ansichten nutzen dieselbe Regel). `placeBefore` berechnet
        die neue Reihenfolge: zwischen zwei Nachbarn mit Position genügt eine
        Änderung (Mittelwert), sonst werden die Geschwister neu nummeriert
        (Seiten ohne Position, gleiche Positionen).
      - Seitenleiste: Ziehen auf den oberen oder unteren Rand einer Seite
        (je ein Viertel) setzt sie davor bzw. dahinter (Linie als Hinweis),
        nur unter Geschwistern desselben Bereichs; die Mitte macht wie bisher
        eine Unterseite daraus.
      - Board: Eine Karte auf eine andere ziehen setzt sie davor (in einer
        anderen Spalte auch deren Wert); in eine leere Stelle einer anderen
        Spalte ans Ende. Nur ohne Sortierregel der Ansicht (wie Notion); die
        Reihenfolge gilt für alle Ansichten ohne Sortierung.
      - `usePages.reorderPages`: sofort sichtbar, je Seite ein Update; lehnt
        der Server ab, lädt der Baum neu und ein Hinweis erscheint.
      - Noch nicht: Reihenfolge in geteilten Seiten anderer Workspaces,
        Ziehen in Tabelle und Liste, auf Touch-Geräten.
      - Tests: Vitest `page-hierarchy.test.ts`, Playwright
        `page-order.e2e.ts`.
    - **Umsetzung 32b** (nur Frontend, keine Migration):
      - Kalender: Umschalter „Monat | Woche“ (wie der Monat nur im Tab, nicht
        gespeichert). Die Woche ist eine Zeile mit sieben Tagen ab Montag
        (`weekDays`), Vor/Zurück springt um eine Woche, „Heute“ zur
        aktuellen.
      - Einträge per Ziehen (Maus) auf einen anderen Tag: `moveDate` schiebt
        Start und Ende um dieselbe Zahl Tage (vom Tag, an dem man den Eintrag
        greift, z. B. am zweiten Tag eines Zeitraums); ein Zeitraum behält
        seine Länge, eine Uhrzeit ihre Ortszeit, auch über die Zeitumstellung.
        Gespeichert per `set_page_property`; nur mit Schreibrecht und online.
      - Noch nicht: Uhrzeiten als Raster in der Woche, Ziehen auf
        Touch-Geräten, Länge eines Zeitraums per Ziehen ändern.
      - Tests: Vitest `database-model.test.ts`, Playwright
        `database-views.e2e.ts`.
    - **Umsetzung 32c** (nur Frontend, keine Migration; `config.groupByPropertyId`
      gibt es seit 14c):
      - Tabelle und Liste: „Gruppieren“ in der Leiste mit „Nicht gruppieren“
        und den Auswahl- und Status-Eigenschaften. Anders als das Board wird
        nur gruppiert, wenn man es wählt (`chosenGroupProperty`).
      - Je Option mit Einträgen ein einklappbarer Abschnitt (`GroupedRows`,
        Option als Abzeichen, Anzahl; leere Gruppen fallen weg, „Ohne …“
        zuerst), darin die Tabelle bzw. Liste. In der Tabelle bleibt die
        Spalte sichtbar (ein neuer Wert verschiebt den Eintrag in seine
        Gruppe); „Neu“ in einer Gruppe setzt deren Wert. Eingeklappt ist nur
        im Tab, nicht gespeichert.
      - Noch nicht: Gruppieren nach anderen Typen (Checkbox, Datum, Person),
        Galerie und Feed gruppieren, Reihenfolge der Gruppen ändern.
      - Tests: Vitest `database-model.test.ts`, Playwright
        `database-grouping.e2e.ts`.
    - **Umsetzung 32d** (`20261020200000_timeline_view.sql`):
      - Ansichtstyp `timeline` für Datenbanken und Datenbank-Blöcke (nur die
        erlaubten Werte wachsen; Apps ab 14e lassen den Typ aus). pgTAP:
        `timeline_view.test.sql`.
      - „Zeitleiste“ (`TimelineView`): sechs Wochen ab dem Montag der
        Vorwoche, „Früher“/„Später“ um zwei Wochen, „Heute“; Tage als Spalten
        (Wochentag, Monatsanfang), heute hervorgehoben. Je Eintrag mit Datum
        im Zeitraum ein Balken vom Start bis zum Ende (`timelineBars`, an den
        Rändern abgeschnitten und markiert); Klick öffnet den Eintrag. Die
        Datums-Eigenschaft wählt „Datum“ in der Leiste wie beim Kalender.
        Darunter die Zahl der Einträge ohne Datum und „Neu“. Die Tage
        scrollen seitlich in der Ansicht, nicht die Seite.
      - Noch nicht: Balken ziehen oder in der Länge ändern, andere Maßstäbe
        (Monate, Quartale), Abhängigkeiten.
      - Tests: Vitest `database-model.test.ts`, Playwright
        `database-views.e2e.ts`.
    - **Umsetzung 32e** (nur Frontend, keine Migration):
      - Blöcke `columns` und `column` im Editor-Schema (ohne Inhalt): Die
        Kinder eines `columns`-Blocks (je ein `column`) stehen ab `md`
        nebeneinander, gleich breit; die Kinder eines `column` sind ihr
        Inhalt. Die Anordnung ist nur CSS (`index.css`, Grid, ohne
        Einrückung und Linie verschachtelter Blöcke); das Dokument bleibt
        gewöhnliches BlockNote-JSON. Unter `md` stehen die Spalten
        untereinander. BlockNotes eigenes Spalten-Paket ist nicht genutzt
        (Lizenz GPL bzw. kommerziell).
      - Slash-Menü „2 Spalten“ / „3 Spalten“: je Spalte ein leerer Absatz, der
        Cursor steht in der ersten.
      - Achtung: App-Versionen vor 32e kennen die Blöcke nicht und können
        solche Seiten nicht öffnen (wie 19c/22).
      - Noch nicht: Breite der Spalten ziehen, Blöcke per Ziehen in eine
        Spalte legen, Spalten aus dem Notion-Import (der Export enthält sie
        nur als Folge von Blöcken).
      - Tests: Playwright `columns.e2e.ts` (nebeneinander, gespeicherte
        Struktur, schmal untereinander).
    - **Umsetzung 32f** (`20261020210000_button_property.sql`):
      - Eigenschaftstyp `button` (wie Notions Button „Seiten bearbeiten“);
        `options` = `{label, actions}`, `label` bis 100 Zeichen, `actions`
        höchstens 10 Objekte mit Text `propertyId` und `value` (beliebiges
        JSON) oder `today: true`; geprüft nur die Form
        (`is_valid_button_options`, Check-Constraint, `23514`). Ein Button hat
        keinen Wert (`set_page_property` → `22023`). Nur die erlaubten Werte
        wachsen (rückwärtskompatibel; Apps ab 14e lassen den Typ aus). pgTAP:
        `database_buttons.test.sql`.
      - Klick in Tabelle oder Eigenschaftsleiste setzt die Werte nacheinander
        per `set_page_property` (`useDatabase.runButton`, `buttonChanges`):
        gleiche Rechte, LWW und Rücknahme wie bei jedem Wert. Aktionen auf
        gelöschte Eigenschaften oder nicht mehr passende Werte (gelöschte
        Option) entfallen; „Heute“ ist der lokale Tag. Nur mit Schreibrecht
        und online.
      - `ButtonEditor` (Dialog): Beschriftung, Aktionen für Checkbox
        (angehakt/nicht), Auswahl und Status (Option oder „Leeren“), Datum
        („Heute“/„Leeren“). Öffnet sich nach dem Anlegen, über „Button
        bearbeiten“ im Spaltenkopf und über den Namen in der
        Eigenschaftsleiste.
      - Noch nicht: Buttons in Board, Liste, Galerie und Feed; Aktionen
        „Seite anlegen“, „Seite öffnen“, Werte anderer Typen.
      - Tests: Vitest `database-model.test.ts`, Playwright
        `database-buttons.e2e.ts`.

### Plan ab Paket 33 (Nutzer, 2026-10-25)

33. **Konto und Rechtliches:** Passwort zurücksetzen, Konto löschen,
    Impressum und Datenschutzerklärung. Aufteilung: 33a Datenbank, 33b
    Oberfläche.
    - **Entschieden (Nutzer, 2026-10-25):** (1) Eigene Workspaces mit
      anderen Mitgliedern gehen beim Löschen des Kontos an das Mitglied,
      das am längsten dabei ist; private Seiten der Person werden gelöscht.
      (2) Impressum und Datenschutzerklärung als Vorlage mit Platzhaltern
      aus den tatsächlichen Datenflüssen; Name, Anschrift und Kontakt trägt
      der Nutzer ein (keine Rechtsberatung).
    - **Umsetzung 33a** (`20261025090000_delete_account.sql`):
      - RPC `delete_account()` (nur `authenticated`, sonst `42501`): eigene
        Workspaces ohne andere Mitglieder werden samt Seiten gelöscht (auch
        private Seiten früherer Mitglieder, die niemand mehr erreicht), mit
        Mitgliedern gehen sie an das zuerst beigetretene (`joined_at`, Rolle
        `owner`). In jedem Workspace endet die Mitgliedschaft wie bei
        `leave_workspace` (geteilte Seiten an den Workspace-Owner). Danach
        werden die übrigen Seiten der Person gelöscht (privat, mit allem
        darunter), ihre Freigaben beendet, `created_by` bleibender Seiten auf
        deren Owner gesetzt und `auth.users` gelöscht; Kommentare,
        Favoriten, Mitgliedschaften und öffentliche Links gehen per Kaskade
        mit.
      - Dateien im Storage bleiben vorerst liegen (Paket 35).
      - pgTAP: `delete_account.test.sql`; zusätzlich über die lokale
        Supabase-API geprüft (Konto weg, alter Token abgelehnt).
    - **Umsetzung 33b** (nur Frontend, keine Migration):
      - Login: „Passwort vergessen?“ → `resetPasswordForEmail` mit
        `redirectTo` = App-URL (`BASE_URL`, auf GitHub Pages
        `https://risingwolf21.github.io/nodi/`); dieselbe Antwort, ob es das
        Konto gibt oder nicht. Der Link meldet über `#…&type=recovery` an
        (`PASSWORD_RECOVERY` im `AuthProvider`), die App fragt dann zuerst
        nach dem neuen Passwort (`NewPasswordForm`, `updateUser`, „Später“).
        **Im Supabase-Dashboard** muss die App-URL unter Authentication → URL
        Configuration als Redirect-URL eingetragen sein.
      - Workspace-Menü → „Konto löschen …“ (`DeleteAccountDialog`): Folgen,
        Passwort zur Bestätigung (erneutes `signInWithPassword`, „Das Passwort
        stimmt nicht.“), nur online. Danach `delete_account`, lokale Sitzung
        beenden (`signOut({ scope: "local" })`) und wie beim Abmelden alle
        lokalen Datenbanken des Kontos löschen (`signOutAndDeleteLocalData`).
      - Impressum und Datenschutzerklärung unter `?seite=impressum` bzw.
        `?seite=datenschutz` (wie `?p=` ohne Anmeldung, `main.tsx`), verlinkt
        auf der Login-Seite und im Workspace-Menü (`LegalLinks`). Inhalt in
        `features/legal/LegalPage.tsx` aus den tatsächlichen Datenflüssen
        (GitHub Pages, Supabase, Klartext, Teilen/öffentliche Links,
        OpenStreetMap, Daten auf dem Gerät, Notion-Import, Löschen, Rechte).
        Name, Anschrift, E-Mail, Supabase-Region, Aufsichtsbehörde und Datum
        stehen als Platzhalter in `features/legal/operator.ts`; solange einer
        fehlt, sind sie markiert und oben steht ein Hinweis. Keine
        Rechtsberatung: vor Veröffentlichung prüfen lassen.
      - Tests: Vitest `legal-page.test.ts`, Playwright `account.e2e.ts`.
34. **Export:** Seiten und Datenbanken als Markdown + CSV in einer ZIP-Datei
    (wie der Notion-Export, von nodi wieder importierbar; Nutzer,
    2026-10-25).
    - **Entschieden (Nutzer, 2026-10-25):** (1) Export einer Seite (mit
      Unterseiten) und des ganzen Workspace (Backup). (2) Bilder und Anhänge
      kommen mit in die ZIP-Datei.
    - **Aufteilung:** 34a Seiten (Markdown, Dateien, Baum, Menüs), 34b
      Datenbanken (CSV, Einträge).
    - **Umsetzung 34a** (nur Frontend, keine Migration;
      `src/features/export/`):
      - Aufbau wie ein älterer Notion-Export, damit der Import ihn liest
        (`export-tree.ts`): jede Seite `Titel <id ohne Bindestriche>.md`,
        Unterseiten und Dateien im Ordner `Titel <id>/`, Geschwister nach
        Titel; Namen ohne `\/:*?"<>|`, höchstens 80 Zeichen, leer „Ohne
        Titel“. Links relativ und kodiert (auch Klammern). Vorlagen werden
        nicht exportiert; Datenbanken werden `….csv` (34b).
      - Text (`export-markdown.ts`): nodis eigene Blöcke werden vorher zu
        BlockNote-Standardblöcken, dann wandelt BlockNote um
        (`blocksToMarkdownLossy`, Editor ohne Ansicht in
        `blocks-to-markdown.ts`). `# Titel` zuerst; Seitenlinks werden Links
        auf die exportierte Seite (sonst ihr Titel als Text); ein
        Datenbank-Block wird ein Link allein in der Zeile auf die `.csv`;
        Spalten stehen nacheinander; Callouts werden `<aside>Emoji Text …
        </aside>` (in anderen Blöcken ein Absatz mit Emoji);
        Kommentar-Markierungen entfallen; `nodi-file:`-Bilder und Anhänge
        zeigen auf die Datei im Ordner der Seite (gleiche Namen: „ (2)“).
      - Ablauf (`build-export.ts`): Seite für Seite, Text zuerst aus der
        Kopie auf dem Gerät (kann ungesyncte Änderungen enthalten), sonst
        vom Server; Dateien per signierter URL (`downloadPageFile`), eine
        nach der anderen. Was nicht klappt, steht in der Liste der Hinweise
        (die Seite wird trotzdem mit Titel exportiert). ZIP per `fflate`
        (`zipSync`), Download `Name JJJJ-MM-TT.zip`.
      - Oberfläche: Seitenmenü „Exportieren“ (Seite mit Unterseiten, nur
        eigener Workspace) und Workspace-Menü „Workspace exportieren“ (alle
        obersten Seiten; nur online). `ExportDialog` ist nachgeladen:
        Fortschritt „Seite n von m“, Ergebnis, Hinweise, „Erneut
        herunterladen“.
      - Verlustbehaftet wie Markdown: Farben, Ausrichtung, Titelbilder,
        Icons, Kommentare und Seiteneinstellungen sind nicht im Export.
      - Tests: Vitest (`export-tree`, `export-markdown`, `build-export` mit
        Rundweg über `planNotionImport`), Playwright `export.e2e.ts`
        (Download, Inhalt der ZIP, erneuter Import mit Bild, Seitenlink und
        Callout; Workspace-Export).
    - **Umsetzung 34b** (nur Frontend, keine Migration):
      - Eine Datenbank wird `Titel <id>.csv`, ihre Einträge (ohne Vorlagen)
        `.md` im Ordner `Titel <id>/` wie Seiten, ihre Unterseiten darunter.
        Eigenschaften, Werte und Ansichten lädt `databaseRepository.load`
        vom Server; berechnet wird wie in der App (`buildRows`: Formeln,
        Rollups, Zeiten).
      - CSV (`export-csv.ts`, RFC 4180): „Name“ (Titel) zuerst, dann die
        Eigenschaften in ihrer Reihenfolge (Buttons nicht), Zeilen in der
        Reihenfolge der Datenbank (`position`). Werte in den Formen, die der
        Import wieder erkennt: Checkbox `Yes`/`No`, Zahlen mit Symbol
        (`€12.5`, `15%`), Tag `JJJJ-MM-TT`, Uhrzeit in UTC
        `JJJJ-MM-TT HH:MM (GMT+0)`, Zeitraum mit „→“, Auswahl per Name,
        Verknüpfungen `Titel (Pfad.md)` (nur exportierte Einträge),
        Dateien & Medien als Link auf die Datei im Ordner des Eintrags;
        Formeln und Rollups als Ergebnis, alles andere als angezeigter Text.
      - Wie beim Notion-Export gehen beim Weg zurück verloren: Ansichten
        (der Import leitet Board und Kalender ab), Formel- und
        Rollup-Ausdrücke (feste Werte), Optionsfarben, Personen und Dateien
        (Text). Verknüpfungen kommen als Verknüpfung zurück.
      - Kann eine Datenbank nicht geladen werden, fehlt ihre CSV (Hinweis);
        die Einträge werden trotzdem exportiert.
      - Tests: Vitest `export-csv.test.ts` (Rundweg über `parseCsv`,
        `inferColumn`, `columnValue`), `build-export.test.ts`, Playwright
        `export.e2e.ts` (Datenbank exportieren und wieder importieren).
35. **Speicher aufräumen:** Dateien endgültig gelöschter Seiten und Konten
    aus dem Storage entfernen.
    - **Entschieden (Nutzer, 2026-10-25):** (1) Warteschlange in der
      Datenbank und eine Edge Function, die über die Storage-API löscht
      (`storage.objects` erlaubt kein direktes Löschen); der
      Service-Role-Key bleibt in der Edge Function. (2) Angestoßen von der
      App nach „Endgültig löschen“, „Papierkorb leeren“ und „Konto löschen“
      und zusätzlich einmal täglich von einem GitHub-Workflow.
    - **Aufteilung:** 35a Datenbank, 35b Edge Function, Deploy, täglicher
      Lauf, Aufrufe in der App.
    - **Umsetzung 35a** (`20261025100000_page_file_cleanup.sql`):
      - Tabelle `page_file_deletions (page_id, queued_at)`: Der Trigger
        `queue_page_file_deletion` (nach `delete` auf `pages`, je Zeile)
        trägt jede endgültig gelöschte Seite ein, auch Unterseiten (Kaskade)
        und Seiten aus `delete_account`. RLS ohne Policies, keine Rechte für
        `anon`/`authenticated`.
      - `next_page_file_deletions(limit)` (nur `service_role`): entfernt
        zuerst erledigte Einträge (keine Dateien mehr im Ordner, oder eine
        Seite mit dieser ID gibt es wieder; deren Dateien bleiben) und
        liefert dann bis zu `limit` (1–1000) Pfade im Bucket `page-files`,
        die noch zu löschen sind. Doppelt löschen schadet nicht; ein
        abgebrochener Lauf macht beim nächsten Aufruf weiter.
      - Die Migration trägt einmalig die Seiten ein, deren Dateien heute
        schon verwaist sind (Ordner ohne Seite).
      - pgTAP: `page_file_cleanup.test.sql`.
    - **Umsetzung 35b** (Edge Function, Workflows, App; keine Migration):
      - Edge Function `supabase/functions/purge-deleted-files/index.ts`
        (Deno, ohne Abhängigkeiten, nur `fetch`): bis zu zehn Runden
        `next_page_file_deletions(1000)` → Storage-API
        `DELETE /storage/v1/object/page-files` (`prefixes`), Antwort
        `{removed}`. Schlüssel: `SUPABASE_SECRET_KEYS.default` (neue Keys,
        nur im `apikey`-Header), sonst `SUPABASE_SERVICE_ROLE_KEY`
        (Legacy-JWT, auch als `Authorization`). Nur `POST` (sonst 405),
        CORS für die App.
      - Ohne JWT-Prüfung (`[functions.purge-deleted-files] verify_jwt =
false` in `supabase/config.toml`, beim Deploy `--no-verify-jwt`):
        Die App ruft sie nach dem Löschen auch ohne Sitzung auf (Konto
        gelöscht), der tägliche Lauf mit dem Publishable Key. Bewusst offen:
        Sie löscht nur Dateien von Seiten, die es nicht mehr gibt, und
        verrät nur eine Anzahl; ein Aufruf macht höchstens 10 000 Dateien.
      - App: `requestDeletedFilesCleanup()`
        (`features/files/services/purge-deleted-files.ts`, nur anstoßen,
        Fehler in der Konsole) nach „Endgültig löschen“, „Papierkorb leeren“
        (wenn etwas gelöscht wurde) und „Konto löschen“.
      - Deploy (`deploy.yml`, Job `migrate`): nach `db push` folgt
        `supabase functions deploy purge-deleted-files --no-verify-jwt
--use-api` (ohne Docker); keine neuen Secrets.
      - Täglicher Lauf `.github/workflows/purge-deleted-files.yml` (03:23
        UTC und von Hand): `POST` mit `VITE_SUPABASE_URL` und
        `VITE_SUPABASE_PUBLISHABLE_KEY` aus den Repository-Secrets. GitHub
        pausiert Zeitpläne nach 60 Tagen ohne Aktivität im Repository; die
        Aufrufe der App räumen weiter auf.
      - ESLint lässt `supabase/functions` aus (Deno, nicht im tsconfig der
        App). Geprüft lokal mit `supabase functions serve` gegen die lokale
        Supabase: Datei einer gelöschten Seite entfernt, Warteschlange leer,
        zweiter Aufruf `{removed: 0}`, `GET` → 405, neuer Secret Key nur im
        `apikey`-Header von REST und Storage angenommen.
      - Datenschutzerklärung (Abschnitt 8): Dateien gelöschter Seiten werden
        automatisch entfernt.
      - Tests: Playwright `trash.e2e.ts`, `account.e2e.ts` (Aufruf der
        Function im Fake-Backend).

### Plan ab Paket 36 (Nutzer, 2026-10-26)

Reihenfolge nach Wahl des Nutzers: 36 Echtzeit, 37 Erwähnungen von Personen,
danach Vorlagen & Teilen, Mobil & Dateien, Suche & Leistung (Pakete werden
vor dem Start genauer geschnitten).

36. **Echtzeit:** Änderungen anderer (und anderer Geräte) erscheinen ohne
    Neuladen: Seitentext, Seitenbaum, Datenbanken, Kommentare.
    - **Entschieden (Nutzer, 2026-10-26):** Live-Aktualisieren, kein
      gleichzeitiges Tippen: Eine offene Seite lädt den neuen Stand, solange
      dort nicht getippt wird; die Konfliktregel bleibt LWW, Offline-Sync und
      Warteschlange bleiben unverändert.
    - **Aufteilung:** 36a Datenbank, 36b App.
    - **Umsetzung 36a** (`20261026090000_page_activity.sql`):
      - Tabelle `page_activity (page_id, workspace_id, change, actor,
mutation_id, changed_at)`, eine Zeile je Seite, ohne Inhalt. `change`: `page`
        (Zeile in `pages`, neue Freigabe), `document` (Text), `properties`
        (Eigenschaften, Ansichten, Block-Ansichten und Werte; die Zeile gehört
        der Datenbank, bei Werten der Datenbank des Eintrags), `comments`.
        Bei `document` steht die gespeicherte Mutation-ID dabei: Wer sie schon
        hat (eigenes Speichern), lädt den Text nicht neu. Gesetzt nur von
        Triggern (`touch_page_activity`, security definer).
      - Realtime (`postgres_changes`, Publication `supabase_realtime`) prüft
        die Select-Policy `can_read_page(page_id)` je Empfänger: Eine Änderung
        erreicht nur, wer die Seite lesen darf, auch über Freigaben aus
        anderen Workspaces. Kein Fremdschlüssel und kein Löschen: Für
        gelöschte Zeilen prüft Realtime keine Rechte und schickte ihre
        Schlüssel an alle. Zeilen endgültig gelöschter Seiten bleiben und sind
        für niemanden lesbar.
      - pgTAP: `page_activity.test.sql`; zusätzlich gegen die lokale Supabase
        mit Realtime geprüft (Owner bekommt Anlegen, Text und Umbenennen,
        ein Fremder nichts).
      - Noch nicht: Live-Hinweis auf endgültig gelöschte Seiten und entzogene
        Freigaben (bleibt beim Bereinigen beim Start bzw. `online`).
    - **Umsetzung 36b** (nur Frontend, keine Migration;
      `src/features/realtime/`):
      - `startPageActivity()` (in `WorkspaceHome`, je Konto und Tab): ein
        Kanal `page-activity` mit `postgres_changes` auf `page_activity`;
        Zeilen werden geprüft (`parsePageActivity`) und an Zuhörer verteilt
        (`onPageActivity`). Verpasstes (Verbindung weg) holen wie bisher
        `online` und „App wieder sichtbar“ nach.
      - `useActivityReload(passt, beschäftigt?)`: zählt passende Änderungen
        nach 1 s Ruhe (mehrere hintereinander = ein Laden) und ist wie
        `useServerReload` eine Abhängigkeit des Ladens; solange
        `beschäftigt` gilt, wartet es.
      - Seitenbaum (`usePages`): `page` im aktuellen Workspace. Ein
        Live-Laden, das vor einem hier angelegten Eintrag begann, wird nicht
        angezeigt (sonst fehlte die neue Seite bis zur nächsten Änderung; der
        Notion-Import legt viele hintereinander an). „Mit mir geteilt“: `page`
        aus anderen Workspaces (auch neue Freigaben).
      - Offene Seite (`BlockEditor`): `document` dieser Seite →
        `session.refresh()` nach 1 s, also nur über eine synchronisierte
        Kopie und ohne laufendes Tippen (wie beim Abgleich nach dem Öffnen;
        LWW bleibt). Die eigene Speicherung kommt auch zurück; hält die Seite
        dieselbe Mutation (`holdsMutation`), wird nichts geladen.
      - Datenbanken (`useDatabase`, auch Blöcke): `properties` der Datenbank;
        wartet, solange hier Werte unterwegs sind. Kommentare
        (`PageComments`): `comments` der Seite; Entwürfe bleiben.
      - Tests: Vitest `page-activity.test.ts`, Playwright `realtime.e2e.ts`
        (das Fake-Backend spricht Realtime über `routeWebSocket`: Baum, Text,
        eigene Mutation lädt nichts, Kommentar, Tippen gewinnt, Werte);
        zusätzlich in Chromium gegen die lokale Supabase mit Realtime geprüft
        (Umbenennen, Text und Kommentar von „einem anderen Gerät“ erscheinen).
      - Noch nicht: Live für Rückverweise, Suche und Favoriten; Hinweis, wer
        gerade auf der Seite ist.
37. **Erwähnungen von Personen** („@Name“ im Text).
    - **Entschieden (Nutzer, 2026-10-26):** Erwähnung im Text und ein
      Hinweis in der App („Erwähnungen“ in der Seitenleiste, live, ungelesene
      markiert); keine E-Mails.
    - **Aufteilung:** 37a Datenbank, 37b Oberfläche.
    - **Umsetzung 37a** (`20261026100000_page_mentions.sql`):
      - Im Dokument ist eine Erwähnung Inline-Inhalt
        `{type: "mention", props: {userId, label}}`.
      - Tabelle `page_mentions (id, page_id, user_id, mentioned_by,
mentioned_at, read_at)`, eine Zeile je Seite und Person. Der Trigger
        `record_page_mentions` (nach Speichern des Dokuments) legt sie für neu
        Erwähnte an (nicht in der vorigen Fassung, nicht der Autor, nur
        bestehende Konten) bzw. macht sie wieder ungelesen; entfernte
        Erwähnungen lassen die Zeile stehen. `document_mentions(document)`
        liest die IDs (ungültige entfallen).
      - Sichtbar nur der erwähnten Person und nur, solange sie die Seite lesen
        darf; ändern kann sie nur `read_at` (Spaltenrecht). RPC
        `list_my_mentions(limit)`: eigene Erwähnungen auf lesbaren Seiten
        außerhalb des Papierkorbs, neueste zuerst, mit Workspace, Titel, Icon und E-Mail
        dessen, der erwähnt hat. Realtime (`postgres_changes`) prüft dieselbe
        Policy; Löschen (Seite, Konto) verrät nur die zufällige ID der Zeile.
      - pgTAP: `page_mentions.test.sql`.

Jedes Arbeitspaket soll einen klaren Umfang, die betroffenen Dateien und
überprüfbare Akzeptanzkriterien haben. Nach jedem Paket anhalten und das
Ergebnis erklären, bevor größere Folgeänderungen vorgenommen werden.

---

## 13. Aktuelle offene Fragen / bekannte Lücken

Bekannte Lücken (geprüft 2026-10-16, Behebung siehe §12):

- (Behoben in Paket 7) `BlockEditor` lud nur von Supabase und
  speicherte nur im Speicher.
- (Behoben in Paket 7) Read-only geteilte Seiten waren im Editor
  bearbeitbar.

Behoben in Paket 2 (`20261016175500_protect_page_columns.sql`):
Trigger erzwingen, dass nur der Owner `owner_id`/`visibility` ändert,
`id`/`workspace_id`/`created_by`/`created_at` unveränderlich sind und
`page_documents.updated_at`/`updated_by` vom Server gesetzt werden.

Behoben in Paket 3: Wiederherstellen einer Unterseite stellt auch ihre
archivierten Elternseiten wieder her (Variante A, Nutzerentscheidung
2026-10-16); die UI fragt vorher nach. Logik in
`src/features/pages/page-hierarchy.ts`.

Noch nicht abschließend geprüft:

- (Behoben, `20261018140000_restore_archived_ancestors.sql`,
  Nutzerentscheidung 2026-10-18) Aktive Seiten unter archivierten
  Elternseiten (alter Papierkorb-Bug) waren unsichtbar und wären beim
  endgültigen Löschen der Eltern mitgelöscht worden. Die Migration
  stellt einmalig alle archivierten Vorfahren aktiver Seiten wieder
  her, wie Variante A aus Paket 3. Die Funktion
  `restore_archived_ancestors_of_active_pages()` bleibt für Wartung und
  Tests (nicht per API aufrufbar).
- (Entschieden und umgesetzt, Nutzer 2026-10-18,
  `20261018150000_owner_only_permanent_delete.sql`) Endgültig löschen
  darf nur der Owner der Seite (Delete-Policy `owner_id = auth.uid()`).
  Papierkorb und Wiederherstellen bleiben für alle mit Schreibrecht.
  Unterseiten fremder Owner werden weiterhin mit der Elternseite
  gelöscht (`on delete cascade`). Der Papierkorb zeigt „Endgültig
  löschen“ nur bei eigenen Seiten; da RLS fremde Deletes ohne Fehler
  filtert, prüft `permanentlyDeletePage` die zurückgegebenen Zeilen.
- (Umgesetzt, Nutzerwunsch 2026-10-20) „Papierkorb leeren“ oben im
  Papierkorb, mit Rückfrage (Anzahl, Seiten anderer bleiben): ein Request
  `delete … where workspace_id, is_archived, owner_id = Nutzer` (keine
  ID-Liste in der URL, vgl. 19a), Unterseiten gehen per Kaskade mit, danach
  lädt der Baum neu (`usePages.emptyTrash`). Ohne eigene Seiten im
  Papierkorb gibt es den Knopf nicht. Keine Migration (Delete-Policy wie
  bisher). Test: `trash.e2e.ts`.
- (Umgesetzt in Paket 18a) Verschieben nur über `move_page`, die
  Rechte, Workspace, Bereichsregel und Zyklen prüft; `parent_id` bleibt
  für API-Clients gesperrt.
- RLS-Leistung: `can_read_page` läuft je Zeile. „Mit mir geteilt“ und
  die Bereinigung entzogener Kopien fragen ohne Workspace-Filter und
  prüfen damit alle Seiten der Datenbank (später mengenbasierte RPC).
- Offline-Abmelden widerruft die Sitzung nicht auf dem Server (nur
  lokal entfernt); andere offene Tabs merken das erst beim Neuladen.
- Abmelden wartet auf `syncAll()`; bei sehr langsamem Netz kann das
  dauern (kein eigener Timeout). Scheitert `signOut()`, läuft die
  Sync-Engine weiter (13b). Was während des Abmeldens noch getippt
  wird, kann verloren gehen (Editor ist dabei nicht gesperrt).
- Wird ein Refresh-Token serverseitig widerrufen, meldet Supabase ab,
  ohne die Logout-Policy zu durchlaufen; lokale Daten dieses Kontos
  bleiben dann bis zur nächsten Abmeldung auf dem Gerät.
- Installation und Layout auf echtem iOS- und Android-Gerät (Pakete 4,
  5 und 20 nur in Chromium mit Geräte-Emulation geprüft; die Tastatur
  in Paket 20 über ein nachgebautes `visualViewport`).
- (Behoben, 19a) Papierkorb und Wiederherstellen schickten alle IDs eines
  Seitenbaums in einer URL (`id=in.(…)`); ab etwa 300 Seiten (Notion-Import)
  antwortete der Server mit 414. Jetzt in Teilen zu je 100 IDs
  (`setArchived` in `usePages.ts`). Scheitert ein Teil, bleibt das bereits
  Verschobene so und wird angezeigt; ein erneuter Versuch macht den Rest.
- Paket 10 nicht umgesetzt (bewusst): nichts mehr (Suche seit 27,
  Favoriten seit 30b, Titelbilder seit 30c, Verschieben per Drag & Drop
  seit Paket 18b). Die Emoji-Auswahl hat seit 30a eine
  Suche (feste Liste plus eingefügte Emojis). Abmelden ist mobil nur aus der Seitenliste
  (Workspace-Menü) erreichbar.
- (Behoben) Ein Fehler beim Nachladen des Editors oder des Inhalts
  der öffentlichen Ansicht (`lazy()`) leerte die ganze App. Jetzt fängt
  `LoadErrorBoundary` ihn ab: Pfad und Zurück bleiben, Hinweis mit
  „Neu laden“ (ein abgelehnter `import()` bleibt bis zum Neuladen
  abgelehnt). Je Seite eine eigene Boundary (`key={page.id}`).
- Seit Paket 8 sind direkte Schreibrechte auf `page_documents`
  entzogen (Nutzerentscheidung 2026-10-18, Option A). Installierte
  Apps älter als Paket 7 können erst nach Bestätigung des
  Update-Hinweises wieder speichern.
- Der Hinweis „auf einem anderen Gerät geändert" erscheint auch, wenn
  eine neuere Änderung aus einem anderen Tab desselben Geräts gewinnt.
- Der Client vergleicht Versionen mit Millisekunden, der Server mit
  Mikrosekunden (nur bei gekappten Zeitstempeln relevant). Das
  betrifft nur die lokale Entscheidung, ob eine synchronisierte Kopie
  ersetzt wird; maßgeblich bleibt die Serverordnung.
- Grenzfall der Kappung: Wird eine Mutation mit Zeitstempel aus der
  Zukunft nach einem verlorenen Response wiederholt und wurde sie
  inzwischen verdrängt, bekommt die Wiederholung ein neues `now()`
  und kann gewinnen.
- UI für verdrängte Schreibvorgänge: Option A umgesetzt in Paket 7.
- Teilen (11b): Lokale Kopien entzogener Seiten werden nur beim Start
  und bei `online` bereinigt, nicht während die App lange offen ist.
  Mehr als 1000 lesbare Seiten (`max_rows`) → keine Bereinigung.
  Ungesyncte Änderungen an einer entzogenen Seite bleiben mit Fehler
  stehen, bis der Nutzer sich abmeldet (Dialog bietet Verwerfen).
  (Behoben) Editoren aus anderen Workspaces können Titel und Icon
  geteilter Seiten ändern; Breite, Papierkorb und Teilen nicht.
- Paket 12a: Freigaben und öffentliche Links, die eine ausgetretene
  Person auf ihren privaten Seiten vergeben hat, bleiben gültig (die
  Seiten bleiben ja unangetastet). Zwischen Deploy von 12a und 12b
  legt die alte Oberfläche oberste Seiten weiter als geteilt an.
- Öffentliche Links (11c): Seiten haben kein `noindex`; wer den Link
  öffentlich postet, macht die Seite für Suchmaschinen auffindbar.
  Öffentliche Seiten sind offline nicht verfügbar (bewusst nicht
  gespeichert). Auch angemeldete Nutzer sehen unter `?p=` nur die
  öffentliche Ansicht.

**Arbeitsregel:** Wenn diese Datei und der aktuelle Code
auseinanderlaufen, ist der aktuelle Code die Quelle für den Ist-Zustand.
Die Produktanforderungen und die expliziten Entscheidungen des Nutzers
bleiben verbindlich, sofern sie nicht geändert wurden.
