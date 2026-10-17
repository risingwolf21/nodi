# App-Icon

Quellen (SVG, 512×512):

| Datei | Verwendung |
|---|---|
| `public/favicon.svg` | Favicon und Quelle für `pwa-192.png`, `pwa-512.png` (abgerundet, transparente Ecken) |
| `design/icon-full-bleed.svg` | Quelle für `maskable-512.png` und `apple-touch-icon-180.png` (randlos, Zeichen auf 80 % für die maskable Safe Zone) |

Die PNGs in `public/icons/` werden aus diesen SVGs gerendert, mit
beliebigem SVG-Renderer in exakt der Zielgröße:

| Ausgabe | Quelle | Größe | Hintergrund |
|---|---|---|---|
| `pwa-192.png` | `favicon.svg` | 192×192 | transparent |
| `pwa-512.png` | `favicon.svg` | 512×512 | transparent |
| `maskable-512.png` | `icon-full-bleed.svg` | 512×512 | deckend |
| `apple-touch-icon-180.png` | `icon-full-bleed.svg` | 180×180 | deckend (iOS rundet selbst) |

Nach einer Änderung an einem SVG alle zugehörigen PNGs neu erzeugen.
