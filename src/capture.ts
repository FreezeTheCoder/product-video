// Recording. `Recorder` records one tab; `capture` is the manual mode where the
// user signs in and clicks through themselves (drive.ts is the mode where
// Claude drives). Produces capture.mkv, session.json and shots/.
import { spawn, type ChildProcess } from "node:child_process";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import { chromium, type Browser, type BrowserContext, type CDPSession, type Frame, type Page } from "playwright";
import { which } from "./bin.ts";

export interface CaptureEvent {
  t: number; // ms since the video started
  type: "start" | "click" | "input" | "navigate" | "scroll";
  label?: string;
  tag?: string;
  value?: string;
  url?: string;
  title?: string;
  x?: number;
  y?: number;
  shot?: string;
}

export interface Session {
  url: string;
  viewport: { width: number; height: number };
  /** Recorded frame size (older sessions: same as viewport). */
  video?: { width: number; height: number };
  durationMs: number;
  events: CaptureEvent[];
}

// Drawn cursor + click ripple (the OS cursor is not in page recordings), and a
// logger that reports clicks, field changes and scrolls back to Node.
const PAGE_SCRIPT = String.raw`
(() => {
  if (window.__pv) return; window.__pv = true;
  const send = (e) => { try { window.__pvEvent(e); } catch {} };
  const labelOf = (el) => {
    if (!el) return '';
    const txt = (s) => (s || '').replace(/\s+/g, ' ').trim().slice(0, 80);
    const byFor = el.id && document.querySelector('label[for="' + CSS.escape(el.id) + '"]');
    return txt(el.getAttribute('aria-label')) || txt(byFor && byFor.innerText) || txt(el.innerText)
      || txt(el.getAttribute('placeholder')) || txt(el.getAttribute('title')) || txt(el.getAttribute('alt'))
      || txt(el.getAttribute('name')) || el.tagName.toLowerCase();
  };
  const install = () => {
    const css = document.createElement('style');
    css.textContent = '#pv-cursor{position:fixed;left:-50px;top:-50px;width:22px;height:22px;z-index:2147483647;pointer-events:none;transform:translate(-3px,-2px)}'
      + '.pv-ripple{position:fixed;width:44px;height:44px;margin:-22px 0 0 -22px;border-radius:50%;border:3px solid rgba(229,57,53,.9);z-index:2147483646;pointer-events:none;animation:pv-r .6s ease-out forwards}'
      + '@keyframes pv-r{from{transform:scale(.3);opacity:1}to{transform:scale(1.4);opacity:0}}';
    document.head.appendChild(css);
    const c = document.createElement('div');
    c.id = 'pv-cursor';
    c.innerHTML = '<svg width="22" height="22" viewBox="0 0 24 24"><path d="M3 2l7 19 2.6-7.6L20 11z" fill="#111" stroke="#fff" stroke-width="1.6" stroke-linejoin="round"/></svg>';
    document.body.appendChild(c);
    const place = (x, y) => { c.style.left = x + 'px'; c.style.top = y + 'px'; };
    // Keep the cursor where it was across page loads (it is redrawn on every page).
    try { const p = JSON.parse(sessionStorage.getItem('pv-cur') || 'null'); if (p) place(p[0], p[1]); } catch {}
    addEventListener('mousemove', e => {
      place(e.clientX, e.clientY);
      try { sessionStorage.setItem('pv-cur', JSON.stringify([e.clientX, e.clientY])); } catch {}
    }, true);
    addEventListener('mousedown', e => {
      const r = document.createElement('div'); r.className = 'pv-ripple';
      r.style.left = e.clientX + 'px'; r.style.top = e.clientY + 'px';
      document.body.appendChild(r); setTimeout(() => r.remove(), 700);
    }, true);
  };
  if (document.body) install(); else addEventListener('DOMContentLoaded', install);

  addEventListener('click', e => {
    const el = e.target.closest('a,button,[role=button],[role=tab],[role=menuitem],[role=option],input,select,textarea,label,summary,li,td,tr') || e.target;
    send({ type: 'click', label: labelOf(el), tag: el.tagName.toLowerCase(), x: e.clientX, y: e.clientY });
  }, true);
  addEventListener('change', e => {
    const el = e.target;
    if (!el || !('value' in el)) return;
    const secret = el.type === 'password' || /pass|otp|pin|card|cvv|ssn/i.test(el.name + el.id + el.autocomplete);
    const value = el.tagName === 'SELECT' ? (el.selectedOptions[0] || {}).text : el.value;
    send({ type: 'input', label: labelOf(el), tag: el.tagName.toLowerCase(), value: secret ? '(hidden)' : String(value || '').slice(0, 60) });
  }, true);
  let st;
  addEventListener('scroll', () => {
    clearTimeout(st);
    st = setTimeout(() => send({ type: 'scroll', label: 'scrolled to ' + Math.round(scrollY) + 'px' }), 400);
  }, true);
})();`;

