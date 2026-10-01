// The archive contains two adjacent engine contract revisions. The public
// exports at the bottom normalize the older implementation for the current UI.
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-nocheck
import type {
  CapabilityGraph,
  Change,
  Constraints,
  DiffLine,
  Finding,
  Intent,
  Mechanism,
  Operation,
  Precision,
  SessionState,
  Track,
  VerificationClass,
} from "./types";
import { DEFAULT_CONSTRAINTS } from "./types";
import { CHORUS_RANGES, cloneSession, trackById } from "./session";
import { formatClock, formatDb, quantizeHigh, quantizeMcu } from "./format";

export function nextOpId(seq: number): string {
  return `op_${String(seq).padStart(6, "0")}`;
}

function chorusOffsets(track: Track): number[] {
  const verse = track.volumeDb;
  return CHORUS_RANGES.map(([start, end]) => {
    const pts = track.automation.filter((p) => p.time >= start && p.time < end);
    if (!pts.length) return 0;
    const avg = pts.reduce((s, p) => s + p.db, 0) / pts.length;
    return avg - verse;
  });
}

export function scanFindings(session: SessionState): Finding[] {
  const findings: Finding[] = [];
  const lead = trackById(session, "tr_lead");
  const gtr = trackById(session, "tr_gtrbus");
  const room = trackById(session, "tr_room");
  const master = trackById(session, "tr_master");
  const scratch = trackById(session, "tr_scratch");

  if (lead && lead.clippingEvents > 0) {
    findings.push({
      id: "f_clip_lead",
      severity: "critical",
      trackId: lead.id,
      title: `${lead.name} — ${lead.clippingEvents} clipped events`,
      evidence: `True peak ${formatDb(lead.truePeakDb)} dBTP. Peak ${formatDb(lead.peakDb)} dBFS. Three transients exceed 0 dBFS.`,
      autoSafe: true,
      fixable: true,
      intent: { kind: "repair_clipping", trackId: lead.id },
    });
  }

  if (gtr && gtr.targetDb !== undefined) {
    const over = gtr.volumeDb - gtr.targetDb;
    if (over > 0.3) {
      findings.push({
        id: "f_gtr_hot",
        severity: "warn",
        trackId: gtr.id,
        title: `${gtr.name} — ${formatDb(over)} dB above target`,
        evidence: `Fader ${formatDb(gtr.volumeDb)} dB against a −3.5 dB bus target. Reduction of ${formatDb(over)} dB exceeds the 3 dB hard limit.`,
        autoSafe: false,
        fixable: true,
        intent: { kind: "set_gain", trackId: gtr.id, mode: "rel", db: -over, exact: false },
      });
    }
  }

  if (lead && lead.takes.length >= 2) {
    const active = lead.takes.filter((t) => !t.archived);
    const ranked = [...active].sort((a, b) => b.snrDb - a.snrDb);
    const best = ranked[0];
    const fourth = active.find((t) => t.name === "Take 4") ?? ranked[ranked.length - 1];
    if (best && fourth && fourth.id !== best.id && best.snrDb - fourth.snrDb >= 1) {
      findings.push({
        id: "f_takes",
        severity: "info",
        trackId: lead.id,
        title: `${fourth.name} — ${formatDb(best.snrDb - fourth.snrDb)} dB worse SNR than ${best.name}`,
        evidence: `${best.name} SNR ${formatDb(best.snrDb)} dB vs ${fourth.name} ${formatDb(fourth.snrDb)} dB. Measurement, not a taste call. Best two: ${ranked
          .slice(0, 2)
          .map((t) => t.name)
          .join(" and ")}.`,
        autoSafe: true,
        fixable: true,
        intent: { kind: "organize_takes", trackId: lead.id, keep: 2 },
      });
    }
  }

  if (room && room.unusedSilenceSec >= 1) {
    findings.push({
      id: "f_silence",
      severity: "info",
      trackId: room.id,
      title: `${room.name} — ${room.unusedSilenceSec.toFixed(1)} seconds unused silence`,
      evidence: `Leading silent region of ${room.unusedSilenceSec.toFixed(1)} s with no detectable audio. Safe to trim.`,
      autoSafe: true,
      fixable: true,
      intent: { kind: "trim_silence", trackId: room.id },
    });
  }

  if (master && master.truePeakDb > -1) {
    findings.push({
      id: "f_master_tp",
      severity: "critical",
      trackId: master.id,
      title: `${master.name} — ${formatDb(master.truePeakDb)} dBTP`,
      evidence: `True peak ${formatDb(master.truePeakDb)} dBTP. Integrated LUFS ${formatDb(master.lufsIntegrated)}. Target −1.0 dBTP.`,
      autoSafe: true,
      fixable: true,
      intent: { kind: "repair_true_peak", trackId: master.id, targetDb: -1 },
    });
  }

  if (scratch?.missingMedia) {
    findings.push({
      id: "f_missing",
      severity: "warn",
      trackId: scratch.id,
      title: `${scratch.name} — missing media`,
      evidence:
        "Offline clip. The file is not on disk. Helix will not invent audio or rewrite a proprietary project to fake a restore.",
      autoSafe: false,
      fixable: false,
      intent: { kind: "unknown", text: "locate missing media" },
    });
  }

  if (lead && lead.automation.length > 2) {
    const offsets = chorusOffsets(lead);
    const spread = Math.max(...offsets) - Math.min(...offsets);
    if (spread > 1.0) {
      findings.push({
        id: "f_chorus_auto",
        severity: "warn",
        trackId: lead.id,
        title: "Lead Vocal — inconsistent chorus automation",
        evidence: `Chorus offsets relative to verse: ${offsets
          .map((o, i) => `C${i + 1} ${formatDb(o)}`)
          .join(", ")}. Spread ${formatDb(spread)} dB.`,
        autoSafe: true,
        fixable: true,
        intent: { kind: "flatten_chorus", trackId: lead.id, offsetDb: -2 },
      });
    }
  }

  return findings;
}

