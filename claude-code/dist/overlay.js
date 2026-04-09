"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.injectAgentOverlay = injectAgentOverlay;
const OVERLAY_ID = "__opennavi_agent_overlay__";
const OVERLAY_CSS = `
#${OVERLAY_ID} {
  position: fixed;
  top: 0; left: 0; right: 0; bottom: 0;
  pointer-events: none;
  z-index: 2147483647;
  border: none;
  background: linear-gradient(to bottom, rgba(250, 204, 21, 0.6), transparent 60px),
              linear-gradient(to top, rgba(250, 204, 21, 0.6), transparent 60px),
              linear-gradient(to right, rgba(250, 204, 21, 0.6), transparent 60px),
              linear-gradient(to left, rgba(250, 204, 21, 0.6), transparent 60px);
  animation: __opennavi_pulse__ 2s ease-in-out infinite;
}

@keyframes __opennavi_pulse__ {
  0%, 100% { opacity: 0.3; }
  50% { opacity: 1; }
}
`;
const BUTTERFLY_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32"><g transform="translate(16,16)"><g transform="rotate(-15)"><ellipse cx="-6" cy="-5" rx="6" ry="8" fill="#facc15" stroke="#d97706" stroke-width="0.8" opacity="0.9"/><ellipse cx="-5" cy="-3" rx="2.5" ry="3.5" fill="#fde68a" opacity="0.5"/></g><g transform="scale(-1,1) rotate(-15)"><ellipse cx="-6" cy="-5" rx="6" ry="8" fill="#facc15" stroke="#d97706" stroke-width="0.8" opacity="0.9"/><ellipse cx="-5" cy="-3" rx="2.5" ry="3.5" fill="#fde68a" opacity="0.5"/></g><g transform="rotate(20)"><ellipse cx="-4" cy="4" rx="3.5" ry="5.5" fill="#fbbf24" stroke="#d97706" stroke-width="0.8" opacity="0.85"/></g><g transform="scale(-1,1) rotate(20)"><ellipse cx="-4" cy="4" rx="3.5" ry="5.5" fill="#fbbf24" stroke="#d97706" stroke-width="0.8" opacity="0.85"/></g><ellipse cx="0" cy="0" rx="1" ry="6" fill="#92400e"/><line x1="0" y1="-6" x2="-3" y2="-10" stroke="#92400e" stroke-width="0.8" stroke-linecap="round"/><line x1="0" y1="-6" x2="3" y2="-10" stroke="#92400e" stroke-width="0.8" stroke-linecap="round"/><circle cx="-3" cy="-10.5" r="0.8" fill="#92400e"/><circle cx="3" cy="-10.5" r="0.8" fill="#92400e"/></g></svg>`;
/**
 * Inject a gradient border overlay and butterfly favicon to indicate agent-controlled browsing.
 * Idempotent — safe to call multiple times on the same page.
 */
async function injectAgentOverlay(page) {
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
    }
    catch {
        // Silently ignore — page might not be ready or is a special page (chrome://, about:blank)
    }
}
