# Changelog

## 26.10.4 — 2026-10-23

- **Fix: macOS on Apple Silicon said the app was "damaged".** The Apple Silicon build had a signature that was no longer valid (macOS: "code has no resources but signature indicates they must be present"), and recent macOS versions refuse such an app instead of offering to open it. The app is now signed ad hoc during the build (no Apple account is needed) and the build checks the signature of the app inside each disk image. The first start still shows the usual "unidentified developer" notice: System Settings → Privacy & Security → Open Anyway. If you already downloaded an earlier version and it will not open, run in Terminal: `xattr -cr "/Applications/File Renamer.app" && codesign --force --deep -s - "/Applications/File Renamer.app"`.
- **Tags and file values in the new name**: `{artist}` and `{title}` (the tags written in the file), `{duration}` (seconds; `{duration:mmss}` gives `0307`, `{duration:hhmmss}` gives `000307`), `{bitrate}` (kbit/s) and `{samplerate}` (Hz). They are read from the files on your computer, only when the pattern uses one of them, for MP3, FLAC, WAV/BWF, AIFF, M4A/MP4, Ogg/Opus and the other common formats. A file without the tag gets an empty value and its row says "tag missing". Characters a file name cannot hold are replaced as always.
- **Extension**: keep it, write it in lowercase or UPPERCASE, or replace it with another one (Find & replace, clean up, extension). Only the name changes: the file is not converted. The extension is part of presets and of the backup.
- **Save log (CSV)**: after a rename, Save log… writes old name, new name, folder, result and time of the batch (the files that failed too) to a CSV file for Excel, Numbers or LibreOffice.
- **Copy preview**: copies the lines "old name → new name" of the files that would be renamed to the clipboard.
- **Undo several batches**: the last 10 batches are kept and Undo last batch can be pressed again to go back one more. A batch that can no longer be undone (files moved or edited since) can be forgotten to reach the one before; no file is touched. The batch saved by 26.10.3 is picked up as the first one.
- **Sort by size** (smallest or largest first) before `{seq}` is applied.
- New dependency `music-metadata` (reads the tags; JavaScript only, nothing is sent anywhere). The build and the tests now run on Node 22.
- Tests: 91 in all (new ones for the tags, the extension, the CSV, the undo history, the sort and the ad-hoc signature).

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
