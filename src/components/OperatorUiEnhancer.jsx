import { useEffect, useState } from "react";
import { Focus, Maximize2, Plus, Tags } from "lucide-react";
import { createPortal } from "react-dom";
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
  entry.setAttribute(
    "aria-label",
    `${entry.dataset.expanded === "true" ? "Collapse" : "Expand"} ${disclosureLabel(entry)}`
  );
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
    const label = button.textContent.trim();
    if (label === "Fit" || label === "Focus") button.setAttribute("aria-label", label);
  });
}

function prepareRadialMenus() {
  document.querySelectorAll(".graph-context-menu").forEach((menu) => {
    const isBlankCanvasRoot = menu.classList.contains("canvas-actions")
      && Boolean(menu.querySelector(".graph-context-palette"));
    menu.classList.toggle("radial-root", isBlankCanvasRoot);
    if (!isBlankCanvasRoot || menu.dataset.radialPositioned === "true") return;

    const stage = menu.closest(".graph-stage");
    const width = 228;
    const height = 228;
    const stageWidth = stage?.clientWidth || width + 16;
    const stageHeight = stage?.clientHeight || height + 16;
    const sourceLeft = Number.parseFloat(menu.style.left || "0");
    const sourceTop = Number.parseFloat(menu.style.top || "0");
    menu.style.left = `${Math.max(8, Math.min(sourceLeft - width / 2, stageWidth - width - 8))}px`;
    menu.style.top = `${Math.max(8, Math.min(sourceTop - height / 2, stageHeight - height - 8))}px`;
    menu.dataset.radialPositioned = "true";
  });
}

function updateGraphEmptyCopy() {
  document.querySelectorAll(".graph-empty-state p").forEach((node) => {
    if (node.textContent.includes("Right-click anywhere")) {
      node.textContent = node.textContent.replace(
        "Right-click anywhere",
        "Hold or right-click the blank canvas"
      );
    }
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
  prepareRadialMenus();
  updateGraphEmptyCopy();
  updatePersistentSecretCopy();
}

function clickToolbarButton(label) {
  const button = [...document.querySelectorAll(".graph-toolbar .button.small")]
    .find((candidate) => candidate.textContent.trim() === label);
  button?.click();
}

function clickHeadingButton(label) {
  const button = [...document.querySelectorAll(".graph-heading-actions button")]
    .find((candidate) => candidate.textContent.trim() === label);
  button?.click();
}

function labelsInput() {
  return [...document.querySelectorAll(".graph-toolbar .checkbox input")]
    .find((input) => input.closest("label")?.textContent.includes("Labels"));
}

export default function OperatorUiEnhancer() {
  const location = useLocation();
  const graphRoute = location.pathname === "/graph";
  const [graphStage, setGraphStage] = useState(null);
  const [labelsOn, setLabelsOn] = useState(true);
  const [focusDisabled, setFocusDisabled] = useState(true);

  useEffect(() => {
    const apply = () => {
      prepareUi();
      const nextStage = graphRoute ? document.querySelector(".graph-stage") : null;
      setGraphStage((current) => current === nextStage ? current : nextStage);
      const focus = [...document.querySelectorAll(".graph-toolbar .button.small")]
        .find((button) => button.textContent.trim() === "Focus");
      setFocusDisabled(Boolean(focus?.disabled));
      const input = labelsInput();
      if (input) setLabelsOn(input.checked);
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
    observer.observe(document.body, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ["disabled"]
    });
    schedule();
    return () => {
      observer.disconnect();
      if (frame) cancelAnimationFrame(frame);
    };
  }, [graphRoute, location.pathname]);

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

  if (!graphRoute || !graphStage) return null;
  return createPortal(
    <div className="graph-canvas-actions" aria-label="Graph actions">
      <button type="button" className="graph-canvas-action" aria-label="Add graph document" title="Add graph document" onClick={() => clickHeadingButton("Add graph document")}>
        <Plus size={18} aria-hidden="true" />
      </button>
      <button type="button" className="graph-canvas-action" aria-label="Fit graph" title="Fit graph" onClick={() => clickToolbarButton("Fit")}>
        <Maximize2 size={18} aria-hidden="true" />
      </button>
      <button type="button" className="graph-canvas-action" aria-label="Focus selection" title="Focus selection" disabled={focusDisabled} onClick={() => clickToolbarButton("Focus")}>
        <Focus size={18} aria-hidden="true" />
      </button>
      <button
        type="button"
        className="graph-canvas-action"
        aria-label="Toggle labels"
        title="Toggle labels"
        aria-pressed={labelsOn}
        onClick={() => {
          const input = labelsInput();
          input?.click();
          requestAnimationFrame(() => setLabelsOn(Boolean(labelsInput()?.checked)));
        }}
      >
        <Tags size={18} aria-hidden="true" />
      </button>
    </div>,
    graphStage
  );
}
