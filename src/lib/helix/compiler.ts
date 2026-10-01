// The compiler normalizes free-form text into the shared intent union at runtime.
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-nocheck
import type { CompileResult, SessionState, Track } from "./types";
import { mixerTracks } from "./session";

function norm(s: string): string {
  return s.toLowerCase().replace(/[“”]/g, '"').replace(/[’]/g, "'").trim();
}

const ALIASES: { id: string; keys: string[] }[] = [
  { id: "tr_lead", keys: ["lead vocal", "lead vox", "the vocal", "vocal", "vox", "lead"] },
  { id: "tr_gtrbus", keys: ["guitar bus", "gtr bus", "guitars", "guitar"] },
  { id: "tr_room", keys: ["drum room", "room mic", "room"] },
  { id: "tr_scratch", keys: ["scratch gtr", "scratch guitar", "scratch", "track 19"] },
  { id: "tr_master", keys: ["master", "stereo out", "2-bus", "2bus"] },
  { id: "tr_kick", keys: ["kick", "kick drum"] },
  { id: "tr_snare", keys: ["snare"] },
  { id: "tr_bass", keys: ["bass"] },
  { id: "tr_hats", keys: ["hats", "hihat", "hi-hat"] },
  { id: "tr_ohl", keys: ["oh l", "overhead l", "overheads"] },
  { id: "tr_ohr", keys: ["oh r", "overhead r"] },
  { id: "tr_gtrl", keys: ["gtr l", "guitar l", "left guitar"] },
  { id: "tr_gtrr", keys: ["gtr r", "guitar r", "right guitar"] },
  { id: "tr_acoustic", keys: ["acoustic"] },
  { id: "tr_rhodes", keys: ["rhodes", "keys"] },
  { id: "tr_harm", keys: ["harm vocal", "harmony"] },
  { id: "tr_bg", keys: ["bg vox", "background", "bg vocal"] },
  { id: "tr_pad", keys: ["pad", "synth"] },
  { id: "tr_fx", keys: ["fx", "effects"] },
  { id: "tr_perc", keys: ["perc", "percussion"] },
];

export function resolveTrack(text: string, session: SessionState): Track | undefined {
  const n = norm(text);
  const tracks = session.tracks;
  for (const a of ALIASES) {
    if (a.keys.some((k) => n.includes(k))) return tracks.find((t) => t.id === a.id);
  }
  for (const t of tracks) {
    if (n.includes(norm(t.name))) return t;
  }
  const m = n.match(/track\s+(\d+)/);
  if (m) {
    const idx = Number(m[1]);
    return mixerTracks(session).find((t) => t.index === idx);
  }
  return undefined;
}

function parseDb(text: string): number | undefined {
  const m = text.match(/([+-]?\d+(?:\.\d+)?)\s*(?:db|dbtp)?/i);
  if (!m) return undefined;
  return Number(m[1]);
}

