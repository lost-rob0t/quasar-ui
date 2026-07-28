const USER_NAVIGATION_GUARD_MS = 360;
const navigationStates = new WeakMap();

export function markUserNavigation(state, now = Date.now(), duration = USER_NAVIGATION_GUARD_MS) {
  if (!state) return 0;
  state.until = Math.max(state.until || 0, now + duration);
  return state.until;
}

export function isUserNavigationActive(state, now = Date.now()) {
  return Boolean(state && now < (state.until || 0));
}

export function isGraphUserNavigationActive(cy, now = Date.now()) {
  return isUserNavigationActive(navigationStates.get(cy), now);
}

export function installUserNavigationGuard(cy, duration = USER_NAVIGATION_GUARD_MS) {
  if (!cy || typeof cy.on !== "function") return () => {};

  const state = { until: 0 };
  const mark = () => markUserNavigation(state, Date.now(), duration);

  navigationStates.set(cy, state);
  cy.on("dragpan scrollzoom pinchzoom", mark);

  return () => {
    cy.off?.("dragpan scrollzoom pinchzoom", mark);
    if (navigationStates.get(cy) === state) navigationStates.delete(cy);
  };
}
