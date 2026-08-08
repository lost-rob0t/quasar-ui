const ICON_STROKE = "#f8fafc";

// prettier-ignore
const ICON_PATHS = Object.freeze({
  actor: '<rect x="5" y="7" width="14" height="11" rx="2"/><path d="M9 7V5h6v2M8 12h.01M16 12h.01M9 16h6"/>',
  address: '<path d="M20 10c0 5-8 11-8 11S4 15 4 10a8 8 0 1 1 16 0Z"/><circle cx="12" cy="10" r="2.5"/>',
  alert: '<path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 7h18s-3 0-3-7M10 19h4"/>',
  analysis: '<path d="M4 19V5M4 19h16M7 15l4-4 3 2 5-6"/>',
  asset: '<circle cx="8" cy="15" r="4"/><path d="m11 12 8-8M15 4h4v4"/>',
  breach: '<path d="M12 3 5 6v5c0 5 3.5 8 7 10 3.5-2 7-5 7-10V6l-7-3Z"/><path d="m9 9 6 6M15 9l-6 6"/>',
  finance: '<rect x="3" y="6" width="18" height="12" rx="2"/><circle cx="12" cy="12" r="2.5"/><path d="M7 9H6M18 15h-1"/>',
  claim: '<path d="M6 9h5v5H7l-2 2v-5a2 2 0 0 1 1-2ZM13 7h5a2 2 0 0 1 2 2v5l-2-2h-5Z"/>',
  concept: '<path d="M9 18h6M10 22h4M8.5 14.5A6 6 0 1 1 15.5 14.5C14.5 15.5 14 16 14 18h-4c0-2-.5-2.5-1.5-3.5Z"/>',
  contract: '<path d="M6 3h9l3 3v15H6Z"/><path d="M15 3v4h4M9 12h6M9 16h4"/>',
  database: '<ellipse cx="12" cy="5" rx="7" ry="3"/><path d="M5 5v6c0 1.7 3.1 3 7 3s7-1.3 7-3V5M5 11v6c0 1.7 3.1 3 7 3s7-1.3 7-3v-6"/>',
  document: '<path d="M6 3h8l4 4v14H6Z"/><path d="M14 3v5h5M9 13h6M9 17h6"/>',
  domain: '<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3c3 3 3 15 0 18M12 3c-3 3-3 15 0 18"/>',
  education: '<path d="m3 9 9-5 9 5-9 5Z"/><path d="M7 12v4c3 2 7 2 10 0v-4M21 9v6"/>',
  email: '<rect x="3" y="5" width="18" height="14" rx="2"/><path d="m4 7 8 6 8-6"/>',
  emailMessage: '<path d="M4 6h16v12H4Z"/><path d="m4 8 8 5 8-5M8 4h8"/>',
  employment: '<rect x="3" y="7" width="18" height="12" rx="2"/><path d="M9 7V5h6v2M3 12h18M10 12v2h4v-2"/>',
  entity: '<circle cx="12" cy="12" r="8"/><circle cx="12" cy="12" r="2"/>',
  event: '<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M8 3v4M16 3v4M3 10h18M8 14h.01M12 14h.01M16 14h.01"/>',
  evidence: '<rect x="5" y="4" width="14" height="17" rx="2"/><path d="M9 4V2h6v2M8 12l2 2 5-5M8 18h8"/>',
  file: '<path d="M3 6h7l2 2h9v11H3Z"/>',
  financial: '<path d="M3 10h18M5 10v8M9 10v8M15 10v8M19 10v8M3 18h18M12 3l9 5H3Z"/>',
  geo: '<path d="M3 6l6-3 6 3 6-3v15l-6 3-6-3-6 3Z"/><path d="M9 3v15M15 6v15"/>',
  grant: '<circle cx="12" cy="8" r="5"/><path d="m9 13-2 8 5-3 5 3-2-8"/>',
  host: '<rect x="4" y="4" width="16" height="6" rx="1"/><rect x="4" y="14" width="16" height="6" rx="1"/><path d="M8 7h.01M8 17h.01M12 7h5M12 17h5"/>',
  target: '<circle cx="12" cy="12" r="8"/><circle cx="12" cy="12" r="4"/><path d="M12 2v4M12 18v4M2 12h4M18 12h4"/>',
  legal: '<path d="M12 3v18M5 7h14M7 7l-4 7h8L7 7ZM17 7l-4 7h8l-4-7ZM8 21h8"/>',
  lobbying: '<path d="m3 11 13-5v12L3 13Z"/><path d="M16 9h2a3 3 0 0 1 0 6h-2M6 14l2 6h3l-2-7"/>',
  media: '<rect x="3" y="4" width="18" height="16" rx="2"/><circle cx="9" cy="9" r="2"/><path d="m4 18 5-5 3 3 3-3 5 5"/>',
  meeting: '<circle cx="8" cy="8" r="3"/><circle cx="16" cy="8" r="3"/><path d="M2 20c0-4 2-6 6-6s6 2 6 6M12 20c0-3 1.5-5 4-5 3 0 5 2 5 5"/>',
  message: '<path d="M4 5h16v12H9l-5 4Z"/><path d="M8 9h8M8 13h5"/>',
  network: '<circle cx="5" cy="12" r="2.5"/><circle cx="19" cy="5" r="2.5"/><circle cx="19" cy="19" r="2.5"/><path d="m7 11 9-5M7 13l9 5"/>',
  observation: '<path d="M2 12s4-6 10-6 10 6 10 6-4 6-10 6S2 12 2 12Z"/><circle cx="12" cy="12" r="3"/>',
  org: '<path d="M4 21V6l8-3 8 3v15M8 9h2M14 9h2M8 13h2M14 13h2M10 21v-4h4v4"/>',
  ownership: '<circle cx="12" cy="12" r="9"/><path d="M12 3v9h9M12 12l-6.5 6.2"/>',
  person: '<circle cx="12" cy="8" r="4"/><path d="M4 21c0-5 3-8 8-8s8 3 8 8"/>',
  phone: '<path d="M6 3h4l2 5-3 2c1.5 3 3 4.5 6 6l2-3 5 2v4c0 2-2 3-4 3C10 21 3 14 3 6c0-2 1-3 3-3Z"/>',
  policy: '<path d="M6 3h12v18H6Z"/><path d="M9 7h6M9 11h6M9 15h4"/>',
  procurement: '<circle cx="9" cy="20" r="1.5"/><circle cx="18" cy="20" r="1.5"/><path d="M2 3h3l2.5 11h10L20 7H6"/>',
  product: '<path d="m12 3 8 4-8 4-8-4 8-4Z"/><path d="m4 7 8 4 8-4v10l-8 4-8-4Z"/><path d="M12 11v10"/>',
  relation: '<path d="M10 13a5 5 0 0 0 7.5.5l2-2a5 5 0 0 0-7-7l-1 1M14 11a5 5 0 0 0-7.5-.5l-2 2a5 5 0 0 0 7 7l1-1"/>',
  research: '<circle cx="10" cy="10" r="6"/><path d="m15 15 6 6M7 10h6M10 7v6"/>',
  route: '<circle cx="5" cy="5" r="2"/><circle cx="19" cy="19" r="2"/><path d="M7 5h4a3 3 0 0 1 0 6H9a3 3 0 0 0 0 6h8"/>',
  social: '<circle cx="12" cy="12" r="8"/><path d="M16 12v2a4 4 0 1 1-1.2-2.8V8"/>',
  source: '<path d="M4 5h7a4 4 0 0 1 4 4v10H8a4 4 0 0 0-4 2ZM20 5h-7a4 4 0 0 0-4 4v10h7a4 4 0 0 1 4 2Z"/>',
  task: '<rect x="4" y="3" width="16" height="18" rx="2"/><path d="m8 9 2 2 4-4M8 16h8"/>',
  url: '<path d="M14 4h6v6M20 4l-9 9"/><path d="M10 6H5a2 2 0 0 0-2 2v11a2 2 0 0 0 2 2h11a2 2 0 0 0 2-2v-5"/>',
  user: '<circle cx="12" cy="12" r="9"/><circle cx="12" cy="9" r="3"/><path d="M6.5 18c1.5-3 3.5-4 5.5-4s4 1 5.5 4"/>',
  unresolved: '<circle cx="12" cy="12" r="9"/><path d="M9.5 9a2.5 2.5 0 1 1 4 2c-1 .7-1.5 1.2-1.5 2.5M12 17h.01"/>'
});

