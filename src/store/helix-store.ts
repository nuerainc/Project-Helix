import { create } from "zustand";
import type {
  AgentMessage,
  AutonomyLevel,
  CapabilityGraph,
  Finding,
  HostId,
  Intent,
  LedgerEntry,
  Operation,
  SessionState,
  Snapshot,
} from "@/lib/helix/types";
import { DEFAULT_CONSTRAINTS, hostById } from "@/lib/helix/hosts";
import { cloneSession, createDemoSession, findTrack, mixerTracks } from "@/lib/helix/session";
import {
  applyChange,
  describeInspect,
  executeOperation,
  makeSeq,
  planFinding,
  planIntent,
  scanSession,
  toLedger,
  verifyOperation,
} from "@/lib/helix/engine";
import { compileLocal } from "@/lib/helix/compiler";
import { compileIntentRemote } from "@/lib/helix/compile-intent";
import { AUTONOMY } from "@/lib/helix/format";
import { createProToolsHuiSimulator, type AdapterHealth } from "@/lib/udawca/adapter";
import type { HelixSurfaceProtocol } from "@/lib/udawca/protocol-registry";
import type { VoiceInputMode, VoiceProviderHealth, VoiceTranscript } from "@/lib/helix/voice";
import type { AudioDiagnosticsSnapshot } from "@/lib/helix/audio-diagnostics";
import {
  createBrowserVoiceMacroStorage,
  createVoiceMacro,
  type VoiceMacro,
} from "@/lib/helix/voice-macros";
import {
  createBrowserBackupStorage,
  createSessionBackup,
  verifySessionBackup,
  type SessionBackup,
} from "@/lib/helix/session-backup";

const seq = makeSeq();
const proToolsHuiSimulator = createProToolsHuiSimulator();
const sessionBackupStorage = createBrowserBackupStorage();
const voiceMacroStorage = createBrowserVoiceMacroStorage();

function welcome(): AgentMessage {
  return {
    id: seq.nextMsg(),
    role: "system",
    timestamp: Date.now(),
    text: "Helix compiles production intent, then picks the strongest mechanism this host actually has — native, plugin bridge, or control surface. It verifies the result and writes a ledger. Today it drives the DAW you already use. Long-term, Helix Session is the agent-first DAW.",
  };
}

type MobilePane = "mixer" | "agent" | "ledger" | "surface";

interface HelixStore {
  hostId: HostId;
  caps: CapabilityGraph;
  autonomy: AutonomyLevel;
  session: SessionState;
  bankOffset: number;
  selectedTrackId: string | null;
  findings: Finding[];
  inspectFindings: Finding[];
  operations: Operation[];
  ledger: LedgerEntry[];
  snapshots: Record<string, Snapshot>;
  messages: AgentMessage[];
  busy: boolean;
  mobilePane: MobilePane;
  capsOpen: boolean;
  adapterProtocol: HelixSurfaceProtocol;
  adapterHealth: AdapterHealth | null;
  voiceHealth: VoiceProviderHealth;
  voiceMode: VoiceInputMode | null;
  latestVoiceTranscript: VoiceTranscript | null;
  lastVoiceRoutingConfirmation: string | null;
  adapterFeedbackAt: number | null;
  routingFeedback: string | null;
  backups: SessionBackup[];
  backupStatus: string | null;
  pendingRecoveryId: string | null;
  voiceMacros: VoiceMacro[];
  audioDiagnostics: AudioDiagnosticsSnapshot | null;
  audioDiagnosticsStatus: string | null;
  connect: (id: HostId) => void;
  setAutonomy: (level: AutonomyLevel) => void;
  selectTrack: (id: string | null) => void;
  bank: (delta: number) => void;
  setPlayhead: (t: number) => void;
  tick: (dt: number) => void;
  setMobilePane: (p: MobilePane) => void;
  toggleCaps: (open?: boolean) => void;
  setAdapterProtocol: (protocol: HelixSurfaceProtocol) => void;
  connectAdapter: () => Promise<void>;
  disconnectAdapter: () => Promise<void>;
  setVoiceHealth: (health: VoiceProviderHealth) => void;
  setVoiceMode: (mode: VoiceInputMode | null) => void;
  receiveVoiceTranscript: (transcript: VoiceTranscript) => Promise<void>;
  receiveAdapterFeedback: (session: SessionState) => void;
  backupSession: (label?: string) => SessionBackup;
  listBackups: () => SessionBackup[];
  requestRestore: (backupId?: string) => void;
  approveRestore: () => void;
  defineVoiceMacro: (name: string, trigger: string, template: string) => void;
  listVoiceMacros: () => VoiceMacro[];
  deleteVoiceMacro: (name: string) => void;
  inspectAudioDiagnostics: () => void;
  receiveAudioDiagnostics: (snapshot: AudioDiagnosticsSnapshot) => void;
  submit: (text: string) => Promise<void>;
  inspect: () => Promise<void>;
  approve: (id: string) => Promise<void>;
  approveSafe: () => Promise<void>;
  skip: (id: string) => void;
  undo: (operationId: string) => void;
  reset: () => void;
  surfaceFader: (trackId: string, db: number) => void;
  surfaceToggle: (trackId: string, field: "mute" | "solo" | "arm") => void;
  transport: (command: "play" | "stop" | "return") => void;
}

