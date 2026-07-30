(() => {
  "use strict";
  const FOOTER_ID = "starintel-community-footer";
  const MOBILE_LINK_ID = "starintel-community-mobile-link";
  const STYLE_ID = "starintel-community-footer-styles";
  const INVITE_URL = "https://discord.gg/R3VY8wr86Y";
  const CHAT_ICON = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 8.5h10a3 3 0 0 1 3 3v3a3 3 0 0 1-3 3h-4l-3.5 2.5v-2.5H7a3 3 0 0 1-3-3v-3a3 3 0 0 1 3-3Z"/><path d="M9 13h.01M15 13h.01"/></svg>';
  function installStyles() {
    if (document.getElementById(STYLE_ID)) return;
    const style = document.createElement("style");
    style.id = STYLE_ID;
    style.textContent = `.starintel-community-footer { position: relative; isolation: isolate; width: 100%; padding: 1.1rem clamp(1rem, 3vw, 2.5rem) calc(1.1rem + env(safe-area-inset-bottom)); overflow: hidden; border-top: 1px solid var(--line, #29415e); background: var(--panel, #0b192a); background: radial-gradient(circle at 85% 0%, color-mix(in srgb, var(--accent, #38bdf8) 18%, transparent), transparent 32rem), linear-gradient(145deg, color-mix(in srgb, var(--panel, #0b192a) 94%, #000), var(--bg, #06101d)); color: var(--text, #dbe7f4); } .starintel-community-footer::before { position: absolute; inset: 0 auto 0 0; width: 3px; content: ""; background: var(--accent, #38bdf8); box-shadow: 0 0 24px color-mix(in srgb, var(--accent, #38bdf8) 65%, transparent); } .starintel-community-footer__inner { display: flex; align-items: center; justify-content: space-between; gap: 1.25rem; width: min(1500px, 100%); margin: 0 auto; } .starintel-community-footer__identity { display: flex; align-items: center; gap: 0.8rem; min-width: 0; } .starintel-community-footer__mark { display: grid; flex: 0 0 auto; place-items: center; width: 2.45rem; height: 2.45rem; border: 1px solid color-mix(in srgb, var(--accent, #38bdf8) 72%, var(--line, #29415e)); border-radius: 0.7rem; background: color-mix(in srgb, var(--accent, #38bdf8) 14%, var(--panel, #0b192a)); color: var(--accent, #38bdf8); font-weight: 900; box-shadow: 0 0 28px color-mix(in srgb, var(--accent, #38bdf8) 17%, transparent); } .starintel-community-footer__copy { min-width: 0; } .starintel-community-footer__copy strong, .starintel-community-footer__copy span { display: block; } .starintel-community-footer__copy strong { color: var(--text-strong, var(--white, #f8fafc)); font-size: 0.94rem; letter-spacing: 0.01em; } .starintel-community-footer__copy span { margin-top: 0.2rem; color: var(--muted, #8fa5bc); font-size: 0.78rem; line-height: 1.45; } .starintel-community-footer__action { display: inline-flex; flex: 0 0 auto; align-items: center; justify-content: center; gap: 0.5rem; min-height: 2.55rem; padding: 0.62rem 0.9rem; border: 1px solid color-mix(in srgb, var(--accent, #38bdf8) 78%, var(--line, #29415e)); border-radius: 0.7rem; background: color-mix(in srgb, var(--accent, #38bdf8) 15%, var(--panel, #0b192a)); color: var(--text-strong, var(--white, #f8fafc)); font-size: 0.84rem; font-weight: 800; text-decoration: none; box-shadow: 0 8px 28px color-mix(in srgb, var(--accent, #38bdf8) 10%, transparent); transition: transform 150ms ease, border-color 150ms ease, background 150ms ease; } .starintel-community-footer__action:hover { border-color: var(--accent, #38bdf8); background: color-mix(in srgb, var(--accent, #38bdf8) 24%, var(--panel, #0b192a)); color: var(--text-strong, var(--white, #f8fafc)); transform: translateY(-1px); } .starintel-community-footer__action:focus-visible, .starintel-community-mobile-link:focus-visible { outline: 3px solid color-mix(in srgb, var(--accent, #38bdf8) 38%, transparent); outline-offset: 3px; } .starintel-community-footer__action svg, .starintel-community-mobile-link svg { width: 1rem; height: 1rem; fill: none; stroke: currentColor; stroke-linecap: round; stroke-linejoin: round; stroke-width: 2; } .starintel-community-footer--sidebar { padding: 0.15rem 0 0; overflow: visible; border: 0; background: transparent; } .starintel-community-footer--sidebar::before, .starintel-community-footer--sidebar .starintel-community-footer__identity { display: none; } .starintel-community-footer--sidebar .starintel-community-footer__inner, .starintel-community-footer--sidebar .starintel-community-footer__action { width: 100%; } .starintel-community-footer--sidebar .starintel-community-footer__action { justify-content: flex-start; min-height: 2.4rem; padding: 0.52rem 0.65rem; } .starintel-community-mobile-link { color: var(--accent, #38bdf8); } .mobile-nav:has(.starintel-community-mobile-link) { grid-template-columns: repeat(6, minmax(0, 1fr)); } .starintel-community-mobile-link svg { width: 21px; height: 21px; } @media (max-width: 760px) { body:not(:has(.app-shell)) .starintel-community-footer { padding-bottom: calc(4.75rem + env(safe-area-inset-bottom)); } body:not(:has(.app-shell)) .starintel-community-footer__inner { align-items: stretch; flex-direction: column; } body:not(:has(.app-shell)) .starintel-community-footer__action { width: 100%; } } @media (prefers-reduced-motion: reduce) { .starintel-community-footer__action { transition: none; } }`;
    document.head.append(style);
  }
  function actionMarkup(label) {
    return `${CHAT_ICON}<span>${label}</span><span aria-hidden="true">↗</span>`;
  }
  function createFooter(sidebar = false) {
    const footer = document.createElement("footer");
    footer.id = FOOTER_ID;
    footer.className = `starintel-community-footer${sidebar ? " starintel-community-footer--sidebar" : ""}`;
    footer.setAttribute("aria-label", "StarIntel community");
    footer.innerHTML = `
      <div class="starintel-community-footer__inner">
        <div class="starintel-community-footer__identity">
          <span class="starintel-community-footer__mark" aria-hidden="true">✦</span>
          <span class="starintel-community-footer__copy">
            <strong>StarIntel Community</strong>
            <span>Research, actors, datasets, and development.</span>
          </span>
        </div>
        <a class="starintel-community-footer__action" href="${INVITE_URL}" target="_blank" rel="noopener noreferrer">
          ${actionMarkup("Join Discord")}
        </a>
      </div>
    `;
    return footer;
  }
  function createMobileLink() {
    const link = document.createElement("a");
    link.id = MOBILE_LINK_ID;
    link.className = "nav-link starintel-community-mobile-link";
    link.href = INVITE_URL;
    link.target = "_blank";
    link.rel = "noopener noreferrer";
    link.setAttribute("aria-label", "Join StarIntel Discord");
    link.innerHTML = `${CHAT_ICON}<span>Discord</span>`;
    return link;
  }
  function mountApplicationUi() {
    const sidebar = document.querySelector(".sidebar-foot");
    const mobileNav = document.querySelector(".mobile-nav");
    if (sidebar) {
      let footer = document.getElementById(FOOTER_ID);
      if (!footer) footer = createFooter(true);
      footer.classList.add("starintel-community-footer--sidebar");
      if (footer.parentElement !== sidebar) sidebar.append(footer);
    }
    if (mobileNav && !document.getElementById(MOBILE_LINK_ID)) mobileNav.append(createMobileLink());
  }
  function placeStaticFooter() {
    if (!document.body) return;
    let footer = document.getElementById(FOOTER_ID);
    if (!footer) footer = createFooter(false);
    if (footer.parentElement !== document.body || footer !== document.body.lastElementChild) {
      document.body.append(footer);
    }
  }
  function reconcile() {
    installStyles();
    if (document.querySelector(".app-shell")) mountApplicationUi();
    else placeStaticFooter();
  }
  function boot() {
    reconcile();
    const observer = new MutationObserver(reconcile);
    observer.observe(document.body, { childList: true, subtree: true });
    window.addEventListener("pagehide", () => observer.disconnect(), { once: true });
  }
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot, { once: true });
  } else {
    boot();
  }
})();
