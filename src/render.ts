// Turns the capture video + script.yaml into a narrated 1080p MP4 with burnt-in
// captions and animated cards.
//
// Each narration segment owns the recording from its `at` to the next segment's
// `at`. When the voice needs longer than that stretch, the stretch's last frame
// is held, so the narration never runs over the next action. When the stretch
// is longer, frozen screen time in it is cut, so the silence between lines
// stays short and natural. A segment with a `card` plays an animated
// full-screen card at that point (the recording pauses, the card fades in and
// out), narrated by its text, then the recording continues.
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync, statSync, writeFileSync } from "node:fs";
import path from "node:path";
import YAML from "yaml";
import { contentBox, ffmpeg, videoSize, which } from "./bin.ts";
import type { Session } from "./capture.ts";
import { closeCards, DEFAULT_THEME, renderCard, type Card, type Theme } from "./cards.ts";
import { defaultEngine, speak, type Engine } from "./voice.ts";

export interface Segment {
  at: number;
  text?: string;
  card?: Card;
}

export interface Script {
  title?: string;
  /** "female" / "male", or a voice id of the engine. */
  voice?: string;
  /** Default: elevenlabs when a key is set, else kokoro (English only). */
  engine?: Engine;
  /** Language of the narration and captions, e.g. "en", "de", "ar", "hi". */
  language?: string;
  speed?: number;
  captions?: boolean;
  start?: number;
  end?: number;
  theme?: Partial<Theme>;
  segments: Segment[];
  /** [from, to] ms ranges of the recording to drop (idle time, mistakes). */
  cuts?: [number, number][];
  /** Cut frozen screen time so silences between lines stay short (default true). */
  tighten?: boolean;
}

/** Split [from, to) into the parts that survive the cuts. */
function keep(from: number, to: number, cuts: [number, number][]): [number, number][] {
  let parts: [number, number][] = [[from, to]];
  for (const [cf, ct] of cuts) {
    parts = parts.flatMap(([a, b]): [number, number][] =>
      ct <= a || cf >= b ? [[a, b]] : [...(cf > a ? [[a, cf] as [number, number]] : []), ...(ct < b ? [[ct, b] as [number, number]] : [])]);
  }
  return parts.filter(([a, b]) => b - a >= 40);
}

const LEAD = 120; // ms from a segment's start to its voice
const TAIL = 300; // ms of breathing room after each line
const GAP = 350; // most extra silence kept between lines when the screen is idle
const CARD_MIN = 2500; // shortest card, ms
const XFADE = 400; // card fade in/out, ms
const FRAME = 1000 / 30;
const snap = (ms: number) => Math.round(ms / FRAME) * FRAME;
const MARGIN = 200; // ms of a frozen stretch kept next to any movement

/** Stretches of the 1080p recording where the screen doesn't change (cached). */
function frozen(dir: string, src: string): [number, number][] {
  // The threshold is low enough that a moving cursor or typed text counts as change.
  const cache = path.join(dir, "frozen.json");
  if (existsSync(cache) && statSync(cache).mtimeMs > statSync(path.join(dir, src)).mtimeMs) return JSON.parse(readFileSync(cache, "utf8"));
  const r = spawnSync(which("ffmpeg"), ["-hide_banner", "-i", src, "-vf", "freezedetect=n=0.00002:d=0.3", "-an", "-f", "null", "-"],
    { cwd: dir, encoding: "utf8", maxBuffer: 1 << 26 });
  const spans: [number, number][] = [];
  let from: number | undefined;
  for (const m of (r.stderr ?? "").matchAll(/freeze_(start|end): ([\d.]+)/g)) {
    const ms = parseFloat(m[2]) * 1000;
    if (m[1] === "start") from = ms;
    else if (from !== undefined) { spans.push([from, ms]); from = undefined; }
  }
  if (from !== undefined) spans.push([from, Number.MAX_SAFE_INTEGER]);
  // A blinking text caret splits one still stretch into many: join them again.
  const merged = spans.reduce<[number, number][]>((out, s) => {
    const last = out[out.length - 1];
    if (last && s[0] - last[1] <= 2 * FRAME) last[1] = s[1];
    else out.push([...s]);
    return out;
  }, []);
  writeFileSync(cache, JSON.stringify(merged));
  return merged;
}

