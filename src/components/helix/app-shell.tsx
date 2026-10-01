import { useEffect } from "react";
import { Layers, SlidersHorizontal, BookOpen, Cpu } from "lucide-react";
import { useHelix } from "@/store/helix-store";
import { HOSTS } from "@/lib/helix/hosts";
import { AUTONOMY, formatTimeShort } from "@/lib/helix/format";
import { Button } from "@/components/ui/button";
import { MixerView } from "./mixer-view";
import { SurfaceView } from "./surface-view";
import { AgentView } from "./agent-view";
import { LedgerView } from "./ledger-view";
import { CapsPanel } from "./caps-panel";
import { cn } from "@/lib/utils";
import type { HostId, AutonomyLevel } from "@/lib/helix/types";

export function AppShell() {
  const session = useHelix((s) => s.session);
  const hostId = useHelix((s) => s.hostId);
  const caps = useHelix((s) => s.caps);
  const autonomy = useHelix((s) => s.autonomy);
  const connect = useHelix((s) => s.connect);
  const setAutonomy = useHelix((s) => s.setAutonomy);
  const tick = useHelix((s) => s.tick);
  const transport = useHelix((s) => s.transport);
  const pane = useHelix((s) => s.mobilePane);
  const setPane = useHelix((s) => s.setMobilePane);
  const toggleCaps = useHelix((s) => s.toggleCaps);
  const inspect = useHelix((s) => s.inspect);

  useEffect(() => {
    let raf = 0;
    let last = performance.now();
    const loop = (now: number) => {
      tick((now - last) / 1000);
      last = now;
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [tick]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.tagName === "SELECT")) return;
      if (e.code === "Space") {
        e.preventDefault();
        transport(session.playing ? "stop" : "play");
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [session.playing, transport]);

  return (
    <div className="flex h-dvh flex-col bg-bg text-fg">
      <header className="flex shrink-0 items-center gap-3 border-b border-border px-3 py-2 md:px-4">
        <Mark />
        <div className="min-w-0 flex-1">
          <div className="flex items-baseline gap-2">
            <h1 className="text-base font-semibold tracking-tight">Helix</h1>
            <span className="truncate text-xs text-muted">
              {session.name}
              <span className="hidden sm:inline"> · {session.artist}</span>
            </span>
          </div>
          <p className="font-mono text-[11px] tabular-nums text-subtle">
            {session.tempo} BPM · {session.sampleRate / 1000} kHz · {formatTimeShort(session.duration)} · {caps.protocol}
            {caps.agentFirst ? " · agent-first" : ""}
          </p>
        </div>
        <label className="hidden md:flex flex-col text-[10px] uppercase tracking-wider text-subtle">
          Host
          <select
            value={hostId}
            onChange={(e) => connect(e.target.value as HostId)}
            className="h-9 min-w-[9.5rem] rounded-sm bg-elevated px-2 text-xs font-medium text-fg shadow-[var(--shadow-border)]"
          >
            {HOSTS.map((h) => (
              <option key={h.host} value={h.host}>
                {h.label}
                {h.agentFirst ? " · DAW" : ""}
              </option>
            ))}
          </select>
        </label>
        <label className="hidden md:flex flex-col text-[10px] uppercase tracking-wider text-subtle">
          Autonomy
          <select
            value={autonomy}
            onChange={(e) => setAutonomy(Number(e.target.value) as AutonomyLevel)}
            className="h-9 min-w-[8.5rem] rounded-sm bg-elevated px-2 text-xs font-medium text-fg shadow-[var(--shadow-border)]"
          >
            {AUTONOMY.map((a) => (
              <option key={a.level} value={a.level}>
                {a.level} {a.label}
              </option>
            ))}
          </select>
        </label>
        <Button variant="outline" size="sm" className="hidden md:inline-flex" onClick={() => toggleCaps()}>
          <Layers /> Caps
        </Button>
        <Button size="sm" className="hidden sm:inline-flex" onClick={() => void inspect()}>
          Inspect
        </Button>
      </header>

      <div className="flex min-h-0 flex-1">
        <main
          className={cn(
            "min-h-0 min-w-0 flex-1 flex-col gap-2 p-2 md:flex md:p-3",
            pane === "mixer" || pane === "surface" ? "flex" : "hidden md:flex",
          )}
        >
          <div className={cn("min-h-0 flex-1 flex-col", pane === "mixer" ? "flex" : "hidden md:flex")}>
            <MixerView />
          </div>
          <div className={cn(pane === "surface" ? "block" : "hidden md:block")}>
            <SurfaceView />
          </div>
        </main>
        <aside
          className={cn(
            "min-h-0 w-full flex-col gap-2 p-2 md:flex md:w-[min(42vw,440px)] md:shrink-0 md:p-3 md:pl-0",
            pane === "agent" || pane === "ledger" ? "flex" : "hidden md:flex",
          )}
        >
          <div className={cn("min-h-0 flex-[1.35]", pane === "agent" ? "flex" : "hidden md:flex")}>
            <AgentView />
          </div>
          <div className={cn("min-h-0 flex-1", pane === "ledger" ? "flex" : "hidden md:flex")}>
            <LedgerView />
          </div>
        </aside>
      </div>

      <nav className="grid shrink-0 grid-cols-4 border-t border-border md:hidden">
        {(
          [
            ["mixer", "Mixer", SlidersHorizontal],
            ["agent", "Agent", Cpu],
            ["ledger", "Ledger", BookOpen],
            ["surface", "Surface", Layers],
          ] as const
        ).map(([id, label, Icon]) => (
          <button
            key={id}
            type="button"
            onClick={() => setPane(id)}
            className={cn(
              "flex h-12 flex-col items-center justify-center gap-0.5 text-[10px] uppercase tracking-wide",
              pane === id ? "text-fg" : "text-subtle",
            )}
          >
            <Icon className="size-4" />
            {label}
          </button>
        ))}
      </nav>
      <CapsPanel />
      <MobileHostBar
        hostId={hostId}
        autonomy={autonomy}
        onHost={connect}
        onAuto={setAutonomy}
        onCaps={() => toggleCaps()}
      />
    </div>
  );
}

function MobileHostBar({
  hostId,
  autonomy,
  onHost,
  onAuto,
  onCaps,
}: {
  hostId: HostId;
  autonomy: AutonomyLevel;
  onHost: (id: HostId) => void;
  onAuto: (l: AutonomyLevel) => void;
  onCaps: () => void;
}) {
  return (
    <div className="flex gap-2 border-t border-border p-2 md:hidden">
      <select
        value={hostId}
        onChange={(e) => onHost(e.target.value as HostId)}
        className="h-10 min-w-0 flex-1 rounded-sm bg-elevated px-2 text-xs text-fg"
      >
        {HOSTS.map((h) => (
          <option key={h.host} value={h.host}>
            {h.label}
          </option>
        ))}
      </select>
      <select
        value={autonomy}
        onChange={(e) => onAuto(Number(e.target.value) as AutonomyLevel)}
        className="h-10 w-[7.5rem] rounded-sm bg-elevated px-2 text-xs text-fg"
      >
        {AUTONOMY.map((a) => (
          <option key={a.level} value={a.level}>
            {a.label}
          </option>
        ))}
      </select>
      <Button variant="outline" size="sm" className="h-10" onClick={onCaps}>
        Caps
      </Button>
    </div>
  );
}

function Mark() {
  return (
    <svg width="28" height="28" viewBox="0 0 28 28" aria-hidden className="shrink-0">
      <rect width="28" height="28" rx="6" className="fill-elevated" />
      {[6, 10, 14, 18, 22].map((x, i) => (
        <rect
          key={x}
          x={x}
          y={6 + (i % 3) * 2}
          width="2"
          height={16 - (i % 3) * 3}
          rx="1"
          className={i === 2 ? "fill-accent" : "fill-muted"}
        />
      ))}
    </svg>
  );
}
