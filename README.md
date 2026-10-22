# MusicFlow — Professional Digital Sheet Music Reader

MusicFlow is a local-first web application designed for pianists and musicians to import, organise, read, annotate, and practise PDF and image sheet music without interface distractions.

---

## 1. Quick Start (Local Development & Production Preview)

### Prerequisites

- **Node.js** 20+ (Node 24 LTS is installed at `%LOCALAPPDATA%\Programs\node-v24.22.1-win-x64` on this machine) and **npm**.

### Install & Run

```bash
cd musicflow
npm install
npm run dev
```

Open the URL printed by Vite (typically `http://localhost:5173`) in your browser.

### Production Build & Preview

```bash
cd musicflow
npm run build
npm run preview
```

---

## 2. Implemented Features

### Digital Sheet Music Library
- **Multi-format import:** Import single or multipage **PDF** scores as well as **PNG** and **JPG** sheet music via drag-and-drop or the file picker. Multiple uploaded images can optionally be combined into a single multipage score.
- **Starter score generator:** Includes a one-click 3-page engraved-style PDF generator (*Prelude in C Major, BWV 846 — J.S. Bach*) so you can test every feature immediately.
- **Automatic thumbnails & filename parsing:** Renders a JPEG preview thumbnail of page 1 on import and extracts `Title - Composer` automatically from filenames.
- **Rich metadata & collections:** Edit title, composer, musical genre, difficulty level (1–5), tags, favourites, personal practice notes, and assign scores to collections (*Currently Practising*, *Performance Repertoire*, *Classical Music*, *Film Soundtracks*, *Video Game Music*, *Technical Exercises*, or custom collections).
- **Search, filter & sort:** Accent-insensitive full-text search across title, composer, genre, tags, notes, and filename; filter by collection, favourites, recently opened, genre, difficulty, or tag; sort by last opened, date added, title, composer, or difficulty; switch between **Grid** and **List** layouts.
- **Persistent local storage & portable backups:** Uses **IndexedDB (Dexie.js)** to store both metadata and original PDF/image blobs locally across browser restarts. Includes full `.musicflow.zip` backup export and merge/replace restore.

### Distraction-Free Sheet Music Reader
- **Maximum score area:** No permanently visible toolbars or page indicators covering notation. Floating controls fade out automatically after inactivity and reappear on pointer movement, screen tap, or keypress.
- **Performance mode (`P`):** Hides all floating bars, leaving only a tiny semi-transparent corner button to exit performance mode.
- **Display & zoom modes:**
  1. Continuous vertical scrolling (`continuous`)
  2. Single-page view (`single`)
  3. Two-page spread view (`spread`)
  4. Fit-to-width (`width`)
  5. Fit-to-page (`page`)
  6. Custom zoom (`25%` – `500%`) with offscreen double-buffered rendering at device-pixel resolution so notation stays crisp on high-DPI displays without stretching or flashing blank frames.
- **Page navigation:** Previous/Next buttons, direct page selector, keyboard shortcuts, optional left/right edge click zones, and touch swipe gestures.

### Advanced Automatic Scrolling
- **Time-based `requestAnimationFrame` engine:** Uses elapsed frame time (`dt`) and sub-pixel accumulation for smooth movement at any speed across multipage PDFs.
- **Live speed controls:** Adjust seconds-per-page continuously while scrolling is active, step speed up/down (`+` / `-`), choose speed presets (*Very slow* to *Very fast*), or configure a start countdown (`None`, `3s`, `5s`, `10s`, or `1 Bar` metronome count-in).
- **Musical Timing Mode (BPM-Calibrated):** Place bar (measure) reference markers on the score; MusicFlow interpolates between your calibrated bar positions at the exact tempo (`BPM` and time signature) set in the metronome.

