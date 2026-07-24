# Sound Cue Board

A self-contained, installable web app for triggering sound effects during a live play from an iPad. No app store, no account, no internet connection required once installed. All sounds, images, and show layout are stored on the device itself.

**Live URL:** https://davidmhornsby.github.io/sound-cue-board/
**Repo:** https://github.com/davidmhornsby/sound-cue-board

## Features

- Multiple pages (e.g. "Act 1", "Act 2") of sound buttons
- Upload any playable audio file (mp3, wav, m4a, etc.) per button
- Custom emoji or uploaded image icon per button, plus a color
- Tap to play; live countdown shown on the button, with a top progress bar that fills at 100% instantly and depletes to 0% as the sound plays
- Sounds can overlap — different buttons can play at the same time
- A **STOP** button appears on any playing tile to stop just that sound
- **Trim audio** per sound — drag handles on a waveform to pick the exact start/end of the clip
- **Fade in / fade out** per sound — set ramp times on the trim waveform; the envelope is drawn right on it
- Per-button volume and an optional loop (tap once to start looping, tap again to stop)
- **STOP ALL** panic button for an instant hard stop
- **FADE OUT** button — gracefully fades every playing sound to silence over a configurable 0.5–5s duration (adjustable right on the button), with a live countdown and depleting background showing fade progress
- **Edit Mode** lock — normal taps just play sounds; flip on Edit Mode (header turns amber/black hazard stripes so it's unmistakable) to rename buttons, change icons/colors/audio, reorder (long-press and drag), and manage pages
- Export/Import a single backup file containing every page, button, sound file, and setting (including trims/fades/fade-out duration)
- Installs to the iPad Home Screen and works fully offline after the first load
- Switchable dark/light theme (dark is easier on the eyes backstage)
- Ships with a **default show** (`default-show.json`) that loads automatically the very first time the app runs on a device with no saved show yet

## Deploying updates

This repo is already deployed via GitHub Pages from the `main` branch. To ship a change:

```bash
cd sound-cue-board
git add -A
git commit -m "describe the change"
git push
```

GitHub rebuilds the Pages site automatically within about a minute. **Important:** whenever you edit `css/style.css` or any file under `js/`, bump the `?v=N` query on that file everywhere it's referenced — the `<link>`/`<script>` tags in `index.html`, the `import` lines at the top of `js/app.js`, and the `CACHE_NAME` + `SHELL_FILES` list in `sw.js`. Without that bump, the offline service worker (and some browsers/proxies) will keep serving the old file even after you push, since a same-URL request looks unchanged to them. This is what makes updates actually show up instead of silently staying stale.

### Updating the default show

`default-show.json` at the repo root is loaded automatically on any device/browser that has no saved show yet (a genuinely fresh install, or Safari data cleared). To update what ships as the default:

1. Build the show you want as the default inside the app itself.
2. Open the ☰ menu → **Export Show Backup** — it downloads a `sound-cue-board-backup-*.json` file.
3. Replace the repo's `default-show.json` with that downloaded file (rename it to exactly `default-show.json`).
4. Commit and push. Existing installs that already have a saved show are untouched — this only affects new/empty installs.

## Installing on the iPad

1. Open the deployed URL in **Safari** on the iPad (must be Safari, not Chrome, for Home Screen install to work fully).
2. Tap the **Share** icon → **Add to Home Screen** → **Add**.
3. Launch it from the Home Screen icon from now on. After this first load, it keeps working even with no Wi-Fi/data — the sounds and show layout live in the iPad's local storage, and the app itself is cached for offline use.

If you ever update the deployed files, re-open the app once while online so it can fetch the update in the background; it'll take effect the next time you fully close and reopen it.

## Using it for a show

- **Building your show**: tap **Edit Mode**, then **+** to add a sound button — give it a name, an emoji or image, a color, and a sound file. Add more pages with **+ Page** in the page bar (e.g. one per act).
- **Reordering**: while in Edit Mode, press and hold a button for about a third of a second, then drag it to a new spot.
- **Running the show**: turn **Edit Mode** off. Tapping a button plays its sound and shows a live countdown. Looping buttons show an elapsed time with a 🔁 icon — tap them again to stop. **STOP ALL** kills every currently playing sound instantly.
- **Backups**: open the ☰ menu → **Export Show Backup** to download one file with everything in it. Keep a copy somewhere safe (email it to yourself, save it to Files/iCloud). **Import Show Backup** restores from that file onto any iPad — handy if you get a replacement device or want to hand the show off to another operator's iPad.

## Local development / testing on a Mac

From this folder:
```bash
python3 -m http.server 8123
```
Then open `http://localhost:8123` in a browser. Regenerate the icons any time with:
```bash
python3 scripts/make_icons.py
```
