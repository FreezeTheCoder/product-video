---
name: product-video
description: Make a narrated product demo video. Claude first collects a short brief (name, description, audience, special requirements), the user records themselves clicking through a web app in Chrome, Claude writes the voice-over and animated cards from the brief and the recording, and the tool renders a 1080p MP4 with a local AI voice (Kokoro) and burnt-in captions. Use when the user asks to make, record or create a product video, demo video, walkthrough or tutorial video of a website or web app.
---

# Product video

The user does the recording. You collect the brief, write the narration and
cards, and run the tool. Keep chat replies short.

`SKILL_DIR` = the folder containing this file. Run every command with Bash from
the user's working directory, e.g. `node "$SKILL_DIR/src/cli.ts" ...`.

## 1. Setup (first run only)

1. `node --version`. If Node is missing or older than 22.18, stop and ask the
   user to install the current LTS from https://nodejs.org (Windows:
   `winget install OpenJS.NodeJS.LTS`), then restart Claude Code.
2. If `$SKILL_DIR/node_modules` is missing: `npm install --prefix "$SKILL_DIR"`.
3. `node "$SKILL_DIR/src/cli.ts" doctor`. If ffmpeg is missing, ask the user, then
   install it (Windows: `winget install --id Gyan.FFmpeg -e`; macOS: `brew install ffmpeg`).
   If Chrome is missing, ask the user to install Google Chrome.

## 2. Brief (always, before recording)

Ask these in one message and wait for the answers. Do not start recording
without them. Also ask for the start URL if it is not known.

1. **Name of the video**
2. **Description**: what the video shows and what the viewer should take away
3. **Audience**: who will watch it (e.g. new auditors, dealership managers, prospects)
4. **Special requirements**: topics that must be narrated, key messages, and any
   special animated screens wanted (e.g. a stat card or a list of points).
   By default a video only gets a title card and an outro card

Save the answers to `$OUT/brief.md`, where `OUT` = `product-videos/<name-in-kebab-case>`
in the working directory. Use the brief for every writing decision:
- **Audience** sets tone and depth (prospects: benefits and outcomes;
  trainees: steps and where to click; managers: control and visibility).
- **Special requirements** become dedicated lines, and animated cards only where
  the user asks for one. Every item listed must appear in the final video.

## 3. Record

1. Run in the background: `node "$SKILL_DIR/src/cli.ts" capture <url> "$OUT"`
   (it replaces any earlier recording in `$OUT` and keeps `brief.md`).
2. Tell the user, in short bullets (see `instructions/recording.md`):
   - a Chrome window opens; sign in if asked (you never see or type credentials)
   - press F11 for fullscreen: on a 1080p screen that gives a sharp 1080p video
   - click through calmly, pausing ~2 s after each click
   - close the window to finish
3. Wait for the command to finish. Never drive the browser yourself.

## 4. Write the script

First read `$SKILL_DIR/instructions/narration.md`, `$SKILL_DIR/instructions/cards.md`
and `$SKILL_DIR/instructions/brand.md`, plus `$OUT/brief.md`. Follow them.

Read `$OUT/session.json`: `events` lists every click, field change, scroll and
page change with `t` (ms from video start), a `label`, and for clicks/pages a
screenshot `shot`. Look at only the screenshots you need (usually 5–12), not all.

Write `$OUT/script.yaml`:

```yaml
title: AutoSmart Audit - Approvals and Reports
voice: af_heart
speed: 1.0
captions: true
start: 2000            # ms; trim dead time before the first action
end: 40800             # ms; trim after the last action
cuts: [[38000, 50800]] # optional; drop idle stretches
segments:              # in time order; one per step the viewer should understand
  - at: 2000
    card: { type: title, title: "Approvals & Reports", subtitle: "For area managers" }
    text: Checking dealership fixes shouldn't take all week. Here's how it works.
  - at: 2000
    text: Your day starts here. Pending, in progress, and done... all in one view.
  - at: 5500
    text: When a dealership fixes an issue, it comes to you for approval.
  - at: 40800
    card: { type: outro, title: "AutoSmart Audit", subtitle: "Every center. Every finding." }
    text: AutoSmart Audit. Every center, every finding... under control.
```

- A plain segment narrates the recording from its `at` until the next segment.
- A segment with `card` pauses the recording at `at`, plays the animated card
  while its `text` is spoken, then the recording continues.
- **Quote every string inside `{ }`**: an unquoted comma splits the value.

## 5. Render and review

1. `node "$SKILL_DIR/src/cli.ts" render "$OUT"` (first run downloads the voice
   model, ~300 MB).
2. Check the brief: every special requirement is covered. Fix and re-render if not.
3. Send the `.mp4` to the user.

## Edits

Change `script.yaml` and render again. Only edited lines and cards are
regenerated. Record again only if the user wants different on-screen actions.
