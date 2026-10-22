// ElevenLabs text-to-speech (cloud, paid per character). The key comes from the
// ELEVENLABS_API_KEY environment variable or a `.env` file in the skill folder.
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

const SKILL_DIR = path.resolve(import.meta.dirname, "..");
const MODEL = process.env.ELEVENLABS_MODEL ?? "eleven_multilingual_v2";

/** Default voices from the ElevenLabs library; both speak every supported language. */
export const ELEVEN_VOICES: Record<string, string> = {
  female: process.env.ELEVENLABS_VOICE_FEMALE ?? "EXAVITQu4vr4xnSDxMaL", // Sarah
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

/** A voice of that gender from the account's own library, explainer voices first. */
async function voiceFromAccount(key: string, gender: string): Promise<string | undefined> {
  const res = await fetch("https://api.elevenlabs.io/v2/voices?page_size=100", { headers: { "xi-api-key": key } });
  if (!res.ok) return undefined;
  const { voices = [] } = (await res.json()) as { voices?: { voice_id: string; labels?: Record<string, string> }[] };
  const fits = voices.filter((v) => v.labels?.gender === gender);
  return (fits.find((v) => /informative|narrat/.test(v.labels?.use_case ?? "")) ?? fits[0])?.voice_id;
}

export async function elevenSpeak(text: string, voice: string, speed: number, file: string, ctx: ElevenContext = {}) {
  const key = elevenKey();
  if (!key) throw new Error("No ElevenLabs key. Set ELEVENLABS_API_KEY, or use engine: kokoro.");
  let res = await tts(key, ELEVEN_VOICES[voice] ?? voice, text, speed, ctx);
  // A default voice can be missing from some accounts: use one of theirs instead.
  if (res.status === 404 && voice in ELEVEN_VOICES) {
    const id = await voiceFromAccount(key, voice);
    if (id) {
      ELEVEN_VOICES[voice] = id;
      res = await tts(key, id, text, speed, ctx);
    }
  }
  if (!res.ok) {
    const why = await res.text().catch(() => "");
    throw new Error(`ElevenLabs ${res.status}: ${why.slice(0, 300)}`);
  }
  writeFileSync(file, Buffer.from(await res.arrayBuffer()));
}

function tts(key: string, id: string, text: string, speed: number, ctx: ElevenContext) {
  return fetch(`https://api.elevenlabs.io/v1/text-to-speech/${encodeURIComponent(id)}?output_format=mp3_44100_128`, {
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
}