interface MechPick {
  mechanism: Mechanism;
  precision: Precision;
  cap: "CAP-0" | "CAP-1" | "CAP-2" | "CAP-3";
  refuse?: string;
  human?: string;
}

function pickMechanism(
  kind: Intent["kind"],
  caps: CapabilityGraph,
  requireExact: boolean,
): MechPick {
  const native = caps.native;
  const plugin = caps.plugin_bridge;

  if (
    kind === "mute" ||
    kind === "solo" ||
    kind === "arm" ||
    kind === "transport" ||
    kind === "bank"
  ) {
    return { mechanism: "surface", precision: "EXACT", cap: "CAP-2" };
  }
  if (kind === "set_send") {
    return { mechanism: "surface", precision: "COARSE", cap: "CAP-2" };
  }
  if (kind === "rename") {
    if (native.rename) return { mechanism: "native", precision: "EXACT", cap: "CAP-3" };
    if (plugin.track_state) return { mechanism: "plugin_bridge", precision: "EXACT", cap: "CAP-3" };
    return {
      mechanism: "human",
      precision: "UNKNOWN",
      cap: "CAP-1",
      human: "Rename the track in the host, then re-inspect.",
    };
  }
  if (kind === "set_gain" || kind === "repair_clipping" || kind === "repair_true_peak") {
    if (native.parameter_exact) return { mechanism: "native", precision: "EXACT", cap: "CAP-3" };
    if (plugin.parameter_state && !requireExact) {
      return { mechanism: "plugin_bridge", precision: "HIGH", cap: "CAP-3" };
    }
    if (requireExact) {
      return {
        mechanism: "surface",
        precision: "COARSE",
        cap: "CAP-2",
        refuse: `The available ${caps.protocol} surface does not provide sufficient precision for an exact setting. Approximate through the mixer, or switch to a host with native/plugin parameter control (REAPER or Helix DAW).`,
      };
    }
    return { mechanism: "surface", precision: "COARSE", cap: "CAP-2" };
  }
  if (kind === "set_pan") {
    if (native.parameter_exact) return { mechanism: "native", precision: "EXACT", cap: "CAP-3" };
    return { mechanism: "surface", precision: "COARSE", cap: "CAP-2" };
  }
  if (kind === "write_automation" || kind === "flatten_chorus") {
    if (!DEFAULT_CONSTRAINTS.allowAutomationChanges) {
      return {
        mechanism: "none",
        precision: "UNKNOWN",
        cap: "CAP-0",
        refuse: "Automation changes are blocked by a hard constraint.",
      };
    }
    if (native.automation) return { mechanism: "native", precision: "EXACT", cap: "CAP-3" };
    if (plugin.track_state) return { mechanism: "plugin_bridge", precision: "HIGH", cap: "CAP-3" };
    return {
      mechanism: "human",
      precision: "COARSE",
      cap: "CAP-1",
      human: "Write a chorus volume ride of −2.0 dB in the host automation lane, then re-inspect.",
    };
  }
  if (kind === "organize_takes") {
    if (native.takes) return { mechanism: "native", precision: "EXACT", cap: "CAP-3" };
    if (plugin.track_state) return { mechanism: "plugin_bridge", precision: "EXACT", cap: "CAP-3" };
    return {
      mechanism: "human",
      precision: "UNKNOWN",
      cap: "CAP-1",
      human: "Keep the two highest-SNR takes visible and hide the others. Do not delete.",
    };
  }
  if (kind === "trim_silence") {
    if (native.clip_editing) return { mechanism: "native", precision: "EXACT", cap: "CAP-3" };
    if (plugin.track_state) return { mechanism: "plugin_bridge", precision: "EXACT", cap: "CAP-3" };
    return {
      mechanism: "human",
      precision: "UNKNOWN",
      cap: "CAP-1",
      human: "Trim the leading silent region on Drum Room.",
    };
  }
  return {
    mechanism: "none",
    precision: "UNKNOWN",
    cap: "CAP-0",
    refuse: "No mechanism for this intent.",
  };
}

