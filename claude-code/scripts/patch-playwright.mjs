#!/usr/bin/env node
// Patches playwright-core to swallow `Browser.setDownloadBehavior` protocol
// errors during `connectOverCDP`. Chrome 147+ no longer supports this
// browser-scoped command on CDP-attached browsers, and without a `.catch()`
// the error surfaces as "Browser context management is not supported" and
// breaks every connect attempt.
//
// Upstream tracker: https://github.com/microsoft/playwright/issues (search
// "setDownloadBehavior Browser context management"). Remove this script once
// a released playwright-core version no longer has the failing call.

import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";

const require = createRequire(import.meta.url);

function resolvePlaywrightFile() {
  try {
    const pkgPath = require.resolve("playwright-core/package.json");
    return join(dirname(pkgPath), "lib/server/chromium/crBrowser.js");
  } catch {
    return null;
  }
}

const target = resolvePlaywrightFile();
if (!target || !existsSync(target)) {
  // playwright-core not installed yet (e.g. during lockfile-only install) — no-op.
  process.exit(0);
}

const NEEDLE =
  '        eventsEnabled: true\n      }));';
const REPLACEMENT =
  '        eventsEnabled: true\n      }).catch(() => {}));';

const src = readFileSync(target, "utf8");

if (src.includes("}).catch(() => {}));")) {
  // Already patched (either by us or by upstream).
  process.exit(0);
}

if (!src.includes(NEEDLE)) {
  console.warn(
    "[patch-playwright] Could not find setDownloadBehavior call to patch — " +
      "playwright-core layout may have changed. Skipping.",
  );
  process.exit(0);
}

writeFileSync(target, src.replace(NEEDLE, REPLACEMENT));
console.log("[patch-playwright] Applied Chrome 147+ setDownloadBehavior workaround.");
