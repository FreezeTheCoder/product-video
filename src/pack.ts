// Builds dist/product-video.zip: only what a user needs to install the skill.
import { spawnSync } from "node:child_process";
import { mkdirSync, rmSync } from "node:fs";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "..");
const dist = path.join(root, "dist");
const zip = path.join(dist, "product-video.zip");
const files = ["SKILL.md", "README.md", "package.json", "package-lock.json", "src", "instructions", "assets"];

mkdirSync(dist, { recursive: true });
rmSync(zip, { force: true });
// tar ships with Windows 10+, macOS and Linux; -a picks the format from the extension.
// On Windows use the system tar (bsdtar); Git Bash's GNU tar cannot write zip.
const tar = process.platform === "win32" ? path.join(process.env.SystemRoot ?? "C:\\Windows", "System32", "tar.exe") : "tar";
const r = spawnSync(tar,["-a", "-c", "-f", zip, ...files], { cwd: root, stdio: "inherit" });
if (r.status !== 0) throw new Error("packing failed");
console.log(zip);