const STOP_HINT = String.raw`
(() => {
  const d = document.createElement('div');
  d.textContent = 'Recording. Close this window when you are done.';
  Object.assign(d.style, { position: 'fixed', top: '16px', left: '50%', transform: 'translateX(-50%)', zIndex: 2147483647,
    background: '#e53935', color: '#fff', font: '600 15px system-ui', padding: '10px 18px', borderRadius: '999px',
    boxShadow: '0 4px 16px rgba(0,0,0,.25)', transition: 'opacity .5s' });
  document.body.appendChild(d);
  setTimeout(() => { d.style.opacity = '0'; setTimeout(() => d.remove(), 600); }, 2500);
})();`;

export async function launch(args = ["--start-maximized"]): Promise<Browser> {
  const channels = process.env.PV_BROWSER ? [process.env.PV_BROWSER] : ["chrome", "msedge"];
  for (const channel of channels) {
    try {
      return await chromium.launch({ channel, headless: false, args });
    } catch {}
  }
  throw new Error("Could not start Google Chrome or Microsoft Edge.");
}

/**
 * Records one tab. Frames come from Chrome's screencast at the page's real
 * pixel size and are written at a steady 30 fps as MJPEG, so recording costs
 * almost no CPU. Clicks, field changes, scrolls and page loads are logged with
 * a screenshot. Call `instrument` once per browser context first.
 */
export class Recorder {
  private static active: Recorder | undefined;
  readonly events: CaptureEvent[] = [];
  private t0 = Date.now();
  private shotN = 0;
  private written = 0;
  private latest: Buffer | undefined;
  private size = { width: 0, height: 0 };
  private ticker: NodeJS.Timeout | undefined;
  private enc!: ChildProcess;
  private cdp!: CDPSession;
  private startUrl = "";

  // No parameter properties: Node's type stripping does not support them.
  private page: Page;
  private outDir: string;
  private quiet: boolean;

  private constructor(page: Page, outDir: string, quiet: boolean) {
    this.page = page;
    this.outDir = outDir;
    this.quiet = quiet;
  }

  static async instrument(ctx: BrowserContext) {
    await ctx.exposeBinding("__pvEvent", (src, e: CaptureEvent) => {
      const r = Recorder.active;
      if (r && src.page === r.page) r.log({ ...e, t: r.now() });
    });
    await ctx.addInitScript(PAGE_SCRIPT);
  }

  /** Replaces the previous recording in outDir (keeps brief, steps and script) and starts a new one. */
  static async start(page: Page, outDir: string, quiet = false): Promise<Recorder> {
    for (const old of ["shots", "capture.mkv", "capture-1080p.mp4", "session.json"]) rmSync(path.join(outDir, old), { recursive: true, force: true });
    mkdirSync(path.join(outDir, "shots"), { recursive: true });
    const r = new Recorder(page, outDir, quiet);
    r.enc = spawn(which("ffmpeg"), [
      "-hide_banner", "-loglevel", "error", "-y",
      "-f", "image2pipe", "-c:v", "mjpeg", "-framerate", "30", "-i", "-",
      "-c:v", "copy", path.join(outDir, "capture.mkv"),
    ], { stdio: ["pipe", "ignore", "inherit"] });
    r.cdp = await page.context().newCDPSession(page);
    r.cdp.on("Page.screencastFrame", (f) => {
      r.latest = Buffer.from(f.data, "base64");
      r.size = { width: Math.round(f.metadata.deviceWidth * (f.metadata.pageScaleFactor || 1)), height: Math.round(f.metadata.deviceHeight) };
      r.cdp.send("Page.screencastFrameAck", { sessionId: f.sessionId }).catch(() => {});
    });
    await r.cdp.send("Page.startScreencast", { format: "jpeg", quality: 90, maxWidth: 3840, maxHeight: 2160 });
    while (!r.latest) await new Promise((res) => setTimeout(res, 20));
    r.t0 = Date.now();
    // Repeat the latest frame so the video keeps real time even when nothing moves.
    r.ticker = setInterval(() => {
      const due = Math.floor(r.now() / (1000 / 30)) + 1;
      while (r.latest && r.written < due) { r.enc.stdin!.write(r.latest); r.written++; }
    }, 15);
    page.on("framenavigated", r.onNavigate);
    Recorder.active = r;
    r.startUrl = page.url();
    r.log({ t: r.now(), type: "start", url: page.url(), title: await page.title().catch(() => "") });
    return r;
  }

