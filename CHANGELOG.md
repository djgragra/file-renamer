# Changelog

## 26.10.3 — 2026-10-17

- **Guided update, cleaner interrupted downloads** (shared updater, version 2): a download that is cut off, cancelled, stalls for a minute or ends with a failed rename no longer leaves an unfinished installer (`.part`) in the Downloads folder, and the ones an earlier run left are removed when the app starts.
- **Tip line** in Settings → Help & About: a small box with a tip jar and one line with a link to the tip page of onairgarage.com, in the language of the app. Nothing appears in the main window and nothing repeats.
- Electron updated to 44.9.0 and the build tools to their latest compatible versions.
- Tests: 56 in all (new ones for the interrupted downloads and the tip line).

## 26.10.2 — 2026-10-13

- **Find and replace, clean up** (new, optional, in the pattern area): find text or a regular expression in the new name and replace it (an empty "Replace with" removes the text); clean up accents, special characters, upper/lower/Title Case and spaces (to `_` or `-`). The result still goes through the safety rules and the preview.
- **Presets**: save the pattern, the counter, find & replace and clean up under a name; load, replace or delete them from the list. Presets are part of the backup.
- **`{parent}`** placeholder: the name of the folder that contains the file (the day, the event…).
- **Backup like the other OnAir Garage apps** (Settings → Backup): Export / Import of the settings and the presets, file `file-renamer-backup-YYYY-MM-DD.json`; the import can replace everything or add only the presets this computer does not have. The app keeps no passwords or tokens, so the file holds none.
- **Guided update, the same in every OnAir Garage app**: a banner offers **Download and install**, **Remind me later** (24 hours) and **Skip this version**; progress bar with Cancel; the installer is checked against the published SHA-256 sums. **Close and install** is refused while a rename is in progress, saves a safety copy of the settings first (the last 3 are kept) and, on Windows, closes the app and starts the installer; on macOS it opens the disk image, on Linux it shows the AppImage. After the update a **What's new** window shows once. Settings → Updates shows the same states, the last check and **Check now**. Nothing is installed without a click.
- **Signature of the OnAir Garage apps**: Settings in tabs (General, Updates, Backup, Help & About); **Help & About** with licence, credits, links, **Copy info for support** (no file names or folders) and **Open logs folder**; daily logs of at most 5 MB each, 7 days kept (counts only, never file names). The settings now live in one settings file in the app data folder (the values saved by 26.10.1 are copied over at the first start).
- **New logo and new look**: a new logo (an old name turning into a new one) drawn as SVG (`assets/logo.svg`) with all the app icons generated from it (`dev/make-icons.mjs`); header with the logo and a status pill that says in words what is ready; soft corners, light shadows and small transitions (off when the system asks for less motion), better contrast in the light theme, a welcome screen with the logo. No change in how names are built or files are renamed.
- `CLAUDE.md` is now part of the repository and points to the standard the app is built under.
- Tests: 46 in all (new ones for find & replace and clean up, `{parent}`, presets and settings, the backup, the guided update with a fake GitHub, the safety copy, the changelog in the package, the log rotation, the same keys in English/Italian/Spanish and the icon files).

## 26.10.1 — 2026-10-01

First release. Batch rename of audio and video files with a pattern (`{date}`, `{time}`, `{mdate}`, `{mtime}`, `{seq}`, `{rand}`, `{env}`, `{orig}`), a mandatory preview, no overwriting, swaps and chains handled through temporary names and one-step undo. English, Italiano, Español; light, dark or system theme; update check against the GitHub releases of the project.
