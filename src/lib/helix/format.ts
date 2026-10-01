import type { Mechanism, Precision, CapLevel, AutonomyLevel, VerifyClass } from "./types";

export function formatDb(db: number, digits = 1): string {
  if (!Number.isFinite(db) || db <= -60) return "−∞";
  const n = db.toFixed(digits);
  return `${db > 0 ? "+" : db < 0 ? "−" : ""}${n.replace("-", "")} dB`;
}

export function formatDbTp(db: number): string {
  if (!Number.isFinite(db)) return "—";
  const sign = db > 0 ? "+" : db < 0 ? "−" : "";
  return `${sign}${Math.abs(db).toFixed(2)} dBTP`;
}

export function formatTime(sec: number): string {
  const s = Math.max(0, sec);
  const m = Math.floor(s / 60);
  const r = s - m * 60;
  const whole = Math.floor(r);
  const tenths = Math.floor((r - whole) * 10);
  return `${m}:${String(whole).padStart(2, "0")}.${tenths}`;
}

export function formatTimeShort(sec: number): string {
  const s = Math.max(0, sec);
  const m = Math.floor(s / 60);
  const whole = Math.floor(s - m * 60);
  return `${m}:${String(whole).padStart(2, "0")}`;
}

export function formatClock(sec: number): string {
  const minutes = Math.floor(sec / 60);
  const seconds = Math.floor(sec % 60);
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}

export function quantizeHigh(db: number): number {
  return Math.round(db * 10) / 10;
}

export function quantizeMcu(db: number): number {
  return Math.round(db * 2) / 2;
}

export function mechanismLabel(m: Mechanism): string {
  switch (m) {
    case "native":
      return "Native";
    case "plugin_bridge":
      return "Plugin bridge";
    case "control_surface":
      return "Control surface";
    case "file":
      return "File";
    case "human":
      return "Human-assisted";
  }
}

export function precisionLabel(p: Precision): string {
  return p;
}

export function capLabel(c: CapLevel): string {
  return `CAP-${c}`;
}

export function verifyLabel(v: VerifyClass): string {
  switch (v) {
    case "V0":
      return "Ack";
    case "V1":
      return "State feedback";
    case "V2":
      return "Semantic";
    case "V3":
      return "Audio";
  }
}

export const AUTONOMY: { level: AutonomyLevel; label: string; blurb: string }[] = [
  { level: 0, label: "Observe", blurb: "Inspect and analyze. No mutations." },
  { level: 1, label: "Propose", blurb: "Plans and diffs. You execute." },
  { level: 2, label: "Approve", blurb: "Each mutation needs approval." },
  { level: 3, label: "Batch", blurb: "Approve a group of operations." },
  { level: 4, label: "Bounded", blurb: "Runs automatically inside constraints." },
  { level: 5, label: "Unattended", blurb: "Long-running work in a defined scope." },
];

export function uid(prefix: string, n: number): string {
  return `${prefix}_${String(n).padStart(6, "0")}`;
}

export function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
