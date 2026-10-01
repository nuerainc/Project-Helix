import { useHelix } from "@/store/helix-store";
import { mixerTracks, masterTrack, findTrack } from "@/lib/helix/session";
import { formatTime, formatTimeShort, formatDb, formatDbTp } from "@/lib/helix/format";
import { cn } from "@/lib/utils";
import { Fader, LedMeter, tintClass } from "./controls";
import type { Track } from "@/lib/helix/types";

export function MixerView() {
  const session = useHelix((s) => s.session);
  const selected = useHelix((s) => s.selectedTrackId);
  const selectTrack = useHelix((s) => s.selectTrack);
  const surfaceFader = useHelix((s) => s.surfaceFader);
  const surfaceToggle = useHelix((s) => s.surfaceToggle);
  const tracks = mixerTracks(session);
  const master = masterTrack(session);
  const anySolo = tracks.some((t) => t.solo) || master.solo;

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-2">
      <Timeline />
      <div className="min-h-0 flex-1 overflow-x-auto overflow-y-hidden rounded-lg bg-surface shadow-[var(--shadow-border)]">
        <div className="flex h-full min-w-max">
          {tracks.map((t) => (
            <TrackStrip
              key={t.id}
              track={t}
              selected={selected === t.id}
              dim={anySolo && !t.solo}
              onSelect={() => selectTrack(t.id)}
              onFader={(db) => surfaceFader(t.id, db)}
              onToggle={(f) => surfaceToggle(t.id, f)}
            />
          ))}
          <div className="w-px bg-border-strong" />
          <TrackStrip
            track={master}
            selected={selected === master.id}
            dim={false}
            master
            onSelect={() => selectTrack(master.id)}
            onFader={(db) => surfaceFader(master.id, db)}
            onToggle={(f) => surfaceToggle(master.id, f)}
          />
        </div>
      </div>
      <Inspector />
    </div>
  );
}

function Timeline() {
  const session = useHelix((s) => s.session);
  const setPlayhead = useHelix((s) => s.setPlayhead);
  const tracks = mixerTracks(session);

  return (
    <div className="rounded-lg bg-surface p-2 shadow-[var(--shadow-border)]">
      <div className="mb-1 flex items-center justify-between px-1">
        <span className="text-[11px] font-medium uppercase tracking-wider text-subtle">Arrangement</span>
        <span className="font-mono text-[11px] tabular-nums text-muted">{formatTime(session.playhead)}</span>
      </div>
      <button
        type="button"
        className="relative block h-[104px] w-full overflow-hidden rounded-md bg-bg text-left"
        onClick={(e) => {
          const r = e.currentTarget.getBoundingClientRect();
          setPlayhead(((e.clientX - r.left) / r.width) * session.duration);
        }}
      >
        {session.markers.map((m) => (
          <div
            key={m.id}
            className="absolute top-0 h-full border-l border-border"
            style={{ left: `${(m.time / session.duration) * 100}%` }}
          >
            <span
              className={cn(
                "absolute top-0 left-0.5 text-[9px] uppercase tracking-wide",
                m.type === "chorus" ? "text-accent" : "text-subtle",
              )}
            >
              {m.name}
            </span>
          </div>
        ))}
        <div className="absolute inset-x-0 top-4 bottom-0">
          {tracks.slice(0, 10).map((t, i) => (
            <div key={t.id} className="absolute inset-x-0 h-[6px]" style={{ top: 4 + i * 8 }}>
              {t.clips.map((c) =>
                c.missing ? (
                  <div
                    key={c.id}
                    className="absolute h-full rounded-[1px] bg-danger/40"
                    style={{
                      left: `${(c.start / session.duration) * 100}%`,
                      width: `${(c.duration / session.duration) * 100}%`,
                    }}
                  />
                ) : c.silent ? (
                  <div
                    key={c.id}
                    className="absolute h-full rounded-[1px] bg-faint"
                    style={{
                      left: `${(c.start / session.duration) * 100}%`,
                      width: `${(c.duration / session.duration) * 100}%`,
                    }}
                  />
                ) : (
                  <div
                    key={c.id}
                    className={cn("absolute h-full overflow-hidden rounded-[1px]", tintClass(t.tint), "opacity-70")}
                    style={{
                      left: `${(c.start / session.duration) * 100}%`,
                      width: `${(c.duration / session.duration) * 100}%`,
                    }}
                  />
                ),
              )}
            </div>
          ))}
        </div>
        <div
          className="absolute top-0 bottom-0 w-px bg-playhead"
          style={{ left: `${(session.playhead / session.duration) * 100}%` }}
        />
      </button>
      <div className="mt-1 flex justify-between px-1 font-mono text-[10px] tabular-nums text-subtle">
        <span>0:00</span>
        <span>{formatTimeShort(session.duration / 2)}</span>
        <span>{formatTimeShort(session.duration)}</span>
      </div>
    </div>
  );
}

