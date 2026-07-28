import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { ShieldCheck } from "lucide-react";
import {
  resolveRuntimeToolPermission,
  subscribeRuntimeToolPermissions
} from "../lib/agent-permission-broker";

function stringify(value) {
  if (typeof value === "string") return value;
  try { return JSON.stringify(value, null, 2); } catch { return String(value); }
}

function PermissionCard({ request }) {
  const actions = [
    ["allow-action", "Allow action", "primary"],
    ["allow-chat", "Allow chat", ""],
    ["allow-session", "Allow session", ""],
    ["always-allow", "Always allow", ""],
    ["deny", "Deny", "danger"],
    ["always-deny", "Always deny", "danger"]
  ];
  return (
    <article className={`agent-permission-card agent-runtime-permission-card permission-${request.risk || "medium"}`} data-permission-request={request.id}>
      <header>
        <ShieldCheck size={17} />
        <strong>{request.permission}</strong>
        <span>{request.risk || "medium"} risk</span>
      </header>
      <p>{request.reason}</p>
      {request.target && <p><b>Target:</b> {stringify(request.target)}</p>}
      {request.sideEffects?.length > 0 && <p><b>Side effects:</b> {request.sideEffects.join("; ")}</p>}
      {request.arguments && (
        <details>
          <summary>Proposed arguments</summary>
          <pre>{stringify(request.arguments)}</pre>
        </details>
      )}
      <div className="agent-permission-actions">
        {actions.map(([choice, label, className]) => (
          <button
            className={`button ${className}`.trim()}
            key={choice}
            type="button"
            onClick={() => resolveRuntimeToolPermission(request.id, choice)}
          >
            {label}
          </button>
        ))}
      </div>
    </article>
  );
}

export default function AgentPermissionOverlay() {
  const [requests, setRequests] = useState([]);
  const [timeline, setTimeline] = useState(null);

  useEffect(() => subscribeRuntimeToolPermissions(({ type, request }) => {
    setRequests((current) => type === "request"
      ? [request, ...current.filter((candidate) => candidate.id !== request.id)]
      : current.filter((candidate) => candidate.id !== request.id));
  }), []);

  useEffect(() => {
    if (!requests.length) return undefined;
    if (!document.querySelector(".agent-chat-modal")) document.querySelector(".agent-chat-bubble")?.click();
    const resolveTimeline = () => setTimeline(document.querySelector(".agent-chat-timeline"));
    resolveTimeline();
    const observer = new MutationObserver(resolveTimeline);
    observer.observe(document.body, { childList: true, subtree: true });
    return () => observer.disconnect();
  }, [requests.length]);

  const content = useMemo(() => requests.length ? (
    <div className="agent-runtime-permission-slot" aria-live="assertive">
      {requests.map((request) => <PermissionCard request={request} key={request.id} />)}
    </div>
  ) : null, [requests]);

  if (!content) return null;
  return timeline ? createPortal(content, timeline) : <div className="agent-runtime-permission-fallback">{content}</div>;
}
