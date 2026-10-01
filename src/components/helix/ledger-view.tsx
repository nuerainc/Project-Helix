import { RotateCcw } from "lucide-react";
import { useHelix } from "@/store/helix-store";
import { Button } from "@/components/ui/button";
import { mechanismLabel, verifyLabel } from "@/lib/helix/format";
import { cn } from "@/lib/utils";

export function LedgerView() {
  const ledger = useHelix((s) => s.ledger);
  const undo = useHelix((s) => s.undo);
  const reset = useHelix((s) => s.reset);

  return (
    <div className="flex min-h-0 flex-col rounded-lg bg-surface shadow-[var(--shadow-border)]">
      <div className="flex items-center justify-between border-b border-border px-3 py-2">
        <div>
          <p className="text-[11px] font-medium uppercase tracking-wider text-subtle">Ledger</p>
          <p className="text-sm font-medium">Semantic history</p>
        </div>
        <Button size="sm" variant="ghost" onClick={reset}>
          Reset session
        </Button>
      </div>
      <div className="min-h-0 flex-1 space-y-2 overflow-y-auto p-3">
        {ledger.length === 0 && (
          <p className="text-sm text-muted">No operations yet. Inspect the session or send an intent.</p>
        )}
        {[...ledger].reverse().map((e) => (
          <article key={e.id} className="rounded-md bg-bg p-2.5 shadow-[var(--shadow-border)]">
            <div className="flex flex-wrap items-center gap-1.5 font-mono text-[10px] uppercase tracking-wide text-subtle">
              <span>{e.operationId}</span>
              <span>{mechanismLabel(e.mechanism)}</span>
              <span>{verifyLabel(e.verifyClass)}</span>
              <span
                className={cn(
                  e.verification === "PASS"
                    ? "text-ok"
                    : e.verification === "FAIL"
                      ? "text-danger"
                      : "text-warn",
                )}
              >
                {e.verification}
                {e.rolledBack ? " · rolled back" : ""}
              </span>
            </div>
            <p className="mt-1 text-sm">{e.summary}</p>
            {e.diffs.length > 0 && (
              <ul className="mt-1.5 space-y-0.5">
                {e.diffs.map((d) => (
                  <li key={`${e.id}-${d.label}-${d.before}`} className="flex gap-2 font-mono text-[11px]">
                    <span className="w-[5.5rem] shrink-0 text-subtle">{d.label}</span>
                    <span className="text-muted">{d.before}</span>
                    <span className="text-subtle">→</span>
                    <span>{d.after}</span>
                  </li>
                ))}
              </ul>
            )}
            {e.rollbackAvailable && (
              <Button size="sm" variant="outline" className="mt-2" onClick={() => undo(e.operationId)}>
                <RotateCcw /> Rollback
              </Button>
            )}
          </article>
        ))}
      </div>
    </div>
  );
}
