import { useEffect, useState } from "react";
import { ChevronDown, Menu } from "lucide-react";
import { useLocation } from "react-router-dom";

function isAgentDisclosure(entry) {
  return entry?.matches?.(
    ".agent-log-entry.tool, .agent-log-entry.model, .agent-log-entry.thinking, .agent-log-entry.reasoning"
  );
}

function disclosureLabel(entry) {
  const heading = entry.querySelector(":scope > strong")?.textContent?.trim();
  return entry.classList.contains("tool") ? heading || "Tool run" : "Agent thinking";
}

function prepareAgentEntry(entry) {
  if (!isAgentDisclosure(entry)) return;
  if (!entry.dataset.expanded) entry.dataset.expanded = "false";
  entry.classList.add("agent-log-collapsible");
  entry.dataset.disclosureReady = "true";
  entry.tabIndex = 0;
  entry.setAttribute("role", "button");
  entry.setAttribute("aria-expanded", entry.dataset.expanded);
  entry.setAttribute("aria-label", `${entry.dataset.expanded === "true" ? "Collapse" : "Expand"} ${disclosureLabel(entry)}`);
}

function prepareAgentEntries() {
  document
    .querySelectorAll(
      ".agent-log-entry.tool, .agent-log-entry.model, .agent-log-entry.thinking, .agent-log-entry.reasoning"
    )
    .forEach(prepareAgentEntry);
}

function toggleAgentEntry(entry) {
  const expanded = entry.dataset.expanded !== "true";
  entry.dataset.expanded = String(expanded);
  entry.setAttribute("aria-expanded", String(expanded));
  entry.setAttribute("aria-label", `${expanded ? "Collapse" : "Expand"} ${disclosureLabel(entry)}`);
}

function prepareGraphControls() {
  document.querySelectorAll(".graph-toolbar .button.small").forEach((button) => {
    if (button.textContent.trim() === "Fit") button.setAttribute("aria-label", "Fit");
  });
}

function updatePersistentSecretCopy() {
  document.querySelectorAll(".agent-editor .field > span").forEach((node) => {
    if (node.textContent.includes("set for this session")) {
      node.textContent = node.textContent.replace("set for this session", "saved on this device");
    }
  });
  document.querySelectorAll(".agent-editor .muted, .agent-editor .button-row + *").forEach((node) => {
    if (node.textContent.includes("Keys stay in this browser session")) {
      node.textContent = node.textContent.replace(
        "Keys stay in this browser session",
        "Keys stay in this browser on this device"
      );
    }
    if (node.textContent.includes("Brave key set for this session")) {
      node.textContent = node.textContent.replace(
        "Brave key set for this session",
        "Brave key saved on this device"
      );
    }
  });
}

function prepareUi() {
  prepareAgentEntries();
  prepareGraphControls();
  updatePersistentSecretCopy();
}

export default function OperatorUiEnhancer() {
  const location = useLocation();
  const graphRoute = location.pathname === "/graph";
  const [graphControlsOpen, setGraphControlsOpen] = useState(false);

  useEffect(() => setGraphControlsOpen(false), [location.pathname]);

  useEffect(() => {
    const apply = () => {
      const toolbar = document.querySelector(".graph-toolbar");
      if (toolbar) toolbar.dataset.mobileCollapsed = graphControlsOpen ? "false" : "true";
      prepareUi();
    };
    let frame = 0;
    const schedule = () => {
      if (frame) return;
      frame = requestAnimationFrame(() => {
        frame = 0;
        apply();
      });
    };
    const observer = new MutationObserver(schedule);
    observer.observe(document.body, { childList: true, subtree: true });
    schedule();
    return () => {
      observer.disconnect();
      if (frame) cancelAnimationFrame(frame);
    };
  }, [graphControlsOpen, location.pathname]);

  useEffect(() => {
    const onClick = (event) => {
      const entry = event.target.closest?.(".agent-log-entry");
      if (!isAgentDisclosure(entry) || event.target.closest("pre")) return;
      toggleAgentEntry(entry);
    };
    const onKeyDown = (event) => {
      const entry = event.target.closest?.(".agent-log-entry");
      if (!isAgentDisclosure(entry) || !["Enter", " "].includes(event.key)) return;
      event.preventDefault();
      toggleAgentEntry(entry);
    };
    document.addEventListener("click", onClick);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("click", onClick);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, []);

  if (!graphRoute) return null;
  return (
    <button
      className="icon-button graph-toolbar-mobile-toggle"
      type="button"
      aria-label="More graph controls"
      aria-expanded={graphControlsOpen}
      title="More graph controls"
      onClick={() => setGraphControlsOpen((value) => !value)}
    >
      <Menu size={17} aria-hidden="true" />
      <ChevronDown size={13} aria-hidden="true" />
    </button>
  );
}
