// Text-to-speech. ElevenLabs (cloud, any language) when a key is set, else
// Kokoro (local, CPU, English only). Clips are cached by engine + text + voice + speed.
import { createHash } from "node:crypto";
import { existsSync, mkdirSync } from "node:fs";
import path from "node:path";
import { homedir } from "node:os";
import { ffmpeg, mediaDuration } from "./bin.ts";
import { elevenKey, elevenSpeak, type ElevenContext } from "./eleven.ts";

const MODEL = "onnx-community/Kokoro-82M-v1.0-ONNX";
const KOKORO_VOICES: Record<string, string> = { female: "af_heart", male: "am_michael" };
let tts: any;

export type Engine = "elevenlabs" | "kokoro";
export interface Clip { file: string; ms: number }

export const defaultEngine = (): Engine => (elevenKey() ? "elevenlabs" : "kokoro");

export async function speak(text: string, voice: string, speed: number, dir: string, engine: Engine, ctx: ElevenContext = {}): Promise<Clip> {
  mkdirSync(dir, { recursive: true });
  const key = engine === "kokoro" ? [text, voice, speed, "fp32"] : [engine, text, voice, speed, ctx.previous ?? "", ctx.next ?? ""];
  const hash = createHash("sha1").update(JSON.stringify(key)).digest("hex").slice(0, 12);
  const file = path.join(dir, `${hash}.${engine === "kokoro" ? "wav" : "mp3"}`);
  if (!existsSync(file)) {
    if (engine === "elevenlabs") await elevenSpeak(text, voice, speed, file, ctx);
    else await kokoro(text, KOKORO_VOICES[voice] ?? voice, speed, file);
  }
  // Engines pad clips with silence; trim it so the gaps between lines are set
  // by the renderer alone and stay short and even.
  const trimmed = file.replace(/\.\w+$/, ".trim.wav");
  if (!existsSync(trimmed)) {
    const cut = (keep: number) => `silenceremove=start_periods=1:start_threshold=-50dB:start_silence=${keep}`;
    ffmpeg(["-i", file, "-af", `${cut(0.03)},areverse,${cut(0.08)},areverse`, trimmed]);
  }
  return { file: trimmed, ms: mediaDuration(trimmed) };
}

async function kokoro(text: string, voice: string, speed: number, file: string) {
  if (!tts) {
    // Loaded lazily: these packages are large and only needed for Kokoro.
    const { env } = await import("@huggingface/transformers");
    // Keep the voice model in a short, fixed folder: it survives reinstalls, and
    // the ONNX runtime cannot open paths over 260 characters on Windows.
    env.cacheDir = path.join(homedir(), ".cache", "product-video");
    const { KokoroTTS } = await import("kokoro-js");
    console.log("  loading voice model ...");
    tts = await KokoroTTS.from_pretrained(MODEL, { dtype: "fp32", device: "cpu" });
  }
  const audio = await tts.generate(text, { voice, speed });
  await audio.save(file);
}
