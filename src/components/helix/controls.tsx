import { useEffect, useRef, useState, type PointerEvent as PE } from "react";
import { cn } from "@/lib/utils";
import { dbToFader127, fader127ToDb } from "@/lib/helix/engine";
import { formatDb, mulberry32 } from "@/lib/helix/format";

const TINT = [
  "bg-tint-0",
  "bg-tint-1",
  "bg-tint-2",
  "bg-tint-3",
  "bg-tint-4",
  "bg-tint-5",
  "bg-tint-6",
  "bg-tint-7",
] as const;

export function tintClass(n: number) {
  return TINT[n % TINT.length];
}

export function Fader({
  valueDb,
  onCommit,
  height = 132,
  disabled,
}: {
  valueDb: number;
  onCommit: (db: number) => void;
  height?: number;
  disabled?: boolean;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [live, setLive] = useState<number | null>(null);
  const db = live ?? valueDb;
  const pos = dbToFader127(db) / 127;

  function fromClientY(clientY: number) {
    const el = ref.current;
    if (!el) return valueDb;
    const r = el.getBoundingClientRect();
    const t = Math.max(0, Math.min(1, 1 - (clientY - r.top) / r.height));
    return fader127ToDb(Math.round(t * 127));
  }

  function onDown(e: PE<HTMLDivElement>) {
    if (disabled) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    setLive(fromClientY(e.clientY));
  }
  function onMove(e: PE<HTMLDivElement>) {
    if (live === null) return;
    setLive(fromClientY(e.clientY));
  }
  function onUp(e: PE<HTMLDivElement>) {
    if (live === null) return;
    const next = fromClientY(e.clientY);
    setLive(null);
    onCommit(next);
  }

  return (
    <div className="flex flex-col items-center gap-1">
      <div
        ref={ref}
        role="slider"
        aria-valuemin={-60}
        aria-valuemax={6}
        aria-valuenow={Math.round(db * 10) / 10}
        aria-disabled={disabled}
        tabIndex={0}
        onPointerDown={onDown}
        onPointerMove={onMove}
        onPointerUp={onUp}
        onPointerCancel={onUp}
        className={cn(
          "relative w-7 touch-none rounded-sm bg-bg shadow-[inset_0_0_0_1px_var(--color-border)]",
          disabled && "opacity-40",
        )}
        style={{ height }}
      >
        <div className="absolute inset-x-2 top-[22%] h-px bg-border-strong" />
        <div
          className="absolute left-1/2 z-10 size-4 -translate-x-1/2 rounded-[3px] bg-accent shadow-[0_1px_2px_rgb(0_0_0/0.4)]"
          style={{ bottom: `calc(${pos * 100}% - 8px)` }}
        />
      </div>
      <span className="font-mono text-[10px] tabular-nums text-muted">{formatDb(db)}</span>
    </div>
  );
}

export function LedMeter({
  peakDb,
  rmsDb,
  clip,
  silent,
}: {
  peakDb: number;
  rmsDb: number;
  clip: boolean;
  silent: boolean;
}) {
  const [level, setLevel] = useState(0);
  const [hold, setHold] = useState(0);

  useEffect(() => {
    let raf = 0;
    let last = performance.now();
    const loop = (now: number) => {
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      if (silent) {
        setLevel((v) => v * Math.pow(0.02, dt));
        setHold((v) => v * Math.pow(0.15, dt));
      } else {
        const target = Math.max(0, Math.min(1, (rmsDb + 48) / 54));
        const peak = Math.max(0, Math.min(1, (peakDb + 48) / 54));
        const noise = (Math.random() - 0.4) * 0.08;
        setLevel((v) => v + (target + noise - v) * Math.min(1, dt * 14));
        setHold((v) => Math.max(peak, v * Math.pow(0.25, dt)));
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [peakDb, rmsDb, silent]);

  const segs = 16;
  const lit = Math.round(level * segs);

  return (
    <div className="flex h-[132px] w-2.5 flex-col-reverse gap-px" aria-hidden>
      {Array.from({ length: segs }, (_, i) => {
        const idx = i;
        const on = idx < lit || (clip && idx >= segs - 1);
        const color =
          idx >= segs - 2 ? "bg-meter-clip" : idx >= segs - 5 ? "bg-meter-warn" : "bg-meter";
        const holdOn = Math.round(hold * segs) === idx + 1;
        return (
          <div
            key={idx}
            className={cn(
              "flex-1 rounded-[1px]",
              on || holdOn ? color : "bg-faint",
              !on && holdOn && "opacity-80",
              on && "opacity-90",
            )}
          />
        );
      })}
    </div>
  );
}

export function Waveform({
  seed,
  width,
  height,
  dim,
}: {
  seed: number;
  width: number;
  height: number;
  dim?: boolean;
}) {
  const d = useRef("");
  if (!d.current) {
    const rand = mulberry32(seed);
    const pts: string[] = [];
    const n = 80;
    for (let i = 0; i <= n; i++) {
      const x = (i / n) * width;
      const env = 0.25 + 0.75 * Math.sin((i / n) * Math.PI);
      const y = height / 2 + (rand() * 2 - 1) * (height / 2) * env * 0.92;
      pts.push(`${x.toFixed(1)},${y.toFixed(1)}`);
    }
    d.current = pts.join(" ");
  }
  return (
    <svg width={width} height={height} className={cn("block overflow-visible", dim && "opacity-30")} aria-hidden>
      <polyline
        fill="none"
        stroke="currentColor"
        strokeWidth="1.1"
        points={d.current}
        className="text-muted"
      />
    </svg>
  );
}
