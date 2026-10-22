// product-video CLI
//   node src/cli.ts doctor
//   node src/cli.ts drive <url> <out-dir>          Claude drives (see drive.ts)
//   node src/cli.ts do <out-dir> <look | step <yaml> | run <file> | record <file> | close>
//   node src/cli.ts capture <url> <out-dir>        the user records by hand
//   node src/cli.ts render <out-dir>
import { existsSync } from "node:fs";
import path from "node:path";
import { which } from "./bin.ts";
import { elevenKey } from "./eleven.ts";
import { capture } from "./capture.ts";
import { command, drive } from "./drive.ts";


const [cmd, ...args] = process.argv.slice(2);

switch (cmd) {
  case "doctor": {
    let ok = true;
    const check = (name: string, fn: () => string) => {
      try { console.log(`  ok    ${name}: ${fn()}`); } catch (e: any) { ok = false; console.log(`  MISSING ${name}: ${e.message}`); }
    };
    check("node", () => {
      const [maj, min] = process.versions.node.split(".").map(Number);
      if (maj < 22 || (maj === 22 && min < 18)) throw new Error(`${process.version}; need 22.18 or newer`);
      return process.version;
    });
    check("packages", () => {
      if (!existsSync(path.join(import.meta.dirname, "..", "node_modules", "kokoro-js"))) throw new Error("run npm install in the skill folder");
      return "installed";
    });
    check("ffmpeg", () => which("ffmpeg"));
    console.log(elevenKey()
      ? "  ok    elevenlabs: key set"
      : "  info  elevenlabs: no key (optional; without it the free English-only Kokoro voice is used)");
    check("ffprobe", () => which("ffprobe"));
    check("chrome/edge", () => {
      const paths = [
        "C:/Program Files/Google/Chrome/Application/chrome.exe",
        "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe",
        "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
        "/usr/bin/google-chrome",
      ];
      const hit = paths.find((p) => existsSync(p));
      if (!hit) throw new Error("install Google Chrome");
      return hit;
    });
    process.exit(ok ? 0 : 1);
  }
  case "drive": {
    const [url, out] = args;
    if (!url || !out) throw new Error("usage: drive <url> <out-dir>");
    await drive(url, path.resolve(out));
    break;
  }
  case "do": {
    const [out, sub, arg] = args;
    if (!out || !sub) throw new Error("usage: do <out-dir> <look | step <yaml> | run <file> | record <file> | close>");
    process.exitCode = (await command(path.resolve(out), sub, arg)) ? 0 : 1;
    break;
  }
  case "capture": {
    const [url, out] = args;
    if (!url || !out) throw new Error("usage: capture <url> <out-dir>");
    const s = await capture(url, path.resolve(out));
    console.log(`Captured ${(s.durationMs / 1000).toFixed(1)}s, ${s.events.length} events -> ${path.resolve(out)}`);
    break;
  }
  case "render": {
    const [out] = args;
    if (!out) throw new Error("usage: render <out-dir>");
    // Loaded lazily: the voice library installs global error handlers that must not run during capture.
    const { render } = await import("./render.ts");
    console.log(`Video: ${await render(path.resolve(out))}`);
    break;
  }
  default:
    console.log("usage: node src/cli.ts <doctor | drive <url> <out-dir> | do <out-dir> ... | capture <url> <out-dir> | render <out-dir>>");
    process.exit(1);
}
