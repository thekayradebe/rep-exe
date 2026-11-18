# REP.exe

A personal Monday–Saturday dumbbell strength log (Saturday is Abs & Core). Phone-first, pastel Y2K look.

**Live:** https://thekayradebe.github.io/rep-exe/

## Where the workout data lives

Workout logs are saved in the browser on the device you use (localStorage). Nothing is sent anywhere unless you turn on sync. This repo only holds the app code.

- Each phone or browser keeps its own copy of the log. On iPhone, Safari and the Home Screen app are separate, and deleting the Home Screen app deletes its copy.
- **Sync (optional):** Progress → *Sync with GitHub*. Paste a classic GitHub token with only the `gist` scope. The app keeps the log in one secret gist (`rep-exe-log.json`) and merges it with each device on open, after edits, and when back online. The newest edit of each day wins. The token stays on that device; *Turn off* removes it. A secret gist is unlisted, not locked: anyone with its URL can read it.
- Use **Progress → Backup → Export** now and then. **Import** restores a backup file (merge or replace).
- On iPhone, add the app to your Home Screen (Safari → Share → Add to Home Screen). Safari can clear website data for sites you haven't opened in a while; the Home Screen app is protected from that.

## Files

| File | What it is |
| --- | --- |
| `js/plan.js` | The training plan, form-video links and cues. **Edit this to change exercises or videos.** |
| `js/model.js` | Data rules: dates, set counting, progress squares, backup validation. No UI code. |
| `js/app.js` | Screens, storage and when to sync. |
| `js/sync.js` | GitHub Gist calls for sync. |
| `css/styles.css` | The look. |
| `sw.js`, `manifest.webmanifest`, `icons/` | Home Screen install and offline use. |
| `tests/model.test.js` | Logic tests. |

Past sessions store the prescription they were logged with, so editing `plan.js` never rewrites history.

## Run locally

```
cd ~/Documents/hosted-sites/rep-exe
python3 -m http.server 8765
```

Then open http://127.0.0.1:8765/

## Tests

```
npm test
```

## Deploy

GitHub Pages serves branch `main` from the repo root. Push to `main` and wait about a minute.

```
gh api repos/thekayradebe/rep-exe/pages/builds/latest --jq '.status'
```

**After changing any app file**, bump the `?v=` number everywhere it appears (index.html, js/app.js, js/model.js, tests, sw.js `V`). This stops phones mixing old and new files.

The installed app checks the network first, so updates arrive on the next open with a connection. Offline, it uses the last cached copy.
