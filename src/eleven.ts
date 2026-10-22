// ElevenLabs text-to-speech (cloud, paid per character). The key comes from the
// ELEVENLABS_API_KEY environment variable or a `.env` file in the skill folder.
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

const SKILL_DIR = path.resolve(import.meta.dirname, "..");
const MODEL = process.env.ELEVENLABS_MODEL ?? "eleven_multilingual_v2";

/** Default voices from the ElevenLabs library; both speak every supported language. */
export const ELEVEN_VOICES: Record<string, string> = {
  female: process.env.ELEVENLABS_VOICE_FEMALE ?? "EXAVITQu4vr4xnzrjVrq", // Sarah
  male: process.env.ELEVENLABS_VOICE_MALE ?? "nPczCjzI2devNBz1zQrb", // Brian
};

export function elevenKey(): string | undefined {
  if (process.env.ELEVENLABS_API_KEY) return process.env.ELEVENLABS_API_KEY.trim();
  const env = path.join(SKILL_DIR, ".env");
  if (!existsSync(env)) return undefined;
  return readFileSync(env, "utf8").match(/^\s*ELEVENLABS_API_KEY\s*=\s*["']?([^"'\s]+)/m)?.[1];
}

export interface ElevenContext {
  /** Neighbouring lines: ElevenLabs uses them to keep the delivery continuous. */
  previous?: string;
  next?: string;
}

export async function elevenSpeak(text: string, voice: string, speed: number, file: string, ctx: ElevenContext = {}) {
  const key = elevenKey();
  if (!key) throw new Error("No ElevenLabs key. Set ELEVENLABS_API_KEY, or use engine: kokoro.");
  const id = ELEVEN_VOICES[voice] ?? voice;
  const res = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${encodeURIComponent(id)}?output_format=mp3_44100_192`, {
    method: "POST",
    headers: { "xi-api-key": key, "content-type": "application/json", accept: "audio/mpeg" },
    body: JSON.stringify({
      text,
      model_id: MODEL,
      previous_text: ctx.previous,
      next_text: ctx.next,
      voice_settings: { stability: 0.45, similarity_boost: 0.8, style: 0.15, use_speaker_boost: true, speed: Math.min(1.2, Math.max(0.7, speed)) },
    }),
  });
  if (!res.ok) {
    const why = await res.text().catch(() => "");
    throw new Error(`ElevenLabs ${res.status}: ${why.slice(0, 300)}`);
  }
  writeFileSync(file, Buffer.from(await res.arrayBuffer()));
}
