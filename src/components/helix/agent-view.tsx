import { useEffect, useRef, useState, type FormEvent } from "react";
import { ArrowUp, Check, RotateCcw, ShieldAlert } from "lucide-react";
import { useHelix } from "@/store/helix-store";
import { Button } from "@/components/ui/button";
import { PROMPT_CHIPS } from "@/lib/helix/compiler";
import { capLabel, mechanismLabel, precisionLabel, verifyLabel } from "@/lib/helix/format";
import { cn } from "@/lib/utils";
import type { Finding, Operation } from "@/lib/helix/types";

export function AgentView() {
  const messages = useHelix((s) => s.messages);
  const findings = useHelix((s) => s.inspectFindings);
  const operations = useHelix((s) => s.operations);
  const busy = useHelix((s) => s.busy);
  const inspect = useHelix((s) => s.inspect);
  const approveSafe = useHelix((s) => s.approveSafe);
  const submit = useHelix((s) => s.submit);
  const scroller = useRef<HTMLDivElement>(null);
  const [text, setText] = useState("");

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