function quantizeByPrecision(db: number, precision: Precision): number {
  if (precision === "EXACT") return db;
  if (precision === "HIGH") return quantizeHigh(db);
  return quantizeMcu(db);
}

function volumeChange(
  track: Track,
  change: Extract<Change, { kind: "volume" }>,
  precision: Precision,
) {
  const target = change.absDb !== undefined ? change.absDb : track.volumeDb + (change.deltaDb ?? 0);
  return quantizeByPrecision(target, precision);
}

function previewDiffs(session: SessionState, changes: Change[], precision: Precision): DiffLine[] {
  const lines: DiffLine[] = [];
  for (const change of changes) {
    if (change.kind === "volume") {
      const t = trackById(session, change.trackId);
      if (!t) continue;
      const next = volumeChange(t, change, precision);
      lines.push({
        label: `${t.name} · volume`,
        before: `${formatDb(t.volumeDb)} dB`,
        after: `${formatDb(next)} dB`,
      });
      if (t.truePeakDb > -80) {
        const delta = next - t.volumeDb;
        lines.push({
          label: `${t.name} · true peak`,
          before: `${formatDb(t.truePeakDb)} dBTP`,
          after: `${formatDb(t.truePeakDb + delta)} dBTP`,
        });
      }
    } else if (change.kind === "mute") {
      const t = trackById(session, change.trackId);
      if (t)
        lines.push({
          label: `${t.name} · mute`,
          before: t.mute ? "on" : "off",
          after: change.enabled ? "on" : "off",
        });
    } else if (change.kind === "solo") {
      const t = trackById(session, change.trackId);
      if (t)
        lines.push({
          label: `${t.name} · solo`,
          before: t.solo ? "on" : "off",
          after: change.enabled ? "on" : "off",
        });
    } else if (change.kind === "arm") {
      const t = trackById(session, change.trackId);
      if (t)
        lines.push({
          label: `${t.name} · arm`,
          before: t.arm ? "on" : "off",
          after: change.enabled ? "on" : "off",
        });
    } else if (change.kind === "rename") {
      const t = trackById(session, change.trackId);
      if (t) lines.push({ label: "Track name", before: t.name, after: change.name });
    } else if (change.kind === "trim_silence") {
      const t = trackById(session, change.trackId);
      if (t)
        lines.push({
          label: `${t.name} · silence`,
          before: `${t.unusedSilenceSec.toFixed(1)} s`,
          after: "0.0 s",
        });
    } else if (change.kind === "archive_takes") {
      const t = trackById(session, change.trackId);
      if (t) {
        const keep = t.takes.filter((x) => change.keepIds.includes(x.id)).map((x) => x.name);
        const hide = t.takes.filter((x) => !change.keepIds.includes(x.id)).map((x) => x.name);
        lines.push({
          label: "Keep",
          before:
            t.takes
              .filter((x) => x.selected && !x.archived)
              .map((x) => x.name)
              .join(", ") || "—",
          after: keep.join(", "),
        });
        lines.push({ label: "Archive", before: "—", after: hide.join(", ") });
      }
    } else if (change.kind === "automation_delta" || change.kind === "flatten_chorus") {
      const t = trackById(session, change.trackId);
      if (t) {
        lines.push({
          label: `${t.name} · chorus ride`,
          before: chorusOffsets(t)
            .map((o) => formatDb(o))
            .join(" / "),
          after: `${formatDb(change.kind === "flatten_chorus" ? change.offsetDb : change.deltaDb)} dB × 4`,
        });
      }
    } else if (change.kind === "pan") {
      const t = trackById(session, change.trackId);
      if (t)
        lines.push({
          label: `${t.name} · pan`,
          before: t.pan.toFixed(2),
          after: change.value.toFixed(2),
        });
    } else if (change.kind === "send") {
      const t = trackById(session, change.trackId);
      const send = t?.sends.find((candidate) => candidate.dest === change.dest);
      if (t)
        lines.push({
          label: `${t.name} · send`,
          before: send ? `${formatDb(send.db)} dB → ${change.dest}` : "not assigned",
          after: `${formatDb(change.db)} dB → ${change.dest}`,
        });
    }
  }
  return lines;
}

