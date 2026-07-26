from pathlib import Path


def replace_once(source: str, old: str, new: str, label: str) -> str:
    if old not in source:
        raise SystemExit(f"{label} not found")
    return source.replace(old, new, 1)


operator = Path("src/components/OperatorUiEnhancer.jsx")
source = operator.read_text()
source = replace_once(
    source,
    'import { createPortal } from "react-dom";\n',
    'import { createPortal } from "react-dom";\nimport GraphSelectMenu from "./GraphSelectMenu.jsx";\n',
    "operator import",
)
source = replace_once(
    source,
    '  const [datasetLabel, setDatasetLabel] = useState("All datasets");\n',
    '  const [datasetLabel, setDatasetLabel] = useState("All datasets");\n  const [datasetOpen, setDatasetOpen] = useState(false);\n',
    "operator dataset state",
)
source = replace_once(
    source,
    '      if (event.key === "Escape") setSearchOpen(false);',
    '      if (event.key === "Escape") {\n        setSearchOpen(false);\n        setDatasetOpen(false);\n      }',
    "operator escape handler",
)
source = replace_once(
    source,
    '          onClick={() => setSearchOpen((value) => !value)}',
    '          onClick={() => {\n            setDatasetOpen(false);\n            setSearchOpen((value) => !value);\n          }}',
    "operator search toggle",
)
old_dataset = '''        <button
          type="button"
          className="graph-canvas-action"
          aria-label="Cycle dataset"
          title={`Dataset: ${datasetLabel}. Tap for next; right-click for previous.`}
          onClick={() => cycleControl(selectControl("Dataset filter"), 1)}
          onContextMenu={(event) => {
            event.preventDefault();
            cycleControl(selectControl("Dataset filter"), -1);
          }}
        >
          <Database size={18} aria-hidden="true" />
          <span>{shortLabel(datasetLabel, "Dataset")}</span>
        </button>'''
new_dataset = '''        <button
          type="button"
          className="graph-canvas-action"
          aria-label="Select dataset"
          title={`Dataset: ${datasetLabel}. Choose dataset.`}
          aria-haspopup="listbox"
          aria-expanded={datasetOpen}
          onClick={() => {
            setSearchOpen(false);
            setDatasetOpen((value) => !value);
          }}
        >
          <Database size={18} aria-hidden="true" />
          <span>{shortLabel(datasetLabel, "Dataset")}</span>
        </button>'''
source = replace_once(source, old_dataset, new_dataset, "desktop dataset button")
source = replace_once(
    source,
    '''      </div>

      {searchOpen && (''',
    '''      </div>

      <GraphSelectMenu
        open={datasetOpen}
        selectLabel="Dataset filter"
        title="Dataset"
        listLabel="Datasets"
        onClose={() => setDatasetOpen(false)}
      />

      {searchOpen && (''',
    "desktop picker mount",
)
operator.write_text(source)

