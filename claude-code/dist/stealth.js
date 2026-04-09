"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.resolveUserDataDir = resolveUserDataDir;
exports.buildStealthLaunchArgs = buildStealthLaunchArgs;
exports.pickUserAgent = pickUserAgent;
exports.applyStealthScripts = applyStealthScripts;
const node_os_1 = require("node:os");
const node_path_1 = require("node:path");
// ---------------------------------------------------------------------------
// Persistent profile directory
// ---------------------------------------------------------------------------
const OPENNAVI_DIR = (0, node_path_1.join)((0, node_os_1.homedir)(), ".opennavi");
function resolveUserDataDir(profileName = "default") {
    return (0, node_path_1.join)(OPENNAVI_DIR, "browser", profileName, "user-data");
}
// ---------------------------------------------------------------------------
// Chrome launch args — minimize detection surface & optimize performance
// ---------------------------------------------------------------------------
function buildStealthLaunchArgs() {
    return [
        // --- Anti-detection ---
        "--disable-blink-features=AutomationControlled",
        // --- Startup noise reduction ---
        "--no-first-run",
        "--no-default-browser-check",
        "--disable-sync",
        "--disable-background-networking",
        "--disable-component-update",
        "--disable-features=Translate,MediaRouter",
        "--disable-session-crashed-bubble",
        "--hide-crash-restore-bubble",
        "--password-store=basic",
        // --- Crash/logging ---
        "--disable-breakpad",
        "--disable-crash-reporter",
        "--metrics-recording-only",
        // --- Linux container compatibility ---
        ...(process.platform === "linux"
            ? ["--disable-dev-shm-usage", "--no-sandbox", "--disable-setuid-sandbox"]
            : []),
    ];
}
// ---------------------------------------------------------------------------
// Realistic User-Agent strings
// ---------------------------------------------------------------------------
const DESKTOP_USER_AGENTS = [
    // Chrome 131 on macOS
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
    // Chrome 131 on Windows
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
    // Chrome 130 on macOS
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36",
];
function pickUserAgent() {
    if (process.platform === "darwin")
        return DESKTOP_USER_AGENTS[0];
    if (process.platform === "win32")
        return DESKTOP_USER_AGENTS[1];
    return DESKTOP_USER_AGENTS[0];
}
// ---------------------------------------------------------------------------
// Stealth init scripts — injected into every new browsing context
// ---------------------------------------------------------------------------
/**
 * Apply all stealth patches to a BrowserContext.
 * Must be called BEFORE any page.goto().
 */
async function applyStealthScripts(context) {
    await context.addInitScript({ content: STEALTH_SCRIPT });
}
/**
 * Combined stealth script. Runs in the page's JS context before any other
 * script. Covers the most common bot-detection vectors:
 *
 * 1. navigator.webdriver → false
 * 2. chrome.runtime present
 * 3. navigator.plugins populated
 * 4. navigator.languages populated
 * 5. navigator.permissions.query → prompt for notifications
 * 6. WebGL vendor/renderer spoofing
 * 7. Consistent screen dimensions
 * 8. iframe contentWindow access
 */
const STEALTH_SCRIPT = `
// 1. navigator.webdriver
Object.defineProperty(navigator, 'webdriver', {
  get: () => false,
  configurable: true,
});

// 2. chrome.runtime (only if chrome object exists or we create it)
if (!window.chrome) {
  window.chrome = {};
}
if (!window.chrome.runtime) {
  window.chrome.runtime = {
    connect: function() {},
    sendMessage: function() {},
  };
}

// 3. navigator.plugins — inject realistic plugin list
Object.defineProperty(navigator, 'plugins', {
  get: () => {
    const fakePlugins = [
      { name: 'Chrome PDF Plugin', filename: 'internal-pdf-viewer', description: 'Portable Document Format', length: 1 },
      { name: 'Chrome PDF Viewer', filename: 'mhjfbmdgcfjbbpaeojofohoefgiehjai', description: '', length: 1 },
      { name: 'Native Client', filename: 'internal-nacl-plugin', description: '', length: 2 },
    ];
    const pluginArray = Object.create(PluginArray.prototype);
    for (let i = 0; i < fakePlugins.length; i++) {
      const p = Object.create(Plugin.prototype);
      Object.defineProperties(p, {
        name: { value: fakePlugins[i].name, enumerable: true },
        filename: { value: fakePlugins[i].filename, enumerable: true },
        description: { value: fakePlugins[i].description, enumerable: true },
        length: { value: fakePlugins[i].length, enumerable: true },
      });
      pluginArray[i] = p;
    }
    Object.defineProperty(pluginArray, 'length', { value: fakePlugins.length });
    pluginArray.item = function(i) { return this[i] || null; };
    pluginArray.namedItem = function(n) {
      for (let i = 0; i < this.length; i++) {
        if (this[i].name === n) return this[i];
      }
      return null;
    };
    pluginArray.refresh = function() {};
    return pluginArray;
  },
  configurable: true,
});

// 4. navigator.languages
Object.defineProperty(navigator, 'languages', {
  get: () => ['en-US', 'en'],
  configurable: true,
});

// 5. navigator.permissions.query — return 'prompt' for notifications
const originalQuery = navigator.permissions?.query?.bind(navigator.permissions);
if (originalQuery) {
  navigator.permissions.query = (parameters) => {
    if (parameters.name === 'notifications') {
      return Promise.resolve({ state: Notification.permission });
    }
    return originalQuery(parameters);
  };
}

// 6. WebGL vendor/renderer spoofing
const getParameterProto = WebGLRenderingContext.prototype.getParameter;
WebGLRenderingContext.prototype.getParameter = function(parameter) {
  // UNMASKED_VENDOR_WEBGL
  if (parameter === 0x9245) return 'Intel Inc.';
  // UNMASKED_RENDERER_WEBGL
  if (parameter === 0x9246) return 'Intel Iris OpenGL Engine';
  return getParameterProto.call(this, parameter);
};
const getParameterProto2 = WebGL2RenderingContext.prototype.getParameter;
WebGL2RenderingContext.prototype.getParameter = function(parameter) {
  if (parameter === 0x9245) return 'Intel Inc.';
  if (parameter === 0x9246) return 'Intel Iris OpenGL Engine';
  return getParameterProto2.call(this, parameter);
};

// 7. Consistent window dimensions (prevent zero-size viewport detection)
if (window.outerHeight === 0) {
  Object.defineProperty(window, 'outerHeight', { get: () => window.innerHeight + 85 });
}
if (window.outerWidth === 0) {
  Object.defineProperty(window, 'outerWidth', { get: () => window.innerWidth });
}

// 8. iframe contentWindow — prevent cross-origin detection tricks
try {
  const elementDescriptor = Object.getOwnPropertyDescriptor(HTMLIFrameElement.prototype, 'contentWindow');
  if (elementDescriptor) {
    Object.defineProperty(HTMLIFrameElement.prototype, 'contentWindow', {
      get: function() {
        const result = elementDescriptor.get.call(this);
        if (!result) return result;
        // Avoid throwing on cross-origin access
        try { result.self; } catch { return result; }
        return result;
      },
    });
  }
} catch {}
`;
