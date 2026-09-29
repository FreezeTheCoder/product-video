// Turns the capture video + script.yaml into a narrated 1080p MP4 with burnt-in
// captions and animated cards.
//
// Each narration segment owns the recording from its `at` to the next segment's
// `at`. When the voice needs longer than that stretch, the stretch's last frame
// is held, so the narration never runs over the next action. A segment with a
// `card` plays an animated full-screen card at that point (the recording
// pauses), narrated by its text, then the recording continues.
import { existsSync, readFileSync, statSync, writeFileSync } from "node:fs";
import path from "node:path";
import YAML from "yaml";
import { contentBox, ffmpeg, videoSize } from "./bin.ts";
import type { Session } from "./capture.ts";
import { closeCards, DEFAULT_THEME, renderCard, type Card, type Theme } from "./cards.ts";
import { speak } from "./voice.ts";

export interface Segment {
  at: number;
  text?: string;
  card?: Card;
}

export interface Script {
  title?: string;
  voice?: string;
  speed?: number;
  captions?: boolean;
  start?: number;
  end?: number;
  theme?: Partial<Theme>;
  segments: Segment[];
  /** [from, to] ms ranges of the recording to drop (idle time, mistakes). */
  cuts?: [number, number][];
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

const LEAD = 250; // ms from a segment's start to its voice
const TAIL = 450; // ms of breathing room after each line
const CARD_MIN = 2500; // shortest card, ms

const srtTime = (ms: number) => {
  const p = (n: number, w = 2) => String(Math.floor(n)).padStart(w, "0");
  return `${p(ms / 3.6e6)}:${p((ms / 6e4) % 60)}:${p((ms / 1000) % 60)},${p(ms % 1000, 3)}`;
};

type Item = { kind: "range"; a: number; b: number; hold: number } | { kind: "card"; file: string; ms: number };
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

const itemMs = (it: Item) => (it.kind === "card" ? it.ms : it.b - it.a + it.hold);

export async function render(dir: string): Promise<string> {
  const session: Session = JSON.parse(readFileSync(path.join(dir, "session.json"), "utf8"));
  const scriptFile = path.join(dir, "script.yaml");
  if (!existsSync(scriptFile)) throw new Error(`Missing ${scriptFile}`);
  const script: Script = YAML.parse(readFileSync(scriptFile, "utf8"));
  const voice = script.voice ?? "af_heart";
  const speed = script.speed ?? 1;
  const theme: Theme = { ...DEFAULT_THEME, ...script.theme };
  const start = script.start ?? 0;
  const end = Math.min(script.end ?? session.durationMs, session.durationMs);
  const cuts = script.cuts ?? [];
  const segs = [...script.segments].filter((s) => s.card || s.text?.trim()).sort((a, b) => a.at - b.at);
  if (!segs.length) throw new Error("script.yaml has no segments");

  // Build the output timeline: pieces of items, each piece optionally narrated.
  type Piece = { items: Item[]; clip?: { file: string; ms: number }; text?: string };
  const ranges = (a: number, b: number): Item[] =>
    keep(Math.max(a, start), Math.min(b, end), cuts).map(([x, y]) => ({ kind: "range" as const, a: x, b: y, hold: 0 }));
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
        clip = await speak(text, voice, speed, path.join(dir, "voice"));
        console.log(`${(clip.ms / 1000).toFixed(1)}s`);
      }
      const need = clip ? LEAD + clip.ms + TAIL : 0;

      if (s.card) {
        const ms = Math.max(CARD_MIN, need + 300);
        process.stdout.write(`  card  ${s.card.type} "${s.card.title ?? ""}" `);
        const file = await renderCard(s.card, theme, ms, path.join(dir, "cards"));
        console.log(`${(ms / 1000).toFixed(1)}s`);
        pieces.push({ items: [{ kind: "card", file, ms }, ...ranges(s.at, next)], clip, text });
      } else {
        let items = ranges(s.at, next);
        if (!items.length) items = [{ kind: "range", a: Math.max(s.at, start), b: Math.max(s.at, start) + 40, hold: 0 }];
        const last = items[items.length - 1] as Extract<Item, { kind: "range" }>;
        last.hold = Math.max(0, need - items.reduce((n, it) => n + itemMs(it), 0));
        pieces.push({ items, clip, text });
      }
    }
  } finally {
    await closeCards();
  }
  const items = pieces.flatMap((p) => p.items);

  // Video: every item becomes a 1920x1080/30fps stream, then all are joined.
  // Recordings change frame size when the user resizes or goes fullscreen.
  // Fit every frame to 1080p on its own in a first pass (cached), so the cut
  // and join below always see one steady 1920x1080 stream.
  const src = normalize(dir, theme.background);
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
  items.forEach((it, i) => {
    if (it.kind === "range") {
      const pad = it.hold ? `,tpad=stop_mode=clone:stop_duration=${(it.hold / 1000).toFixed(3)}` : "";
      f.push(`[s${r++}]trim=start=${(it.a / 1000).toFixed(3)}:end=${(it.b / 1000).toFixed(3)},setpts=PTS-STARTPTS${pad}[v${i}]`);
    } else {
      const idx = nextInput();
      inputs.push("-i", path.relative(dir, it.file));
      f.push(`[${idx}:v]fps=30,${fit},setpts=PTS-STARTPTS[v${i}]`);
    }
  });
  const subs = script.captions !== false
    ? `,subtitles=captions.srt:force_style='FontName=Segoe UI,FontSize=13,PrimaryColour=&H00FFFFFF,BackColour=&H99000000,BorderStyle=4,Outline=0,Shadow=0,MarginV=40'`
    : "";
  f.push(`${items.map((_, i) => `[v${i}]`).join("")}concat=n=${items.length}:v=1:a=0${subs}[vid]`);

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
      const parts = p.text.match(/[^.!?]+[.!?]*/g)?.map((s) => s.trim()).filter(Boolean) ?? [p.text];
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
    ? `${mix.join("")}amix=inputs=${mix.length}:normalize=0:duration=longest,apad[aud]`
    : `anullsrc=r=48000:cl=stereo[aud]`);
  writeFileSync(path.join(dir, "captions.srt"), cues.join("\n"));

  const name = (script.title ?? "video").replace(/[^\w\- ]+/g, "").trim().replace(/\s+/g, "-").toLowerCase() || "video";
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
