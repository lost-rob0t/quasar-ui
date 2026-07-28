const USER_NAVIGATION_GUARD_MS = 360;

export function markUserNavigation(state, now = Date.now(), duration = USER_NAVIGATION_GUARD_MS) {
  if (!state) return 0;
  state.until = Math.max(state.until || 0, now + duration);
  return state.until;
}

export function isUserNavigationActive(state, now = Date.now()) {
  return Boolean(state && now < (state.until || 0));
}

export function installUserNavigationGuard(cy, duration = USER_NAVIGATION_GUARD_MS) {
  if (!cy || typeof cy.panBy !== "function") return () => {};

  const state = { until: 0 };
  const nativePanBy = cy.panBy.bind(cy);
  const mark = () => markUserNavigation(state, Date.now(), duration);

  cy.on("dragpan scrollzoom pinchzoom", mark);
  cy.panBy = (...args) => (
    isUserNavigationActive(state) ? cy : nativePanBy(...args)
  );

  return () => {
    cy.off?.("dragpan scrollzoom pinchzoom", mark);
    cy.panBy = nativePanBy;
  };
}
