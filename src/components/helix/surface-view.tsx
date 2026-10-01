import { ChevronLeft, ChevronRight, Square, Play, Undo2 } from "lucide-react";
import { useHelix } from "@/store/helix-store";
import { mixerTracks } from "@/lib/helix/session";
import { Fader, LedMeter, tintClass } from "./controls";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";

export function SurfaceView({ compact }: { compact?: boolean }) {
  const session = useHelix((s) => s.session);
  const bankOffset = useHelix((s) => s.bankOffset);
  const bank = useHelix((s) => s.bank);
  const selected = useHelix((s) => s.selectedTrackId);
  const selectTrack = useHelix((s) => s.selectTrack);
  const surfaceFader = useHelix((s) => s.surfaceFader);
  const surfaceToggle = useHelix((s) => s.surfaceToggle);
  const transport = useHelix((s) => s.transport);
  const caps = useHelix((s) => s.caps);
  const tracks = mixerTracks(session);
  const start = bankOffset * 8;
  const bankTracks = tracks.slice(start, start + 8);
  const anySolo = tracks.some((t) => t.solo);

  return (
    <div className={cn("rounded-lg bg-surface p-3 shadow-[var(--shadow-border)]", compact && "p-2")}>
      <div className="mb-2 flex items-center justify-between gap-2">
        <div>
          <p className="text-[11px] font-medium uppercase tracking-wider text-subtle">
            Layer 1 · {caps.protocol}
          </p>
          <p className="font-mono text-[11px] text-muted">
            Bank {bankOffset + 1} · ch {start + 1}–{start + bankTracks.length}
          </p>
        </div>
        <div className="flex items-center gap-1">
          <Button variant="ghost" size="icon-sm" aria-label="Bank left" onClick={() => bank(-1)}>
            <ChevronLeft />
          </Button>
          <Button variant="ghost" size="icon-sm" aria-label="Bank right" onClick={() => bank(1)}>
            <ChevronRight />
          </Button>
          <Button
            variant="secondary"
            size="icon-sm"
            aria-label={session.playing ? "Stop" : "Play"}
            onClick={() => transport(session.playing ? "stop" : "play")}
          >
            {session.playing ? <Square className="fill-current" /> : <Play className="ml-px fill-current" />}
          </Button>
          <Button variant="ghost" size="icon-sm" aria-label="Return to zero" onClick={() => transport("return")}>
            <Undo2 />
          </Button>
        </div>
      </div>
      <div className="flex gap-1 overflow-x-auto">
        {Array.from({ length: 8 }, (_, i) => {
          const t = bankTracks[i];
          if (!t) {
            return (
              <div key={`empty-${i}`} className="flex w-[64px] shrink-0 flex-col items-center gap-1 opacity-30">
                <div className="h-7 w-full rounded-xs bg-elevated" />
                <div className="h-[100px] w-6 rounded-sm bg-bg" />
              </div>
            );
          }
          const silent = t.mute || (anySolo && !t.solo) || t.missingMedia;
          return (
            <div key={t.id} className="flex w-[64px] shrink-0 flex-col items-center gap-1">
              <button
                type="button"
                onClick={() => selectTrack(t.id)}
                className={cn(
                  "h-7 w-full truncate rounded-xs px-1 text-[10px] font-medium",
                  selected === t.id ? "bg-accent text-accent-fg" : "bg-elevated text-fg",
                )}
              >
                {t.name}
              </button>
              <div className="flex items-end gap-1">
                <LedMeter peakDb={t.peakDb} rmsDb={t.rmsDb} clip={t.clippingEvents > 0} silent={silent} />
                <Fader valueDb={t.volumeDb} onCommit={(db) => surfaceFader(t.id, db)} height={100} />
              </div>
              <div className="flex gap-0.5">
                {(["mute", "solo", "arm"] as const).map((f) => (
                  <button
                    key={f}
                    type="button"
                    onClick={() => surfaceToggle(t.id, f)}
                    className={cn(
                      "size-5 rounded-xs text-[8px] font-semibold uppercase",
                      t[f]
                        ? f === "solo"
                          ? "bg-ok text-accent-fg"
                          : f === "mute"
                            ? "bg-warn text-accent-fg"
                            : "bg-danger text-fg"
                        : "bg-bg text-subtle",
                    )}
                  >
                    {f[0]}
                  </button>
                ))}
              </div>
              <span className={cn("h-0.5 w-8 rounded-full", tintClass(t.tint))} />
            </div>
          );
        })}
      </div>
    </div>
  );
}
