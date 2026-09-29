import { execFileSync, spawnSync } from "node:child_process";
import { existsSync, readdirSync } from "node:fs";
import path from "node:path";

/** Resolve a CLI tool from PATH, falling back to winget's per-user package dir. */
export function which(name: "ffmpeg" | "ffprobe" | "uv"): string {
  const probe = spawnSync(process.platform === "win32" ? "where" : "which", [name], { encoding: "utf8" });
  const hit = probe.stdout?.split(/\r?\n/).find(Boolean);
  if (probe.status === 0 && hit) return hit.trim();

  const pkgs = path.join(process.env.LOCALAPPDATA ?? "", "Microsoft", "WinGet", "Packages");
  if (existsSync(pkgs)) {
    for (const dir of readdirSync(pkgs)) {
      if (name === "uv" && dir.startsWith("astral-sh.uv")) {
        const exe = path.join(pkgs, dir, "uv.exe");
        if (existsSync(exe)) return exe;
      }
      if (name !== "uv" && dir.startsWith("Gyan.FFmpeg")) {
        for (const build of readdirSync(path.join(pkgs, dir))) {
          const exe = path.join(pkgs, dir, build, "bin", `${name}.exe`);
          if (existsSync(exe)) return exe;
        }
      }
    }
  }
  throw new Error(`${name} not found. Install it (winget install ${name === "uv" ? "astral-sh.uv" : "Gyan.FFmpeg"}).`);
}

export function mediaDuration(file: string): number {
  const out = execFileSync(which("ffprobe"), [
    "-v", "error", "-show_entries", "format=duration", "-of", "default=nw=1:nk=1", file,
  ], { encoding: "utf8" });
  return Math.round(parseFloat(out) * 1000);
}

/**
 * Chrome's recorder sometimes draws the page smaller than the frame and fills
 * the rest with grey (#80807d). Find the real page area from a frame in the
 * middle of the video; returns null when the page fills the frame.
 */
export function contentBox(file: string, atMs: number, w: number, h: number): { w: number; h: number } | null {
  const raw = execFileSync(which("ffmpeg"), [
    "-v", "error", "-ss", (atMs / 1000).toFixed(2), "-i", file, "-frames:v", "1",
    "-vf", `crop=2:${h}:${Math.floor(w / 6) * 2}:0`, "-f", "rawvideo", "-pix_fmt", "rgb24", "-",
  ], { maxBuffer: 1 << 24 });
  const grey = (y: number) => {
    const [r, g, b] = [raw[y * 6], raw[y * 6 + 1], raw[y * 6 + 2]];
    return Math.abs(r - 128) < 6 && Math.abs(g - 128) < 6 && Math.abs(b - 125) < 6;
  };
  let y = h;
  while (y > 0 && grey(y - 1)) y--;
  if (h - y < 4) return null;
  const ch = y - (y % 2);
  const cw = Math.round((ch * w) / h / 2) * 2;
  return { w: cw, h: ch };
}

export function ffmpeg(args: string[], cwd?: string) {
  const r = spawnSync(which("ffmpeg"), ["-hide_banner", "-loglevel", "error", "-y", ...args], { stdio: "inherit", cwd });
  if (r.status !== 0) throw new Error(`ffmpeg failed (exit ${r.status})`);
}

export function videoSize(file: string): { width: number; height: number } {
  const out = execFileSync(which("ffprobe"), [
    "-v", "error", "-select_streams", "v:0", "-show_entries", "stream=width,height", "-of", "csv=p=0", file,
  ], { encoding: "utf8" });
  const [width, height] = out.trim().split(",").map(Number);
  return { width, height };
}
