# nodi

Webbasierte Wissensmanagement-App: Seiten in Workspaces organisieren und mit
einem Block-Editor ([BlockNote](https://www.blocknotejs.org/)) bearbeiten.
Backend und Authentifizierung laufen über [Supabase](https://supabase.com/).

Ziel ist eine installierbare PWA für iOS und Android mit Offline-Bearbeitung.
Architektur, Entscheidungen und Arbeitspakete stehen in [`CLAUDE.md`](CLAUDE.md).

Produktiv: <https://risingwolf21.github.io/nodi/>

## Technik

- React 19, TypeScript 6, Vite 8
- Tailwind CSS 4, shadcn/ui
- Supabase (Postgres mit Row Level Security, Auth)
- pgTAP für Datenbanktests

## Lokale Entwicklung

Voraussetzungen: Node.js 24, npm, für die Datenbank zusätzlich Docker und die
[Supabase CLI](https://supabase.com/docs/guides/local-development/cli/getting-started).

```bash
npm ci
cp .env.example .env.local   # Werte eintragen, siehe unten
npm run dev                  # http://localhost:5173/nodi/
```

`.env.local` braucht nur öffentliche Client-Werte:

| Variable | Wert |
|---|---|
| `VITE_SUPABASE_URL` | Projekt-URL, lokal `http://127.0.0.1:54321` |
| `VITE_SUPABASE_PUBLISHABLE_KEY` | Publishable Key des Projekts, lokal aus `supabase status` |

Niemals den Service-Role-Key ins Frontend oder ins Repository legen.

### Lokale Datenbank

```bash
supabase start      # komplette lokale Supabase-Instanz inkl. Auth und Studio
supabase db reset   # Datenbank neu aufsetzen und alle Migrationen anwenden
supabase test db    # pgTAP-Tests aus supabase/tests/
supabase db lint    # Schema-Lint
```

Schemaänderungen immer als neue Datei in `supabase/migrations/` anlegen und mit
einem pgTAP-Test absichern.

## Skripte

| Befehl | Zweck |
|---|---|
| `npm run dev` | Entwicklungsserver |
| `npm run lint` | ESLint |
| `npm run build` | Typprüfung (`tsc -b`) und Produktionsbuild nach `dist/` |
| `npm run preview` | Produktionsbuild lokal ausliefern |

## CI und Deployment

- **CI** (`.github/workflows/ci.yml`) läuft bei jedem Pull Request und jedem
  Push auf `master`: Lint, Build, Prüfung des Base-Pfads `/nodi/`, alle
  Migrationen auf einer frischen Datenbank, `supabase db lint` und
  `supabase test db`.
- **Deployment** (`.github/workflows/deploy.yml`) auf GitHub Pages bei Push auf
  den Branch `production`. Benötigt die Repository-Secrets
  `VITE_SUPABASE_URL` und `VITE_SUPABASE_PUBLISHABLE_KEY`.

Die App läuft unter dem Base-Pfad `/nodi/` (`vite.config.ts`). Neue Assets und
URLs müssen unter diesem Pfad funktionieren.
