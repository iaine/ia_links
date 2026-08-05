#!/usr/bin/env node
/**
 * Build script for the IA Link Ripper extension.
 *
 * Packages the source files into a target-specific archive:
 *   - firefox -> dist/ia-link-ripper-firefox-<version>.xpi
 *   - chrome  -> dist/ia-link-ripper-chrome-<version>.zip
 *
 * The only manifest.json difference between targets is the
 * `browser_specific_settings` block (Firefox-only; Chrome ignores it but
 * it's cleaner to omit it from the Chrome build). Everything else -
 * permissions, background service worker, options_ui - is shared MV3 and
 * works unmodified on both.
 *
 * Usage:
 *   node build.mjs --target firefox --version 0.0.1
 *   node build.mjs --target chrome  --version 0.0.1
 *   npm run build:firefox
 *   npm run build:chrome
 *   npm run build:all
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import archiver from "archiver";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const SEMVER_RE = /^\d+\.\d+\.\d+$/;

// Every source file that ships in the built package, relative to this
// script. manifest.json is handled separately since its content is
// rewritten per-target (version stamped in, browser_specific_settings
// added/removed).
const SOURCE_FILES = [
  "popup.html",
  "popup.js",
  "options.html",
  "options.js",
  "background.js",
  "styles.css",
  "compat.js",
  "settings.js",
  "format-utils.js",
  "resultsStore.js",
  "lib/links.js",
];

const FIREFOX_GECKO_SETTINGS = {
  gecko: {
    id: "ia-link-ripper@example.com",
    strict_min_version: "109.0",
  },
};

function printHelp() {
  console.log(`
Build the IA Link Ripper extension for Firefox or Chrome.

Usage: node build.mjs [options]

  -t, --target <firefox|chrome>   Which browser to build for (required)
  -v, --version <semver>          Version to stamp into manifest.json (default: 0.0.1)
  -o, --out <dir>                 Output directory, relative to this script (default: dist)
  -h, --help                      Show this help
`);
}

function parseArgs(argv) {
  const args = { target: null, version: "0.0.1", outDir: "dist" };

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "-h" || arg === "--help") {
      printHelp();
      process.exit(0);
    } else if (arg === "-t" || arg === "--target") {
      args.target = argv[++i];
    } else if (arg.startsWith("--target=")) {
      args.target = arg.split("=")[1];
    } else if (arg === "-v" || arg === "--version") {
      args.version = argv[++i];
    } else if (arg.startsWith("--version=")) {
      args.version = arg.split("=")[1];
    } else if (arg === "-o" || arg === "--out") {
      args.outDir = argv[++i];
    } else if (arg.startsWith("--out=")) {
      args.outDir = arg.split("=")[1];
    } else {
      console.error(`Unknown argument: ${arg}\n`);
      printHelp();
      process.exit(1);
    }
  }

  return args;
}

function validateArgs(args) {
  if (args.target !== "firefox" && args.target !== "chrome") {
    console.error(`--target must be "firefox" or "chrome" (got: ${args.target})`);
    process.exit(1);
  }
  if (!SEMVER_RE.test(args.version)) {
    console.error(`--version must look like 0.0.1 (got: ${args.version})`);
    process.exit(1);
  }
}

function buildManifest(target, version) {
  const manifest = JSON.parse(
    fs.readFileSync(path.join(__dirname, "manifest.json"), "utf8")
  );

  manifest.version = version;

  if (target === "firefox") {
    manifest.browser_specific_settings =
      manifest.browser_specific_settings || FIREFOX_GECKO_SETTINGS;
  } else {
    // Chrome ignores this key harmlessly, but omit it for a clean
    // target-specific package rather than relying on that.
    delete manifest.browser_specific_settings;
  }

  return manifest;
}

async function packageExtension({ target, version, outDir }) {
  const manifest = buildManifest(target, version);
  const ext = target === "firefox" ? "xpi" : "zip";

  const resolvedOutDir = path.join(__dirname, outDir);
  fs.mkdirSync(resolvedOutDir, { recursive: true });

  const outFile = path.join(
    resolvedOutDir,
    `ia-link-ripper-${target}-${version}.${ext}`
  );

  const output = fs.createWriteStream(outFile);
  const archive = archiver("zip", { zlib: { level: 9 } });

  const finished = new Promise((resolve, reject) => {
    output.on("close", resolve);
    archive.on("warning", (err) => {
      if (err.code !== "ENOENT") reject(err);
    });
    archive.on("error", reject);
  });

  archive.pipe(output);
  archive.append(JSON.stringify(manifest, null, 2), { name: "manifest.json" });

  for (const file of SOURCE_FILES) {
    const fullPath = path.join(__dirname, file);
    if (!fs.existsSync(fullPath)) {
      throw new Error(`Missing source file: ${file}`);
    }
    archive.file(fullPath, { name: file });
  }

  await archive.finalize();
  await finished;

  return outFile;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  validateArgs(args);

  const outFile = await packageExtension(args);
  const sizeKb = (fs.statSync(outFile).size / 1024).toFixed(1);
  console.log(
    `Built ${args.target} package v${args.version}: ${path.relative(
      __dirname,
      outFile
    )} (${sizeKb} KB)`
  );
}

main().catch((err) => {
  console.error(err.message || err);
  process.exit(1);
});
