// Animated full-screen cards (title, points, stat, outro), rendered frame by
// frame from HTML/CSS in headless Chrome. Time is set explicitly for every
// frame, so animations are smooth and identical on every machine.
import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { chromium, type Browser } from "playwright";
import { which } from "./bin.ts";

export interface Card {
  type: "title" | "points" | "stat" | "outro";
  title?: string;
  subtitle?: string;
  points?: string[];
  value?: number;
  prefix?: string;
  suffix?: string;
  label?: string;
  /** Cards are centred; set "left" only when asked for. */
  align?: "center" | "left";
}

export interface Theme {
  accent: string;
  background: string;
  text: string;
  muted: string;
  font: string;
  /** Logo image shown on title and outro cards (path relative to the skill, or absolute). */
  logo?: string;
}

export const DEFAULT_THEME: Theme = {
  accent: "#ef9820", // logo orange
  background: "#ffffff",
  text: "#12110d", // logo black
  muted: "#12110d",
  font: "Inter, 'Segoe UI', system-ui, sans-serif",
  logo: "assets/logo.png",
};

const SKILL_DIR = path.resolve(import.meta.dirname, "..");

function logoData(file?: string): string | undefined {
  if (!file) return undefined;
  const abs = path.isAbsolute(file) ? file : path.join(SKILL_DIR, file);
  if (!existsSync(abs)) return undefined;
  const ext = path.extname(abs).slice(1).toLowerCase().replace("jpg", "jpeg").replace("svg", "svg+xml");
  return `data:image/${ext};base64,${readFileSync(abs).toString("base64")}`;
}

const esc = (s = "") => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);

function html(card: Card, th: Theme): string {
  const logo = card.type === "title" || card.type === "outro" ? logoData(th.logo) : undefined;
  const logoTag = logo ? `<img class="logo pop" src="${logo}">` : "";
  const body = (() => {
    switch (card.type) {
      case "title":
      case "outro":
        return `${logoTag}
          <h1 class="up" style="animation-delay:.25s">${esc(card.title)}</h1>
          <div class="bar"></div>
          ${card.subtitle ? `<p class="sub up" style="animation-delay:.55s">${esc(card.subtitle)}</p>` : ""}`;
      case "points":
        return `<h2 class="up" style="animation-delay:.1s">${esc(card.title)}</h2>
          <div class="bar"></div>
          <ul>${(card.points ?? []).map((p, i) =>
            `<li class="left" style="animation-delay:${(0.5 + i * 0.35).toFixed(2)}s"><span class="dot"></span>${esc(p)}</li>`).join("")}</ul>`;
      case "stat":
        return `<p class="sub up" style="animation-delay:.1s">${esc(card.title)}</p>
          <div class="num pop" style="animation-delay:.3s">${esc(card.prefix)}<span data-count="${card.value ?? 0}">0</span>${esc(card.suffix)}</div>
          <div class="bar center"></div>
          ${card.label ? `<p class="sub up" style="animation-delay:.9s">${esc(card.label)}</p>` : ""}`;
    }
  })();
  const center = card.align !== "left";
  return `<!doctype html><html><head><meta charset="utf-8"><style>
    *{margin:0;box-sizing:border-box}
    html,body{width:1920px;height:1080px;overflow:hidden}
    body{background:${th.background};
      color:${th.text};font-family:${th.font};display:flex;flex-direction:column;justify-content:center;
      padding:0 180px;${center ? "align-items:center;text-align:center;" : ""}}
    h1{font-size:104px;font-weight:800;letter-spacing:-2px;line-height:1.05;max-width:1500px}
    h2{font-size:76px;font-weight:800;letter-spacing:-1px;margin-bottom:56px}
    .sub{font-size:40px;font-weight:400;color:${th.muted};margin-top:28px;max-width:1400px;line-height:1.3}
    ${center ? ".sub{margin-left:auto;margin-right:auto}" : ""}
    .bar{width:0;height:10px;border-radius:5px;background:${th.accent};margin:36px 0 8px;animation:grow .8s .2s cubic-bezier(.2,.8,.2,1) forwards}
    ${center ? ".bar{margin-left:auto;margin-right:auto}ul{margin:0 auto;text-align:left}" : ""}
    .logo{width:170px;height:170px;object-fit:contain;margin-bottom:48px}
    h2 + .bar{margin-top:0;margin-bottom:48px}
    ul{list-style:none}
    li{font-size:50px;line-height:1.3;margin:22px 0;display:flex;align-items:center;gap:32px}
    .dot{flex:none;width:22px;height:22px;border-radius:50%;background:${th.accent};box-shadow:0 0 0 10px ${th.accent}33}
    .num{font-size:220px;font-weight:900;letter-spacing:-6px;line-height:1;color:${th.accent}}
    .up,.left,.pop{opacity:0;animation:.9s cubic-bezier(.2,.8,.2,1) forwards}
    .up{animation-name:up}.left{animation-name:left}.pop{animation-name:pop}
    @keyframes up{from{opacity:0;transform:translateY(50px)}to{opacity:1;transform:none}}
    @keyframes left{from{opacity:0;transform:translateX(-60px)}to{opacity:1;transform:none}}
    @keyframes pop{from{opacity:0;transform:scale(.8)}to{opacity:1;transform:none}}
    @keyframes grow{to{width:160px}}
  </style></head><body>${body}<script>
    // Driven by the renderer: set every animation (and counters) to time t (ms).
    window.__seek = (t) => {
      for (const a of document.getAnimations()) { a.pause(); a.currentTime = t; }
      for (const el of document.querySelectorAll('[data-count]')) {
        const v = +el.dataset.count, k = Math.min(1, Math.max(0, (t - 300) / 1400));
        const e = 1 - Math.pow(1 - k, 3);
        el.textContent = (Number.isInteger(v) ? Math.round(v * e) : (v * e).toFixed(1)).toLocaleString();
      }
    };
  </script></body></html>`;
}

let browser: Browser | undefined;

/** Render a card to an H.264 clip of `ms` length at 1920x1080/30fps (cached). */
export async function renderCard(card: Card, theme: Theme, ms: number, dir: string): Promise<string> {
  mkdirSync(dir, { recursive: true });
  const markup = html(card, theme);
  const file = path.join(dir, `${createHash("sha1").update(markup + ms).digest("hex").slice(0, 12)}.mp4`);
  if (existsSync(file)) return file;

  browser ??= await chromium.launch({ channel: process.env.PV_BROWSER ?? "chrome", headless: true });
  const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
  await page.setContent(markup, { waitUntil: "load" });
  await page.evaluate(() => document.fonts.ready);

  const enc = spawn(which("ffmpeg"), [
    "-hide_banner", "-loglevel", "error", "-y",
    "-f", "image2pipe", "-c:v", "mjpeg", "-framerate", "30", "-i", "-",
    "-c:v", "libx264", "-preset", "medium", "-crf", "16", "-pix_fmt", "yuv420p", file,
  ], { stdio: ["pipe", "ignore", "inherit"] });
  const frames = Math.ceil((ms / 1000) * 30);
  for (let i = 0; i < frames; i++) {
    await page.evaluate((t) => (window as any).__seek(t), (i * 1000) / 30);
    const jpg = await page.screenshot({ type: "jpeg", quality: 95 });
    if (!enc.stdin.write(jpg)) await new Promise((r) => enc.stdin.once("drain", r));
  }
  enc.stdin.end();
  await new Promise((r) => enc.on("close", r));
  await page.close();
  return file;
}

export async function closeCards() {
  await browser?.close();
  browser = undefined;
}
