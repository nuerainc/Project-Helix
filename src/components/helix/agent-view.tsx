import { useEffect, useRef, useState, type FormEvent } from "react";
import { ArrowUp, Check, Mic, MicOff, Radio, RotateCcw, ShieldAlert } from "lucide-react";
import { useHelix } from "@/store/helix-store";
import { Button } from "@/components/ui/button";
import { PROMPT_CHIPS } from "@/lib/helix/compiler";
import { WORKFLOW_STARTERS } from "@/lib/helix/workflows";
import { capLabel, mechanismLabel, precisionLabel, verifyLabel } from "@/lib/helix/format";
import { cn } from "@/lib/utils";
import type { Finding, Operation } from "@/lib/helix/types";

interface SpeechRecognitionResultLike {
  isFinal: boolean;
  [index: number]: { transcript: string };
}

interface SpeechRecognitionEventLike extends Event {
  resultIndex: number;
  results: ArrayLike<SpeechRecognitionResultLike>;
}

interface SpeechRecognitionLike {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  onend: (() => void) | null;
  onerror: ((event: { error: string }) => void) | null;
  onresult: ((event: SpeechRecognitionEventLike) => void) | null;
  start: () => void;
  stop: () => void;
  abort: () => void;
}

type SpeechRecognitionConstructor = new () => SpeechRecognitionLike;

// Preview adapter only. Production voice uses the shared VoiceInputProvider
// contract with native Windows/macOS/Linux microphone providers.
function speechRecognitionConstructor(): SpeechRecognitionConstructor | undefined {
  if (typeof window === "undefined") return undefined;
  const scope = window as typeof window & {
    SpeechRecognition?: SpeechRecognitionConstructor;
    webkitSpeechRecognition?: SpeechRecognitionConstructor;
  };
  return scope.SpeechRecognition ?? scope.webkitSpeechRecognition;
}

function useVoicePrompt(onTranscript: (text: string) => void) {
  const [supported, setSupported] = useState(false);
  const [listening, setListening] = useState(false);
  const [liveMode, setLiveMode] = useState(false);
  const [interim, setInterim] = useState("");
  const [error, setError] = useState<string | null>(null);
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);
  const liveModeRef = useRef(false);
  const restartRef = useRef<number | null>(null);
  const onTranscriptRef = useRef(onTranscript);
  onTranscriptRef.current = onTranscript;

  useEffect(() => {
    setSupported(Boolean(speechRecognitionConstructor()));
    return () => {
      liveModeRef.current = false;
      if (restartRef.current !== null) window.clearTimeout(restartRef.current);
      recognitionRef.current?.abort();
    };
  }, []);

  function begin(continuous: boolean) {
    const Constructor = speechRecognitionConstructor();
    if (!Constructor) {
      setError("Voice input is not supported in this browser.");
      return;
    }
    recognitionRef.current?.abort();
    const recognition = new Constructor();
    recognition.continuous = continuous;
    recognition.interimResults = true;
    recognition.lang = "en-US";
    recognition.onresult = (event) => {
      let finalText = "";
      let interimText = "";
      for (let i = event.resultIndex; i < event.results.length; i += 1) {
        const transcript = event.results[i]?.[0]?.transcript ?? "";
        if (event.results[i]?.isFinal) finalText += transcript;
        else interimText += transcript;
      }
      setInterim(interimText.trim());
      if (finalText.trim()) onTranscriptRef.current(finalText.trim());
    };
    recognition.onerror = (event) => {
      if (event.error !== "aborted" && event.error !== "no-speech") {
        setError(
          event.error === "not-allowed"
            ? "Microphone permission was denied."
            : `Voice input error: ${event.error}.`,
        );
      }
    };
    recognition.onend = () => {
      setListening(false);
      setInterim("");
      if (liveModeRef.current) {
        restartRef.current = window.setTimeout(() => begin(true), 120);
      }
    };
    recognitionRef.current = recognition;
    setError(null);
    setListening(true);
    try {
      recognition.start();
    } catch {
      setListening(false);
      setError("The microphone could not start. Check browser permissions and try again.");
    }
  }

  function stop() {
    liveModeRef.current = false;
    setLiveMode(false);
    setInterim("");
    recognitionRef.current?.stop();
  }

  function togglePrompt() {
    if (listening) stop();
    else begin(false);
  }

  function toggleLive() {
    if (liveMode) stop();
    else {
      liveModeRef.current = true;
      setLiveMode(true);
      begin(true);
    }
  }

  return { supported, listening, liveMode, interim, error, togglePrompt, toggleLive, stop };
}