export const DTYPE_ICON_KEYS = Object.freeze({
  "actor-manifest": "actor",
  address: "address",
  alert: "alert",
  analysis: "analysis",
  asset: "asset",
  breach: "breach",
  "campaign-finance": "finance",
  claim: "claim",
  concept: "concept",
  contract: "contract",
  "dataset-manifest": "database",
  document: "document",
  domain: "domain",
  education: "education",
  email: "email",
  "email-message": "emailMessage",
  employment: "employment",
  entity: "entity",
  event: "event",
  "evidence-record": "evidence",
  file: "file",
  "financial-observation": "financial",
  geo: "geo",
  grant: "grant",
  host: "host",
  "investigation-target": "target",
  "legal-case": "legal",
  "lobbying-filing": "lobbying",
  location: "address",
  media: "media",
  meeting: "meeting",
  message: "message",
  network: "network",
  observation: "observation",
  org: "org",
  ownership: "ownership",
  person: "person",
  phone: "phone",
  policy: "policy",
  procurement: "procurement",
  product: "product",
  relation: "relation",
  "research-node": "research",
  "research-pass": "route",
  "social-media-post": "social",
  source: "source",
  target: "target",
  task: "task",
  url: "url",
  user: "user"
});

function svgDataUri(inner) {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="${ICON_STROKE}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${inner}</svg>`;
  return `data:image/svg+xml,${encodeURIComponent(svg)}`;
}

const ICONS = Object.freeze(
  Object.fromEntries(Object.entries(ICON_PATHS).map(([name, paths]) => [name, svgDataUri(paths)]))
);

export function documentTypeIcon(dtype) {
  const normalized = String(dtype || "document")
    .trim()
    .toLowerCase()
    .replaceAll("_", "-")
    .replaceAll(" ", "-");
  return ICONS[DTYPE_ICON_KEYS[normalized] || "document"];
}

export const UNRESOLVED_GRAPH_ICON = ICONS.unresolved;