function pushMsg(
  list: AgentMessage[],
  role: AgentMessage["role"],
  text: string,
  extra?: Partial<AgentMessage>,
): AgentMessage[] {
  return [
    ...list,
    {
      id: seq.nextMsg(),
      role,
      text,
      timestamp: Date.now(),
      ...extra,
    },
  ];
}

function pendingOps(ops: Operation[]) {
  return ops.filter((o) => o.phase === "propose" || o.phase === "approve");
}

export const useHelix = create<HelixStore>((set, get) => ({
  hostId: "logic",
  caps: hostById("logic"),
  autonomy: 2,
  session: createDemoSession(),
  bankOffset: 0,
  selectedTrackId: "tr_lead",
  findings: [],
  inspectFindings: [],
  operations: [],
  ledger: [],
  snapshots: {},
  messages: [welcome()],
  busy: false,
  mobilePane: "agent",
  capsOpen: false,
  adapterProtocol: "HUI",
  adapterHealth: null,
  voiceHealth: {
    state: "idle",
    permission: "unknown",
    message: "Native booth microphone is not connected in the browser preview.",
  },
  voiceMode: null,
  latestVoiceTranscript: null,
  lastVoiceRoutingConfirmation: null,
  adapterFeedbackAt: null,
  routingFeedback: null,
  backups: sessionBackupStorage.list(),
  backupStatus: null,
  pendingRecoveryId: null,
  voiceMacros: voiceMacroStorage.list(),
  audioDiagnostics: null,
  audioDiagnosticsStatus: null,

  connect: (id) => {
    const caps = hostById(id);
    set((s) => ({
      hostId: id,
      caps,
      adapterHealth:
        id === "protools" && get().adapterProtocol === "HUI" ? proToolsHuiSimulator.health() : null,
      messages: pushMsg(
        s.messages,
        "system",
        caps.agentFirst
          ? `Connected to ${caps.label}. This is the agent-first DAW — intent, verification, and the ledger are native. No MCU translation.`
          : `Connected to ${caps.label} (${caps.vendor}) over ${caps.protocol}. Mixer precision: ${caps.precision.volume}. Native exact parameters: ${caps.native.parameter_exact ? "yes" : "no"}.`,
      ),
    }));
  },

  setAutonomy: (level) => {
    const row = AUTONOMY.find((a) => a.level === level);
    set((s) => ({
      autonomy: level,
      messages: pushMsg(s.messages, "system", `Autonomy ${level} — ${row?.label}. ${row?.blurb}`),
    }));
  },

  selectTrack: (id) => set({ selectedTrackId: id }),

  bank: (delta) => {
    const n = mixerTracks(get().session).length;
    const max = Math.max(0, Math.ceil(n / 8) - 1);
    set((s) => ({ bankOffset: Math.max(0, Math.min(max, s.bankOffset + delta)) }));
  },

  setPlayhead: (t) =>
    set((s) => ({
      session: { ...s.session, playhead: Math.max(0, Math.min(s.session.duration, t)) },
    })),

  tick: (dt) => {
    const s = get();
    if (!s.session.playing) return;
    let next = s.session.playhead + dt;
    let playing = true;
    if (next >= s.session.duration) {
      next = 0;
      playing = false;
    }
    set({ session: { ...s.session, playhead: next, playing } });
  },

  setMobilePane: (p) => set({ mobilePane: p }),
  toggleCaps: (open) => set((s) => ({ capsOpen: open ?? !s.capsOpen })),

  setVoiceHealth: (health) => set({ voiceHealth: health }),
  setVoiceMode: (mode) => set({ voiceMode: mode }),
  receiveVoiceTranscript: async (transcript) => {
    const routingPrompt = /\b(send|route|routing|aux|bus|reverb|delay)\b/i.test(transcript.text);
    set((s) => ({
      latestVoiceTranscript: transcript,
      lastVoiceRoutingConfirmation: routingPrompt
        ? "Voice routing prompt received. Helix will plan the send change, require routing permission, and wait for surface feedback before confirming it."
        : s.lastVoiceRoutingConfirmation,
      messages: routingPrompt
        ? pushMsg(
            s.messages,
            "system",
            "Voice routing prompt received. Planning will preserve Helix approval and feedback verification.",
          )
        : s.messages,
    }));
    if (!transcript.final || !transcript.text.trim()) return;
    await get().submit(transcript.text.trim());
  },

  receiveAdapterFeedback: (feedback) => {
    const touched = feedback.tracks
      .filter((track) => track.feedbackAt)
      .filter(
        (track) =>
          track.sends.length || track.meterLeftDb !== undefined || track.meterRightDb !== undefined,
      )
      .slice(0, 6)
      .map((track) => {
        const sends = track.sends.map((send) => `${send.dest} ${send.db.toFixed(1)} dB`).join(", ");
        const meters = [track.meterLeftDb, track.meterRightDb]
          .filter((db): db is number => db !== undefined)
          .map((db) => `${db.toFixed(1)} dB`)
          .join(" / ");
        return `${track.name}: ${[sends && `sends ${sends}`, meters && `meters ${meters}`].filter(Boolean).join(" · ")}`;
      });
    const summary = touched.length ? `Live HUI feedback: ${touched.join("; ")}.` : null;
    set((s) => ({
      session: cloneSession(feedback),
      adapterFeedbackAt: Date.now(),
      routingFeedback: summary,
      messages:
        summary && summary !== s.routingFeedback
          ? pushMsg(s.messages, "system", summary)
          : s.messages,
    }));
  },

  backupSession: (label) => {
    const backup = createSessionBackup(get().session, label);
    sessionBackupStorage.save(backup);
    set((s) => ({
      backups: sessionBackupStorage.list(),
      backupStatus: `Backup saved: ${backup.label}. Integrity ${backup.checksum}.`,
      messages: pushMsg(s.messages, "system", `Session backup saved: ${backup.label}.`),
    }));
    return backup;
  },

  listBackups: () => {
    const backups = sessionBackupStorage.list();
    set({
      backups,
      backupStatus: backups.length
        ? `${backups.length} session backup(s) available.`
        : "No session backups exist yet.",
    });
    return backups;
  },

  requestRestore: (backupId) => {
    const records = sessionBackupStorage.list();
    const backup =
      (backupId &&
        records.find(
          (candidate) =>
            candidate.id === backupId || candidate.label.toLowerCase() === backupId.toLowerCase(),
        )) ??
      records[0];
    if (!backup) {
      set((s) => ({
        backupStatus: "No session backup is available to restore.",
        messages: pushMsg(s.messages, "agent", "No session backup is available to restore."),
      }));
      return;
    }
    set((s) => ({
      pendingRecoveryId: backup.id,
      backupStatus: `Recovery staged: ${backup.label}. Approval is required before replacing the current session.`,
      messages: pushMsg(
        s.messages,
        "agent",
        `Recovery staged for ${backup.label}. Approve it to replace the current session.`,
      ),
    }));
  },

  approveRestore: () => {
    const id = get().pendingRecoveryId;
    const backup = id
      ? sessionBackupStorage.list().find((candidate) => candidate.id === id)
      : undefined;
    if (!backup) return;
    const integrity = verifySessionBackup(backup);
    if (!integrity.ok) {
      set((s) => ({
        pendingRecoveryId: null,
        backupStatus: integrity.reason,
        messages: pushMsg(s.messages, "agent", integrity.reason),
      }));
      return;
    }
    set((s) => ({
      session: cloneSession(backup.session),
      pendingRecoveryId: null,
      backupStatus: `Recovered ${backup.label} after integrity verification.`,
      findings: scanSession(backup.session),
      messages: pushMsg(
        s.messages,
        "agent",
        `Recovered ${backup.label}. Checksum verified before restore.`,
      ),
    }));
  },

  defineVoiceMacro: (name, trigger, template) => {
    try {
      const macro = createVoiceMacro(name, trigger, template);
      voiceMacroStorage.save(macro);
      set((s) => ({
        voiceMacros: voiceMacroStorage.list(),
        messages: pushMsg(
          s.messages,
          "system",
          `Voice macro saved: “${macro.trigger}” runs “${macro.template}”.`,
        ),
      }));
    } catch (error) {
      set((s) => ({
        messages: pushMsg(
          s.messages,
          "agent",
          error instanceof Error ? error.message : String(error),
        ),
      }));
    }
  },

  listVoiceMacros: () => {
    const voiceMacros = voiceMacroStorage.list();
    set({ voiceMacros });
    return voiceMacros;
  },

  deleteVoiceMacro: (name) => {
    const macro = voiceMacroStorage
      .list()
      .find(
        (candidate) =>
          candidate.name.toLowerCase() === name.toLowerCase() ||
          candidate.trigger === name.toLowerCase(),
      );
    if (!macro) {
      set((s) => ({
        messages: pushMsg(s.messages, "agent", `No voice macro named “${name}” exists.`),
      }));
      return;
    }
    voiceMacroStorage.remove(macro.id);
    set((s) => ({
      voiceMacros: voiceMacroStorage.list(),
      messages: pushMsg(s.messages, "system", `Voice macro deleted: “${macro.name}”.`),
    }));
  },

  inspectAudioDiagnostics: () => {
    const snapshot = get().audioDiagnostics;
    set((s) => ({
      audioDiagnosticsStatus: snapshot
        ? `${snapshot.status.toUpperCase()}: input ${snapshot.inputLatencyMs?.toFixed(1) ?? "—"} ms · jitter ${snapshot.jitterMs.toFixed(1)} ms · CPU ${snapshot.cpuLoadPercent.toFixed(0)}% · xruns ${snapshot.xruns} · dropouts ${snapshot.dropouts}`
        : "No live audio diagnostics sample is available. Start the native booth provider to collect telemetry.",
      messages: pushMsg(
        s.messages,
        "agent",
        snapshot
          ? `Audio diagnostics: ${snapshot.message}`
          : "No live audio diagnostics sample is available.",
      ),
    }));
  },

  receiveAudioDiagnostics: (snapshot) => {
    set({
      audioDiagnostics: snapshot,
      audioDiagnosticsStatus: `${snapshot.status.toUpperCase()}: ${snapshot.inputLatencyMs?.toFixed(1) ?? "—"} ms input · ${snapshot.jitterMs.toFixed(1)} ms jitter · ${snapshot.cpuLoadPercent.toFixed(0)}% CPU`,
    });
  },

  setAdapterProtocol: (protocol) =>
    set((s) => ({
      adapterProtocol: protocol,
      adapterHealth: protocol === "HUI" ? proToolsHuiSimulator.health() : null,
      messages: pushMsg(
        s.messages,
        "system",
        `${protocol} selected. Native desktop transport requires explicit port configuration; browser preview remains fixture-only.`,
      ),
    })),

  connectAdapter: async () => {
    if (get().hostId !== "protools") return;
    if (get().adapterProtocol !== "HUI") {
      set((s) => ({
        adapterHealth: null,
        messages: pushMsg(
          s.messages,
          "system",
          `${get().adapterProtocol} is implemented in the native desktop adapter, but this browser preview does not claim a live connection without configured MIDI/UDP ports.`,
        ),
      }));
      return;
    }
    const health = await proToolsHuiSimulator.connect();
    set((s) => ({
      adapterHealth: health,
      messages: pushMsg(s.messages, "system", health.message ?? "Adapter connected."),
    }));
  },

  disconnectAdapter: async () => {
    if (get().adapterProtocol !== "HUI") return;
    await proToolsHuiSimulator.disconnect();
    set((s) => ({
      adapterHealth: proToolsHuiSimulator.health(),
      messages: pushMsg(
        s.messages,
        "system",
        "Pro Tools HUI simulator disconnected. No live DAW connection is claimed.",
      ),
    }));
  },

  submit: async (text) => {
    const trimmed = text.trim();
    if (!trimmed) return;
    set((s) => ({ messages: pushMsg(s.messages, "user", trimmed), busy: true }));
    const local = compileLocal(trimmed, get().session, get().voiceMacros);
    let intent: Intent = local.intent;
    if (local.confidence < 0.75 && local.intent.kind === "unknown") {
      try {
        const remote = await compileIntentRemote({
          data: {
            text: trimmed,
            host: get().caps.label,
            trackIds: get().session.tracks.map((t) => ({ id: t.id, name: t.name })),
          },
        });
        if (remote.ok) intent = remote.intent;
      } catch {
        /* local fallback */
      }
    }
    await dispatchIntent(intent, trimmed);
    set({ busy: false });
  },

  inspect: async () => {
    set((s) => ({
      messages: pushMsg(s.messages, "user", "Inspect session"),
      busy: true,
      mobilePane: "agent",
    }));
    await wait(520);
    await dispatchIntent({ kind: "inspect_session" }, "Inspect session");
    set({ busy: false });
  },

  approve: async (id) => {
    await runOne(id);
  },

  approveSafe: async () => {
    const ids = pendingOps(get().operations)
      .filter((o) => o.autoSafe && !o.refusedReason)
      .map((o) => o.id);
    for (const id of ids) await runOne(id);
  },

  skip: (id) => {
    set((s) => ({
      operations: s.operations.map((o) => (o.id === id ? { ...o, phase: "skipped" as const } : o)),
      messages: pushMsg(s.messages, "agent", `Skipped ${id}.`),
    }));
  },

  undo: (operationId) => {
    const snap = get().snapshots[operationId];
    if (!snap) return;
    set((s) => ({
      session: cloneSession(snap.session),
      ledger: s.ledger.map((e) =>
        e.operationId === operationId
          ? { ...e, rollbackAvailable: false, rolledBack: true, verification: e.verification }
          : e,
      ),
      operations: s.operations.map((o) =>
        o.id === operationId ? { ...o, phase: "rollback" as const } : o,
      ),
      findings: scanSession(snap.session),
      messages: pushMsg(
        s.messages,
        "agent",
        `Rolled back ${operationId}. Host-level undo would also apply; the ledger keeps the semantic record.`,
      ),
    }));
  },

  reset: () => {
    const session = createDemoSession();
    set((s) => ({
      session,
      findings: [],
      inspectFindings: [],
      operations: [],
      snapshots: {},
      ledger: [],
      bankOffset: 0,
      selectedTrackId: "tr_lead",
      messages: pushMsg(s.messages, "system", "Session restored to the Night Shift demo mix."),
    }));
  },

  surfaceFader: (trackId, db) => {
    const { session, caps } = get();
    if (!findTrack(session, trackId)) return;
    set({
      session: applyChange(session, { kind: "volume", trackId, absDb: db }, caps.precision.volume),
    });
  },

  surfaceToggle: (trackId, field) => {
    const { session } = get();
    const track = findTrack(session, trackId);
    if (!track) return;
    set({
      session: applyChange(session, { kind: field, trackId, enabled: !track[field] }, "EXACT"),
    });
  },

  transport: (command) => {
    set((s) => {
      const session = { ...s.session };
      if (command === "play") session.playing = true;
      if (command === "stop") session.playing = false;
      if (command === "return") {
        session.playing = false;
        session.playhead = 0;
      }
      return { session };
    });
  },
}));