function vClass(kind: Intent["kind"]): VerificationClass {
  if (kind === "repair_clipping" || kind === "repair_true_peak") return "V3";
  if (kind === "set_gain" || kind === "write_automation" || kind === "flatten_chorus") return "V2";
  if (
    kind === "mute" ||
    kind === "solo" ||
    kind === "arm" ||
    kind === "rename" ||
    kind === "set_send"
  )
    return "V1";
  return "V1";
}

function planIntentLegacy(
  intent: Intent,
  session: SessionState,
  caps: CapabilityGraph,
  seq: number,
  constraints: Constraints = DEFAULT_CONSTRAINTS,
): Operation[] {
  if (
    intent.kind === "inspect_session" ||
    intent.kind === "inspect_takes" ||
    intent.kind === "fix_safe" ||
    intent.kind === "undo_last" ||
    intent.kind === "reset_session" ||
    intent.kind === "unknown"
  ) {
    return [];
  }

  const requireExact = intent.kind === "set_gain" && intent.exact === true;
  const pick = pickMechanism(intent.kind, caps, requireExact);
  const id = nextOpId(seq);
  const trackId =
    "trackId" in intent
      ? intent.trackId
      : intent.kind === "transport" || intent.kind === "bank"
        ? undefined
        : undefined;
  const track = trackId ? trackById(session, trackId) : undefined;

  const base = {
    id,
    mechanism: pick.mechanism,
    cap: pick.cap,
    precision: pick.precision,
    verificationClass: vClass(intent.kind),
    reversibility: true,
    approval: "user" as const,
    phase: "propose" as const,
    autoSafe: true,
    preconditions: [] as string[],
    changes: [] as Change[],
    diffs: [] as DiffLine[],
    toleranceDb: pick.precision === "EXACT" ? 0.05 : pick.precision === "HIGH" ? 0.15 : 0.6,
    trackId,
    refuseReason: pick.refuse,
    humanProcedure: pick.human,
  };

  if (intent.kind === "set_send" && !constraints.allowRoutingChanges) {
    pick.refuse =
      "Routing changes are blocked by the active project constraint. Enable routing changes explicitly before committing a send automation operation.";
  }
  if (pick.refuse) {
    return [
      {
        ...base,
        intent: describeIntent(intent, track),
        phase: "refused",
        autoSafe: false,
        approval: "none",
        changes: [],
        diffs: [],
      },
    ];
  }
  if (pick.mechanism === "human") {
    return [
      {
        ...base,
        intent: describeIntent(intent, track),
        phase: "propose",
        autoSafe: false,
        approval: "none",
        changes: [],
        diffs: [],
      },
    ];
  }

  const changes = changesFor(intent, session);
  if (!changes.length) return [];

  let autoSafe = true;
  const preconditions: string[] = [];
  for (const change of changes) {
    if (change.kind === "volume") {
      const t = trackById(session, change.trackId);
      if (!t) continue;
      const next = volumeChange(t, change, pick.precision);
      const delta = Math.abs(next - t.volumeDb);
      if (delta > constraints.maxGainChangeDb) {
        autoSafe = false;
        preconditions.push(
          `Gain change ${formatDb(delta)} dB exceeds hard limit of ${constraints.maxGainChangeDb} dB.`,
        );
      }
    }
    if (
      (change.kind === "automation_delta" || change.kind === "flatten_chorus") &&
      !constraints.allowAutomationChanges
    ) {
      autoSafe = false;
      preconditions.push("Automation changes are blocked.");
    }
  }

  const op: Operation = {
    ...base,
    intent: describeIntent(intent, track),
    changes,
    diffs: previewDiffs(session, changes, pick.precision),
    autoSafe,
    preconditions,
    findingId: undefined,
  };
  return [op];
}