function TrackStrip({
  track,
  selected,
  dim,
  master,
  onSelect,
  onFader,
  onToggle,
}: {
  track: Track;
  selected: boolean;
  dim: boolean;
  master?: boolean;
  onSelect: () => void;
  onFader: (db: number) => void;
  onToggle: (f: "mute" | "solo" | "arm") => void;
}) {
  const silent = track.mute || dim || track.missingMedia;
  return (
    <div
      className={cn(
        "flex w-[72px] shrink-0 flex-col items-center gap-1.5 border-r border-border py-2",
        selected && "bg-elevated",
        master && "bg-panel",
        dim && "opacity-50",
      )}
    >
      <button type="button" onClick={onSelect} className="flex w-full flex-col items-center gap-1 px-1">
        <span className={cn("h-1 w-8 rounded-full", tintClass(track.tint))} />
        <span className="w-full truncate text-center text-[10px] font-medium leading-tight text-fg">{track.name}</span>
        {track.missingMedia && <span className="text-[9px] uppercase tracking-wide text-danger">offline</span>}
      </button>
      <div className="flex items-end gap-1">
        <LedMeter peakDb={track.peakDb} rmsDb={track.rmsDb} clip={track.clippingEvents > 0} silent={silent} />
        <Fader valueDb={track.volumeDb} onCommit={onFader} />
      </div>
      <div className="flex gap-0.5">
        <StripBtn label="M" active={track.mute} tone="mute" onClick={() => onToggle("mute")} />
        <StripBtn label="S" active={track.solo} tone="solo" onClick={() => onToggle("solo")} />
        <StripBtn label="R" active={track.arm} tone="arm" onClick={() => onToggle("arm")} />
      </div>
    </div>
  );
}

function StripBtn({
  label,
  active,
  tone,
  onClick,
}: {
  label: string;
  active: boolean;
  tone: "mute" | "solo" | "arm";
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "size-6 rounded-xs text-[9px] font-semibold",
        active
          ? tone === "mute"
            ? "bg-warn text-accent-fg"
            : tone === "solo"
              ? "bg-ok text-accent-fg"
              : "bg-danger text-fg"
          : "bg-elevated text-subtle shadow-[var(--shadow-border)]",
      )}
    >
      {label}
    </button>
  );
}

function Inspector() {
  const session = useHelix((s) => s.session);
  const id = useHelix((s) => s.selectedTrackId);
  const track = id ? findTrack(session, id) : undefined;
  if (!track) return null;
  return (
    <div className="grid grid-cols-2 gap-2 rounded-lg bg-surface p-3 shadow-[var(--shadow-border)] md:grid-cols-4">
      <Stat label="Track" value={track.name} />
      <Stat label="Gain" value={formatDb(track.volumeDb)} />
      <Stat label="True peak" value={formatDbTp(track.truePeakDb)} />
      <Stat label="LUFS-I" value={`${track.lufsIntegrated.toFixed(1)}`} />
      <div className="col-span-2 md:col-span-4">
        <p className="mb-1 text-[10px] uppercase tracking-wider text-subtle">Inserts</p>
        <div className="flex flex-wrap gap-1">
          {track.plugins.length ? (
            track.plugins.map((p) => (
              <span key={p} className="rounded-xs bg-elevated px-1.5 py-0.5 font-mono text-[10px] text-muted">
                {p}
              </span>
            ))
          ) : (
            <span className="text-[11px] text-subtle">None</span>
          )}
        </div>
      </div>
      {track.takes.length > 0 && (
        <div className="col-span-2 md:col-span-4">
          <p className="mb-1 text-[10px] uppercase tracking-wider text-subtle">Takes · measurement</p>
          <div className="grid gap-1 sm:grid-cols-2">
            {track.takes.map((tk) => (
              <div
                key={tk.id}
                className={cn(
                  "flex items-center justify-between rounded-sm bg-bg px-2 py-1 font-mono text-[11px]",
                  tk.archived && "opacity-40",
                  tk.selected && "shadow-[var(--shadow-border)]",
                )}
              >
                <span>
                  {tk.name}
                  {tk.selected ? " · comp" : tk.archived ? " · archive" : ""}
                </span>
                <span className="tabular-nums text-muted">SNR {tk.snrDb.toFixed(1)}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-[10px] uppercase tracking-wider text-subtle">{label}</p>
      <p className="font-mono text-sm tabular-nums">{value}</p>
    </div>
  );
}
