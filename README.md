# product-video

A [Claude Code](https://claude.com/claude-code) skill that makes a narrated,
captioned 1080p product video of your web app, in the language you choose.

You describe what to show and sign in. Claude clicks through the app itself
and records it, writes the voice-over, and renders an MP4 with animated title
and outro cards. The voice is [ElevenLabs](https://elevenlabs.io) (natural,
about 30 languages, male or female) or, without a key, the free local Kokoro
voice (English).

---

## Contents

- [How it works](#how-it-works)
- [Requirements](#requirements)
- [Install](#install)
- [Make your first video](#make-your-first-video)
- [Editing a video](#editing-a-video)
- [Customising the skill](#customising-the-skill)
- [The script file](#the-script-file)
- [Commands](#commands)
- [Updating](#updating)
- [Privacy and security](#privacy-and-security)
- [Troubleshooting](#troubleshooting)
- [Project layout](#project-layout)
- [Licences](#licences)

---

## How it works

```
 1. Brief        Claude asks: name, objective, steps to show, audience, language, voice, extras
 2. Sign in      Chrome opens -> you sign in -> you tell Claude "done"
 3. Record       Claude explores the app, then records a clean take of your steps
 4. Script       Claude reads the clicks + screenshots and writes the narration
 5. Render       AI voice + recording + animated cards + captions -> MP4
```

1. **Brief.** Claude asks a few questions first. The objective and audience set
   the story and tone; the steps say exactly what to show in the app.
2. **Sign in.** A Chrome window opens. You sign in yourself (Claude never sees
   or types passwords) and tell Claude when you're in.
3. **Record.** Claude reads the page, tries each step, then records the whole
   flow as one clean take, with a smooth drawn cursor and typed text. If a take
   isn't right, Claude fixes the steps and records again: no redoing by you.
   Before anything that saves or submits real data, Claude asks you first.
4. **Script.** Claude looks at the click log and screenshots and writes
   `script.yaml` in your language: one narration line per step, plus a title
   card and an outro card.
5. **Render.** Each line is spoken by ElevenLabs (or Kokoro). If a line is
   longer than the time before the next click, the frame is held so the voice
   never talks over the next action. Output: 1920x1080, 30 fps, H.264, with
   burnt-in captions.

A typical 1–2 minute video takes you about 2 minutes (brief + sign-in) and
about 5–10 minutes of Claude's time.

Prefer to click through yourself? Say so, and Claude uses manual mode: you
record, Claude narrates.

## Requirements

| Needed | Why | How to get it |
|---|---|---|
| [Claude Code](https://claude.com/claude-code) | runs the skill | desktop app, CLI or IDE extension |
| Node.js 22.18+ | runs the tool | [nodejs.org](https://nodejs.org) or `winget install OpenJS.NodeJS.LTS` |
| Google Chrome | recording | [google.com/chrome](https://www.google.com/chrome) (Microsoft Edge also works) |
| ffmpeg | video processing | Windows: `winget install --id Gyan.FFmpeg -e` · macOS: `brew install ffmpeg` · Linux: `apt install ffmpeg` |
| Git | installing and updating the skill | [git-scm.com](https://git-scm.com) or `winget install Git.Git` |
| ElevenLabs API key (optional) | natural voices in ~30 languages | [elevenlabs.io](https://elevenlabs.io) → Developers → API keys. Paid per character; a 2-minute video is roughly 2,000 characters |
| ~1.2 GB disk | packages (~430 MB) + Kokoro voice model (~330 MB, only if used) | |

No GPU is needed. Tested on Windows 11; macOS and Linux should work.

You don't have to check these by hand: the skill checks everything on first use
and offers to install what is missing.

## Install

### The easy way: ask Claude

Open Claude Code and paste:

> Install the product-video skill: clone https://github.com/FreezeTheCoder/product-video
> into ~/.claude/skills/product-video, then run npm install in that folder.


Claude clones the repository and installs the packages. The skill is available
straight away; if Claude doesn't pick it up, restart Claude Code.

### By hand

```bash
git clone https://github.com/FreezeTheCoder/product-video ~/.claude/skills/product-video
cd ~/.claude/skills/product-video
npm install
```

On Windows, `~` is your user folder, e.g. `C:\Users\you\.claude\skills\product-video`.

### Check the install

```bash
node ~/.claude/skills/product-video/src/cli.ts doctor
```

```
  ok    node: v24.19.0
  ok    packages: installed
  ok    ffmpeg: C:\...\ffmpeg.exe
  ok    ffprobe: C:\...\ffprobe.exe
  ok    chrome/edge: C:/Program Files/Google/Chrome/Application/chrome.exe
```

### Add your ElevenLabs key (optional)

Create a file named `.env` in the skill folder with one line:

```
ELEVENLABS_API_KEY=your-key-here
```

or set `ELEVENLABS_API_KEY` as an environment variable. Don't paste the key into
the chat. Without a key, videos use the free Kokoro voice, in English only.

## Make your first video

1. In Claude Code, open the folder where you want videos saved, and say:

   > make a product video

2. Answer the questions:

   | Question | Example |
   |---|---|
   | Name of the video | Action Plan Tracker |
   | Objective | Teach new users to close issues on their own; they should know where to look tomorrow morning. |
   | Steps | Open Action Plan Tracker → filter to "Open" → open the first issue → view the photo evidence → approve it |
   | Audience | New users of the platform |
   | Language | English (or German, Arabic, Hindi, ...) |
   | Voice | Female or male |
   | Special requirements | none (or e.g. "add a stat card: 85 centers audited this quarter") |

   Plus the URL to start from.

3. A Chrome window opens. **Sign in**, then tell Claude "done". Don't touch the
   window after that while Claude works in it.

4. Claude records the steps, writes the script and renders the video. You get
   `product-videos/<name>/<name>.mp4`.

### Tips for the steps

- 4–8 steps make a good video. Shorter videos are better videos.
- Name things the way they appear on screen ("the Approvals tab").
- Use demo data. Real customer names or emails on screen end up in the video.
- Claude asks before anything that saves, approves or sends real data.

## Editing a video

Just tell Claude what to change:

> Make the intro shorter. Say "action plan" instead of "issue". Use a British voice.

Claude edits `script.yaml` and renders again. Only changed lines are re-voiced
and only changed cards are redrawn, so edits take seconds to a minute.
For different things on screen, Claude changes the steps and records a new take.

## Customising the skill

All behaviour is in plain text files you can edit (or ask Claude to edit).

| File | What it controls |
|---|---|
| `instructions/brand.md` | Your product's name, terms and how to say them, tone, words to avoid. **Edit this first.** |
| `instructions/narration.md` | How the voice-over is written: style, pacing, timing, voice choice. |
| `instructions/cards.md` | Which animated cards are used and when (default: title + outro only). |
| `instructions/driving.md` | How Claude drives the app and paces a take. |
| `instructions/recording.md` | The tips Claude gives in manual mode. |
| `assets/logo.png` | Logo on the title and outro cards (transparent PNG, square works best). |
| `SKILL.md` | The step-by-step process Claude follows, including the brief questions. |

Changes apply to the next video. Edits to your copy stay on your computer; see
[Updating](#updating) before pulling a new version.

### Voices

`voice: female` or `voice: male` picks a good default for the engine in use.

| Engine | Female | Male | Other voices |
|---|---|---|---|
| ElevenLabs | Sarah | Brian | any voice ID from your ElevenLabs library; or set `ELEVENLABS_VOICE_FEMALE` / `ELEVENLABS_VOICE_MALE` |
| Kokoro | `af_heart` | `am_michael` | `af_bella`, `bf_emma` (British), `am_fenrir`, `bm_george` (British) |

### Card style

Default: white background, black text, orange accents, logo on title and outro,
everything centred. Change it for one video with a `theme` in its script, or for
all videos by editing `DEFAULT_THEME` in `src/cards.ts`.

## The script file

Claude writes this for you; you only need it if you want to fine-tune by hand.
Times are milliseconds from the start of the recording (see `session.json` for
the time of each click).

```yaml
title: Action Plan Tracker          # also the output file name
language: en                        # en, de, fr, es, ar, hi, zh, ...
voice: female                       # female | male | a voice ID
engine: elevenlabs                  # optional; default: elevenlabs if a key is set, else kokoro
speed: 1.0                          # 0.9 slower ... 1.1 faster
captions: true
start: 7800                         # skip everything before this
end: 61500                          # stop here
cuts:                               # drop idle stretches
  - [44600, 46600]
segments:
  - at: 7800                        # a card: the recording pauses while it plays
    card: { type: title, title: "Action Plan Tracker", subtitle: "Follow every issue from finding to fix" }
    text: Found a problem at a dealership? Here's how you follow it, all the way to closed.
  - at: 7800                        # narration over the recording, until the next segment
    text: Start from the top menu, and open the Action Plan Tracker.
  - at: 9500
    text: Up top, you'll see every issue across your network.
  - at: 61500
    card: { type: outro, title: "AutoSmart Audit", subtitle: "Every issue, tracked from finding to fix" }
    text: That's the Action Plan Tracker. Every issue, tracked from finding to fix.
```

Card types: `title`, `outro` (with logo), `points` (a list that slides in),
`stat` (a number that counts up). Quote text inside `{ }`, because an unquoted
comma splits the value.

## Commands

Claude runs these for you. From any folder:

```bash
node ~/.claude/skills/product-video/src/cli.ts doctor                    # check requirements
node ~/.claude/skills/product-video/src/cli.ts drive <url> <out-dir>     # open Chrome for Claude to drive
node ~/.claude/skills/product-video/src/cli.ts do <out-dir> look         # see the page (also: step, run, record, close)
node ~/.claude/skills/product-video/src/cli.ts capture <url> <out-dir>   # manual mode: you record
node ~/.claude/skills/product-video/src/cli.ts render <out-dir>          # voice + cards + MP4
```

Environment variables:

| Variable | Default | Purpose |
|---|---|---|
| `PV_BROWSER` | `chrome`, then `msedge` | Browser to record with |
| `PV_VIEWPORT` | `1280x720@1.5` | Page size and zoom when Claude drives (1280x720 at 1.5x = 1080p video) |
| `ELEVENLABS_API_KEY` | (none) | ElevenLabs key; also read from `.env` in the skill folder |
| `ELEVENLABS_MODEL` | `eleven_multilingual_v2` | ElevenLabs model |

### Output folder

```
product-videos/action-plan-tracker/
  brief.md              your answers to the brief
  steps.yaml            the clicks Claude records (drive mode)
  capture.mkv           raw recording (large; delete when done)
  capture-1080p.mp4     recording fitted to 1080p (cached)
  session.json          clicks, page changes and timings
  shots/                a screenshot after each click
  script.yaml           the narration and cards
  voice/  cards/        generated audio and card clips (cached)
  captions.srt          captions, also usable on YouTube etc.
  action-plan-tracker.mp4   the finished video
```

## Updating

Ask Claude:

> Update the product-video skill.

or by hand:

```bash
cd ~/.claude/skills/product-video
git pull
npm install
```

If you edited files in the skill (e.g. `instructions/brand.md`), `git pull`
keeps your changes when possible and stops if they clash. Claude can help
resolve that. To keep your edits safe, commit them in your copy first.

## Privacy and security

- **Sign-in is yours.** You type your credentials in the Chrome window. The
  session exists only in that browser and is gone when it closes. Nothing is
  saved to disk, and recording starts only after sign-in.
- **Claude never types passwords.** The driver refuses to fill password and
  one-time-code fields, and they are masked in the click log (`(hidden)`).
- **Claude asks before real changes.** Anything that saves, sends, approves or
  deletes data is confirmed with you first.
- **Mostly local.** Recording and rendering run on your computer. With
  ElevenLabs, the narration text (only the text) is sent to ElevenLabs to be
  voiced. With Kokoro, voice runs locally too.
- **Claude sees your screenshots.** To write the narration, Claude reads the
  screenshots and click log, which are sent to Claude like any other file you
  share in Claude Code. Use demo data for anything sensitive.
- **Actions are real.** Anything clicked while recording happens in the app.

## Troubleshooting

| Problem | Fix |
|---|---|
| `doctor` says ffmpeg is missing | Install it (see [Requirements](#requirements)), then restart Claude Code so the new PATH is picked up. |
| "Could not start Google Chrome or Microsoft Edge" | Install Chrome, or set `PV_BROWSER=msedge`. |
| Claude can't find a button | Tell Claude what it's called on screen, or switch to manual mode for that video. |
| "Kokoro speaks English only" | Add an ElevenLabs key for other languages. |
| `ElevenLabs 401` / `402` | The key is wrong, or the ElevenLabs account is out of credits. |
| Manual mode: bars at the top and bottom | The window wasn't fullscreen. Press F11 before clicking through. |
| First Kokoro render is slow | It downloads the voice model (~330 MB) once, into `~/.cache/product-video`. |
| Voice mispronounces a word | Add how to say it to `instructions/brand.md` (e.g. "Q3 → Q three"). |
| `npm warn allow-scripts` during install | Harmless; the needed binaries ship with the packages. |

## Project layout

```
SKILL.md               instructions Claude follows (the skill itself)
instructions/          style guides Claude reads before writing
assets/logo.png        logo for the cards
src/
  cli.ts               commands: doctor, drive, do, capture, render
  drive.ts             Claude-driven browser: look, steps, recorded takes
  capture.ts           recorder + click/scroll/page logging; manual mode
  voice.ts             text-to-speech dispatch + Kokoro (cached)
  eleven.ts            ElevenLabs text-to-speech
  cards.ts             animated cards, drawn frame by frame in headless Chrome
  render.ts            timeline, frame holds, cuts, captions, final encode
  bin.ts               ffmpeg/ffprobe helpers
  pack.ts              builds a zip of the skill (optional)
```

The tool is plain TypeScript run directly by Node (no build step). Main
dependencies: [Playwright](https://playwright.dev) (Chrome control),
[kokoro-js](https://github.com/hexgrad/kokoro) (voice),
[yaml](https://eemeli.org/yaml).

## Licences

- Kokoro-82M voice model: Apache-2.0. ElevenLabs voices: under your ElevenLabs plan's terms.
- Playwright: Apache-2.0. ffmpeg: LGPL/GPL (installed separately).
- The logo in `assets/logo.png` belongs to AutoSmart. Replace it with your own
  if you use this skill for another product.