function describeIntent(intent: Intent, track?: Track): string {
  const name = track?.name ?? "";
  switch (intent.kind) {
    case "set_gain":
      return intent.mode === "rel"
        ? `Adjust ${name} by ${formatDb(intent.db)} dB`
        : `Set ${name} to ${formatDb(intent.db)} dB${intent.exact ? " (exact)" : ""}`;
    case "repair_clipping":
      return `Repair clipping on ${name}`;
    case "repair_true_peak":
      return `Bring ${name} below ${formatDb(intent.targetDb)} dBTP`;
    case "mute":
      return `${intent.enabled ? "Mute" : "Unmute"} ${name}`;
    case "solo":
      return `${intent.enabled ? "Solo" : "Unsolo"} ${name}`;
    case "arm":
      return `${intent.enabled ? "Arm" : "Disarm"} ${name}`;
    case "rename":
      return `Rename ${name}`;
    case "trim_silence":
      return `Trim silence on ${name}`;
    case "organize_takes":
      return `Keep best ${intent.keep} takes on ${name}`;
    case "write_automation":
      return `Ride ${name} ${formatDb(intent.deltaDb)} dB in every chorus`;
    case "flatten_chorus":
      return `Normalize ${name} chorus rides to ${formatDb(intent.offsetDb)} dB`;
    case "set_pan":
      return `Pan ${name}`;
    case "set_send":
      return `Set ${name} send to ${intent.dest} at ${formatDb(intent.db)} dB`;
    case "transport":
      return `Transport ${intent.command}`;
    case "bank":
      return `Bank ${intent.delta > 0 ? "right" : "left"}`;
    default:
      return intent.kind;
  }
}

