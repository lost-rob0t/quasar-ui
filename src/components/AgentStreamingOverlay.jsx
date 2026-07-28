import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import {
  getActiveConversationId,
  hydrateConversationState,
  loadConversationStreams,
  saveConversationStreams
} from "../lib/agent-conversations";
import { PROVIDER_STREAM_EVENT } from "../lib/provider-adapters";

export default function AgentStreamingOverlay() {
  const [streams, setStreams] = useState(loadConversationStreams);
  const [timeline, setTimeline] = useState(null);

  useEffect(() => {
    let active = true;
    hydrateConversationState().then(() => {
      if (active) setStreams(loadConversationStreams());
    });
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    const listener = (event) => {
      const payload = event.detail || {};
      setStreams((current) => {
        const previous = current.find((stream) => stream.id === payload.streamId) || {
          id: payload.streamId,
          conversationId: getActiveConversationId() || null,
          provider: payload.provider,
          model: payload.model || null,
          text: "",
          status: "streaming",
          startedAt: payload.at
        };
        const next = {
          ...previous,
          text: payload.type === "delta" ? `${previous.text}${payload.text || ""}` : previous.text,
          status: payload.type === "complete" ? "completed" : payload.type === "error" ? "failed" : previous.status,
          error: payload.error || previous.error,
          updatedAt: payload.at
        };
        const result = [next, ...current.filter((stream) => stream.id !== next.id)].slice(0, 8);
        saveConversationStreams(result.filter((stream) => stream.status === "streaming" || stream.status === "failed"));
        return result;
      });
      if (payload.type === "start" && !document.querySelector(".agent-chat-modal")) document.querySelector(".agent-chat-bubble")?.click();
      if (payload.type === "complete") {
        setTimeout(() => setStreams((current) => current.filter((stream) => stream.id !== payload.streamId)), 800);
      }
    };
    window.addEventListener(PROVIDER_STREAM_EVENT, listener);
    return () => window.removeEventListener(PROVIDER_STREAM_EVENT, listener);
  }, []);

  useEffect(() => {
    if (!streams.length) return undefined;
    const resolveTimeline = () => setTimeline(document.querySelector(".agent-chat-timeline"));
    resolveTimeline();
    const observer = new MutationObserver(resolveTimeline);
    observer.observe(document.body, { childList: true, subtree: true });
    return () => observer.disconnect();
  }, [streams.length]);

  const activeConversationId = getActiveConversationId();
  const visible = streams.filter((stream) => !stream.conversationId || stream.conversationId === activeConversationId);
  const content = useMemo(() => visible.length ? (
    <div className="agent-streaming-slot" aria-live="polite">
      {visible.map((stream) => (
        <article className={`agent-chat-message agent-message-assistant agent-message-${stream.status}`} data-provider-stream={stream.id} key={stream.id}>
          <header>
            <strong>Agent</strong>
            <span>{stream.provider}{stream.model ? ` · ${stream.model}` : ""}</span>
            <span>{stream.status}</span>
          </header>
          <div className="agent-chat-markdown">{stream.text || (stream.status === "failed" ? stream.error?.message : "") || "…"}</div>
        </article>
      ))}
    </div>
  ) : null, [visible]);

  if (!content) return null;
  return timeline ? createPortal(content, timeline) : <div className="agent-streaming-fallback">{content}</div>;
}