export function AgentView() {
  const messages = useHelix((s) => s.messages);
  const findings = useHelix((s) => s.inspectFindings);
  const operations = useHelix((s) => s.operations);
  const busy = useHelix((s) => s.busy);
  const inspect = useHelix((s) => s.inspect);
  const approveSafe = useHelix((s) => s.approveSafe);
  const submit = useHelix((s) => s.submit);
  const voiceHealth = useHelix((s) => s.voiceHealth);
  const latestVoiceTranscript = useHelix((s) => s.latestVoiceTranscript);
  const lastVoiceRoutingConfirmation = useHelix((s) => s.lastVoiceRoutingConfirmation);
  const routingFeedback = useHelix((s) => s.routingFeedback);
  const adapterFeedbackAt = useHelix((s) => s.adapterFeedbackAt);
  const backups = useHelix((s) => s.backups);
  const backupStatus = useHelix((s) => s.backupStatus);
  const pendingRecoveryId = useHelix((s) => s.pendingRecoveryId);
  const approveRestore = useHelix((s) => s.approveRestore);
  const voiceMacros = useHelix((s) => s.voiceMacros);
  const audioDiagnostics = useHelix((s) => s.audioDiagnostics);
  const audioDiagnosticsStatus = useHelix((s) => s.audioDiagnosticsStatus);
  const setVoiceHealth = useHelix((s) => s.setVoiceHealth);
  const setVoiceMode = useHelix((s) => s.setVoiceMode);
  const receiveVoiceTranscript = useHelix((s) => s.receiveVoiceTranscript);
  const scroller = useRef<HTMLDivElement>(null);
  const [text, setText] = useState("");
  const voice = useVoicePrompt(
    (transcript) =>
      void receiveVoiceTranscript({
        text: transcript,
        final: true,
        timestamp: Date.now(),
        source: "browser_preview",
      }),
  );

  useEffect(() => {
    const active = voice.liveMode || voice.listening;
    setVoiceMode(voice.liveMode ? "continuous" : voice.listening ? "push_to_talk" : null);
    setVoiceHealth({
      state: active ? "listening" : "idle",
      permission: active ? "granted" : "unknown",
      message: active
        ? voice.liveMode
          ? "Browser preview booth listening is active; native desktop capture is not connected."
          : "Browser preview push-to-talk is active."
        : "Native booth microphone is not connected in the browser preview.",
      lastTranscriptAt: latestVoiceTranscript?.timestamp,
    });
  }, [
    latestVoiceTranscript?.timestamp,
    setVoiceHealth,
    setVoiceMode,
    voice.liveMode,
    voice.listening,
  ]);

  useEffect(() => {
    scroller.current?.scrollTo({ top: scroller.current.scrollHeight, behavior: "smooth" });
  }, [messages.length, operations.length]);

  const pending = operations.filter((o) => o.phase === "propose");
  const autoN = pending.filter((o) => o.autoSafe && !o.refusedReason).length;
  const reviewN = pending.filter((o) => !o.autoSafe || o.refusedReason).length;

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    const v = text.trim();
    if (!v) return;
    setText("");
    void submit(v);
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col rounded-lg bg-surface shadow-[var(--shadow-border)]">
      <div className="flex items-center justify-between gap-2 border-b border-border px-3 py-2">
        <div>
          <p className="text-[11px] font-medium uppercase tracking-wider text-subtle">Agent</p>
          <p className="text-sm font-medium">Intent · plan · verify</p>
        </div>
        <Button size="sm" onClick={() => void inspect()} disabled={busy}>
          Inspect session
        </Button>
      </div>
      <div ref={scroller} className="min-h-0 flex-1 space-y-3 overflow-y-auto p-3">
        {messages.map((m) => (
          <article
            key={m.id}
            className={cn(
              "max-w-[46rem] rounded-md px-3 py-2 text-sm leading-relaxed",
              m.role === "user"
                ? "ml-auto bg-elevated text-fg"
                : m.role === "system"
                  ? "bg-bg text-muted"
                  : "bg-bg text-fg shadow-[var(--shadow-border)]",
            )}
          >
            <p className="whitespace-pre-wrap">{m.text}</p>
            {m.findingIds && m.findingIds.length > 0 && (
              <ul className="mt-2 space-y-2">
                {findings
                  .filter((f) => m.findingIds?.includes(f.id))
                  .map((f, i) => (
                    <FindingCard key={f.id} finding={f} index={i + 1} />
                  ))}
              </ul>
            )}
            {m.operationIds &&
              m.operationIds
                .map((id) => operations.find((o) => o.id === id))
                .filter(Boolean)
                .map((op) => op && <OpCard key={op.id} op={op} />)}
          </article>
        ))}
        {busy && (
          <p className="font-mono text-xs text-muted">
            <span className="inline-block bg-[linear-gradient(90deg,var(--color-muted),var(--color-fg),var(--color-muted))] bg-[length:200%_100%] bg-clip-text text-transparent animate-[helix-shimmer_1.4s_linear_infinite]">
              Compiling intent
            </span>
          </p>
        )}
      </div>
      {autoN + reviewN > 0 && (
        <div className="flex flex-wrap items-center gap-2 border-t border-border px-3 py-2">
          <span className="text-xs text-muted">
            {autoN} within constraints · {reviewN} review
          </span>
          {autoN > 0 && (
            <Button size="sm" onClick={() => void approveSafe()} disabled={busy}>
              Fix {autoN}
            </Button>
          )}
        </div>
      )}
      <div className="border-t border-border p-2">
        <div className="mb-2 grid grid-cols-2 gap-1.5 sm:grid-cols-4">
          {WORKFLOW_STARTERS.map((workflow) => (
            <button
              key={workflow.id}
              type="button"
              disabled={!workflow.available || busy}
              onClick={() => void submit(workflow.prompt)}
              title={
                workflow.available
                  ? workflow.description
                  : `${workflow.description} Planned for ${workflow.release}.`
              }
              className={cn(
                "min-w-0 rounded-sm bg-bg px-2 py-1.5 text-left shadow-[var(--shadow-border)]",
                workflow.available
                  ? "text-muted hover:text-fg"
                  : "cursor-not-allowed text-subtle opacity-60",
              )}
            >
              <span className="block truncate text-[11px] font-medium">{workflow.title}</span>
              <span className="block text-[9px] uppercase tracking-wide text-subtle">
                {workflow.available ? "ready" : workflow.release}
              </span>
            </button>
          ))}
        </div>
        <div className="mb-2 flex gap-1 overflow-x-auto pb-1">
          {PROMPT_CHIPS.map((c) => (
            <button
              key={c}
              type="button"
              onClick={() => void submit(c)}
              className="shrink-0 rounded-sm bg-bg px-2 py-1 text-[11px] text-muted hover:text-fg"
            >
              {c}
            </button>
          ))}
        </div>
        <form onSubmit={onSubmit} className="flex gap-2">
          <input
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="Production intent"
            className="h-11 min-w-0 flex-1 rounded-sm bg-bg px-3 text-sm text-fg shadow-[var(--shadow-border)] placeholder:text-subtle focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40"
          />
          <Button type="submit" size="icon" disabled={busy || !text.trim()} aria-label="Send">
            <ArrowUp />
          </Button>
        </form>
        <div className="mt-2 flex flex-wrap items-center gap-1.5">
          <Button
            type="button"
            size="sm"
            variant={voice.listening && !voice.liveMode ? "primary" : "outline"}
            onClick={voice.togglePrompt}
            disabled={!voice.supported}
            aria-pressed={voice.listening && !voice.liveMode}
            title="Speak one production prompt"
          >
            {voice.listening && !voice.liveMode ? <MicOff /> : <Mic />}
            {voice.listening && !voice.liveMode ? "Stop speaking" : "Speak"}
          </Button>
          <Button
            type="button"
            size="sm"
            variant={voice.liveMode ? "primary" : "outline"}
            onClick={voice.toggleLive}
            disabled={!voice.supported}
            aria-pressed={voice.liveMode}
            title="Keep listening for prompts from the booth"
          >
            <Radio />
            {voice.liveMode ? "Booth listening" : "Live booth"}
          </Button>
          <span className="text-[11px] text-subtle">
            {!voice.supported
              ? "Browser preview voice unavailable"
              : voice.interim
                ? `Hearing: ${voice.interim}`
                : voice.liveMode
                  ? "Listening continuously · final phrases are sent to the Agent"
                  : "Browser preview · final phrases become chat prompts"}
          </span>
        </div>
        {voice.error && <p className="mt-1 text-[11px] text-warn">{voice.error}</p>}
        <div className="mt-2 rounded-sm bg-bg px-2 py-1.5 text-[11px] text-subtle">
          <span className="font-medium text-muted">Native booth provider:</span>{" "}
          {voiceHealth.message}
          {latestVoiceTranscript && (
            <span className="ml-2 text-fg">Last transcript: “{latestVoiceTranscript.text}”</span>
          )}
        </div>
        {lastVoiceRoutingConfirmation && (
          <div className="mt-1 rounded-sm bg-accent/10 px-2 py-1.5 text-[11px] text-muted">
            <span className="font-medium text-fg">Voice routing:</span>{" "}
            {lastVoiceRoutingConfirmation}
          </div>
        )}
        {routingFeedback && (
          <div className="mt-1 rounded-sm bg-ok-dim px-2 py-1.5 text-[11px] text-muted">
            <span className="font-medium text-ok">Track feedback:</span> {routingFeedback}
            {adapterFeedbackAt && (
              <span className="ml-1 text-subtle">
                · {new Date(adapterFeedbackAt).toLocaleTimeString()}
              </span>
            )}
          </div>
        )}
        {backupStatus && (
          <div className="mt-1 rounded-sm bg-bg px-2 py-1.5 text-[11px] text-muted">
            <span className="font-medium text-fg">Session recovery:</span> {backupStatus}
            {pendingRecoveryId && (
              <Button type="button" size="sm" className="ml-2" onClick={approveRestore}>
                Approve restore
              </Button>
            )}
            {!pendingRecoveryId && backups.length > 0 && (
              <span className="ml-2 text-subtle">
                {backups.length} local checkpoint{backups.length === 1 ? "" : "s"}
              </span>
            )}
          </div>
        )}
        <div className="mt-1 rounded-sm bg-bg px-2 py-1.5 text-[11px] text-subtle">
          <span className="font-medium text-muted">Voice macros:</span>{" "}
          {voiceMacros.length
            ? voiceMacros.map((macro) => `“${macro.trigger}” → ${macro.template}`).join(" · ")
            : "none defined"}
        </div>
        {audioDiagnosticsStatus && (
          <div className="mt-1 rounded-sm bg-bg px-2 py-1.5 text-[11px] text-muted">
            <span
              className={cn(
                "font-medium",
                audioDiagnostics?.status === "critical" ? "text-warn" : "text-fg",
              )}
            >
              Audio diagnostics:
            </span>{" "}
            {audioDiagnosticsStatus}
            {audioDiagnostics && (
              <span className="ml-1 text-subtle">
                · buffer {audioDiagnostics.bufferFrames} frames @ {audioDiagnostics.sampleRate} Hz
              </span>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function FindingCard({ finding, index }: { finding: Finding; index: number }) {
  return (
    <li className="rounded-sm bg-elevated px-2.5 py-2">
      <div className="flex items-start justify-between gap-2">
        <p className="text-sm font-medium">
          <span className="mr-1.5 font-mono text-xs text-subtle">{index}</span>
          {finding.title}
        </p>
        <span
          className={cn(
            "shrink-0 rounded-xs px-1.5 py-0.5 text-[10px] uppercase tracking-wide",
            finding.severity === "critical"
              ? "bg-danger-dim text-danger"
              : finding.severity === "warn"
                ? "bg-warn-dim text-warn"
                : "bg-ok-dim text-ok",
          )}
        >
          {finding.fixable ? (finding.autoSafe ? "fix" : "review") : "observe"}
        </span>
      </div>
      <p className="mt-1 text-xs text-muted">{finding.detail}</p>
      <ul className="mt-1 space-y-0.5">
        {finding.evidence.map((e) => (
          <li key={e} className="font-mono text-[11px] text-subtle">
            {e}
          </li>
        ))}
      </ul>
    </li>
  );
}

function OpCard({ op }: { op: Operation }) {
  const approve = useHelix((s) => s.approve);
  const skip = useHelix((s) => s.skip);
  const undo = useHelix((s) => s.undo);
  const ledger = useHelix((s) => s.ledger);
  const entry = ledger.find((e) => e.operationId === op.id);

  return (
    <div className="mt-2 rounded-sm bg-elevated p-2.5">
      <div className="flex flex-wrap items-center gap-1.5 font-mono text-[10px] uppercase tracking-wide text-subtle">
        <span>{op.id}</span>
        <span>{capLabel(op.cap)}</span>
        <span>{mechanismLabel(op.mechanism)}</span>
        <span>{precisionLabel(op.precision)}</span>
        <span>{verifyLabel(op.verifyClass)}</span>
        <span className="text-muted">{op.phase}</span>
      </div>
      <p className="mt-1 text-sm">{op.summary}</p>
      {op.refusedReason && (
        <p className="mt-1 flex gap-1.5 text-xs text-warn">
          <ShieldAlert className="mt-0.5 size-3.5 shrink-0" />
          {op.refusedReason}
        </p>
      )}
      {op.preconditions.length > 0 && !op.refusedReason && (
        <p className="mt-1 text-[11px] text-subtle">{op.preconditions.join(" · ")}</p>
      )}
      {entry && entry.diffs.length > 0 && (
        <ul className="mt-2 space-y-0.5">
          {entry.diffs.map((d) => (
            <li key={d.label} className="flex gap-2 font-mono text-[11px]">
              <span className="w-24 shrink-0 text-subtle">{d.label}</span>
              <span className="text-muted">{d.before}</span>
              <span className="text-subtle">→</span>
              <span className={d.positive ? "text-ok" : "text-fg"}>{d.after}</span>
            </li>
          ))}
        </ul>
      )}
      <div className="mt-2 flex flex-wrap gap-1.5">
        {op.phase === "propose" && !op.refusedReason && (
          <>
            <Button size="sm" onClick={() => void approve(op.id)}>
              <Check /> Approve
            </Button>
            <Button size="sm" variant="ghost" onClick={() => skip(op.id)}>
              Skip
            </Button>
          </>
        )}
        {op.phase === "commit" && entry?.rollbackAvailable && (
          <Button size="sm" variant="outline" onClick={() => undo(op.id)}>
            <RotateCcw /> Rollback
          </Button>
        )}
      </div>
    </div>
  );
}