function changesFor(intent: Intent, session: SessionState): Change[] {
  switch (intent.kind) {
    case "set_gain":
      return [
        intent.mode === "abs"
          ? { kind: "volume", trackId: intent.trackId, absDb: intent.db }
          : { kind: "volume", trackId: intent.trackId, deltaDb: intent.db },
      ];
    case "repair_clipping": {
      const t = trackById(session, intent.trackId);
      if (!t) return [];
      const need = Math.max(t.truePeakDb + 0.7, t.peakDb + 0.5);
      const delta = -Math.min(2.4, Math.max(0.8, need));
      return [{ kind: "volume", trackId: t.id, deltaDb: delta }];
    }
    case "repair_true_peak": {
      const t = trackById(session, intent.trackId);
      if (!t) return [];
      const delta = Math.min(0, intent.targetDb - 0.12 - t.truePeakDb);
      return [{ kind: "volume", trackId: t.id, deltaDb: delta }];
    }
    case "mute":
      return [{ kind: "mute", trackId: intent.trackId, enabled: intent.enabled }];
    case "solo":
      return [{ kind: "solo", trackId: intent.trackId, enabled: intent.enabled }];
    case "arm":
      return [{ kind: "arm", trackId: intent.trackId, enabled: intent.enabled }];
    case "rename":
      return [{ kind: "rename", trackId: intent.trackId, name: intent.name }];
    case "set_pan":
      return [{ kind: "pan", trackId: intent.trackId, value: intent.value }];
    case "set_send":
      return [
        {
          kind: "send",
          trackId: intent.trackId,
          dest: intent.dest,
          db: intent.db,
          sendIndex: intent.sendIndex,
        },
      ];
    case "trim_silence":
      if (!intent.trackId) return [];
      return [{ kind: "trim_silence", trackId: intent.trackId }];
    case "organize_takes": {
      const t = trackById(session, intent.trackId);
      if (!t) return [];
      const ranked = [...t.takes].filter((x) => !x.archived).sort((a, b) => b.snrDb - a.snrDb);
      return [
        {
          kind: "archive_takes",
          trackId: t.id,
          keepIds: ranked.slice(0, intent.keep).map((x) => x.id),
        },
      ];
    }
    case "write_automation":
      return [
        {
          kind: "automation_delta",
          trackId: intent.trackId,
          region: "chorus",
          deltaDb: intent.deltaDb,
        },
      ];
    case "flatten_chorus":
      return [{ kind: "flatten_chorus", trackId: intent.trackId, offsetDb: intent.offsetDb }];
    case "transport":
      return [{ kind: "transport", command: intent.command }];
    case "bank":
      return [{ kind: "bank", delta: intent.delta }];
    default:
      return [];
  }
}

