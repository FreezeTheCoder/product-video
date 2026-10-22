// Claude-driven recording. `drive` opens Chrome and keeps it open; the user
// signs in by hand, then Claude controls the tab through `do` commands: look at
// the page, try steps, and record clean takes of a steps file. Every take
// replaces the previous recording, so a take can be redone at any time.
//
//   node src/cli.ts drive <url> <out-dir>          (keep running in the background)
//   node src/cli.ts do <out-dir> look
//   node src/cli.ts do <out-dir> step '<yaml step>'
//   node src/cli.ts do <out-dir> run <steps.yaml>     (try, not recorded)
//   node src/cli.ts do <out-dir> record <steps.yaml>  (recorded take)
//   node src/cli.ts do <out-dir> close
import { randomBytes } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { createServer } from "node:http";
import path from "node:path";
import YAML from "yaml";
import type { Locator, Page } from "playwright";
import { launch, Recorder } from "./capture.ts";

/** One action. `pause` = ms to wait afterwards (default: 1400 in a take, 400 otherwise). */
export type Step = { pause?: number } & (
  | { click: string }
  | { fill: string; text: string }
  | { press: string }
  | { select: string; option: string }
  | { hover: string }
  | { scroll: number | string }
  | { wait: number }
  | { goto: string }
);

export interface Steps {
  /** Page to open before the take; default: wherever the tab is. */
  start?: string;
  steps: Step[];
}

const STATE = ".drive.json";

/**
 * Page size in CSS pixels and zoom. 1280x720 drawn at 1.5x gives sharp
 * 1920x1080 frames with laptop-sized text. The screencast follows the window's
 * real pixel density, not the emulated one, so the zoom is forced on the window.
 */