/** Remove up to `excess` ms of frozen time from the ranges, latest first. */
function trimIdle(items: Item[], excess: number, still: [number, number][]): Item[] {
  if (excess < FRAME) return items;
  const spans: [number, number][] = [];
  for (const it of items) {
    if (it.kind !== "range") continue;
    for (const [fa, fb] of still) {
      const a = Math.max(it.a, fa + MARGIN), b = Math.min(it.b, fb - MARGIN);
      if (b - a >= 100) spans.push([a, b]);
    }
  }
  spans.sort((x, y) => y[0] - x[0]);
  const drop: [number, number][] = [];
  for (const [a, b] of spans) {
    if (excess < FRAME) break;
    const d = Math.min(b - a, excess);
    drop.push([snap(b - d), snap(b)]);
    excess -= d;
  }
  return items.flatMap((it): Item[] => it.kind !== "range" ? [it]
    : keep(it.a, it.b, drop).map(([a, b], k, all) => ({ kind: "range", a, b, hold: k === all.length - 1 ? it.hold : 0 })));
}

/** Caption fonts that can draw each script (libass does not fall back on its own). */
function captionFont(lang: string): string {
  const win = process.platform === "win32";
  const mac = process.platform === "darwin";
  const pick = (w: string, m: string, l: string) => (win ? w : mac ? m : l);
  switch (lang.slice(0, 2)) {
    case "zh": return pick("Microsoft YaHei", "PingFang SC", "Noto Sans CJK SC");
    case "ja": return pick("Yu Gothic UI", "Hiragino Sans", "Noto Sans CJK JP");
    case "ko": return pick("Malgun Gothic", "Apple SD Gothic Neo", "Noto Sans CJK KR");
    case "hi": case "mr": case "ne": return pick("Nirmala UI", "Kohinoor Devanagari", "Noto Sans Devanagari");
    case "ta": case "te": case "bn": case "gu": case "kn": case "ml": case "pa": return pick("Nirmala UI", "Tamil Sangam MN", "Noto Sans");
    case "th": return pick("Leelawadee UI", "Thonburi", "Noto Sans Thai");
    case "ar": case "fa": case "ur": return pick("Segoe UI", "Geeza Pro", "Noto Sans Arabic");
    case "he": return pick("Segoe UI", "Arial Hebrew", "Noto Sans Hebrew");
    default: return pick("Segoe UI", "Helvetica Neue", "DejaVu Sans");
  }
}

const srtTime = (ms: number) => {
  const p = (n: number, w = 2) => String(Math.floor(n)).padStart(w, "0");
  return `${p(ms / 3.6e6)}:${p((ms / 6e4) % 60)}:${p((ms / 1000) % 60)},${p(ms % 1000, 3)}`;
};

type Item =
  | { kind: "range"; a: number; b: number; hold: number }
  /** `ms` is the card's own time; `din`/`dout` extend it to fade over its neighbours. */
  | { kind: "card"; card: Card; ms: number; din: number; dout: number; file?: string };
/** Fit every frame of the recording to 1920x1080 once; returns the file name. */
function normalize(dir: string, background: string): string {
  const raw = ["capture.mkv", "capture.webm"].find((f) => existsSync(path.join(dir, f)));
  if (!raw) throw new Error(`No recording in ${dir}`);
  const out = "capture-1080p.mp4";
  const o = path.join(dir, out);
  if (existsSync(o) && statSync(o).mtimeMs > statSync(path.join(dir, raw)).mtimeMs) return out;
  let crop = "";
  if (raw === "capture.webm") {
    // Old Playwright recordings can carry a grey border.
    const dim = videoSize(path.join(dir, raw));
    const box = contentBox(path.join(dir, raw), 5000, dim.width, dim.height);
    if (box) crop = `crop=${box.w}:${box.h}:0:0,`;
  }
  console.log("  preparing recording (1080p) ...");
  ffmpeg([
    "-i", raw,
    "-vf", `${crop}scale=1920:1080:force_original_aspect_ratio=decrease:flags=lanczos,pad=1920:1080:(ow-iw)/2:(oh-ih)/2:color=${background.replace("#", "0x")},setsar=1,fps=30,format=yuv420p`,
    "-an", "-c:v", "libx264", "-preset", "veryfast", "-crf", "12", out,
  ], dir);
  return out;
}

/** An item's own time on the output timeline (card fades overlap its neighbours). */
const itemMs = (it: Item) => (it.kind === "card" ? it.ms : it.b - it.a + it.hold);