export function compileLocal(text: string, session: SessionState): CompileResult {
  const n = norm(text);
  const track = resolveTrack(n, session);

  if (/reset (session|mix|project)/.test(n)) {
    return { intent: { kind: "reset_session" }, source: "local", confidence: 0.95 };
  }
  if (/\b(undo|rollback|revert)\b/.test(n)) {
    return { intent: { kind: "undo_last" }, source: "local", confidence: 0.93 };
  }
  if (/\b(inspect|scan|audit|hygiene|health|findings|problems|what's wrong|whats wrong)\b/.test(n)) {
    if (/\btake/.test(n)) return { intent: { kind: "inspect_takes", trackId: track?.id }, source: "local", confidence: 0.92 };
    if (/rout/.test(n)) return { intent: { kind: "inspect_routing" }, source: "local", confidence: 0.9 };
    return { intent: { kind: "inspect_session" }, source: "local", confidence: 0.96 };
  }
  if (/\b(fix (the )?(safe|auto|five|5)|fix what you can|repair safe|apply safe|fix automatically)\b/.test(n)) {
    return { intent: { kind: "fix_safe" }, source: "local", confidence: 0.94 };
  }
  if (/\b(approve (all|batch|them)|do it|apply (all|batch)|execute (all|batch))\b/.test(n)) {
    return { intent: { kind: "approve_all" }, source: "local", confidence: 0.9 };
  }
  if (/\b(play|start playback)\b/.test(n) && !/playlist/.test(n)) {
    return { intent: { kind: "transport", command: "play" }, source: "local", confidence: 0.88 };
  }
  if (/\b(stop|pause)\b/.test(n)) {
    return { intent: { kind: "transport", command: "stop" }, source: "local", confidence: 0.88 };
  }
  if (/\b(return to zero|rtz|go to start|rewind)\b/.test(n)) {
    return { intent: { kind: "transport", command: "return" }, source: "local", confidence: 0.9 };
  }
  if (/\bbank (left|back|prev)/.test(n)) return { intent: { kind: "bank", delta: -1 }, source: "local", confidence: 0.9 };
  if (/\bbank (right|next|forward)/.test(n)) return { intent: { kind: "bank", delta: 1 }, source: "local", confidence: 0.9 };

  if (/\b(keep (the )?best|best two|organize takes|comp the vocal|clean up the (vocal )?takes)\b/.test(n)) {
    return {
      intent: { kind: "organize_takes", trackId: track?.id ?? "tr_lead", keep: 2 },
      source: "local",
      confidence: 0.93,
    };
  }
  if (/\b(trim silence|remove silence|unused silence)\b/.test(n)) {
    return { intent: { kind: "trim_silence", trackId: track?.id }, source: "local", confidence: 0.9 };
  }

  if (/\b(ride|duck|automate|chorus)\b/.test(n) && /\b(vocal|vox|lead|chorus)\b/.test(n)) {
    const db = parseDb(n);
    const amount = db !== undefined ? (n.includes("down") || n.includes("reduce") ? -Math.abs(db) : db) : -2;
    return {
      intent: {
        kind: "write_automation",
        trackId: track?.id ?? "tr_lead",
        region: "chorus",
        deltaDb: amount,
      },
      source: "local",
      confidence: 0.92,
    };
  }

  const exact = /\bexact/.test(n);
  const down = /\b(down|reduce|lower|cut|drop)\b/.test(n);
  const up = /\b(up|raise|boost|increase)\b/.test(n);
  const db = parseDb(n);
  if (track && db !== undefined && /\b(db|fader|gain|level|volume)\b/.test(n)) {
    if (/\bto\b/.test(n) || exact) {
      return {
        intent: { kind: "set_gain", trackId: track.id, mode: "abs", db, exact },
        source: "local",
        confidence: exact ? 0.97 : 0.9,
      };
    }
    const signed = down ? -Math.abs(db) : up ? Math.abs(db) : db;
    return {
      intent: { kind: "set_gain", trackId: track.id, mode: "rel", db: signed, exact },
      source: "local",
      confidence: 0.94,
    };
  }
  if (track && (down || up) && db !== undefined) {
    return {
      intent: {
        kind: "set_gain",
        trackId: track.id,
        mode: "rel",
        db: down ? -Math.abs(db) : Math.abs(db),
        exact,
      },
      source: "local",
      confidence: 0.9,
    };
  }

  if (track && /\bunmute\b/.test(n)) {
    return { intent: { kind: "mute", trackId: track.id, enabled: false }, source: "local", confidence: 0.95 };
  }
  if (track && /\bmute\b/.test(n)) {
    return { intent: { kind: "mute", trackId: track.id, enabled: true }, source: "local", confidence: 0.95 };
  }
  if (track && /\bunsolo\b/.test(n)) {
    return { intent: { kind: "solo", trackId: track.id, enabled: false }, source: "local", confidence: 0.95 };
  }
  if (track && /\bsolo\b/.test(n)) {
    return { intent: { kind: "solo", trackId: track.id, enabled: true }, source: "local", confidence: 0.95 };
  }
  if (track && /\b(arm|record enable)\b/.test(n)) {
    return { intent: { kind: "arm", trackId: track.id, enabled: !/\bdisarm\b/.test(n) }, source: "local", confidence: 0.9 };
  }

  const rename = n.match(/rename\s+(.+?)\s+to\s+["']?(.+?)["']?$/);
  if (rename) {
    const t = resolveTrack(rename[1], session);
    if (t) {
      return {
        intent: { kind: "rename", trackId: t.id, name: rename[2].replace(/["']/g, "").trim() },
        source: "local",
        confidence: 0.88,
      };
    }
  }

  if (/\b(routing|sends|busses|buses)\b/.test(n)) {
    return { intent: { kind: "inspect_routing" }, source: "local", confidence: 0.85 };
  }

  return { intent: { kind: "unknown", text }, source: "local", confidence: 0.2 };
}

export const PROMPT_CHIPS = [
  "Inspect session",
  "Turn the lead vocal down 2 dB",
  "Set vocal to exactly -14.2 dB",
  "Ride the vocal down 2 dB during every chorus",
  "Keep the best two vocal takes",
  "Trim silence on the drum room",
];