async function wait(ms: number) {
  await new Promise((r) => setTimeout(r, ms));
}

async function dispatchIntent(intent: Intent, original: string) {
  const state = useHelix.getState();
  const { session, caps, autonomy } = state;

  if (intent.kind === "unknown") {
    useHelix.setState((s) => ({
      messages: pushMsg(
        s.messages,
        "agent",
        `I could not compile “${original}” into an operation. Try inspect, a relative gain change, an exact level, chorus automation, or take organization.`,
      ),
    }));
    return;
  }

  if (intent.kind === "reset_session") {
    useHelix.getState().reset();
    return;
  }
  if (intent.kind === "backup_session") {
    const backup = useHelix.getState().backupSession(intent.label);
    useHelix.setState((s) => ({
      messages: pushMsg(
        s.messages,
        "agent",
        `Voice backup complete: ${backup.label} is available for recovery.`,
      ),
    }));
    return;
  }
  if (intent.kind === "list_backups") {
    const backups = useHelix.getState().listBackups();
    useHelix.setState((s) => ({
      messages: pushMsg(
        s.messages,
        "agent",
        backups.length
          ? `Available session backups\n${backups.map((backup) => `${backup.label} · ${new Date(backup.createdAt).toLocaleString()}`).join("\n")}`
          : "No session backups are available.",
      ),
    }));
    return;
  }
  if (intent.kind === "restore_session") {
    useHelix.getState().requestRestore(intent.backupId);
    if (autonomy >= 4) useHelix.getState().approveRestore();
    return;
  }
  if (intent.kind === "define_voice_macro") {
    useHelix.getState().defineVoiceMacro(intent.name, intent.trigger, intent.template);
    return;
  }
  if (intent.kind === "list_voice_macros") {
    const macros = useHelix.getState().listVoiceMacros();
    useHelix.setState((s) => ({
      messages: pushMsg(
        s.messages,
        "agent",
        macros.length
          ? `Voice macros\n${macros.map((macro) => `“${macro.trigger}” → ${macro.template}`).join("\n")}`
          : "No custom voice macros are defined.",
      ),
    }));
    return;
  }
  if (intent.kind === "delete_voice_macro") {
    useHelix.getState().deleteVoiceMacro(intent.name);
    return;
  }
  if (intent.kind === "inspect_audio_diagnostics") {
    useHelix.getState().inspectAudioDiagnostics();
    return;
  }
  if (intent.kind === "bank") {
    useHelix.getState().bank(intent.delta);
    return;
  }
  if (intent.kind === "undo_last") {
    const last = [...state.ledger].reverse().find((e) => e.rollbackAvailable);
    if (last) useHelix.getState().undo(last.operationId);
    else
      useHelix.setState((s) => ({
        messages: pushMsg(s.messages, "agent", "Nothing in the ledger is reversible right now."),
      }));
    return;
  }
  if (intent.kind === "inspect_routing") {
    const lines = mixerTracks(session)
      .filter((t) => t.sends.length)
      .map(
        (t) =>
          `${t.name} → ${t.sends.map((s) => findTrack(session, s.dest)?.name ?? s.dest).join(", ")}`,
      );
    useHelix.setState((s) => ({
      messages: pushMsg(
        s.messages,
        "agent",
        lines.length
          ? `Routing\n${lines.join("\n")}\nGtr L/R feed Guitar Bus. All tracks sum to Master.`
          : "No explicit sends besides Guitar Bus. All tracks sum to Master.",
      ),
    }));
    return;
  }
  if (intent.kind === "inspect_takes") {
    const track = findTrack(session, intent.trackId ?? "tr_lead");
    if (!track || track.takes.length === 0) {
      useHelix.setState((s) => ({
        messages: pushMsg(s.messages, "agent", "No take lanes on that track."),
      }));
      return;
    }
    const rows = [...track.takes]
      .sort((a, b) => b.snrDb - a.snrDb)
      .map(
        (t) =>
          `${t.archived ? "archived" : t.selected ? "comp" : "live"}  ${t.name}  SNR ${t.snrDb.toFixed(1)} dB  clips ${t.clippingEvents}  pitch ${Math.round(t.pitchStability * 100)}  timing ${Math.round(t.timingStability * 100)}`,
      );
    useHelix.setState((s) => ({
      messages: pushMsg(
        s.messages,
        "agent",
        `${track.name} takes — measurements, not musical judgment.\n${rows.join("\n")}`,
      ),
    }));
    return;
  }
  if (intent.kind === "inspect_session") {
    const findings = scanSession(session);
    const planned = findings.flatMap((f) =>
      planFinding(f, session, caps, DEFAULT_CONSTRAINTS, seq),
    );
    const auto = planned.filter((o) => o.autoSafe && !o.refusedReason);
    const review = planned.filter((o) => !o.autoSafe || o.refusedReason);
    useHelix.setState((s) => ({
      findings,
      inspectFindings: findings,
      operations: [
        ...s.operations.filter((o) => o.phase === "commit" || o.phase === "rollback"),
        ...planned,
      ],
      messages: pushMsg(s.messages, "agent", describeInspect(findings), {
        findingIds: findings.map((f) => f.id),
        operationIds: planned.map((o) => o.id),
      }),
    }));
    if (autonomy >= 4) {
      for (const op of auto) await runOne(op.id);
    } else if (autonomy === 0) {
      useHelix.setState((s) => ({
        operations: s.operations.map((o) =>
          planned.some((p) => p.id === o.id) ? { ...o, phase: "propose" } : o,
        ),
        messages: pushMsg(
          s.messages,
          "agent",
          "Autonomy is Observe. I will not mutate. Raise autonomy to Propose or Approve to act.",
        ),
      }));
    } else if (auto.length && autonomy >= 1) {
      useHelix.setState((s) => ({
        messages: pushMsg(
          s.messages,
          "agent",
          `${auto.length} operations are within constraints. ${review.length} need review (hard limit or missing capability).`,
        ),
      }));
    }
    return;
  }
  if (intent.kind === "fix_safe" || intent.kind === "approve_all") {
    if (state.findings.length === 0) {
      const findings = scanSession(session);
      const planned = findings.flatMap((f) =>
        planFinding(f, session, caps, DEFAULT_CONSTRAINTS, seq),
      );
      useHelix.setState((s) => ({
        findings,
        operations: [...s.operations, ...planned],
      }));
    }
    if (intent.kind === "fix_safe") await useHelix.getState().approveSafe();
    else {
      const ids = pendingOps(useHelix.getState().operations)
        .filter((o) => !o.refusedReason)
        .map((o) => o.id);
      for (const id of ids) await runOne(id);
    }
    return;
  }

  if (autonomy === 0) {
    useHelix.setState((s) => ({
      messages: pushMsg(
        s.messages,
        "agent",
        "Autonomy is Observe. I can inspect, not mutate. Raise the level to Propose or Approve.",
      ),
    }));
    return;
  }

  const planned = planIntent(intent, session, caps, DEFAULT_CONSTRAINTS, seq);
  if (planned.length === 0) {
    useHelix.setState((s) => ({
      messages: pushMsg(s.messages, "agent", "Nothing to do for that intent in this session."),
    }));
    return;
  }

  for (const op of planned) {
    useHelix.setState((s) => ({
      operations: [...s.operations, op],
      messages: pushMsg(
        s.messages,
        "agent",
        op.refusedReason
          ? op.refusedReason
          : `Proposed ${op.id}: ${op.summary}\nMechanism: ${op.mechanism.replaceAll("_", " ")} · ${op.precision} · CAP-${op.cap}`,
        { operationIds: [op.id] },
      ),
    }));
    if (op.refusedReason) {
      useHelix.setState((s) => ({
        operations: s.operations.map((o) => (o.id === op.id ? { ...o, phase: "refused" } : o)),
        ledger: [...s.ledger, toLedger(op, session, session, "REFUSED", seq)],
      }));
      continue;
    }
    const auto = autonomy >= 4 || (autonomy >= 3 && op.autoSafe) || op.approval === "auto";
    if (autonomy === 1) continue;
    if (auto) await runOne(op.id);
  }
}