mobile = Path("src/components/MobileGraphToolTray.jsx")
source = mobile.read_text()
source = replace_once(
    source,
    'import { createPortal } from "react-dom";\n',
    'import { createPortal } from "react-dom";\nimport GraphSelectMenu from "./GraphSelectMenu.jsx";\n',
    "mobile import",
)
source = replace_once(
    source,
    '  const [open, setOpen] = useState(false);\n',
    '  const [open, setOpen] = useState(false);\n  const [datasetOpen, setDatasetOpen] = useState(false);\n',
    "mobile dataset state",
)
source = replace_once(
    source,
    '      setOpen(false);\n      return undefined;',
    '      setOpen(false);\n      setDatasetOpen(false);\n      return undefined;',
    "mobile route reset",
)
source = replace_once(
    source,
    '''  useEffect(() => {
    if (!open) return undefined;
    const close = (event) => event.key === "Escape" && setOpen(false);
    window.addEventListener("keydown", close);
    return () => window.removeEventListener("keydown", close);
  }, [open]);''',
    '''  useEffect(() => {
    if (!open && !datasetOpen) return undefined;
    const close = (event) => {
      if (event.key !== "Escape") return;
      setOpen(false);
      setDatasetOpen(false);
    };
    window.addEventListener("keydown", close);
    return () => window.removeEventListener("keydown", close);
  }, [datasetOpen, open]);''',
    "mobile escape handler",
)
source = replace_once(
    source,
    '''            <ToolButton
              label="Dataset"
              Icon={Database}
              onClick={() => run(() => cycleControl(selectControl("Dataset filter")))}
            />''',
    '''            <ToolButton
              label="Dataset"
              Icon={Database}
              onClick={() => {
                setOpen(false);
                setDatasetOpen(true);
              }}
            />''',
    "mobile dataset tool",
)
source = replace_once(
    source,
    '''        </>
      )}
    </>,''',
    '''        </>
      )}
      <GraphSelectMenu
        open={datasetOpen}
        selectLabel="Dataset filter"
        title="Dataset"
        listLabel="Datasets"
        onClose={() => setDatasetOpen(false)}
      />
    </>,''',
    "mobile picker mount",
)
mobile.write_text(source)

for path in [Path("e2e/application.spec.ts"), Path("e2e/mobile-fit-agent-disclosure.spec.ts")]:
    path.write_text(path.read_text().replace('name: "Cycle dataset"', 'name: "Select dataset"'))

css = Path("src/operator-ui.css")
css.write_text(
    css.read_text()
    + '''

.graph-select-backdrop {
  position: absolute;
  inset: 0;
  z-index: 183;
  display: block;
  width: 100%;
  height: 100%;
  padding: 0;
  border: 0;
  background: #0004;
  backdrop-filter: blur(1px);
}

.graph-select-picker {
  position: absolute;
  top: .7rem;
  left: 6.75rem;
  z-index: 184;
  display: grid;
  width: min(340px, calc(100% - 7.45rem));
  max-height: min(70dvh, 560px);
  overflow: hidden;
  border: 1px solid color-mix(in srgb, var(--line) 78%, var(--accent));
  border-radius: 14px;
  background: color-mix(in srgb, var(--panel) 97%, transparent);
  box-shadow: 0 18px 48px #000c;
  backdrop-filter: blur(16px);
}

.graph-select-picker-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: .75rem;
  min-height: 46px;
  padding: .55rem .65rem .55rem .8rem;
  border-bottom: 1px solid var(--line);
}

.graph-select-picker-header strong {
  font-size: .8rem;
  letter-spacing: .03em;
}

.graph-select-picker-header button {
  display: grid;
  place-items: center;
  width: 32px;
  height: 32px;
  padding: 0;
  border: 0;
  border-radius: 8px;
  background: transparent;
  color: var(--muted);
}

.graph-select-picker-header button:hover,
.graph-select-picker-header button:focus-visible {
  outline: none;
  background: var(--panel-2);
  color: var(--text);
}

.graph-select-options {
  display: grid;
  gap: .35rem;
  padding: .55rem;
  overflow: auto;
  overscroll-behavior: contain;
}

.graph-select-option {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 18px;
  align-items: center;
  gap: .6rem;
  width: 100%;
  min-height: 44px;
  padding: .55rem .65rem;
  border: 1px solid var(--line);
  border-radius: 10px;
  background: var(--panel-2);
  color: var(--text);
  text-align: left;
}

.graph-select-option > span {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.graph-select-option:hover,
.graph-select-option:focus-visible,
.graph-select-option[aria-selected="true"] {
  outline: none;
  border-color: var(--accent);
  background: color-mix(in srgb, var(--panel-2) 72%, var(--accent));
}

.graph-select-option:disabled {
  opacity: .4;
}

@media (max-width: 850px) {
  .graph-select-picker {
    top: 4.15rem;
    left: .55rem;
    width: calc(100% - 1.1rem);
    max-height: calc(100dvh - 4.7rem);
  }
}
'''
)
