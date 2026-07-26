import { Check, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";

function findSelect(label) {
  return document.querySelector(`select[aria-label="${label}"]`);
}

export function readSelectOptions(select) {
  if (!select) return [];
  return [...select.options].map((option, index) => ({
    value: option.value,
    label: option.textContent?.trim() || option.value,
    disabled: option.disabled,
    selected: option.selected,
    index
  }));
}

export function setSelectValue(select, value) {
  if (!select) return false;
  const option = [...select.options].find((candidate) => candidate.value === value);
  if (!option || option.disabled) return false;

  const setter = Object.getOwnPropertyDescriptor(window.HTMLSelectElement.prototype, "value")?.set;
  if (setter) setter.call(select, value);
  else select.value = value;
  select.dispatchEvent(new Event("input", { bubbles: true }));
  select.dispatchEvent(new Event("change", { bubbles: true }));
  return true;
}

export default function GraphSelectMenu({
  open,
  selectLabel,
  title,
  listLabel,
  onClose
}) {
  const listRef = useRef(null);
  const [options, setOptions] = useState([]);

  useEffect(() => {
    if (!open) return undefined;
    const select = findSelect(selectLabel);
    const sync = () => setOptions(readSelectOptions(findSelect(selectLabel)));
    sync();

    const observer = new MutationObserver(sync);
    if (select) {
      observer.observe(select, {
        childList: true,
        subtree: true,
        attributes: true,
        attributeFilter: ["disabled", "selected", "value"]
      });
    }
    document.addEventListener("change", sync);
    const onKeyDown = (event) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKeyDown);

    return () => {
      observer.disconnect();
      document.removeEventListener("change", sync);
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [open, onClose, selectLabel]);

  useEffect(() => {
    if (!open || !options.length) return;
    const frame = requestAnimationFrame(() => {
      const selected = listRef.current?.querySelector('[role="option"][aria-selected="true"]');
      const first = listRef.current?.querySelector('[role="option"]');
      (selected || first)?.focus();
    });
    return () => cancelAnimationFrame(frame);
  }, [open, options.length]);

  if (!open) return null;

  const moveFocus = (event) => {
    if (!["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) return;
    const buttons = [...(listRef.current?.querySelectorAll('[role="option"]') || [])]
      .filter((button) => !button.disabled);
    if (!buttons.length) return;
    event.preventDefault();
    const current = Math.max(0, buttons.indexOf(document.activeElement));
    const next = event.key === "Home"
      ? 0
      : event.key === "End"
        ? buttons.length - 1
        : (current + (event.key === "ArrowDown" ? 1 : -1) + buttons.length) % buttons.length;
    buttons[next]?.focus();
  };

  return (
    <>
      <button
        type="button"
        className="graph-select-backdrop"
        aria-label={`Close ${title.toLowerCase()} picker`}
        onClick={onClose}
      />
      <section className="graph-select-picker" role="dialog" aria-modal="true" aria-label={`Select ${title.toLowerCase()}`}>
        <header className="graph-select-picker-header">
          <strong>{title}</strong>
          <button type="button" aria-label={`Close ${title.toLowerCase()} picker`} onClick={onClose}>
            <X size={18} aria-hidden="true" />
          </button>
        </header>
        <div
          ref={listRef}
          className="graph-select-options"
          role="listbox"
          aria-label={listLabel}
          onKeyDown={moveFocus}
        >
          {options.map((option) => (
            <button
              key={`${option.value}:${option.index}`}
              type="button"
              className="graph-select-option"
              role="option"
              aria-selected={option.selected}
              disabled={option.disabled}
              onClick={() => {
                if (setSelectValue(findSelect(selectLabel), option.value)) onClose();
              }}
            >
              <span>{option.label}</span>
              {option.selected && <Check size={17} aria-hidden="true" />}
            </button>
          ))}
          {!options.length && <p className="muted">No options.</p>}
        </div>
      </section>
    </>
  );
}