async function runOne(id: string) {
  const op = useHelix.getState().operations.find((o) => o.id === id);
  if (!op || op.phase === "commit" || op.phase === "skipped" || op.phase === "refused") return;
  if (op.refusedReason) {
    useHelix.setState((s) => ({
      operations: s.operations.map((o) => (o.id === id ? { ...o, phase: "refused" } : o)),
    }));
    return;
  }
  if (useHelix.getState().autonomy === 0) return;
  await runPlanned(op, { silent: false, auto: false });
}

async function runPlanned(op: Operation, opts: { silent: boolean; auto: boolean }) {
  const phases: Operation["phase"][] = [
    "validate",
    "snapshot",
    "execute",
    "observe",
    "verify",
    "commit",
  ];
  for (const phase of phases) {
    useHelix.setState((s) => ({
      operations: s.operations.map((o) => (o.id === op.id ? { ...o, phase } : o)),
    }));
    if (!opts.silent) await wait(phase === "execute" ? 180 : 70);
  }
  const before = useHelix.getState().session;
  const { session, snapshot } = executeOperation(op, before);
  snapshot.bankOffset = useHelix.getState().bankOffset;
  const check = verifyOperation(op, before, session);
  if (!check.pass) {
    useHelix.setState((s) => ({
      operations: s.operations.map((o) =>
        o.id === op.id ? { ...o, phase: "rollback", verifyNote: check.note } : o,
      ),
      ledger: [
        ...s.ledger,
        toLedger({ ...op, verifyNote: check.note }, before, before, "FAIL", seq),
      ],
      messages: opts.silent
        ? s.messages
        : pushMsg(
            s.messages,
            "agent",
            `Verification failed on ${op.id}. Rolled back. ${check.note}`,
          ),
    }));
    return;
  }
  const entry = toLedger(op, before, session, "PASS", seq);
  useHelix.setState((s) => ({
    session,
    snapshots: { ...s.snapshots, [op.id]: snapshot },
    findings: scanSession(session),
    operations: s.operations.map((o) =>
      o.id === op.id ? { ...o, phase: "commit", verifyNote: check.note } : o,
    ),
    ledger: [...s.ledger, entry],
    messages: opts.silent
      ? s.messages
      : pushMsg(
          s.messages,
          "agent",
          `${op.summary}\nVerified ${op.verifyClass} PASS. Rollback available.`,
          {
            operationIds: [op.id],
          },
        ),
  }));
}
