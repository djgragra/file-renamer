# File Renamer manual

File Renamer renames many audio and video files at once with a name pattern. You always see the new names before anything happens, a file is never overwritten, and the last batches can be undone. It is a free desktop app for Windows, macOS and Linux from OnAir Garage.

## Install and first launch

Download the installer for your system from the [Releases](https://github.com/djgragra/file-renamer/releases) page and check it against `SHA256SUMS.txt`:
`File-Renamer-Setup-<V>.exe` (Windows), `File-Renamer-<V>-arm64.dmg` (Mac with Apple silicon), `File-Renamer-<V>-x64.dmg` (Mac with Intel), `File-Renamer-<V>.AppImage` (Linux).
The app is free and has no Apple or Microsoft certificate, so the first launch may show a warning.

- **Windows**: run the installer. If SmartScreen says "Windows protected your PC", click *More info* → *Run anyway*.
- **macOS**: open the disk image and drag the app to Applications. The app is signed ad hoc, which is what an Apple silicon Mac needs to open it. The first start still shows the "unidentified developer" notice: open *System Settings → Privacy & Security*, scroll down and click *Open Anyway* (right-click → Open no longer exists on macOS 15 and later). If an earlier version (26.10.3 or older) says the app is "damaged", run this once in Terminal: `xattr -cr "/Applications/File Renamer.app" && codesign --force --deep -s - "/Applications/File Renamer.app"`
- **Linux**: make the AppImage executable (`chmod +x File-Renamer-*.AppImage`) and run it.

The app always opens in English; choose Italiano or Español from the language menu and the choice is remembered. The theme can be light, dark or follow the system.

## Renaming files step by step

1. **Add files**: drop files or folders on the list, or use *Add files…* and *Add folder…*. Folders are scanned for audio and video files (*Folders: audio/video only*); tick *Include subfolders* to go deeper. Hidden files, folders and links are skipped.
2. **Write a name pattern** in *Name pattern*, for example `{date:yyyyMMdd}_{seq:3}_{orig}`. The pattern applies to the name without the extension, which is kept. The *Insert* buttons add a placeholder at the cursor, and *Recent patterns* brings back what you used before.
3. **Look at the preview**: each row shows a checkbox, the *Current name*, the *New name* and a *Status*. Nothing has been renamed yet.
4. **Fix problems**: a row turns red when the new name is empty, is a reserved name, is longer than 255 characters, is the same as another file in the batch, or already exists on disk. Red rows block the rename until you change the pattern or untick them.
5. **Press *Rename…***, check the summary and confirm. Files are renamed in place, never overwritten.
6. If you change your mind, press ***Undo last batch***.

The counter `{seq}` follows the order of the list and starts where you say (*Counter starts at* and *Step*). You can sort the list by order added, name A–Z or Z–A, modified date or size before the counter is applied.

## Placeholders

The placeholders are replaced in the new name; the buttons under the pattern insert them for you.

| Placeholder | Meaning |
|---|---|
| `{date}` / `{date:FORMAT}` | Current date, default `yyyy-MM-dd` |
| `{time}` / `{time:FORMAT}` | Current time, default `HHmmss` |
| `{mdate}` / `{mtime}` | Same as `{date}` / `{time}`, but the file's own modification time |
| `{date+1h:H}`, `{date-1d:yyyyMMdd}` | Shifted by N minutes (`m`), hours (`h`) or days (`d`) |
| `{seq}` / `{seq:N}` | Counter of the batch, zero-padded to N digits |
| `{rand}` / `{rand:N}` | Random lowercase letters and digits (default 6, at most 64) |
| `{env:NAME}` | Value of the environment variable `NAME` (empty if not set) |
| `{orig}` | Original name without the extension |
| `{parent}` | Name of the folder that contains the file |
| `{artist}` / `{title}` | Tags read from the file (ID3, Vorbis comments, MP4, RIFF INFO, APE…); several artists are joined with `/`, which becomes `_` in a name. Empty if the file has none |
| `{duration}` / `{duration:mmss}` / `{duration:hhmmss}` | Length in whole seconds (`187`), minutes and seconds (`0307`), hours, minutes and seconds (`000307`) |
| `{bitrate}` / `{samplerate}` | Bit rate in kbit/s (rounded) and sample rate in Hz, as written in the file |

FORMAT uses the letters `yyyy yy MM M dd d HH H hh h mm m ss s SSS a`; text in single quotes is literal. An unknown `{word}` is kept as typed and flagged in the preview. Random values stay the same while you type, so the preview does not flicker: *New random values* draws a new set. A file without the requested tag gets an empty value and its row says "tag missing". The names you confirm are exactly the names shown.

## Find & replace, clean up and extension

Open *Find & replace, clean up, extension* to refine the new name after the pattern has been applied.

- **Find and replace**: *Find* a piece of text (or a regular expression, with *Regular expression*; *Match case* is optional) and give *Replace with*. An empty replacement removes the text. An invalid expression blocks the rename and says so.
- **Clean up**: letters all lowercase, ALL UPPERCASE or Title Case; spaces replaced with `_` or `-`; remove accents (è → e); remove special characters (keeps letters, digits, space and `_ - .`).
- **Extension**: keep it, lowercase, UPPERCASE or replace it with another one (letters, digits, `_`, `+` and `-`, 16 characters at most). Only the name changes: a `.wav` renamed to `.mp3` is still a WAV file.
- **Presets**: *Save preset…* keeps the pattern, the counter, find & replace and clean up under a name (up to 50). Choose it again from *Preset*; *Delete* removes it.

## Preview, log and undo

- **Copy preview** puts one line per file that would be renamed on the clipboard (`old name → new name`).
- **Save log…** writes a CSV of the last batch: old name, new name, folder, result and time, also for the files that failed. It opens in Excel, Numbers and LibreOffice.
- ***Undo last batch*** restores the names of the newest batch; press it again to go back one more. The last 10 batches are kept. A file that was changed after the rename, or whose old name is now used by another file, is left as it is. A batch that can no longer be undone can be forgotten to reach the one before.

## Settings

Settings are in tabs, in the same order as in every OnAir Garage app:

| Tab | Content |
|---|---|
| General | Language and theme |
| Updates | The guided update (see below) |
| Backup | Export and import of settings and presets |
| Help & About | Version, licence, links, *Copy info for support*, *Open logs folder* and the tip card |

**Backup**: *Export* saves settings and presets as `file-renamer-backup-YYYY-MM-DD.json`; *Import* reads them back on another computer. The app keeps no passwords or tokens, so the file has none.

**Help & About** shows the version, the licence, the credits and the links. *Copy info for support* copies version, system and language, never file names or folders. *Open logs folder* opens the daily logs (7 days, counts only). The small tip card has a jar and a button: both open the support page of the website in the language of the app; nothing is asked inside the app.

## Updates

File Renamer looks for a new version 15 seconds after it starts and then every 24 hours (you can switch it off, and press *Check now*, in *Settings → Updates*, which also shows the date and result of the last check). A banner offers *Download and install*, *Remind me later* (24 hours) and *Skip this version*, with the first lines of the release notes. The download shows a progress bar, can be cancelled, and is checked against the SHA-256 published in the release (`SHA256SUMS.txt`): a file that does not match is deleted. *Close and install* is refused while a rename is running and saves a safety copy of the settings first. After the update a *What's new* window appears once. Nothing is installed without a click.

## Limits and safety

- Only regular files are renamed. Folders, symbolic links and hidden files found while scanning folders are skipped. A scan stops at 20,000 files.
- **Windows naming rules apply on every system**, so names also work after moving files to Windows or to a FAT/exFAT drive: the characters `< > : " / \ | ? *` and control characters are replaced by `_` (the row says so); reserved names such as `CON`, `PRN`, `AUX`, `NUL`, `COM1`–`COM9` and `LPT1`–`LPT9` are refused; a name must not end with a space or a period.
- **Never overwrite**: the new name is claimed first and the old one is removed afterwards. On file systems without hard links (FAT, exFAT, some network shares) the app checks and then renames, which leaves a very small time window.
- Swaps and chains inside a batch (a→b while b→c) and changes of case only (`Clip.wav` → `clip.wav`) go through temporary names in the same folder.
- The app never writes tags or changes the content of a file: tags, lengths, bit rates and sample rates are only read, on your computer, and only when the pattern uses one of them. Nothing is sent anywhere.
- A very heavy regular expression on thousands of files can make the preview slow.
- This is not a certified tool: always read the preview before confirming.

## Troubleshooting

| Problem | What to do |
|---|---|
| macOS: "the app is damaged / cannot be opened" | Open *System Settings → Privacy & Security → Open Anyway*; for a version before 26.10.4, run in Terminal `xattr -cr "/Applications/File Renamer.app" && codesign --force --deep -s - "/Applications/File Renamer.app"`. |
| Windows: "Windows protected your PC" | *More info* → *Run anyway*. |
| Linux: the AppImage does not start | Make it executable (`chmod +x`) and install FUSE (`libfuse2`) if your system needs it. |
| A row is red | Read its status: change the pattern, or untick the row. |
| The row says "tag missing" | The file has no such tag: the value is empty. Use another placeholder or check the tags with a tag editor. |
| The undo left some files as they are | They were changed after the rename, or their old name is used by another file. |
| The update download failed with "checksum mismatch" | The file was deleted automatically. Try again, or download the installer by hand from the releases page. |

## Contacts

Graziano Melzi · OnAir Garage — `https://onairgarage.com` — `hello@onairgarage.com`. Tool page: `https://onairgarage.com/tools/file-renamer/`. Source code and releases: `https://github.com/djgragra/file-renamer`. Licence: MIT © 2026 Graziano Melzi.
