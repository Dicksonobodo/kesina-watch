import { existsSync } from "node:fs";
import path from "node:path";
import { config } from "./config.js";

const PROGRAM_FILES = process.env.PROGRAMFILES || "C:/Program Files";
// Some shells (e.g. Git Bash) drop the "ProgramFiles(x86)" variable.
const PROGRAM_FILES_X86 = process.env["PROGRAMFILES(X86)"] || "C:/Program Files (x86)";

const CANDIDATES = {
  win32: [
    path.join(PROGRAM_FILES, "Google/Chrome/Application/chrome.exe"),
    path.join(PROGRAM_FILES_X86, "Google/Chrome/Application/chrome.exe"),
    process.env.LOCALAPPDATA && path.join(process.env.LOCALAPPDATA, "Google/Chrome/Application/chrome.exe"),
    path.join(PROGRAM_FILES_X86, "Microsoft/Edge/Application/msedge.exe"),
    path.join(PROGRAM_FILES, "Microsoft/Edge/Application/msedge.exe"),
  ],
  darwin: [
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    "/Applications/Chromium.app/Contents/MacOS/Chromium",
    "/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge",
  ],
  linux: ["/usr/bin/chromium", "/usr/bin/chromium-browser", "/usr/bin/google-chrome", "/usr/bin/google-chrome-stable", "/snap/bin/chromium"],
};

export function findChrome() {
  if (config.chromePath) return config.chromePath;
  return (CANDIDATES[process.platform] || CANDIDATES.linux).find((p) => p && existsSync(p)) || null;
}
