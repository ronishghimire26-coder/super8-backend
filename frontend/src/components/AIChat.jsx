import React, { useEffect, useRef, useState } from "react";
import { Sparkles, Send, Loader2 } from "lucide-react";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { API } from "../lib/api";

const SUGGESTIONS = [
  "How many rooms are vacant right now?",
  "What is today's total hotel revenue?",
  "Which bar items are below par?",
  "Did bar staff submit last night's inventory?",
];

export function AIChat() {
  const [sessionId] = useState(() => `sess-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`);
  const [messages, setMessages] = useState([
    { role: "assistant", content: "Hi! I'm your Super 8 assistant. Ask me anything about the hotel or the bar using live data." },
  ]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const scrollRef = useRef(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages]);

  async function send(text) {
    const q = (text ?? input).trim();
    if (!q || busy) return;
    setInput("");
    setMessages((m) => [...m, { role: "user", content: q }, { role: "assistant", content: "" }]);
    setBusy(true);
    try {
      const token = localStorage.getItem("s8_token");
      const res = await fetch(`${API}/ai/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ session_id: sessionId, message: q }),
      });
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const parts = buffer.split("\n\n");
        buffer = parts.pop();
        for (const p of parts) {
          const line = p.replace(/^data: /, "").trim();
          if (!line) continue;
          try {
            const obj = JSON.parse(line);
            if (obj.delta) {
              setMessages((m) => {
                const copy = [...m];
                copy[copy.length - 1] = { role: "assistant", content: copy[copy.length - 1].content + obj.delta };
                return copy;
              });
            }
          } catch (_) {}
        }
      }
    } catch (e) {
      setMessages((m) => {
        const copy = [...m];
        copy[copy.length - 1] = { role: "assistant", content: "Sorry, I couldn't reach the assistant right now." };
        return copy;
      });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex min-h-[400px] flex-col rounded-2xl border border-slate-200 bg-white shadow-sm" data-testid="ai-chat">
      <div className="flex items-center gap-2 border-b border-slate-100 px-5 py-3">
        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-[#CC0000]">
          <Sparkles className="h-4 w-4 text-[#FFD700]" />
        </div>
        <div>
          <div className="font-display text-sm font-bold text-slate-900">AI Assistant</div>
          <div className="text-[11px] text-slate-500">Live hotel &amp; bar data</div>
        </div>
      </div>

      <div ref={scrollRef} className="flex-1 space-y-3 overflow-y-auto px-5 py-4" style={{ maxHeight: 360 }}>
        {messages.map((m, i) => (
          <div key={i} className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}>
            <div className={`max-w-[80%] whitespace-pre-wrap rounded-2xl px-4 py-2.5 text-sm ${
              m.role === "user" ? "bg-[#CC0000] text-white" : "bg-slate-100 text-slate-800"}`}>
              {m.content || (busy && i === messages.length - 1 ? <Loader2 className="h-4 w-4 animate-spin" /> : "")}
            </div>
          </div>
        ))}
      </div>

      {messages.length <= 1 && (
        <div className="flex flex-wrap gap-2 px-5 pb-2">
          {SUGGESTIONS.map((s) => (
            <button key={s} onClick={() => send(s)} data-testid="ai-suggestion"
              className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs text-slate-600 transition hover:border-[#CC0000] hover:text-[#CC0000]">
              {s}
            </button>
          ))}
        </div>
      )}

      <div className="flex items-center gap-2 border-t border-slate-100 p-3">
        <Input
          data-testid="ai-input"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && send()}
          placeholder="Ask about rooms, revenue, inventory..."
          className="h-11"
        />
        <Button onClick={() => send()} disabled={busy} className="h-11 w-11 bg-[#CC0000] p-0 hover:bg-[#A30000]" data-testid="ai-send">
          {busy ? <Loader2 className="h-5 w-5 animate-spin" /> : <Send className="h-5 w-5" />}
        </Button>
      </div>
    </div>
  );
}
