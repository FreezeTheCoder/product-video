// Kokoro text-to-speech (local, CPU). Clips are cached by text + voice + speed.
import { createHash } from "node:crypto";
import { existsSync, mkdirSync } from "node:fs";
import path from "node:path";
import { homedir } from "node:os";
import { env } from "@huggingface/transformers";
import { KokoroTTS } from "kokoro-js";

// Keep the voice model in a short, fixed folder: it survives reinstalls, and
// the ONNX runtime cannot open paths over 260 characters on Windows.
env.cacheDir = path.join(homedir(), ".cache", "product-video");
import { mediaDuration } from "./bin.ts";

const MODEL = "onnx-community/Kokoro-82M-v1.0-ONNX";
let tts: KokoroTTS | undefined;

export interface Clip { file: string; ms: number }

export async function speak(text: string, voice: string, speed: number, dir: string): Promise<Clip> {
  mkdirSync(dir, { recursive: true });
  const hash = createHash("sha1").update(JSON.stringify([text, voice, speed, "fp32"])).digest("hex").slice(0, 12);
  const file = path.join(dir, `${hash}.wav`);
  if (!existsSync(file)) {
    if (!tts) {
      console.log("  loading voice model ...");
      tts = await KokoroTTS.from_pretrained(MODEL, { dtype: "fp32", device: "cpu" });
    }
    const audio = await tts.generate(text, { voice: voice as any, speed });
    await audio.save(file);
  }
  return { file, ms: mediaDuration(file) };
}