  now = () => Date.now() - this.t0;

  private onNavigate = async (f: Frame) => {
    if (f !== this.page.mainFrame()) return;
    const title = await this.page.title().catch(() => "");
    this.log({ t: this.now(), type: "navigate", url: f.url(), title });
  };

  log(e: CaptureEvent) {
    this.events.push(e);
    if (!this.quiet) {
      const label = e.type === "navigate" ? e.url : `${e.label ?? ""}${e.value ? ` = ${e.value}` : ""}`;
      console.log(`  ${(e.t / 1000).toFixed(1).padStart(6)}s  ${e.type.padEnd(8)} ${label}`);
    }
    if (e.type === "click" || e.type === "navigate" || e.type === "start") {
      const file = `${String(++this.shotN).padStart(3, "0")}.jpg`;
      e.shot = `shots/${file}`;
      // Screenshot once the page has reacted to the action.
      setTimeout(() => {
        this.page.screenshot({ path: path.join(this.outDir, "shots", file), type: "jpeg", quality: 70 }).catch(() => {});
      }, 900);
    }
  }

  async stop(): Promise<Session> {
    const durationMs = this.now();
    Recorder.active = undefined;
    this.page.off("framenavigated", this.onNavigate);
    clearInterval(this.ticker);
    await this.cdp.send("Page.stopScreencast").catch(() => {});
    await this.cdp.detach().catch(() => {});
    this.enc.stdin!.end();
    await new Promise((r) => this.enc.on("close", r));
    await new Promise((r) => setTimeout(r, 1000)); // let the last screenshots land
    const viewport = { ...this.size };
    const session: Session = { url: this.startUrl, viewport, video: viewport, durationMs, events: this.events };
    writeFileSync(path.join(this.outDir, "session.json"), JSON.stringify(session, null, 2));
    return session;
  }
}

/** Manual mode: the user signs in, clicks through, then closes the window. */
export async function capture(url: string, outDir: string): Promise<Session> {
  mkdirSync(outDir, { recursive: true });
  const appHost = new URL(url).host;
  const browser = await launch();

  // 1) Sign in first; nothing is recorded until the user is back in the app.
  // The session lives only in this browser and is gone when it closes.
  const ctx = await browser.newContext({ viewport: null });
  const page = await ctx.newPage();
  await page.goto(url);
  const needsLogin = await page
    .waitForURL((u) => u.host !== appHost, { timeout: 8000 })
    .then(() => true, () => false);
  if (needsLogin) {
    console.log("Sign in in the browser window. Recording starts after you sign in.");
    await page.waitForURL((u) => u.host === appHost, { timeout: 15 * 60_000 });
  }
  await page.waitForLoadState("load").catch(() => {});

  // 2) Record the same window, exactly as the user sees it (no size emulation,
  // so fullscreen/resizing behave normally). Scripts registered now apply from
  // the next page load, so load the page once more.
  await Recorder.instrument(ctx);
  await page.reload().catch(() => {});
  await page.evaluate(STOP_HINT).catch(() => {});
  const rec = await Recorder.start(page, outDir);
  console.log("Recording. Close the browser window when you are done.");

  const why = await new Promise<string>((resolve) => {
    page.on("close", () => resolve("window closed"));
    browser.on("disconnected", () => resolve("browser closed"));
  });
  console.log(`Stopped (${why}).`);
  const session = await rec.stop();
  await browser.close().catch(() => {});
  return session;
}
