import { createHash } from "node:crypto";
import { readFile, readdir, writeFile } from "node:fs/promises";
import path from "node:path";

async function listFiles(directory, root = directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = await Promise.all(entries.map(async entry => {
    const fullPath = path.join(directory, entry.name);
    return entry.isDirectory() ? listFiles(fullPath, root) : path.relative(root, fullPath).split(path.sep).join("/");
  }));
  return files.flat().sort();
}

export function cacheVersionFor(files) {
  const digest = createHash("sha256").update(files.join("\n")).digest("hex").slice(0, 12);
  return `400moji-${digest}`;
}

async function fingerprintsFor(directory, files) {
  return Promise.all(files.map(async file => {
    const content = await readFile(path.join(directory, file));
    const digest = createHash("sha256").update(content).digest("hex");
    return `${file}:${digest}`;
  }));
}

export function appShellFor(files) {
  return files
    .filter(file => file !== "sw.js" && !file.endsWith("icon-master.png"))
    .map(file => `./${file === "index.html" ? "" : file}`);
}

export function serviceWorkerBuildPlugin() {
  let outputDirectory = "dist";
  return {
    name: "400moji-service-worker",
    apply: "build",
    configResolved(config) {
      outputDirectory = path.resolve(config.root, config.build.outDir);
    },
    async closeBundle() {
      const files = await listFiles(outputDirectory);
      const swPath = path.join(outputDirectory, "sw.js");
      const source = await readFile(swPath, "utf8");
      const cacheName = cacheVersionFor(await fingerprintsFor(outputDirectory, files.filter(file => file !== "sw.js")));
      const appShell = appShellFor(files);
      const generated = source
        .replace(/^const CACHE_NAME = .*;$/m, `const CACHE_NAME = ${JSON.stringify(cacheName)};`)
        .replace(/^const APP_SHELL = .*;$/m, `const APP_SHELL = ${JSON.stringify(appShell)};`);
      await writeFile(swPath, generated);
    }
  };
}
