# Sound Cue Board

A self-contained, installable web app for triggering sound effects during a live play from an iPad. No app store, no account, no internet connection required once installed. All sounds, images, and show layout are stored on the device itself.

## Features

- Multiple pages (e.g. "Act 1", "Act 2") of sound buttons
- Upload any playable audio file (mp3, wav, m4a, etc.) per button
- Custom emoji or uploaded image icon per button, plus a color
- Tap to play; live countdown (e.g. `2.4s`) shown on the button while it plays
- Sounds can overlap — different buttons can play at the same time
- Per-button volume and an optional loop (tap once to start looping, tap again to stop)
- **STOP ALL** panic button to instantly silence everything
- **Edit Mode** lock — normal taps just play sounds; flip on Edit Mode to rename buttons, change icons/colors/audio, reorder (long-press and drag), and manage pages
- Export/Import a single backup file containing every page, button, and audio file
- Installs to the iPad Home Screen and works fully offline after the first load
- Switchable dark/light theme (dark is easier on the eyes backstage)

## Deploying so it's installable on the iPad

The app is just static files (no server-side code), so any static host works. GitHub Pages is free and simple:

1. Create a new **private or public** GitHub repository (e.g. `sound-cue-board`).
2. From this folder, initialize git and push:
   ```bash
   cd "sound-cue-board"
   git init
   git add -A
   git commit -m "Initial sound cue board"
   git branch -M main
   git remote add origin https://github.com/<your-username>/sound-cue-board.git
   git push -u origin main
   ```
3. On GitHub: **Settings → Pages** → under "Build and deployment", set Source to **Deploy from a branch**, branch `main`, folder `/ (root)`. Save.
4. After a minute, GitHub gives you a URL like `https://<your-username>.github.io/sound-cue-board/`.

(Netlify or Vercel work the same way if you'd rather drag-and-drop the folder — just make sure the site is served over **https**, which all of these provide automatically.)

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
