// Retained as a compatibility reference for the UDAWCA adapter revision.
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
import { formatDb, quantizeHigh, quantizeMcu } from "./format";

export function nextOpId(seq: number): string {
  return `op_${String(seq).padStart(6, "0")}`;
}

function chorusOffsets(track: Track): number[] {
  const verse = track.volumeDb;
  return CHORUS_RANGES.map(([start, end]) => {
    const pts = track.automation.filter((p) => p.time >= start && p.time < end);
    if (!pts.length) return 0;
    return pts.reduce((s, p) => s + p.db, 0) / pts.length - verse;
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
        evidence: `Fader ${formatDb(gtr.volumeDb)} dB against a −3.5 dB bus target. A ${formatDb(over)} dB cut exceeds the 3 dB hard limit.`,
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
      evidence: `Leading silent region of ${room.unusedSilenceSec.toFixed(1)} s. Safe to trim.`,
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
      evidence: "Offline clip. UDAWCA will not invent audio or rewrite a proprietary project to fake a restore.",
      autoSafe: false,
      fixable: false,
      intent: { kind: "unknown", text: "locate missing media" },
    });
  }
  if (lead && lead.automation.length > 2) {
    const offsets = chorusOffsets(lead);
    const spread = Math.max(...offsets) - Math.min(...offsets);
    if (spread > 1) {
      findings.push({
        id: "f_chorus_auto",
        severity: "warn",
        trackId: lead.id,
        title: "Lead Vocal — inconsistent chorus automation",
        evidence: `Chorus offsets: ${offsets.map((o, i) => `C${i + 1} ${formatDb(o)}`).join(", ")}. Spread ${formatDb(spread)} dB.`,
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

function pickMechanism(kind: Intent["kind"], caps: CapabilityGraph, requireExact: boolean): MechPick {
  const { native, plugin_bridge: plugin } = caps;
  if (kind === "mute" || kind === "solo" || kind === "arm" || kind === "transport" || kind === "bank") {
    return { mechanism: "surface", precision: "EXACT", cap: "CAP-2" };
  }
  if (kind === "rename") {
    if (native.rename) return { mechanism: "native", precision: "EXACT", cap: "CAP-3" };
    if (plugin.track_state) return { mechanism: "plugin_bridge", precision: "EXACT", cap: "CAP-3" };
    return { mechanism: "human", precision: "UNKNOWN", cap: "CAP-1", human: "Rename the track in the host, then re-inspect." };
  }
  if (kind === "set_gain" || kind === "repair_clipping" || kind === "repair_true_peak") {
    if (native.parameter_exact) return { mechanism: "native", precision: "EXACT", cap: "CAP-3" };
    if (plugin.parameter_state && !requireExact) return { mechanism: "plugin_bridge", precision: "HIGH", cap: "CAP-3" };
    if (requireExact) {
      return {
        mechanism: "surface",
        precision: "COARSE",
        cap: "CAP-2",
        refuse: `The available ${caps.protocol} surface does not provide sufficient precision for an exact setting. I can approximate it through the mixer, or use native/plugin integration on a host that exposes it (REAPER, Ableton, Bitwig).`,
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
      return { mechanism: "none", precision: "UNKNOWN", cap: "CAP-0", refuse: "Automation changes are blocked by a hard constraint." };
    }
    if (native.automation) return { mechanism: "native", precision: "EXACT", cap: "CAP-3" };
    if (plugin.track_state) return { mechanism: "plugin_bridge", precision: "HIGH", cap: "CAP-3" };
    return { mechanism: "human", precision: "COARSE", cap: "CAP-1", human: "Write a chorus volume ride of −2.0 dB in the host automation lane, then re-inspect." };
  }
  if (kind === "organize_takes") {
    if (native.takes) return { mechanism: "native", precision: "EXACT", cap: "CAP-3" };
    if (plugin.track_state) return { mechanism: "plugin_bridge", precision: "EXACT", cap: "CAP-3" };
    return { mechanism: "human", precision: "UNKNOWN", cap: "CAP-1", human: "Keep the two highest-SNR takes visible and hide the others. Do not delete." };
  }
  if (kind === "trim_silence") {
    if (native.clip_editing) return { mechanism: "native", precision: "EXACT", cap: "CAP-3" };
    if (plugin.track_state) return { mechanism: "plugin_bridge", precision: "EXACT", cap: "CAP-3" };
    return { mechanism: "human", precision: "UNKNOWN", cap: "CAP-1", human: "Trim the leading silent region on Drum Room." };
  }
  return { mechanism: "none", precision: "UNKNOWN", cap: "CAP-0", refuse: "No mechanism for this intent." };
}

function quantizeByPrecision(db: number, precision: Precision): number {
  if (precision === "EXACT") return db;
  if (precision === "HIGH") return quantizeHigh(db);
  return quantizeMcu(db);
}

export function volumeAfter(track: Track, change: Extract<Change, { kind: "volume" }>, precision: Precision) {
  const target = change.absDb !== undefined ? change.absDb : track.volumeDb + (change.deltaDb ?? 0);
  return quantizeByPrecision(target, precision);
}

function previewDiffs(session: SessionState, changes: Change[], precision: Precision): DiffLine[] {
  const lines: DiffLine[] = [];
  for (const change of changes) {
    if (change.kind === "volume") {
      const t = trackById(session, change.trackId);
      if (!t) continue;
      const next = volumeAfter(t, change, precision);
      lines.push({ label: `${t.name} · volume`, before: `${formatDb(t.volumeDb)} dB`, after: `${formatDb(next)} dB` });
      if (t.truePeakDb > -80) {
        const delta = next - t.volumeDb;
        lines.push({
          label: `${t.name} · true peak`,
          before: `${formatDb(t.truePeakDb)} dBTP`,
          after: `${formatDb(t.truePeakDb + delta)} dBTP`,
        });
      }
    } else if (change.kind === "mute" || change.kind === "solo" || change.kind === "arm") {
      const t = trackById(session, change.trackId);
      const key = change.kind;
      if (t) lines.push({ label: `${t.name} · ${key}`, before: t[key] ? "on" : "off", after: change.enabled ? "on" : "off" });
    } else if (change.kind === "rename") {
      const t = trackById(session, change.trackId);
      if (t) lines.push({ label: "Track name", before: t.name, after: change.name });
    } else if (change.kind === "trim_silence") {
      const t = trackById(session, change.trackId);
      if (t) lines.push({ label: `${t.name} · silence`, before: `${t.unusedSilenceSec.toFixed(1)} s`, after: "0.0 s" });
    } else if (change.kind === "archive_takes") {
      const t = trackById(session, change.trackId);
      if (t) {
        const keep = t.takes.filter((x) => change.keepIds.includes(x.id)).map((x) => x.name);
        const hide = t.takes.filter((x) => !change.keepIds.includes(x.id)).map((x) => x.name);
        lines.push({
          label: "Keep",
          before: t.takes.filter((x) => x.selected && !x.archived).map((x) => x.name).join(", ") || "—",
          after: keep.join(", "),
        });
        lines.push({ label: "Archive", before: "—", after: hide.join(", ") });
      }
    } else if (change.kind === "automation_delta" || change.kind === "flatten_chorus") {
      const t = trackById(session, change.trackId);
      if (t) {
        lines.push({
          label: `${t.name} · chorus ride`,
          before: chorusOffsets(t).map((o) => formatDb(o)).join(" / "),
          after: `${formatDb(change.kind === "flatten_chorus" ? change.offsetDb : change.deltaDb)} dB × 4 regions`,
        });
      }
    } else if (change.kind === "pan") {
      const t = trackById(session, change.trackId);
      if (t) lines.push({ label: `${t.name} · pan`, before: t.pan.toFixed(2), after: change.value.toFixed(2) });
    }
  }
  return lines;
}

function vClass(kind: Intent["kind"]): VerificationClass {
  if (kind === "repair_clipping" || kind === "repair_true_peak") return "V3";
  if (kind === "set_gain" || kind === "write_automation" || kind === "flatten_chorus") return "V2";
  return "V1";
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
      return [{ kind: "volume", trackId: t.id, deltaDb: -Math.min(2.4, Math.max(0.8, need)) }];
    }
    case "repair_true_peak": {
      const t = trackById(session, intent.trackId);
      if (!t) return [];
      return [{ kind: "volume", trackId: t.id, deltaDb: Math.min(0, intent.targetDb - 0.12 - t.truePeakDb) }];
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
    case "trim_silence":
      return intent.trackId ? [{ kind: "trim_silence", trackId: intent.trackId }] : [];
    case "organize_takes": {
      const t = trackById(session, intent.trackId);
      if (!t) return [];
      const ranked = [...t.takes].filter((x) => !x.archived).sort((a, b) => b.snrDb - a.snrDb);
      return [{ kind: "archive_takes", trackId: t.id, keepIds: ranked.slice(0, intent.keep).map((x) => x.id) }];
    }
    case "write_automation":
      return [{ kind: "automation_delta", trackId: intent.trackId, region: "chorus", deltaDb: intent.deltaDb }];
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

export function planIntent(
  intent: Intent,
  session: SessionState,
  caps: CapabilityGraph,
  seq: number,
  constraints: Constraints = DEFAULT_CONSTRAINTS,
): Operation[] {
  const skip = new Set([
    "inspect_session",
    "inspect_takes",
    "fix_safe",
    "undo_last",
    "reset_session",
    "unknown",
    "show_settings",
    "set_host",
    "set_autonomy",
    "show_capabilities",
    "show_mixer",
    "show_ledger",
    "show_surface",
  ]);
  if (skip.has(intent.kind)) return [];

  const requireExact = intent.kind === "set_gain" && intent.exact === true;
  const pick = pickMechanism(intent.kind, caps, requireExact);
  const trackId = "trackId" in intent ? intent.trackId : undefined;
  const track = trackId ? trackById(session, trackId) : undefined;

  const base: Operation = {
    id: nextOpId(seq),
    intent: describeIntent(intent, track),
    trackId,
    mechanism: pick.mechanism,
    cap: pick.cap,
    precision: pick.precision,
    verificationClass: vClass(intent.kind),
    changes: [],
    diffs: [],
    preconditions: [],
    toleranceDb: pick.precision === "EXACT" ? 0.05 : pick.precision === "HIGH" ? 0.15 : 0.6,
    reversibility: true,
    approval: "user",
    autoSafe: true,
    phase: "propose",
    refuseReason: pick.refuse,
    humanProcedure: pick.human,
  };

  if (pick.refuse) return [{ ...base, phase: "refused", autoSafe: false, approval: "none" }];
  if (pick.mechanism === "human") return [{ ...base, autoSafe: false, approval: "none" }];

  const changes = changesFor(intent, session);
  if (!changes.length) return [];

  let autoSafe = true;
  const preconditions: string[] = [];
  for (const change of changes) {
    if (change.kind !== "volume") continue;
    const t = trackById(session, change.trackId);
    if (!t) continue;
    const delta = Math.abs(volumeAfter(t, change, pick.precision) - t.volumeDb);
    if (delta > constraints.maxGainChangeDb) {
      autoSafe = false;
      preconditions.push(`Gain change ${formatDb(delta)} dB exceeds the hard limit of ${constraints.maxGainChangeDb} dB.`);
    }
  }

  return [{ ...base, changes, diffs: previewDiffs(session, changes, pick.precision), autoSafe, preconditions }];
}

export function capVolumeChange(op: Operation, session: SessionState, maxDb: number): Operation {
  const changes = op.changes.map((change) => {
    if (change.kind !== "volume") return change;
    const t = trackById(session, change.trackId);
    if (!t) return change;
    const delta = volumeAfter(t, change, op.precision) - t.volumeDb;
    if (Math.abs(delta) <= maxDb) return change;
    return { kind: "volume" as const, trackId: change.trackId, deltaDb: Math.sign(delta) * maxDb };
  });
  return {
    ...op,
    changes,
    diffs: previewDiffs(session, changes, op.precision),
    autoSafe: true,
    preconditions: [`Applied at the ${maxDb} dB hard limit. Remaining delta needs a constraint change.`],
  };
}

export function applyChanges(session: SessionState, changes: Change[], precision: Precision): SessionState {
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
      const applied = volumeAfter(track, change, precision);
      const delta = applied - track.volumeDb;
      track.volumeDb = applied;
      track.peakDb += delta;
      track.truePeakDb += delta;
      track.lufsIntegrated += delta;
      track.lufsShort += delta;
      track.rmsDb += delta;
      if (track.peakDb < -0.1 && track.truePeakDb < 0) track.clippingEvents = 0;
      track.automation = track.automation.map((p) => ({ ...p, db: p.db + delta }));
    } else if (change.kind === "mute") track.mute = change.enabled;
    else if (change.kind === "solo") track.solo = change.enabled;
    else if (change.kind === "arm") track.arm = change.enabled;
    else if (change.kind === "rename") track.name = change.name;
    else if (change.kind === "pan") track.pan = change.value;
    else if (change.kind === "trim_silence") {
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
        const inside = track.automation.some((p) => p.time >= start && p.time < end);
        if (!inside) {
          track.automation.push(
            { time: start, db: track.volumeDb },
            { time: start + 0.2, db: track.volumeDb + change.deltaDb },
            { time: end - 0.2, db: track.volumeDb + change.deltaDb },
            { time: end, db: track.volumeDb },
          );
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
      const stamped = track.automation.filter((p) => CHORUS_RANGES.every(([s, e]) => p.time < s || p.time >= e));
      for (const [start, end] of CHORUS_RANGES) {
        stamped.push(
          { time: start, db: verse },
          { time: start + 0.25, db: target },
          { time: end - 0.25, db: target },
          { time: end, db: verse },
        );
      }
      stamped.sort((a, b) => a.time - b.time);
      track.automation = stamped;
    }
  }
  return next;
}

export function verifyOperation(
  op: Operation,
  before: SessionState,
  after: SessionState,
): NonNullable<Operation["verification"]> {
  if (!op.changes.length) return { status: "SKIPPED", observed: "No mutation.", class: op.verificationClass };
  const failures: string[] = [];
  for (const change of op.changes) {
    if (change.kind === "volume") {
      const t0 = trackById(before, change.trackId);
      const t1 = trackById(after, change.trackId);
      if (!t0 || !t1) continue;
      const expected = volumeAfter(t0, change, op.precision);
      if (Math.abs(t1.volumeDb - expected) > op.toleranceDb) failures.push(`volume ${formatDb(t1.volumeDb)} vs ${formatDb(expected)}`);
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
        if (kept.sort().join() !== [...change.keepIds].sort().join()) failures.push("take selection mismatch");
      }
    }
  }
  if (failures.length) return { status: "FAIL", observed: failures.join("; "), class: op.verificationClass };
  const t = op.trackId ? trackById(after, op.trackId) : undefined;
  return {
    status: "PASS",
    observed: t ? `${t.name} vol ${formatDb(t.volumeDb)} dB · TP ${formatDb(t.truePeakDb)} dBTP` : "State matched the plan.",
    class: op.verificationClass,
  };
}

export function ledgerSummary(op: Operation): string {
  const diffs = op.diffs.map((d) => `${d.label}: ${d.before} → ${d.after}`).join(" · ");
  return `${op.intent}. ${diffs} Verified ${op.verification?.status ?? "—"}.`;
}

export function takeTable(session: SessionState, trackId: string): string {
  const t = trackById(session, trackId);
  if (!t || !t.takes.length) return "No takes on this track.";
  const lines = t.takes
    .filter((x) => !x.archived)
    .sort((a, b) => b.snrDb - a.snrDb)
    .map(
      (x, i) =>
        `${i + 1}. ${x.name}  SNR ${formatDb(x.snrDb)} dB  pitch ${Math.round(x.pitchStability * 100)}  timing ${Math.round(x.timingStability * 100)}  floor ${formatDb(x.noiseFloorDb)} dB${x.clippingEvents ? `  clips ${x.clippingEvents}` : ""}`,
    );
  return `Take measurements on ${t.name} — not musical judgment.\n${lines.join("\n")}`;
}