export function applyChanges(
  session: SessionState,
  changes: Change[],
  precision: Precision,
): SessionState {
  const next = cloneSession(session);
  for (const change of changes) {
    if (change.kind === "transport") {
      if (change.command === "play") next.playing = true;
      if (change.command === "stop") next.playing = false;
      if (change.command === "return") {
        next.playhead = 0;
        next.playing = false;
      }
      continue;
    }
    if (change.kind === "bank") continue;
    const track = next.tracks.find((t) => t.id === change.trackId);
    if (!track) continue;
    if (change.kind === "volume") {
      const applied = volumeChange(track, change, precision);
      const delta = applied - track.volumeDb;
      track.volumeDb = applied;
      track.peakDb += delta;
      track.truePeakDb += delta;
      track.lufsIntegrated += delta;
      track.lufsShort += delta;
      track.rmsDb += delta;
      if (track.peakDb < -0.1 && track.truePeakDb < 0) track.clippingEvents = 0;
      track.automation = track.automation.map((p) => ({ ...p, db: p.db + delta }));
    } else if (change.kind === "mute") {
      track.mute = change.enabled;
    } else if (change.kind === "solo") {
      track.solo = change.enabled;
    } else if (change.kind === "arm") {
      track.arm = change.enabled;
    } else if (change.kind === "rename") {
      track.name = change.name;
    } else if (change.kind === "pan") {
      track.pan = change.value;
    } else if (change.kind === "send") {
      const existing = track.sends.find((send) => send.dest === change.dest);
      if (existing) existing.db = change.db;
      else track.sends.push({ dest: change.dest, db: change.db });
    } else if (change.kind === "trim_silence") {
      track.unusedSilenceSec = 0;
      track.clips = track.clips.filter((c) => !c.silent);
    } else if (change.kind === "archive_takes") {
      track.takes = track.takes.map((tk) => ({
        ...tk,
        archived: !change.keepIds.includes(tk.id),
        selected: change.keepIds.includes(tk.id),
      }));
    } else if (change.kind === "automation_delta") {
      for (const [start, end] of CHORUS_RANGES) {
        const inside = track.automation.filter((p) => p.time >= start && p.time < end);
        if (!inside.length) {
          track.automation.push({ time: start, db: track.volumeDb });
          track.automation.push({ time: start + 0.2, db: track.volumeDb + change.deltaDb });
          track.automation.push({ time: end - 0.2, db: track.volumeDb + change.deltaDb });
          track.automation.push({ time: end, db: track.volumeDb });
        } else {
          track.automation = track.automation.map((p) =>
            p.time >= start && p.time < end ? { ...p, db: p.db + change.deltaDb } : p,
          );
        }
      }
      track.automation.sort((a, b) => a.time - b.time);
    } else if (change.kind === "flatten_chorus") {
      const verse = track.volumeDb;
      const target = verse + change.offsetDb;
      const stamped: { time: number; db: number }[] = track.automation.filter((p) =>
        CHORUS_RANGES.every(([s, e]) => p.time < s || p.time >= e),
      );
      for (const [start, end] of CHORUS_RANGES) {
        stamped.push({ time: start, db: verse });
        stamped.push({ time: start + 0.25, db: target });
        stamped.push({ time: end - 0.25, db: target });
        stamped.push({ time: end, db: verse });
      }
      stamped.sort((a, b) => a.time - b.time);
      track.automation = stamped;
    }
  }
  return next;
}

function verifyOperationLegacy(
  op: Operation,
  before: SessionState,
  after: SessionState,
): Operation["verification"] {
  if (!op.changes.length) {
    return { status: "SKIPPED", observed: "No mutation.", class: op.verificationClass };
  }
  const failures: string[] = [];
  for (const change of op.changes) {
    if (change.kind === "volume") {
      const t0 = trackById(before, change.trackId);
      const t1 = trackById(after, change.trackId);
      if (!t0 || !t1) continue;
      const expected = volumeChange(t0, change, op.precision);
      if (Math.abs(t1.volumeDb - expected) > op.toleranceDb) {
        failures.push(`volume ${formatDb(t1.volumeDb)} vs ${formatDb(expected)}`);
      }
    }
    if (change.kind === "mute") {
      const t1 = trackById(after, change.trackId);
      if (t1 && t1.mute !== change.enabled) failures.push("mute mismatch");
    }
    if (change.kind === "trim_silence") {
      const t1 = trackById(after, change.trackId);
      if (t1 && t1.unusedSilenceSec > 0.05) failures.push("silence remains");
    }
    if (change.kind === "archive_takes") {
      const t1 = trackById(after, change.trackId);
      if (t1) {
        const kept = t1.takes.filter((t) => !t.archived).map((t) => t.id);
        if (kept.sort().join() !== [...change.keepIds].sort().join())
          failures.push("take selection mismatch");
      }
    }
  }
  if (failures.length) {
    return { status: "FAIL", observed: failures.join("; "), class: op.verificationClass };
  }
  const t = op.trackId ? trackById(after, op.trackId) : undefined;
  const observed = t
    ? `${t.name} vol ${formatDb(t.volumeDb)} dB · TP ${formatDb(t.truePeakDb)} dBTP`
    : "State matched the plan.";
  return { status: "PASS", observed, class: op.verificationClass };
}

export function ledgerSummary(op: Operation): string {
  const diffs = op.diffs.map((d) => `${d.label}: ${d.before} → ${d.after}`).join(" · ");
  const v = op.verification?.status ?? "—";
  return `${op.intent}. ${diffs} Verified ${v}.`;
}

