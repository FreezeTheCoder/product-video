# product-video

A [Claude Code](https://claude.com/claude-code) skill that turns a screen
recording of your web app into a narrated, captioned 1080p product video.

You click through the app yourself. Claude writes the voice-over, a local AI
voice reads it, and the tool renders an MP4 with animated title and outro
cards. Everything runs on your own computer: no video service, no upload, no
per-video cost.

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
 1. Brief        Claude asks: video name, description, audience, special requirements
 2. Record       Chrome opens -> you sign in -> you click through -> you close the window
 3. Script       Claude reads your clicks + screenshots and writes the narration
 4. Render       AI voice + recording + animated cards + captions -> MP4
```

1. **Brief.** Claude asks four questions before recording. The answers decide
   the tone (e.g. tutorial for new users, benefits for prospects) and anything
   that must be covered.
2. **Record.** A normal Chrome window opens. You sign in yourself (Claude never
   sees or types passwords). Recording starts only after sign-in. The tool logs
   every click, page change and scroll with a timestamp and a screenshot.
3. **Script.** Claude looks at the log and the screenshots and writes
   `script.yaml`: one narration line per step, timed to your clicks, plus a
   title card and an outro card.
4. **Render.** Each line is spoken by [Kokoro](https://huggingface.co/hexgrad/Kokoro-82M),
   a small AI voice that runs on your CPU. If a line is longer than the time
   before your next click, the frame is held so the voice never talks over the
   next action. Idle stretches can be cut. Output: 1920x1080, 30 fps, H.264, with
   burnt-in captions.

A typical 1–2 minute video takes 2–5 minutes of your time (recording) and about
2 minutes to render.

## Requirements

| Needed | Why | How to get it |
|---|---|---|
| [Claude Code](https://claude.com/claude-code) | runs the skill | desktop app, CLI or IDE extension |
| Node.js 22.18+ | runs the tool | [nodejs.org](https://nodejs.org) or `winget install OpenJS.NodeJS.LTS` |
| Google Chrome | recording | [google.com/chrome](https://www.google.com/chrome) (Microsoft Edge also works) |
| ffmpeg | video processing | Windows: `winget install --id Gyan.FFmpeg -e` · macOS: `brew install ffmpeg` · Linux: `apt install ffmpeg` |
| Git | installing and updating the skill | [git-scm.com](https://git-scm.com) or `winget install Git.Git` |
| ~1.2 GB disk | packages (~430 MB) + voice model (~330 MB, downloaded once) | |

No GPU is needed. Tested on Windows 11; macOS and Linux should work.

You don't have to check these by hand: the skill checks everything on first use
and offers to install what is missing.

## Install

The repository is private: ask the owner to add you as a collaborator first.
The first time you clone, Git opens a browser window to sign in to GitHub.

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

## Make your first video

1. In Claude Code, open the folder where you want videos saved, and say:

   > make a product video

2. Answer the four questions:

   | Question | Example |
   |---|---|
   | Name of the video | Action Plan Tracker |
   | Description | Shows how to find a center's open issues, follow them through to approval, and check the photo evidence. |
   | Audience | New users of the platform |
   | Special requirements | none (or e.g. "add a stat card: 85 centers audited this quarter") |

   Plus the URL to start from.

3. A Chrome window opens.
   - **Sign in** if the site asks. Recording starts after you're in.
   - **Press F11** for fullscreen. On a 1920x1080 screen this gives a pixel-perfect 1080p video.
   - **Click through calmly.** Pause about 2 seconds after each click so the
     narration has room. Mistakes and waiting are fine; they can be cut.
   - **Close the window** when you're done.

4. Claude writes the script and renders the video. You get
   `product-videos/<name>/<name>.mp4`.

### Recording tips

- Plan 4–8 steps before you start. Shorter videos are better videos.
- Use demo data. Real customer names or emails on screen end up in the video.
- Anything you save or submit while recording really happens in the app.
- Move the mouse deliberately; the cursor is visible in the video.

## Editing a video

Just tell Claude what to change:

> Make the intro shorter. Say "action plan" instead of "issue". Use a British voice.

Claude edits `script.yaml` and renders again. Only changed lines are re-voiced
and only changed cards are redrawn, so edits take seconds to a minute.
Record again only if you want different things on screen.

## Customising the skill

All behaviour is in plain text files you can edit (or ask Claude to edit).

| File | What it controls |
|---|---|
| `instructions/brand.md` | Your product's name, terms and how to say them, tone, words to avoid. **Edit this first.** |
| `instructions/narration.md` | How the voice-over is written: style, pacing, timing, voice choice. |
| `instructions/cards.md` | Which animated cards are used and when (default: title + outro only). |
| `instructions/recording.md` | The tips Claude gives before recording. |
| `assets/logo.png` | Logo on the title and outro cards (transparent PNG, square works best). |
| `SKILL.md` | The step-by-step process Claude follows, including the brief questions. |

Changes apply to the next video. Edits to your copy stay on your computer; see
[Updating](#updating) before pulling a new version.

### Voices

| Voice | Sound |
|---|---|
| `af_heart` | warm female, American (default, best quality) |
| `af_bella` | bright female, American |
| `bf_emma` | female, British |
| `am_michael`, `am_fenrir` | male, American |
| `bm_george` | male, British |

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
voice: af_heart
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
node ~/.claude/skills/product-video/src/cli.ts capture <url> <out-dir>   # record
node ~/.claude/skills/product-video/src/cli.ts render <out-dir>          # voice + cards + MP4
```

Environment variables:

| Variable | Default | Purpose |
|---|---|---|
| `PV_BROWSER` | `chrome`, then `msedge` | Browser to record with |

### Output folder

```
product-videos/action-plan-tracker/
  brief.md              your answers to the four questions
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
- **Password fields are masked** in the click log (`(hidden)`).
- **Everything is local.** Recording, voice and rendering run on your computer.
  The only downloads are npm packages and the voice model (from Hugging Face,
  once).
- **Claude sees your screenshots.** To write the narration, Claude reads the
  screenshots and click log, which are sent to Claude like any other file you
  share in Claude Code. Use demo data for anything sensitive.
- **Actions are real.** Anything you click while recording happens in the app.

## Troubleshooting

| Problem | Fix |
|---|---|
| `doctor` says ffmpeg is missing | Install it (see [Requirements](#requirements)), then restart Claude Code so the new PATH is picked up. |
| "Could not start Google Chrome or Microsoft Edge" | Install Chrome, or set `PV_BROWSER=msedge`. |
| Video has bars at the top and bottom | The window wasn't fullscreen. Press F11 before clicking through. |
| First render is slow | It downloads the voice model (~330 MB) once, into `~/.cache/product-video`. |
| Narration talks over the next step | Click more slowly while recording, or ask Claude to shorten that line. |
| Voice mispronounces a word | Add how to say it to `instructions/brand.md` (e.g. "Q3 → Q three"). |
| `npm warn allow-scripts` during install | Harmless; the needed binaries ship with the packages. |

## Project layout

```
SKILL.md               instructions Claude follows (the skill itself)
instructions/          style guides Claude reads before writing
assets/logo.png        logo for the cards
src/
  cli.ts               commands: doctor, capture, render
  capture.ts           Chrome recording + click/scroll/page logging
  voice.ts             Kokoro text-to-speech (cached)
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

- Kokoro-82M voice model: Apache-2.0.
- Playwright: Apache-2.0. ffmpeg: LGPL/GPL (installed separately).
- The logo in `assets/logo.png` belongs to AutoSmart. Replace it with your own
  if you use this skill for another product.