### Professional Web Audio Metronome
- **Look-ahead Web Audio scheduler:** Schedules synthesized audio clicks directly on the `AudioContext` timeline (`start(time)`) with a worker-backed look-ahead timer to prevent main-thread timing drift.
- **Controls & meters:** 20–300 BPM range, tap tempo (`T`), Italian tempo markings & presets, time signatures (`2/4`, `3/4`, `4/4`, `5/4`, `2/2`, `3/8`, `6/8`, `9/8`, `12/8`), compound-meter grouping (dotted-quarter vs eighth-note feel), subdivisions (`×1`–`×4`), accented downbeat toggle, count-in bars (`Off`, `1b`, `2b`), 4 synthesized timbres (*Studio Click*, *Woodblock*, *Harmonic Beep*, *Quartz Digital*), volume & mute, and visual beat lamps.
- **Independent operation:** Start, pause, or stop autoscroll without interrupting the metronome, or vice versa.

### Practice Tools & Non-Destructive Annotations
- **Bookmarks:** Save named, colour-coded bookmarks at any page and vertical position (or click directly on the score to place one) and jump back with one tap.
- **Practice Sections (A–B Passages):** Define start (`A`) and end (`B`) points for difficult passages, jump to the start (`R`), and optionally loop the passage automatically during autoscroll.
- **Non-destructive annotations:** Draw with the **Pencil** or **Highlighter**, add **Text Notes**, or use the **Eraser** with full **Undo / Redo** and per-page clear. Annotations are stored in normalised `[0..1]` page coordinates separately from the PDF so they remain aligned at every zoom level.
- **Per-piece memory:** Remembers each score's view mode, fit mode, zoom, last reading position (with a *"Continue from Page X"* banner when reopening), autoscroll speed, metronome BPM & time signature, timing markers, bookmarks, practice sections, and annotations.

---

## 3. Automated Testing

```bash
# Run unit and integration tests (Vitest + fake-indexeddb)
npm test

# Run end-to-end browser tests (Playwright + Chrome)
npm run test:e2e
```

---

## 4. Subir a GitHub y Desplegar en GitHub Pages

El proyecto ya cuenta con un repositorio Git inicializado, `.gitignore` configurado y un flujo de trabajo de **GitHub Actions** ([`.github/workflows/deploy.yml`](./.github/workflows/deploy.yml)) listo para publicar automáticamente en **GitHub Pages**.

### Pasos para subirlo a tu cuenta de GitHub

1. Crea un repositorio vacío en [github.com/new](https://github.com/new) (por ejemplo, `musicflow`).
2. Desde una terminal dentro de la carpeta `musicflow`, enlaza tu repositorio remoto y sube la rama `main`:
   ```bash
   cd musicflow
   git remote add origin https://github.com/<TU_USUARIO>/<TU_REPOSITORIO>.git
   git branch -M main
   git push -u origin main
   ```
3. Para activar la publicación web gratuita en **GitHub Pages**:
   - En tu repositorio de GitHub, ve a **Settings → Pages**.
   - En **Build and deployment → Source**, selecciona **GitHub Actions**.
   - El workflow `Deploy MusicFlow to GitHub Pages` compilará y publicará automáticamente tu aplicación en `https://<TU_USUARIO>.github.io/<TU_REPOSITORIO>/`.

*(Rutas relativas `base: './'` en `vite.config.ts` y enrutamiento hash `#/library`, `#/reader/:id`, `#/settings` garantizan compatibilidad total en cualquier subruta o dominio estático).*

---

## 5. Known Technical Limitations

1. **Local browser storage does not auto-sync between devices:** All imported scores, preferences, bookmarks, and annotations are stored locally in the browser's IndexedDB for privacy and offline reliability. To move your library to another computer or tablet, use **Settings → Export Full Backup (`.musicflow.zip`)** and import it on the target device.
2. **Manual calibration for Musical Timing autoscroll:** Standard PDF and image files do not contain machine-readable measure coordinates. Musical Timing (BPM) autoscroll therefore relies on user-placed bar markers rather than optical music recognition (OMR).
3. **Browser audio & wake-lock policies:** Browsers require a user gesture (click, tap, or keypress) before starting Web Audio playback, and the Screen Wake Lock API requires an active visible tab in a secure context (`https://` or `localhost`).