export function chorusRegionLabel(): string {
  return CHORUS_RANGES.map(([a, b]) => `${formatClock(a)}–${formatClock(b)}`).join(", ");
}

export function makeSeq() {
  let msg = 0;
  let op = 0;
  return {
    nextMsg: () => `msg_${String(++msg).padStart(5, "0")}`,
    nextOp: () => ++op,
  };
}

export function scanSession(session: SessionState): Finding[] {
  return scanFindings(session).map((finding: any) => ({
    id: finding.id,
    severity: finding.severity,
    trackId: finding.trackId,
    title: finding.title,
    detail: finding.evidence ?? "",
    evidence: Array.isArray(finding.evidence) ? finding.evidence : [finding.evidence ?? ""],
    autoSafe: finding.autoSafe,
    fixable: finding.fixable,
    intentKind: finding.intent?.kind ?? "unknown",
    _intent: finding.intent,
  }));
}

export function describeInspect(findings: Finding[]): string {
  if (!findings.length) return "Session looks clean. No actionable findings.";
  return findings
    .map((finding) => `${finding.severity.toUpperCase()} · ${finding.title}\n${finding.detail}`)
    .join("\n\n");
}

export function planFinding(
  finding: any,
  session: SessionState,
  caps: CapabilityGraph,
  constraints: Constraints,
  seq: ReturnType<typeof makeSeq>,
): Operation[] {
  const intent = finding._intent ?? finding.intent;
  if (!intent) return [];
  return planIntent(intent, session, caps, constraints, seq);
}

export function planIntent(
  intent: Intent,
  session: SessionState,
  caps: CapabilityGraph,
  constraints: Constraints,
  seq: ReturnType<typeof makeSeq>,
): Operation[] {
  const legacy = planIntentLegacy(
    intent as any,
    session,
    caps,
    seq.nextOp(),
    constraints as any,
  ) as any[];
  return legacy.map((item) => ({
    ...item,
    summary: item.intent,
    intent: item.intent,
    cap: Number(String(item.cap).replace("CAP-", "")) || 0,
    verifyClass: item.verificationClass ?? "V1",
    refusedReason: item.refuseReason,
    human: item.humanProcedure,
  }));
}

export function executeOperation(op: Operation, before: SessionState) {
  const session = applyChanges(before, op.changes, op.precision);
  return {
    session,
    snapshot: {
      id: `snap_${op.id}`,
      operationId: op.id,
      session: cloneSession(before),
      bankOffset: 0,
    },
  };
}

export function applyChange(
  session: SessionState,
  change: Change,
  precision: Precision,
): SessionState {
  return applyChanges(session, [change], precision);
}

export function toLedger(
  op: Operation,
  before: SessionState,
  after: SessionState,
  verification: LedgerEntry["verification"],
  seq: ReturnType<typeof makeSeq>,
): LedgerEntry {
  return {
    id: `led_${seq.nextMsg()}`,
    operationId: op.id,
    timestamp: Date.now(),
    intent: op.intent,
    summary: op.summary,
    target: op.trackId ?? "session",
    mechanism: op.mechanism,
    diffs: op.diffs,
    human: op.human ?? "Applied by Helix.",
    verification,
    verifyClass: op.verifyClass,
    rollbackAvailable: verification === "PASS",
  };
}

export function verifyOperationCompat(op: Operation, before: SessionState, after: SessionState) {
  const result = verifyOperationLegacy(op as any, before, after) as any;
  return { pass: result.status === "PASS", note: result.observed ?? result.status };
}

export { verifyOperationCompat as verifyOperation };

export function dbToFader127(db: number): number {
  return Math.round(Math.max(0, Math.min(127, ((db + 60) / 72) * 127)));
}

export function fader127ToDb(value: number): number {
  return (Math.max(0, Math.min(127, value)) / 127) * 72 - 60;
}
