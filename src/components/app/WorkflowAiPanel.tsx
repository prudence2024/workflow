"use client";

import { useRef, useState } from "react";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Field";
import type { VoiceState } from "@/lib/voice/types";

type RecognitionLike = {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  onresult: ((event: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void) | null;
  onerror: ((event: { error?: string }) => void) | null;
  onend: (() => void) | null;
  start(): void;
  stop(): void;
};
type RecognitionConstructor = new () => RecognitionLike;

type Message = { role: "user" | "assistant"; text: string };

export function WorkflowAiPanel() {
  const [open, setOpen] = useState(false);
  const [input, setInput] = useState("");
  const [messages, setMessages] = useState<Message[]>([]);
  const [busy, setBusy] = useState(false);
  const [voiceState, setVoiceState] = useState<VoiceState>("idle");
  const recognition = useRef<RecognitionLike | null>(null);
  const interim = useRef("");

  async function ask(text: string, voice = false) {
    const message = text.trim();
    if (!message || busy) return;
    setInput("");
    setMessages((current) => [...current, { role: "user", text: message }]);
    setBusy(true);
    setVoiceState(voice ? "thinking" : "idle");
    try {
      const response = await fetch("/api/ai/assistant", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ message, voice }) });
      const payload = await response.json() as { text?: string; error?: string };
      const reply = payload.text ?? payload.error ?? "No response was returned.";
      setMessages((current) => [...current, { role: "assistant", text: reply }]);
      if (voice && "speechSynthesis" in window) {
        setVoiceState("speaking");
        const utterance = new SpeechSynthesisUtterance(reply);
        utterance.onend = () => setVoiceState("idle");
        window.speechSynthesis.cancel();
        window.speechSynthesis.speak(utterance);
      }
    } catch {
      setMessages((current) => [...current, { role: "assistant", text: "Workflow AI is unavailable. Nothing was executed." }]);
      setVoiceState("idle");
    } finally {
      setBusy(false);
    }
  }

  function toggleVoice() {
    if (voiceState === "listening") {
      recognition.current?.stop();
      setVoiceState("understanding");
      return;
    }
    if (voiceState === "speaking") {
      window.speechSynthesis?.cancel();
      setVoiceState("idle");
      return;
    }
    const ctor = (window as Window & { SpeechRecognition?: RecognitionConstructor; webkitSpeechRecognition?: RecognitionConstructor }).SpeechRecognition
      ?? (window as Window & { webkitSpeechRecognition?: RecognitionConstructor }).webkitSpeechRecognition;
    if (!ctor) {
      setMessages((current) => [...current, { role: "assistant", text: "Voice input is not available in this browser. Use the text box instead." }]);
      return;
    }
    const next = new ctor();
    next.continuous = false;
    next.interimResults = true;
    next.lang = "en-US";
    next.onresult = (event) => {
      let finalText = "";
      for (let i = 0; i < event.results.length; i += 1) finalText += event.results[i]?.[0]?.transcript ?? "";
      interim.current = finalText;
      setInput(finalText);
    };
    next.onerror = () => { setVoiceState("idle"); setMessages((current) => [...current, { role: "assistant", text: "Microphone input could not be completed. Nothing was executed." }]); };
    next.onend = () => {
      const text = interim.current.trim();
      interim.current = "";
      if (text) void ask(text, true); else setVoiceState("idle");
    };
    recognition.current = next;
    setVoiceState("listening");
    try { next.start(); } catch { setVoiceState("idle"); }
  }

  return (
    <>
      <button type="button" aria-label="Open Workflow AI" onClick={() => setOpen((value) => !value)} className="fixed bottom-5 right-5 z-40 rounded-full bg-[var(--color-navy)] px-4 py-3 text-sm font-semibold text-white shadow-[var(--shadow-lg)] hover:bg-[var(--color-brand-strong)]">
        Workflow AI
      </button>
      {open && (
        <section aria-label="Workflow AI assistant" className="fixed bottom-20 right-5 z-40 flex w-[min(380px,calc(100vw-2rem))] flex-col overflow-hidden rounded-[var(--radius-lg)] border border-[var(--color-border)] bg-white shadow-[var(--shadow-lg)]">
          <div className="flex items-center justify-between border-b border-[var(--color-border)] px-4 py-3">
            <div><p className="font-display text-sm font-semibold">Workflow AI</p><p className="text-[11px] text-[var(--color-muted)]">Tenant-scoped, proposal-first operations help</p></div>
            <button type="button" aria-label="Close Workflow AI" onClick={() => setOpen(false)} className="text-xl text-[var(--color-muted)]">×</button>
          </div>
          <div className="max-h-72 space-y-3 overflow-y-auto px-4 py-3">
            {messages.length === 0 && <p className="text-[13px] text-[var(--color-muted)]">Ask about campaigns, failed submissions, imports, usage, or missing contact data.</p>}
            {messages.map((message, index) => <div key={`${message.role}-${index}`} className={message.role === "user" ? "ml-8 rounded-lg bg-[var(--color-brand-soft)] px-3 py-2 text-[13px]" : "mr-4 rounded-lg bg-[var(--color-canvas)] px-3 py-2 text-[13px]"}>{message.text}</div>)}
          </div>
          <div className="border-t border-[var(--color-border)] p-3">
            <form onSubmit={(event) => { event.preventDefault(); void ask(input); }} className="flex gap-2">
              <Input aria-label="Ask Workflow AI" value={input} onChange={(event) => setInput(event.target.value)} placeholder="Ask Workflow AI…" disabled={busy} />
              <Button type="submit" size="sm" disabled={busy || !input.trim()}>Ask</Button>
            </form>
            <div className="mt-2 flex items-center justify-between"><span className="text-[11px] text-[var(--color-muted)]">{voiceState === "idle" ? "Text fallback always available" : voiceState[0].toUpperCase() + voiceState.slice(1)}</span><Button type="button" variant="outline" size="sm" onClick={toggleVoice}>{voiceState === "listening" ? "Stop" : voiceState === "speaking" ? "Mute" : "Use voice"}</Button></div>
          </div>
        </section>
      )}
    </>
  );
}