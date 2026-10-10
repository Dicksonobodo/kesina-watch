// Builds deploy/huggingface/space/ : everything a Hugging Face Docker Space needs, ready to upload.
// Run from the project folder:  node deploy/huggingface/make-space.mjs
import { cpSync, existsSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const server = path.resolve(here, "../../server");
const out = path.join(here, "space");

rmSync(out, { recursive: true, force: true });
mkdirSync(out, { recursive: true });

for (const item of ["src", "package.json", "package-lock.json", "Dockerfile", ".dockerignore"]) {
  const from = path.join(server, item);
  if (existsSync(from)) cpSync(from, path.join(out, item), { recursive: true, filter: (p) => !/[\\/](node_modules|\.cache)([\\/]|$)|_[^\\/]*\.mjs$/.test(p) });
}

// Hugging Face reads the Space settings from the README's front matter.
writeFileSync(
  path.join(out, "README.md"),
  `---
title: Dixon Watch Server
emoji: 🎬
colorFrom: green
colorTo: purple
sdk: docker
app_port: 8787
pinned: false
---

Detection server for Dixon Watch. Health check: \`/health\`.
Settings (Firebase project, allowed sites, admin emails, secrets) are set under
**Settings → Variables and secrets**, never in these files.
`,
);

console.log(`Space files ready in ${out}`);
