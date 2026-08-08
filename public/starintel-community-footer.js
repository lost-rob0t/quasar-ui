(() => {
  "use strict";

  const FOOTER_ID = "starintel-community-footer";
  const MOBILE_LINK_ID = "starintel-community-mobile-link";
  const INVITE_URL = "https://discord.gg/R3VY8wr86Y";
  const CHAT_ICON = `
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M7 8.5h10a3 3 0 0 1 3 3v3a3 3 0 0 1-3 3h-4l-3.5 2.5v-2.5H7a3 3 0 0 1-3-3v-3a3 3 0 0 1 3-3Z" />
      <path d="M9 13h.01M15 13h.01" />
    </svg>
  `;

  function createAction(label) {
    const link = document.createElement("a");
    link.className = "starintel-community-footer__action";
    link.href = INVITE_URL;
    link.target = "_blank";
    link.rel = "noopener noreferrer";
    link.innerHTML = `${CHAT_ICON}<span>${label}</span>` + '<span aria-hidden="true">↗</span>';
    return link;
  }

  function createIdentity() {
    const identity = document.createElement("div");
    identity.className = "starintel-community-footer__identity";
    identity.innerHTML = `
      <span class="starintel-community-footer__mark" aria-hidden="true">✦</span>
      <span class="starintel-community-footer__copy">
        <strong>StarIntel Community</strong>
        <span>Research, actors, datasets, and development.</span>
      </span>
    `;
    return identity;
  }

  function createFooter(compact = false) {
    const footer = document.createElement("footer");
    const inner = document.createElement("div");

    footer.id = FOOTER_ID;
    footer.className = "starintel-community-footer";
    footer.setAttribute("aria-label", "StarIntel community");
    inner.className = "starintel-community-footer__inner";

    if (!compact) inner.append(createIdentity());
    inner.append(createAction("Join Discord"));
    footer.append(inner);

    if (compact) footer.classList.add("starintel-community-footer--sidebar");
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

    if (mobileNav && !document.getElementById(MOBILE_LINK_ID)) {
      mobileNav.append(createMobileLink());
    }
  }

  function mountPageFooter() {
    let footer = document.getElementById(FOOTER_ID);
    if (!footer) footer = createFooter();

    footer.classList.remove("starintel-community-footer--sidebar");
    if (footer.parentElement !== document.body || footer !== document.body.lastElementChild) {
      document.body.append(footer);
    }
  }

  function reconcile() {
    if (!document.body) return;

    if (document.querySelector(".app-shell")) {
      mountApplicationUi();
      return;
    }

    mountPageFooter();
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
