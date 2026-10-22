---
name: product-video
description: Make a narrated product demo video. Claude collects a brief (name, objective, the steps to show, audience, language, male or female voice, special requirements), opens Chrome for the user to sign in, then drives the web app itself and records clean takes. Claude writes the voice-over and animated cards, and the tool renders a 1080p MP4 with a natural AI voice (ElevenLabs, or local Kokoro) and burnt-in captions in the chosen language. Use when the user asks to make, record or create a product video, demo video, walkthrough or tutorial video of a website or web app.
---

# Product video

The user signs in; you drive the app, record, write the narration and render.
Keep chat replies short.

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
4. If doctor says there's no ElevenLabs key, tell the user that, and explain
   that Kokoro (free, English only) will be used. To add a key, they put
   `ELEVENLABS_API_KEY=...` in `$SKILL_DIR/.env` or set it as an environment
   variable themselves. Never ask them to paste the key in chat.

## 2. Brief (always, before opening the browser)

Ask these in one message and wait for the answers. Don't start without them.

1. **Name of the video**
2. **Objective**: what the video should achieve (e.g. win prospects, train new
   staff, announce a feature) and what the viewer should do afterwards
3. **Steps**: in clear, short points, what to do in the app, in order
   (e.g. "open Approvals → open the first pending item → approve it → open Reports")
4. **Audience**: who will watch it
5. **Language** of the voice-over and captions (default English)
6. **Voice**: female or male
7. **Special requirements**: key messages, topics that must be narrated, and any
   animated screens wanted (e.g. a stat card or a list of points). By default a
   video only gets a title card and an outro card
8. **Start URL** (if not known)

Save the answers to `$OUT/brief.md`, where `OUT` = `product-videos/<name-in-kebab-case>`
in the working directory. Use the brief for every decision:
- **Objective** sets the story and the closing line (the call to action).
- **Steps** are what you do in the app, in that order. Show nothing outside them
  unless it's needed to get there.
- **Audience** sets tone and depth (prospects: benefits and outcomes;
  trainees: steps and where to click; managers: control and visibility).
- **Special requirements** become dedicated lines, and animated cards only where
  the user asks for one. Every item listed must appear in the final video.

## 3. Sign in

1. Run in the background: `node "$SKILL_DIR/src/cli.ts" drive <url> "$OUT"`.
2. Tell the user, in short bullets:
   - a Chrome window opens; sign in there (you never see or type credentials)
   - say "done" here once they're in the app
   - don't touch the window after that, while you work in it
3. Wait for their "done".

## 4. Explore, then record

Read `$SKILL_DIR/instructions/driving.md` first and follow it. In short:

1. `node "$SKILL_DIR/src/cli.ts" do "$OUT" look` shows the page as a tree of
   roles and names, and saves a screenshot (`$OUT/look.png`).
2. Try each step from the brief with `do "$OUT" step '<step>'` to find working
   targets. Exploring isn't recorded.
3. Write `$OUT/steps.yaml` with the whole flow, test it with `do "$OUT" run`,
   then record a clean take with `do "$OUT" record "$OUT/steps.yaml"`.
4. A take can be redone any time (fix `steps.yaml`, `record` again). It replaces
   the previous recording.
5. Before any step that saves, sends, approves, deletes or pays for something
   real, ask the user first and say exactly what it will do.
6. When the video is approved, `do "$OUT" close`.

## 5. Write the script

First read `$SKILL_DIR/instructions/narration.md`, `$SKILL_DIR/instructions/cards.md`
and `$SKILL_DIR/instructions/brand.md`, plus `$OUT/brief.md`. Follow them.

Read `$OUT/session.json`: `events` lists every click, field change, scroll and
page change with `t` (ms from video start), a `label`, and for clicks/pages a
screenshot `shot`. Look at only the screenshots you need (usually 5–12), not all.

Write `$OUT/script.yaml` with all spoken text and card text in the brief's language:

```yaml
title: AutoSmart Audit - Approvals and Reports
language: en           # brief's language code: en, de, fr, es, ar, hi, zh, ...
voice: female          # brief's choice: female | male
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
    text: Your day starts here – pending, in progress and done, all in one view.
  - at: 5500
    text: And when a dealership fixes an issue, it comes straight to you for approval.
  - at: 40800
    card: { type: outro, title: "AutoSmart Audit", subtitle: "Every center. Every finding." }
    text: That's AutoSmart Audit. Every center, every finding... under control.
```

- A plain segment narrates the recording from its `at` until the next segment.
- A segment with `card` pauses the recording at `at`, plays the animated card
  while its `text` is spoken, then the recording continues.
- **Quote every string inside `{ }`**: an unquoted comma splits the value.
- Silences between lines are tightened automatically (frozen screen time is cut);
  cards fade in and out.
- The voice engine is ElevenLabs when a key is set, else Kokoro. Kokoro speaks
  English only: for another language without a key, tell the user and stop.

## 6. Render and review

1. `node "$SKILL_DIR/src/cli.ts" render "$OUT"` (with Kokoro, the first run
   downloads the voice model, ~300 MB).
2. Check against the brief: the objective comes through, every step is shown,
   and every special requirement is covered. Fix and re-render if not.
3. Send the `.mp4` to the user.

## Edits

- Wording, timing, cards, voice: change `script.yaml` and render again. Only
  edited lines and cards are regenerated.
- On-screen actions: change `steps.yaml`, `record` again (the browser is still
  open unless closed), then re-time `script.yaml` from the new `session.json`.
- If the browser was closed, run `drive` again and the user signs in again.

## Manual mode

If the user wants to click through themselves (or your driving can't handle the
app), run `node "$SKILL_DIR/src/cli.ts" capture <url> "$OUT"` in the background
instead of `drive`, and give them the tips in `instructions/recording.md`. They
close the window to finish; then continue at step 5.