export async function render(dir: string): Promise<string> {
  const session: Session = JSON.parse(readFileSync(path.join(dir, "session.json"), "utf8"));
  const scriptFile = path.join(dir, "script.yaml");
  if (!existsSync(scriptFile)) throw new Error(`Missing ${scriptFile}`);
  const script: Script = YAML.parse(readFileSync(scriptFile, "utf8"));
  const voice = script.voice ?? "female";
  const engine = script.engine ?? defaultEngine();
  const language = script.language ?? "en";
  if (engine === "kokoro" && !language.startsWith("en")) {
    throw new Error(`Kokoro speaks English only. For "${language}" set an ElevenLabs key (see README).`);
  }
  console.log(`  voice: ${engine} ${voice}, language ${language}`);
  const speed = script.speed ?? 1;
  const theme: Theme = { ...DEFAULT_THEME, ...script.theme, lang: language };
  const start = script.start ?? 0;
  const end = Math.min(script.end ?? session.durationMs, session.durationMs);
  const cuts = script.cuts ?? [];
  const segs = [...script.segments].filter((s) => s.card || s.text?.trim()).sort((a, b) => a.at - b.at);
  if (!segs.length) throw new Error("script.yaml has no segments");

  // Recordings change frame size when the user resizes or goes fullscreen.
  // Fit every frame to 1080p on its own in a first pass (cached), so the cut
  // and join below always see one steady 1920x1080 stream.
  const src = normalize(dir, theme.background);
  const still = script.tighten === false ? [] : frozen(dir, src);

  // Build the output timeline: pieces of items, each piece optionally narrated.
  type Piece = { items: Item[]; clip?: { file: string; ms: number }; text?: string };
  const ranges = (a: number, b: number): Item[] =>
    keep(snap(Math.max(a, start)), snap(Math.min(b, end)), cuts).map(([x, y]) => ({ kind: "range" as const, a: x, b: y, hold: 0 }));
  const pieces: Piece[] = [];
  if (segs[0].at > start) pieces.push({ items: ranges(start, segs[0].at) });

  try {
    for (let i = 0; i < segs.length; i++) {
      const s = segs[i];
      const next = i + 1 < segs.length ? segs[i + 1].at : end;
      const text = s.text?.trim().replace(/\s+/g, " ");
      let clip: { file: string; ms: number } | undefined;
      if (text) {
        process.stdout.write(`  voice ${i + 1}/${segs.length} `);
        const near = (j: number) => segs[j]?.text?.trim().replace(/\s+/g, " ") || undefined;
        clip = await speak(text, voice, speed, path.join(dir, "voice"), engine, { previous: near(i - 1), next: near(i + 1) });
        console.log(`${(clip.ms / 1000).toFixed(1)}s`);
      }
      const need = clip ? LEAD + clip.ms + TAIL : 0;

      if (s.card) {
        // The voice is over the card, so the recording after it only needs a short pause.
        const ms = snap(Math.max(CARD_MIN, need + 150));
        const rest = ranges(s.at, next);
        const items = trimIdle(rest, rest.reduce((n, it) => n + itemMs(it), 0) - GAP / 2, still);
        pieces.push({ items: [{ kind: "card", card: s.card, ms, din: 0, dout: 0 }, ...items], clip, text });
      } else {
        let items = ranges(s.at, next);
        if (!items.length) items = [{ kind: "range", a: snap(Math.max(s.at, start)), b: snap(Math.max(s.at, start)) + 2 * FRAME, hold: 0 }];
        const have = items.reduce((n, it) => n + itemMs(it), 0);
        const last = items[items.length - 1] as Extract<Item, { kind: "range" }>;
        last.hold = snap(Math.max(0, need - have));
        if (clip) items = trimIdle(items, have - need - GAP, still);
        pieces.push({ items, clip, text });
      }
    }

    // Cards fade over their neighbours; the overlap comes out of the card's
    // extra time, so everything else keeps its place on the timeline.
    const all = pieces.flatMap((p) => p.items);
    for (let i = 0; i + 1 < all.length; i++) {
      const [a, b] = [all[i], all[i + 1]];
      if (b.kind === "card") b.din = XFADE;
      else if (a.kind === "card") a.dout = XFADE;
    }
    for (const it of all) {
      if (it.kind !== "card") continue;
      process.stdout.write(`  card  ${it.card.type} "${it.card.title ?? ""}" `);
      it.file = await renderCard(it.card, theme, it.ms + it.din + it.dout, path.join(dir, "cards"));
      console.log(`${(it.ms / 1000).toFixed(1)}s`);
    }
  } finally {
    await closeCards();
  }
  const items = pieces.flatMap((p) => p.items);

  // Video: every item becomes a 1920x1080/30fps stream. Runs of recording are
  // joined with hard cuts (they are continuous or cut on frozen frames); cards
  // cross-fade with what is next to them.
  const bg = theme.background.replace("#", "0x");
  const fit = `scale=1920:1080:force_original_aspect_ratio=decrease:flags=lanczos,pad=1920:1080:(ow-iw)/2:(oh-ih)/2:color=${bg},setsar=1,format=yuv420p`;

  const inputs = ["-i", src];
  const nextInput = () => inputs.filter((a) => a === "-i").length;
  const recs = items.filter((it) => it.kind === "range");
  const f: string[] = [];
  if (recs.length) {
    f.push(`[0:v]fps=30,split=${recs.length}${recs.map((_, i) => `[s${i}]`).join("")}`);
  }
  let r = 0;
  const sec = (ms: number) => (ms / 1000).toFixed(3);
  // Groups: a run of recording ranges, or one card. `len` = real stream length.
  const groups: { labels: string[]; len: number }[] = [];
  items.forEach((it, i) => {
    if (it.kind === "range") {
      const pad = it.hold ? `,tpad=stop_mode=clone:stop_duration=${sec(it.hold)}` : "";
      f.push(`[s${r++}]trim=start=${sec(it.a)}:end=${sec(it.b)},setpts=PTS-STARTPTS${pad}[v${i}]`);
      const g = groups[groups.length - 1];
      if (g && items[i - 1]?.kind === "range") { g.labels.push(`[v${i}]`); g.len += itemMs(it); }
      else groups.push({ labels: [`[v${i}]`], len: itemMs(it) });
    } else {
      const idx = nextInput();
      inputs.push("-i", path.relative(dir, it.file!));
      f.push(`[${idx}:v]fps=30,${fit},setpts=PTS-STARTPTS[v${i}]`);
      groups.push({ labels: [`[v${i}]`], len: it.ms + it.din + it.dout });
    }
  });
  const streams = groups.map((g, k) => {
    const out = `[g${k}]`;
    const join = g.labels.length > 1 ? `concat=n=${g.labels.length}:v=1:a=0,` : "";
    f.push(`${g.labels.join("")}${join}fps=30,settb=AVTB,format=yuv420p${out}`);
    return { label: out, len: g.len };
  });
  let acc = streams[0].label;
  let accLen = streams[0].len;
  for (let k = 1; k < streams.length; k++) {
    const out = `[x${k}]`;
    f.push(`${acc}${streams[k].label}xfade=transition=fade:duration=${sec(XFADE)}:offset=${sec(accLen - XFADE)}${out}`);
    acc = out;
    accLen += streams[k].len - XFADE;
  }
  const subs = script.captions !== false
    ? `subtitles=captions.srt:force_style='FontName=${captionFont(language)},FontSize=13,PrimaryColour=&H00FFFFFF,BackColour=&H99000000,BorderStyle=4,Outline=0,Shadow=0,MarginV=40'`
    : "null";
  f.push(`${acc}${subs}[vid]`);

  // Audio + captions, placed on the output timeline.
  const mix: string[] = [];
  const cues: string[] = [];
  let t = 0;
  for (const p of pieces) {
    if (p.clip && p.text) {
      const at = Math.round(t + LEAD);
      const idx = nextInput();
      inputs.push("-i", path.relative(dir, p.clip.file));
      f.push(`[${idx}:a]aresample=48000,adelay=${at}:all=1[a${idx}]`);
      mix.push(`[a${idx}]`);
      // Sentence ends in Latin, CJK, Devanagari and Arabic scripts.
      const parts = p.text.match(/[^.!?。！？।؟]+[.!?。！？।؟]*/g)?.map((s) => s.trim()).filter(Boolean) ?? [p.text];
      const total = parts.reduce((n, s) => n + s.length, 0);
      let c = at;
      for (const s of parts) {
        const d = (p.clip.ms * s.length) / total;
        cues.push(`${cues.length + 1}\n${srtTime(c)} --> ${srtTime(c + d)}\n${s}\n`);
        c += d;
      }
    }
    t += p.items.reduce((n, it) => n + itemMs(it), 0);
  }
  f.push(mix.length
    // Same loudness for every video and voice: -16 LUFS, the usual web/podcast level.
    ? `${mix.join("")}amix=inputs=${mix.length}:normalize=0:duration=longest,loudnorm=I=-16:TP=-1.5:LRA=11,aresample=48000,apad[aud]`
    : `anullsrc=r=48000:cl=stereo[aud]`);
  writeFileSync(path.join(dir, "captions.srt"), cues.join("\n"));

  const name = (script.title ?? "video").replace(/[^\p{L}\p{N}\- ]+/gu, "").trim().replace(/\s+/g, "-").toLowerCase() || "video";
  const out = path.join(dir, `${name}.mp4`);
  console.log("  rendering ...");
  ffmpeg([
    ...inputs,
    "-filter_complex", f.join(";"),
    "-map", "[vid]", "-map", "[aud]",
    "-t", (t / 1000).toFixed(3),
    "-c:v", "libx264", "-preset", "medium", "-crf", "18",
    "-c:a", "aac", "-b:a", "192k", "-movflags", "+faststart",
    path.basename(out),
  ], dir);
  return out;
}
