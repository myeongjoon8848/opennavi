import type { Page } from "playwright-core";

const OVERLAY_ID = "__opennavi_agent_overlay__";

const OVERLAY_CSS = `
#${OVERLAY_ID} {
  position: fixed;
  top: 0; left: 0; right: 0; bottom: 0;
  pointer-events: none;
  z-index: 2147483647;
  border: none;
  background: linear-gradient(to bottom, rgba(20, 184, 166, 0.5), transparent 60px),
              linear-gradient(to top, rgba(20, 184, 166, 0.5), transparent 60px),
              linear-gradient(to right, rgba(20, 184, 166, 0.5), transparent 60px),
              linear-gradient(to left, rgba(20, 184, 166, 0.5), transparent 60px);
  animation: __opennavi_pulse__ 2.4s ease-in-out infinite;
}

@keyframes __opennavi_pulse__ {
  0%, 100% { opacity: 0.25; }
  50% { opacity: 0.9; }
}
`;

const BUTTERFLY_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32"><g fill="#0d9488"><path d="M16 16 C 6 4, 1 10, 3 16 C 8 18, 13 17, 16 16 Z"/><path d="M16 16 C 26 4, 31 10, 29 16 C 24 18, 19 17, 16 16 Z"/><path d="M16 16 C 11 19, 8 26, 12 27 C 15 25, 16 20, 16 17 Z"/><path d="M16 16 C 21 19, 24 26, 20 27 C 17 25, 16 20, 16 17 Z"/></g></svg>`;

/**
 * Inject a gradient border overlay and butterfly favicon to indicate agent-controlled browsing.
 * Idempotent — safe to call multiple times on the same page.
 */
export async function injectAgentOverlay(page: Page): Promise<void> {
  try {
    const faviconDataUri = "data:image/svg+xml," + encodeURIComponent(BUTTERFLY_SVG);
    await page.evaluate(`(() => {
      if (document.getElementById("${OVERLAY_ID}")) return;

      // Gradient border overlay
      const style = document.createElement("style");
      style.textContent = ${JSON.stringify(OVERLAY_CSS)};
      document.head.appendChild(style);
      const div = document.createElement("div");
      div.id = "${OVERLAY_ID}";
      document.body.appendChild(div);

      // Butterfly favicon
      let link = document.querySelector('link[rel*="icon"]');
      if (!link) { link = document.createElement("link"); link.rel = "icon"; document.head.appendChild(link); }
      link.href = "${faviconDataUri}";
    })()`);
  } catch {
    // Silently ignore — page might not be ready or is a special page (chrome://, about:blank)
  }
}
