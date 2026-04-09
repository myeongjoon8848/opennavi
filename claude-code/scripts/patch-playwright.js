#!/usr/bin/env node
/**
 * Patch playwright-core to handle Chrome 147+ removing
 * Browser.setDownloadBehavior browser context management.
 *
 * The fix: make the setDownloadBehavior call non-fatal by adding .catch(() => {}).
 */

const fs = require("fs");
const path = require("path");

const target = path.join(
  __dirname,
  "..",
  "node_modules",
  "playwright-core",
  "lib",
  "server",
  "chromium",
  "crBrowser.js",
);

if (!fs.existsSync(target)) {
  console.log("[patch-playwright] crBrowser.js not found, skipping");
  process.exit(0);
}

let src = fs.readFileSync(target, "utf8");

const needle = `promises.push(this._browser._session.send("Browser.setDownloadBehavior", {
        behavior: this._options.acceptDownloads === "accept" ? "allowAndName" : "deny",
        browserContextId: this._browserContextId,
        downloadPath: this._browser.options.downloadsPath,
        eventsEnabled: true
      }));`;

const replacement = `promises.push(this._browser._session.send("Browser.setDownloadBehavior", {
        behavior: this._options.acceptDownloads === "accept" ? "allowAndName" : "deny",
        browserContextId: this._browserContextId,
        downloadPath: this._browser.options.downloadsPath,
        eventsEnabled: true
      }).catch(() => {}));`;

if (src.includes(".catch(() => {})")) {
  console.log("[patch-playwright] already patched, skipping");
  process.exit(0);
}

if (!src.includes(needle)) {
  console.log("[patch-playwright] target code not found — playwright-core may have changed, skipping");
  process.exit(0);
}

src = src.replace(needle, replacement);
fs.writeFileSync(target, src, "utf8");
console.log("[patch-playwright] patched setDownloadBehavior to be non-fatal (Chrome 147+ compat)");