function viewport() {
  const [w, h, s] = (process.env.PV_VIEWPORT ?? "1280x720@1.5").split(/[x@]/).map(Number);
  return { width: w, height: h, scale: s || 1 };
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const ease = (k: number) => (k < 0.5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2);

class Driver {
  page: Page;
  outDir: string;
  mouse: { x: number; y: number };
  recording = false;

  constructor(page: Page, outDir: string) {
    this.page = page;
    this.outDir = outDir;
    const v = page.viewportSize() ?? { width: 1280, height: 720 };
    this.mouse = { x: v.width / 2, y: v.height / 2 };
  }

  /** Glide the drawn cursor to (x, y) like a hand would. */
  async moveTo(x: number, y: number) {
    const { x: x0, y: y0 } = this.mouse;
    const dist = Math.hypot(x - x0, y - y0);
    const ms = this.recording ? Math.min(900, 350 + dist * 0.6) : 120;
    const n = Math.max(2, Math.round(ms / 16));
    for (let i = 1; i <= n; i++) {
      const k = ease(i / n);
      await this.page.mouse.move(x0 + (x - x0) * k, y0 + (y - y0) * k);
      if (this.recording) await sleep(10);
    }
    this.mouse = { x, y };
  }

  async target(selector: string): Promise<{ loc: Locator; x: number; y: number }> {
    const loc = this.page.locator(selector).first();
    await loc.waitFor({ state: "visible", timeout: 10_000 }).catch(() => {
      throw new Error(`"${selector}" is not visible on the page (waited 10 s). Run look and pick a target from the tree.`);
    });
    // Scroll smoothly so the viewer sees where the element is.
    const inView = await loc.evaluate((el) => {
      const r = el.getBoundingClientRect();
      return r.top >= 0 && r.bottom <= innerHeight && r.left >= 0 && r.right <= innerWidth;
    });
    if (!inView) {
      await loc.evaluate((el, smooth) => el.scrollIntoView({ block: "center", behavior: smooth ? "smooth" : "auto" }), this.recording);
      await sleep(this.recording ? 900 : 100);
    }
    const box = await loc.boundingBox();
    if (!box) throw new Error(`"${selector}" has no size on screen`);
    return { loc, x: box.x + box.width / 2, y: box.y + box.height / 2 };
  }

  async click(selector: string) {
    const { x, y } = await this.target(selector);
    await this.moveTo(x, y);
    if (this.recording) await sleep(250);
    await this.page.mouse.click(x, y);
  }

  async step(s: Step) {
    if ("click" in s) await this.click(s.click);
    else if ("fill" in s) {
      const { loc } = await this.target(s.fill);
      const secret = await loc.evaluate((el) => (el as HTMLInputElement).type === "password"
        || /pass|otp|pin|cvv/i.test(`${(el as HTMLInputElement).name} ${el.id} ${(el as HTMLInputElement).autocomplete}`));
      if (secret) throw new Error(`"${s.fill}" is a password or code field. The user types those, not Claude.`);
      await this.click(s.fill);
      await loc.fill("");
      await this.page.keyboard.type(String(s.text), { delay: this.recording ? 55 : 0 });
    } else if ("press" in s) await this.page.keyboard.press(s.press);
    else if ("select" in s) {
      const { loc, x, y } = await this.target(s.select);
      await this.moveTo(x, y);
      if (this.recording) await sleep(250);
      await loc.selectOption({ label: s.option }).catch(() => loc.selectOption(s.option));
    } else if ("hover" in s) {
      const { x, y } = await this.target(s.hover);
      await this.moveTo(x, y);
    } else if ("scroll" in s) {
      if (typeof s.scroll === "number") {
        // Wheel events from the cursor position: scrolls whatever is under it, like a person.
        const n = this.recording ? Math.max(1, Math.round(Math.abs(s.scroll) / 60)) : 1;
        for (let i = 0; i < n; i++) {
          await this.page.mouse.wheel(0, s.scroll / n);
          if (this.recording) await sleep(25);
        }
      } else await this.target(s.scroll);
    } else if ("wait" in s) await sleep(s.wait);
    else if ("goto" in s) await this.page.goto(new URL(s.goto, this.page.url()).href);
    await this.page.waitForLoadState("load", { timeout: 15_000 }).catch(() => {});
    await sleep(s.pause ?? (this.recording ? 1400 : 400));
  }

  async run(steps: Step[]) {
    for (let i = 0; i < steps.length; i++) {
      try {
        await this.step(steps[i]);
      } catch (e: any) {
        throw new Error(`step ${i + 1} (${JSON.stringify(steps[i])}) failed: ${e.message.split("\n")[0]}`);
      }
    }
  }

  async look(): Promise<string> {
    await this.page.screenshot({ path: path.join(this.outDir, "look.png") });
    const tree = await this.page.locator("body").ariaSnapshot({ timeout: 10_000 }).catch((e) => `(no snapshot: ${e.message})`);
    writeFileSync(path.join(this.outDir, "look.yaml"), tree);
    const max = 12_000;
    return [
      `url: ${this.page.url()}`,
      `title: ${await this.page.title()}`,
      `screenshot: ${path.join(this.outDir, "look.png")}`,
      "page (role \"name\"; target it as role=button[name=\"...\"]):",
      tree.length > max ? `${tree.slice(0, max)}\n... (full tree in look.yaml)` : tree,
    ].join("\n");
  }

  async record(file: string): Promise<string> {
    const plan: Steps = YAML.parse(readFileSync(file, "utf8"));
    if (!plan?.steps?.length) throw new Error(`${file} has no steps`);
    if (plan.start) {
      await this.page.goto(new URL(plan.start, this.page.url()).href);
      await this.page.waitForLoadState("load").catch(() => {});
    }
    await this.page.evaluate(() => scrollTo(0, 0));
    await this.page.mouse.move(this.mouse.x, this.mouse.y); // show the drawn cursor
    await sleep(800);
    const rec = await Recorder.start(this.page, this.outDir, true);
    this.recording = true;
    try {
      await sleep(1200);
      await this.run(plan.steps);
      await sleep(1500);
    } catch (e) {
      await rec.stop();
      for (const f of ["capture.mkv", "session.json", "shots"]) rmSync(path.join(this.outDir, f), { recursive: true, force: true });
      throw e;
    } finally {
      this.recording = false;
    }
    const s = await rec.stop();
    return `Recorded ${(s.durationMs / 1000).toFixed(1)}s, ${s.events.length} events, ${s.viewport.width}x${s.viewport.height} -> ${this.outDir}`;
  }
}

export async function drive(url: string, outDir: string) {
  mkdirSync(outDir, { recursive: true });
  const v = viewport();
  const browser = await launch([`--force-device-scale-factor=${v.scale}`]);
  const ctx = await browser.newContext({ viewport: { width: v.width, height: v.height }, deviceScaleFactor: v.scale });
  await Recorder.instrument(ctx);
  const page = await ctx.newPage();
  const d = new Driver(page, outDir);
  ctx.on("page", (p) => { if (p !== page) console.log(`note: a new tab opened (${p.url()}); only the first tab is used.`); });
  await page.goto(url).catch((e) => console.log(`note: ${e.message.split("\n")[0]}`));

  const token = randomBytes(16).toString("hex");
  let busy = false;
  const server = createServer(async (req, res) => {
    const chunks: Buffer[] = [];
    for await (const c of req) chunks.push(c);
    const reply = (code: number, text: string) => { res.writeHead(code, { "content-type": "text/plain; charset=utf-8" }); res.end(text); };
    if (req.headers["x-token"] !== token) return reply(403, "bad token");
    if (busy) return reply(409, "busy: another command is still running");
    busy = true;
    try {
      const { cmd, arg } = JSON.parse(Buffer.concat(chunks).toString("utf8"));
      switch (cmd) {
        case "look": return reply(200, await d.look());
        case "step": await d.run([YAML.parse(arg)]); return reply(200, `ok\n${await d.look()}`);
        case "run": await d.run(YAML.parse(readFileSync(arg, "utf8")).steps); return reply(200, `ok\n${await d.look()}`);
        case "record": return reply(200, await d.record(arg));
        case "close": reply(200, "closed"); await browser.close(); return;
        default: return reply(400, `unknown command ${cmd}`);
      }
    } catch (e: any) {
      reply(500, `${e.message}\n${await d.look().catch(() => "")}`);
    } finally {
      busy = false;
    }
  });
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  const port = (server.address() as { port: number }).port;
  const stateFile = path.join(outDir, STATE);
  writeFileSync(stateFile, JSON.stringify({ port, token, pid: process.pid }));
  console.log("Browser open. Sign in in the window, then tell Claude you are done.");

  await new Promise((r) => browser.on("disconnected", r));
  server.close();
  rmSync(stateFile, { force: true });
  console.log("Browser closed.");
}

/** Send one command to the running `drive` process; prints its answer. */
export async function command(outDir: string, cmd: string, arg?: string): Promise<boolean> {
  const stateFile = path.join(outDir, STATE);
  if (!existsSync(stateFile)) throw new Error(`No open browser for ${outDir}. Start: node src/cli.ts drive <url> <out-dir>`);
  const { port, token } = JSON.parse(readFileSync(stateFile, "utf8"));
  if ((cmd === "run" || cmd === "record") && arg) arg = path.resolve(arg);
  const res = await fetch(`http://127.0.0.1:${port}/`, {
    method: "POST", headers: { "x-token": token }, body: JSON.stringify({ cmd, arg }),
  }).catch(() => { throw new Error("The browser is not running any more. Start drive again."); });
  console.log(await res.text());
  return res.ok;
}
